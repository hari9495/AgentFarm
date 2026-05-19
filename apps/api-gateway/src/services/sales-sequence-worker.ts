/**
 * sales-sequence-worker.ts
 *
 * Sweeps the SalesSequenceEntry table for rows that are:
 *   - scheduledFor <= now
 *   - sentAt IS NULL
 *   - skipped = false
 *
 * For each due entry it loads the Prospect + SalesAgentConfig,
 * validates the prospect is still workable, then calls
 * sendOutreachEmail to dispatch the follow-up.
 *
 * Environment variables:
 *   SALES_SEQUENCE_SWEEP_INTERVAL_MS — sweep cadence in ms (default: 3 600 000 = 1 h)
 *   SALES_EMAIL_FROM
 *   SENDGRID_API_KEY
 *   MAILGUN_API_KEY
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
 */

import type { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../lib/db.js';
import {
    sendOutreachEmail,
    type OutreachParams,
} from '@agentfarm/agent-runtime/sales/outreach.js';

// ---------------------------------------------------------------------------
// Prisma stub types — avoid full generated client coupling
// ---------------------------------------------------------------------------

interface SeqEntry {
    id: string;
    tenantId: string;
    botId: string;
    prospectId: string;
    sequenceStep: number;
    scheduledFor: Date;
    sentAt: Date | null;
    skipped: boolean;
    skipReason: string | null;
    subject: string | null;
    activityId: string | null;
}

interface ProspectRow {
    id: string;
    tenantId: string;
    botId: string;
    status: string;
    sequenceStep: number;
    lastContactedAt: Date | null;
}

interface SalesConfigRow {
    id: string;
    tenantId: string;
    botId: string;
    productDescription: string;
    icp: string;
    emailProvider: string;
    emailTone: string;
    followUpDays: number[];
    maxProspectsPerDay: number;
    active: boolean;
    [key: string]: unknown;
}

type PrismaWithSales = {
    salesSequenceEntry: {
        findMany: (args: {
            where: Record<string, unknown>;
            orderBy?: Record<string, unknown>;
            take?: number;
        }) => Promise<SeqEntry[]>;
        update: (args: {
            where: { id: string };
            data: Record<string, unknown>;
        }) => Promise<SeqEntry>;
    };
    prospect: {
        findUnique: (args: { where: { id: string } }) => Promise<ProspectRow | null>;
        update: (args: {
            where: { id: string };
            data: Record<string, unknown>;
        }) => Promise<unknown>;
    };
    salesAgentConfig: {
        findFirst: (args: { where: Record<string, unknown> }) => Promise<SalesConfigRow | null>;
    };
    salesSequenceEntry2: never; // unused sentinel
};

// ---------------------------------------------------------------------------
// Statuses that mean no more outreach should be sent
// ---------------------------------------------------------------------------
const TERMINAL_STATUSES = new Set([
    'disqualified',
    'converted',
    'closed_won',
    'closed_lost',
    'unsubscribed',
]);

// ---------------------------------------------------------------------------
// Build emailConfig from env
// ---------------------------------------------------------------------------
function buildEmailConfig(): OutreachParams['emailConfig'] {
    return {
        apiKey:
            process.env['SENDGRID_API_KEY'] ??
            process.env['MAILGUN_API_KEY'] ??
            undefined,
        host: process.env['SMTP_HOST'] ?? undefined,
        port: process.env['SMTP_PORT']
            ? parseInt(process.env['SMTP_PORT'], 10)
            : undefined,
        secure: process.env['SMTP_SECURE'] === 'true',
        user: process.env['SMTP_USER'] ?? undefined,
        pass: process.env['SMTP_PASS'] ?? undefined,
        fromEmail: process.env['SALES_EMAIL_FROM'] ?? undefined,
    };
}

// ---------------------------------------------------------------------------
// Core sweep
// ---------------------------------------------------------------------------

export async function runSalesSequenceSweep(
    prisma: PrismaClient,
): Promise<{ processed: number; skipped: number }> {
    const db = prisma as unknown as PrismaWithSales;
    const now = new Date();

    const dueEntries = await db.salesSequenceEntry.findMany({
        where: {
            scheduledFor: { lte: now },
            sentAt: null,
            skipped: false,
        },
        orderBy: { scheduledFor: 'asc' },
        take: 50,
    });

    let processed = 0;
    let skipped = 0;

    for (const entry of dueEntries) {
        // (a) Load prospect
        const prospect = await db.prospect.findUnique({ where: { id: entry.prospectId } });
        if (!prospect) {
            await db.salesSequenceEntry.update({
                where: { id: entry.id },
                data: { skipped: true, skipReason: 'prospect_not_found', updatedAt: now },
            });
            skipped++;
            continue;
        }

        // (b) Skip terminal statuses
        if (TERMINAL_STATUSES.has(prospect.status)) {
            await db.salesSequenceEntry.update({
                where: { id: entry.id },
                data: {
                    skipped: true,
                    skipReason: `prospect_status_${prospect.status}`,
                    updatedAt: now,
                },
            });
            skipped++;
            continue;
        }

        // (c) Load config
        const config = await db.salesAgentConfig.findFirst({
            where: { botId: entry.botId, tenantId: entry.tenantId },
        });
        if (!config) {
            await db.salesSequenceEntry.update({
                where: { id: entry.id },
                data: { skipped: true, skipReason: 'config_not_found', updatedAt: now },
            });
            skipped++;
            continue;
        }

        // (d) Get previousSubject from step - 1
        let previousSubject: string | undefined;
        if (entry.sequenceStep > 1) {
            const prevEntries = await db.salesSequenceEntry.findMany({
                where: {
                    prospectId: entry.prospectId,
                    sequenceStep: entry.sequenceStep - 1,
                },
                take: 1,
            });
            previousSubject = prevEntries[0]?.subject ?? undefined;
        }

        // (e) Send email
        const emailConfig = buildEmailConfig();
        let result: { success: boolean; subject: string; activityId: string; error?: string };
        try {
            result = await sendOutreachEmail(
                {
                    tenantId: entry.tenantId,
                    botId: entry.botId,
                    prospectId: entry.prospectId,
                    config: config as unknown as OutreachParams['config'],
                    emailConfig,
                    sequenceStep: entry.sequenceStep,
                    previousSubject,
                },
                prisma,
            );
        } catch (err) {
            defaultLogger.error(
                `email send error for entry ${entry.id}`,
                err,
            );
            continue;
        }

        // (f) Mark entry sent
        await db.salesSequenceEntry.update({
            where: { id: entry.id },
            data: {
                sentAt: now,
                subject: result.subject,
                activityId: result.activityId,
                updatedAt: now,
            },
        });

        // (g) Update prospect
        await db.prospect.update({
            where: { id: entry.prospectId },
            data: {
                sequenceStep: entry.sequenceStep,
                lastContactedAt: now,
                updatedAt: now,
            },
        });

        processed++;
    }

    return { processed, skipped };
}

// ---------------------------------------------------------------------------
// Worker lifecycle — same pattern as nurture-worker.ts
// ---------------------------------------------------------------------------

const SWEEP_INTERVAL_MS = (): number =>
    parseInt(
        process.env['SALES_SEQUENCE_SWEEP_INTERVAL_MS'] ?? '3600000',
        10,
    ) || 3_600_000;

const defaultLogger = {
    info: (msg: string) => console.log(`[sales-sequence-worker] ${msg}`),
    error: (msg: string, err?: unknown) =>
        console.error(`[sales-sequence-worker] ${msg}`, err),
};

let workerTimer: NodeJS.Timeout | null = null;
let workerStopping = false;
let inFlightSweep = false;

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
            const result = await runSalesSequenceSweep(prisma);
            defaultLogger.info(
                `sweep complete — processed ${result.processed}, skipped ${result.skipped}`,
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

export function startSalesSequenceWorker(
    prisma: PrismaClient = defaultPrisma,
): void {
    if (workerTimer) {
        defaultLogger.info('sales sequence worker already running');
        return;
    }

    workerStopping = false;
    scheduleNext(prisma, 5_000); // first sweep shortly after startup
    defaultLogger.info('sales sequence worker started');
}

export function stopSalesSequenceWorker(): void {
    workerStopping = true;
    if (workerTimer) {
        clearTimeout(workerTimer);
        workerTimer = null;
    }
}
