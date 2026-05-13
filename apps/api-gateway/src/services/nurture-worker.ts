/**
 * nurture-worker.ts
 *
 * Sweeps the Lead table for records in NURTURE status whose nextContactAt
 * is due, sends the next email in the 3-step sequence, and advances the
 * nurture step.  After the final step the lead stays in NURTURE until a
 * sales rep manually qualifies or disqualifies it.
 *
 * Environment variables:
 *   NURTURE_SWEEP_INTERVAL_MS  — sweep cadence in ms   (default: 3 600 000 = 1 h)
 *   NURTURE_BOOKING_URL        — calendly / booking link inserted into email bodies
 *   NURTURE_EMAIL_ENABLED      — set to "true" to actually dispatch emails
 */

import type { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../lib/db.js';

// ---------------------------------------------------------------------------
// Sequence definition
// ---------------------------------------------------------------------------

interface SequenceStep {
    stepIndex: number;
    delayDays: number;           // delay AFTER this step before the next one
    subject: string;
    bodyTemplate: string;        // {{firstName}}, {{company}}, {{BOOKING_URL}}
}

export const NURTURE_SEQUENCE: SequenceStep[] = [
    {
        stepIndex: 0,
        delayDays: 3,
        subject: 'Thanks for your interest in AgentFarm',
        bodyTemplate: `Hi {{firstName}},

Thanks for reaching out about AgentFarm! We help teams like {{company}} automate complex workflows using AI agents.

I'd love to schedule a quick 20-minute call to understand your use-case better and show you what AgentFarm can do.

Book a time here: {{BOOKING_URL}}

Looking forward to connecting,
The AgentFarm Team`,
    },
    {
        stepIndex: 1,
        delayDays: 4,
        subject: 'A quick question about your workflow, {{firstName}}',
        bodyTemplate: `Hi {{firstName}},

I wanted to follow up with a quick question: what is the biggest manual bottleneck in {{company}}'s current workflow?

AgentFarm customers typically see a 60–80% reduction in manual handoffs within the first sprint.

If that resonates, grab a 20-minute slot here: {{BOOKING_URL}}

Best,
The AgentFarm Team`,
    },
    {
        stepIndex: 2,
        delayDays: 0,           // no further scheduled contact — lead stays NURTURE
        subject: 'One last thought for {{company}}',
        bodyTemplate: `Hi {{firstName}},

I understand you're busy — this will be my last note for now.

If AgentFarm ever becomes relevant for {{company}}, the door is always open.  You can book a conversation any time at {{BOOKING_URL}}.

Wishing you all the best,
The AgentFarm Team`,
    },
];

// ---------------------------------------------------------------------------
// Email dispatch (best-effort stub — wire to real provider via env flag)
// ---------------------------------------------------------------------------

export interface EmailPayload {
    to: string;
    subject: string;
    body: string;
}

export async function dispatchNurtureEmail(payload: EmailPayload): Promise<void> {
    if (process.env['NURTURE_EMAIL_ENABLED'] !== 'true') {
        console.log(
            `[nurture-worker] email dispatch disabled — would send "${payload.subject}" to ${payload.to}`,
        );
        return;
    }

    // Production: replace with your email provider (SendGrid, Postmark, etc.)
    // The stub logs the intent so we can validate end-to-end without a real provider.
    console.log(
        `[nurture-worker] dispatching email "${payload.subject}" to ${payload.to}`,
    );
}

// ---------------------------------------------------------------------------
// Template rendering
// ---------------------------------------------------------------------------

function renderTemplate(template: string, vars: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? `{{${key}}}`);
}

// ---------------------------------------------------------------------------
// Core sweep
// ---------------------------------------------------------------------------

export async function runNurtureSequenceSweep(
    prisma: PrismaClient,
    options?: { dispatch?: (payload: EmailPayload) => Promise<void> },
): Promise<{ processed: number }> {
    const dispatch = options?.dispatch ?? dispatchNurtureEmail;
    const now = new Date();

    const dueleads = await prisma.lead.findMany({
        where: {
            status: 'NURTURE',
            nextContactAt: { lte: now },
        } as never,
        orderBy: { nextContactAt: 'asc' },
        take: 100,
    });

    let processed = 0;

    for (const lead of dueleads) {
        const stepIndex = (lead as { nurtureStep: number }).nurtureStep;

        if (stepIndex >= NURTURE_SEQUENCE.length) {
            // Sequence exhausted — skip without error
            continue;
        }

        const step = NURTURE_SEQUENCE[stepIndex]!;
        const bookingUrl = process.env['NURTURE_BOOKING_URL'] ?? 'https://agentfarm.ai/book';

        const vars: Record<string, string> = {
            firstName: (lead as { firstName: string }).firstName,
            company: (lead as { company: string }).company,
            BOOKING_URL: bookingUrl,
        };

        const subject = renderTemplate(step.subject, vars);
        const body = renderTemplate(step.bodyTemplate, vars);

        // Best-effort email — never block DB updates on dispatch failure
        try {
            await dispatch({ to: (lead as { email: string }).email, subject, body });
        } catch (err) {
            console.warn(`[nurture-worker] email dispatch error for lead ${(lead as { id: string }).id}:`, err);
        }

        const nextStep = NURTURE_SEQUENCE[stepIndex + 1];
        const nextContactAt =
            nextStep && nextStep.delayDays > 0
                ? new Date(now.getTime() + nextStep.delayDays * 24 * 60 * 60 * 1000)
                : null;

        await prisma.nurtureSequenceEntry.create({
            data: {
                leadId: (lead as { id: string }).id,
                step: stepIndex,
                channel: 'email',
                subject,
                body,
            },
        });

        await prisma.lead.update({
            where: { id: (lead as { id: string }).id },
            data: {
                nurtureStep: stepIndex + 1,
                lastContactAt: now,
                nextContactAt,
            } as never,
        });

        processed++;
    }

    return { processed };
}

// ---------------------------------------------------------------------------
// Worker lifecycle (setTimeout-based, matches other workers in this service)
// ---------------------------------------------------------------------------

const SWEEP_INTERVAL_MS = (): number =>
    parseInt(process.env['NURTURE_SWEEP_INTERVAL_MS'] ?? '3600000', 10) || 3_600_000;

const defaultLogger = {
    info: (msg: string) => console.log(`[nurture-worker] ${msg}`),
    error: (msg: string, err?: unknown) => console.error(`[nurture-worker] ${msg}`, err),
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
            const result = await runNurtureSequenceSweep(prisma);
            defaultLogger.info(`sweep complete — processed ${result.processed} lead(s)`);
            scheduleNext(prisma, SWEEP_INTERVAL_MS());
        } catch (err) {
            defaultLogger.error('sweep failed', err);
            scheduleNext(prisma, SWEEP_INTERVAL_MS());
        } finally {
            inFlightSweep = false;
        }
    }, delayMs);
}

export function startNurtureWorker(prisma: PrismaClient = defaultPrisma): void {
    if (workerTimer) {
        defaultLogger.info('nurture worker already running');
        return;
    }

    workerStopping = false;
    scheduleNext(prisma, 5_000); // first sweep shortly after startup
    defaultLogger.info('nurture worker started');
}

export function stopNurtureWorker(): void {
    workerStopping = true;
    if (workerTimer) {
        clearTimeout(workerTimer);
        workerTimer = null;
    }
}
