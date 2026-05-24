/**
 * nps-worker.ts
 *
 * Sprint 21 — Relationship Management
 *
 * Sweeps for closed_won prospects who are due an NPS survey at 30/60/90-day
 * intervals after deal close. Triggers sendNpsSurvey for each due prospect.
 *
 * Environment variables:
 *   NPS_SWEEP_INTERVAL_MS   — sweep cadence in ms (default: 21 600 000 = 6 h)
 *   API_BASE_URL             — base URL for one-click NPS response links
 *   SALES_EMAIL_FROM
 *   SENDGRID_API_KEY / MAILGUN_API_KEY / SMTP_*
 */

import type { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../lib/db.js';
import { sendNpsSurvey } from '@agentfarm/agent-runtime/sales/nps-handler.js';

// ---------------------------------------------------------------------------
// Structural types
// ---------------------------------------------------------------------------

interface ProspectRow {
    id: string;
    tenantId: string;
    botId: string;
    status: string;
}

interface DealRow {
    id: string;
    tenantId: string;
    botId: string;
    prospectId: string;
    stage: string;
    closedAt: Date | null;
}

interface ConfigRow {
    botId: string;
    tenantId: string;
    npsEnabled: boolean;
    npsDelayDays: number[];
    emailProvider: string;
    productDescription: string;
    icp: string;
    [key: string]: unknown;
}

interface NpsResponseRow {
    prospectId: string;
    surveyType: string;
    sentAt: Date;
}

type PrismaWithNps = {
    salesAgentConfig: {
        findMany: (args: { where: Record<string, unknown> }) => Promise<ConfigRow[]>;
    };
    prospect: {
        findMany: (args: { where: Record<string, unknown> }) => Promise<ProspectRow[]>;
    };
    salesDeal: {
        findMany: (args: { where: Record<string, unknown>; orderBy?: Record<string, unknown> }) => Promise<DealRow[]>;
    };
    npsResponse: {
        findMany: (args: { where: Record<string, unknown> }) => Promise<NpsResponseRow[]>;
    };
};

// ---------------------------------------------------------------------------
// Sweep logic
// ---------------------------------------------------------------------------

export async function runNpsSweep(
    prisma: PrismaClient,
): Promise<{ sent: number; skipped: number }> {
    const db = prisma as unknown as PrismaWithNps;
    const now = new Date();

    // Load all configs with NPS enabled
    const configs = await db.salesAgentConfig.findMany({ where: { npsEnabled: true, active: true } });

    let sent = 0;
    let skipped = 0;

    for (const config of configs) {
        const delayDays = Array.isArray(config.npsDelayDays) && config.npsDelayDays.length > 0
            ? config.npsDelayDays
            : [30, 60, 90];

        // Find closed_won prospects for this bot
        const prospects = await db.prospect.findMany({
            where: { tenantId: config.tenantId, botId: config.botId, status: 'closed_won' },
        });

        if (prospects.length === 0) continue;

        // Load all closed_won deals for these prospects
        const prospectIds = prospects.map(p => p.id);
        const deals = await db.salesDeal.findMany({
            where: {
                tenantId: config.tenantId,
                prospectId: { in: prospectIds },
                stage: 'closed_won',
                closedAt: { not: null },
            } as unknown as Record<string, unknown>,
        });

        // Load all NPS responses already sent for this tenant
        const existingResponses = await db.npsResponse.findMany({
            where: { tenantId: config.tenantId, surveyType: 'nps' },
        });

        for (const deal of deals) {
            if (!deal.closedAt) { skipped++; continue; }

            const closedMs = deal.closedAt instanceof Date ? deal.closedAt.getTime() : new Date(deal.closedAt as unknown as string).getTime();
            const daysSinceClose = Math.round((now.getTime() - closedMs) / (1000 * 60 * 60 * 24));

            // For each delay, check if we should send
            for (const delay of delayDays) {
                if (daysSinceClose < delay) continue;                // not due yet
                if (daysSinceClose > delay + 7) continue;            // missed the 7-day window

                // Check if already sent a survey within this delay window
                const windowStart = new Date(closedMs + (delay - 1) * 24 * 60 * 60 * 1000);
                const alreadySent = existingResponses.some(r =>
                    r.prospectId === deal.prospectId &&
                    r.sentAt >= windowStart,
                );
                if (alreadySent) { skipped++; continue; }

                try {
                    const result = await sendNpsSurvey(
                        {
                            prospectId: deal.prospectId,
                            tenantId: deal.tenantId,
                            botId: deal.botId,
                            config: config as unknown as Parameters<typeof sendNpsSurvey>[0]['config'],
                            dealId: deal.id,
                            surveyType: 'nps',
                        },
                        prisma,
                    );
                    if (result.sent) sent++;
                    else skipped++;
                } catch {
                    skipped++;
                }
                break; // send at most one survey per deal per sweep
            }
        }
    }

    return { sent, skipped };
}

// ---------------------------------------------------------------------------
// Worker lifecycle
// ---------------------------------------------------------------------------

const SWEEP_INTERVAL_MS = (): number =>
    parseInt(process.env['NPS_SWEEP_INTERVAL_MS'] ?? '21600000', 10) || 21_600_000;

const log = {
    info: (msg: string) => console.log(`[nps-worker] ${msg}`),
    error: (msg: string, err?: unknown) => console.error(`[nps-worker] ${msg}`, err),
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
            const result = await runNpsSweep(prisma);
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

export function startNpsWorker(prisma: PrismaClient = defaultPrisma): void {
    if (workerTimer) { log.info('nps worker already running'); return; }
    workerStopping = false;
    scheduleNext(prisma, 15_000);
    log.info('nps worker started');
}

export function stopNpsWorker(): void {
    workerStopping = true;
    if (workerTimer) { clearTimeout(workerTimer); workerTimer = null; }
}
