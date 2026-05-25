/**
 * crm-sync-worker.ts
 *
 * Sprint 22 — Closing Gaps
 *
 * Sweeps for prospects modified in the last CRM_SYNC_LOOKBACK_MS that are
 * missing a CRM contact ID (hubspotContactId or salesforceContactId).
 * Calls syncToCrm for each unsynced prospect.
 *
 * Only runs for configs with crmSyncEnabled = true.
 *
 * Environment variables:
 *   CRM_SYNC_INTERVAL_MS   — sweep cadence in ms (default: 3 600 000 = 1 h)
 *   CRM_SYNC_LOOKBACK_MS   — look-back window for unsynced records (default: 86 400 000 = 24 h)
 *   HUBSPOT_ACCESS_TOKEN
 *   SALESFORCE_INSTANCE_URL
 *   SALESFORCE_ACCESS_TOKEN
 */

import type { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../lib/db.js';
import { syncToCrm } from '@agentfarm/agent-runtime/sales/crm-sync-handler.js';

// ---------------------------------------------------------------------------
// Structural types
// ---------------------------------------------------------------------------

interface ConfigRow {
    botId: string;
    tenantId: string;
    active: boolean;
    crmSyncEnabled: boolean;
    emailProvider: string;
    productDescription: string;
    icp: string;
    hubspotAccessToken: string | null;
    salesforceInstanceUrl: string | null;
    salesforceAccessToken: string | null;
    [key: string]: unknown;
}

interface ProspectRow {
    id: string;
    tenantId: string;
    botId: string;
    hubspotContactId: string | null;
    salesforceContactId: string | null;
}

type PrismaWithCrmWorker = {
    salesAgentConfig: {
        findMany: (args: { where: Record<string, unknown> }) => Promise<ConfigRow[]>;
    };
    prospect: {
        findMany: (args: {
            where: Record<string, unknown>;
            orderBy?: Record<string, unknown>;
            take?: number;
        }) => Promise<ProspectRow[]>;
    };
};

// ---------------------------------------------------------------------------
// Sweep logic
// ---------------------------------------------------------------------------

export async function runCrmSyncSweep(
    prisma: PrismaClient,
): Promise<{ synced: number; skipped: number }> {
    const db = prisma as unknown as PrismaWithCrmWorker;
    const lookbackMs = parseInt(process.env['CRM_SYNC_LOOKBACK_MS'] ?? '86400000', 10) || 86_400_000;
    const since = new Date(Date.now() - lookbackMs);

    const configs = await db.salesAgentConfig.findMany({
        where: { crmSyncEnabled: true, active: true },
    });

    let synced = 0;
    let skipped = 0;

    for (const config of configs) {
        const hasHubSpot = !!(config.hubspotAccessToken ?? process.env['HUBSPOT_ACCESS_TOKEN']);
        const hasSalesforce = !!(
            (config.salesforceInstanceUrl ?? process.env['SALESFORCE_INSTANCE_URL']) &&
            (config.salesforceAccessToken ?? process.env['SALESFORCE_ACCESS_TOKEN'])
        );

        if (!hasHubSpot && !hasSalesforce) { skipped++; continue; }

        const provider: 'hubspot' | 'salesforce' = hasHubSpot ? 'hubspot' : 'salesforce';

        // Find prospects modified since lookback, missing the relevant CRM contact ID
        const missingField = provider === 'hubspot' ? 'hubspotContactId' : 'salesforceContactId';
        const prospects = await db.prospect.findMany({
            where: {
                tenantId: config.tenantId,
                botId: config.botId,
                updatedAt: { gte: since } as unknown as Date,
                [missingField]: null,
            } as unknown as Record<string, unknown>,
            take: 50,
        });

        for (const prospect of prospects) {
            try {
                const result = await syncToCrm(
                    {
                        prospectId: prospect.id,
                        tenantId: prospect.tenantId,
                        botId: prospect.botId,
                        config: config as unknown as Parameters<typeof syncToCrm>[0]['config'],
                        provider,
                    },
                    prisma,
                );
                if (result.ok) synced++;
                else skipped++;
            } catch {
                skipped++;
            }
        }
    }

    return { synced, skipped };
}

// ---------------------------------------------------------------------------
// Worker lifecycle
// ---------------------------------------------------------------------------

const SWEEP_INTERVAL_MS = (): number =>
    parseInt(process.env['CRM_SYNC_INTERVAL_MS'] ?? '3600000', 10) || 3_600_000;

const log = {
    info: (msg: string) => console.log(`[crm-sync-worker] ${msg}`),
    error: (msg: string, err?: unknown) => console.error(`[crm-sync-worker] ${msg}`, err),
};

let workerTimer: NodeJS.Timeout | null = null;
let workerStopping = false;
let inFlight = false;

function scheduleNext(prisma: PrismaClient, delayMs: number): void {
    if (workerStopping) return;

    workerTimer = setTimeout(async () => {
        if (workerStopping || inFlight) {
            scheduleNext(prisma, SWEEP_INTERVAL_MS());
            return;
        }
        inFlight = true;
        try {
            const result = await runCrmSyncSweep(prisma);
            log.info(`sweep complete — synced ${result.synced}, skipped ${result.skipped}`);
            scheduleNext(prisma, SWEEP_INTERVAL_MS());
        } catch (err) {
            log.error('sweep failed', err);
            scheduleNext(prisma, SWEEP_INTERVAL_MS());
        } finally {
            inFlight = false;
        }
    }, delayMs);
}

export function startCrmSyncWorker(prisma: PrismaClient = defaultPrisma): void {
    if (workerTimer) { log.info('crm-sync worker already running'); return; }
    workerStopping = false;
    scheduleNext(prisma, 30_000); // first sync 30 s after startup
    log.info('crm-sync worker started');
}

export function stopCrmSyncWorker(): void {
    workerStopping = true;
    if (workerTimer) { clearTimeout(workerTimer); workerTimer = null; }
}
