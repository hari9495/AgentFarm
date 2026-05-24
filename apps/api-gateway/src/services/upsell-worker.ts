/**
 * upsell-worker.ts
 *
 * Sprint 21 — Relationship Management
 *
 * Sweeps for closed_won prospects who are due a upsell check-in based on
 * the configurable upsellCheckInDays setting (default: 90 days after close,
 * then every 90 days thereafter).
 *
 * A upsell email is sent at most once per upsellCheckInDays window to avoid
 * spamming existing customers.
 *
 * Environment variables:
 *   UPSELL_SWEEP_INTERVAL_MS  — sweep cadence in ms (default: 21 600 000 = 6 h)
 *   SALES_EMAIL_FROM
 *   SENDGRID_API_KEY / MAILGUN_API_KEY / SMTP_*
 */

import type { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../lib/db.js';
import { sendUpsellEmail } from '@agentfarm/agent-runtime/sales/upsell-handler.js';

// ---------------------------------------------------------------------------
// Structural types
// ---------------------------------------------------------------------------

interface DealRow {
    id: string;
    tenantId: string;
    botId: string;
    prospectId: string;
    stage: string;
    value: number | null;
    closedAt: Date | null;
}

interface ConfigRow {
    botId: string;
    tenantId: string;
    active: boolean;
    upsellEnabled: boolean;
    upsellCheckInDays: number;
    emailProvider: string;
    productDescription: string;
    icp: string;
    [key: string]: unknown;
}

interface ActivityRow {
    prospectId: string;
    activityType: string;
    createdAt: Date;
}

interface ProspectRow {
    id: string;
    status: string;
}

type PrismaWithUpsell = {
    salesAgentConfig: {
        findMany: (args: { where: Record<string, unknown> }) => Promise<ConfigRow[]>;
    };
    salesDeal: {
        findMany: (args: { where: Record<string, unknown>; orderBy?: Record<string, unknown> }) => Promise<DealRow[]>;
    };
    salesActivity: {
        findMany: (args: { where: Record<string, unknown>; orderBy?: Record<string, unknown>; take?: number }) => Promise<ActivityRow[]>;
    };
    prospect: {
        findUnique: (args: { where: { id: string } }) => Promise<ProspectRow | null>;
    };
};

// ---------------------------------------------------------------------------
// Sweep logic
// ---------------------------------------------------------------------------

export async function runUpsellSweep(
    prisma: PrismaClient,
): Promise<{ sent: number; skipped: number }> {
    const db = prisma as unknown as PrismaWithUpsell;
    const now = new Date();

    const configs = await db.salesAgentConfig.findMany({ where: { upsellEnabled: true, active: true } });

    let sent = 0;
    let skipped = 0;

    for (const config of configs) {
        const checkInDays = config.upsellCheckInDays > 0 ? config.upsellCheckInDays : 90;

        // Find all closed_won deals for this config
        const deals = await db.salesDeal.findMany({
            where: {
                tenantId: config.tenantId,
                botId: config.botId,
                stage: 'closed_won',
                closedAt: { not: null },
            } as unknown as Record<string, unknown>,
            orderBy: { closedAt: 'asc' },
        });

        for (const deal of deals) {
            if (!deal.closedAt) { skipped++; continue; }

            // Verify prospect is still closed_won
            const prospect = await db.prospect.findUnique({ where: { id: deal.prospectId } });
            if (!prospect || prospect.status !== 'closed_won') { skipped++; continue; }

            const closedMs = deal.closedAt instanceof Date ? deal.closedAt.getTime() : new Date(deal.closedAt as unknown as string).getTime();
            const daysSinceClose = Math.round((now.getTime() - closedMs) / (1000 * 60 * 60 * 24));

            // Is this a check-in window? (multiple of checkInDays, within a 7-day grace)
            const cycle = Math.floor(daysSinceClose / checkInDays);
            if (cycle === 0) { skipped++; continue; } // too early

            const windowStart = new Date(closedMs + cycle * checkInDays * 24 * 60 * 60 * 1000);
            const daysInWindow = Math.round((now.getTime() - windowStart.getTime()) / (1000 * 60 * 60 * 24));
            if (daysInWindow > 7) { skipped++; continue; } // missed window

            // Check if we already sent an upsell in this window
            const lastUpsell = await db.salesActivity.findMany({
                where: {
                    prospectId: deal.prospectId,
                    tenantId: config.tenantId,
                    activityType: 'upsell_sent',
                    createdAt: { gte: windowStart } as unknown as Date,
                },
                take: 1,
            });
            if (lastUpsell.length > 0) { skipped++; continue; }

            try {
                const result = await sendUpsellEmail(
                    {
                        prospectId: deal.prospectId,
                        tenantId: deal.tenantId,
                        botId: deal.botId,
                        config: config as unknown as Parameters<typeof sendUpsellEmail>[0]['config'],
                        dealId: deal.id,
                        daysSinceCloseOverride: daysSinceClose,
                    },
                    prisma,
                );
                if (result.sent) sent++;
                else skipped++;
            } catch {
                skipped++;
            }
        }
    }

    return { sent, skipped };
}

// ---------------------------------------------------------------------------
// Worker lifecycle
// ---------------------------------------------------------------------------

const SWEEP_INTERVAL_MS = (): number =>
    parseInt(process.env['UPSELL_SWEEP_INTERVAL_MS'] ?? '21600000', 10) || 21_600_000;

const log = {
    info: (msg: string) => console.log(`[upsell-worker] ${msg}`),
    error: (msg: string, err?: unknown) => console.error(`[upsell-worker] ${msg}`, err),
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
            const result = await runUpsellSweep(prisma);
            log.info(`sweep complete — sent ${result.sent}, skipped ${result.skipped}`);
            scheduleNext(prisma, SWEEP_INTERVAL_MS());
        } catch (err) {
            log.error('sweep failed', err);
            scheduleNext(prisma, SWEEP_INTERVAL_MS());
        } finally {
            inFlight = false;
        }
    }, delayMs);
}

export function startUpsellWorker(prisma: PrismaClient = defaultPrisma): void {
    if (workerTimer) { log.info('upsell worker already running'); return; }
    workerStopping = false;
    scheduleNext(prisma, 20_000);
    log.info('upsell worker started');
}

export function stopUpsellWorker(): void {
    workerStopping = true;
    if (workerTimer) { clearTimeout(workerTimer); workerTimer = null; }
}
