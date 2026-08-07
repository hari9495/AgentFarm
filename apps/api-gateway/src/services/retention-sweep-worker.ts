/**
 * retention-sweep-worker.ts
 *
 * F2 — RetentionPolicy has full CRUD + dashboard UI (retention-policy.ts) but
 * nothing previously enforced it: @agentfarm/retention-cleanup's
 * RetentionCleanupJob existed, fully built, but was never scheduled anywhere.
 * This worker runs it periodically.
 *
 * The job does two things:
 *  - sweeps expired AgentShortTermMemory rows (no external dependency — always runs)
 *  - deletes expired AgentSession recordings/artifacts per their RetentionPolicy
 *    (requires Azure Blob Storage; skipped with a one-time warning if unconfigured)
 *
 * Environment variables:
 *   RETENTION_SWEEP_INTERVAL_MS  — sweep cadence in ms (default: 3 600 000 = 1h)
 *   AZURE_AUDIT_STORAGE_ACCOUNT_URL / _CONTAINER / _WRITE_SAS_TOKEN / _READ_SAS_TOKEN
 *     — artifact-deletion storage config. Without these the session/artifact
 *     portion of retention cannot run (nothing to point deletions at); the
 *     short-term-memory sweep still runs on schedule regardless.
 */

import type { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../lib/db.js';
import { RetentionCleanupJob } from '@agentfarm/retention-cleanup';
import { AzureBlobAuditStorage } from '@agentfarm/audit-storage';

const SWEEP_INTERVAL_MS = (): number =>
    parseInt(process.env['RETENTION_SWEEP_INTERVAL_MS'] ?? '3600000', 10) || 3_600_000;

const defaultLogger = {
    info: (msg: string) => console.log(`[retention-sweep-worker] ${msg}`),
    error: (msg: string, err?: unknown) => console.error(`[retention-sweep-worker] ${msg}`, err),
};

function buildAuditStorage(): AzureBlobAuditStorage | null {
    const accountUrl = process.env['AZURE_AUDIT_STORAGE_ACCOUNT_URL'];
    const container = process.env['AZURE_AUDIT_STORAGE_CONTAINER'];
    const writeSasToken = process.env['AZURE_AUDIT_STORAGE_WRITE_SAS_TOKEN'];
    if (!accountUrl || !container || !writeSasToken) return null;
    return new AzureBlobAuditStorage({
        accountUrl,
        container,
        writeSasToken,
        readSasToken: process.env['AZURE_AUDIT_STORAGE_READ_SAS_TOKEN'],
    });
}

let workerTimer: NodeJS.Timeout | null = null;
let workerStopping = false;
let inFlightSweep = false;
let warnedNoStorage = false;

function scheduleNext(prisma: PrismaClient, delayMs: number): void {
    if (workerStopping) return;

    workerTimer = setTimeout(async () => {
        if (workerStopping) return;
        if (inFlightSweep) {
            scheduleNext(prisma, SWEEP_INTERVAL_MS());
            return;
        }

        inFlightSweep = true;
        try {
            const storage = buildAuditStorage();
            if (!storage && !warnedNoStorage) {
                defaultLogger.info(
                    'AZURE_AUDIT_STORAGE_* not configured — running short-term-memory sweep only ' +
                    '(session/artifact retention needs blob storage to know what to delete)',
                );
                warnedNoStorage = true;
            }
            const job = new RetentionCleanupJob(prisma, storage);
            const stats = await job.run();
            defaultLogger.info(
                `sweep complete — scanned ${stats.sessionsScanned}, deleted ${stats.sessionsDeleted} session(s), ` +
                `${stats.artifactsDeleted} artifact(s), ${stats.failedDeletions} failure(s)`,
            );
            scheduleNext(prisma, SWEEP_INTERVAL_MS());
        } catch (err) {
            defaultLogger.error('sweep failed', err);
            scheduleNext(prisma, SWEEP_INTERVAL_MS());
        } finally {
            inFlightSweep = false;
        }
    }, delayMs);
}

export function startRetentionSweepWorker(prisma: PrismaClient = defaultPrisma): void {
    if (workerTimer) {
        defaultLogger.info('retention sweep worker already running');
        return;
    }
    workerStopping = false;
    scheduleNext(prisma, 5_000); // first sweep shortly after startup
    defaultLogger.info('retention sweep worker started');
}

export function stopRetentionSweepWorker(): void {
    workerStopping = true;
    if (workerTimer) {
        clearTimeout(workerTimer);
        workerTimer = null;
    }
}
