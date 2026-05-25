/**
 * demo-presenter.ts
 *
 * Orchestrates live product demo delivery and post-demo follow-up.
 *
 * workspace_demo_present
 *   Joins a meeting URL via the browser executor (Flask + Playwright), delivers
 *   the demo script using browser speechSynthesis, and handles live Q&A turns.
 *   Falls back to loading the most recent generated demo script from DB, or
 *   generates a fresh one on the fly if none exists.
 *
 * workspace_demo_followup
 *   Generates and sends a personalised post-demo summary email covering what
 *   was demoed, questions raised, and proposed next steps.
 */

import type { PrismaClient } from '@prisma/client';
import type { SalesAgentConfigRecord } from '@agentfarm/shared-types';
import { runBrowserTask } from './browser-executor.js';
import { generateDemoScript, generateDemoFollowupEmail } from './demo-script-generator.js';
import { getEmailProvider } from './email-provider-factory.js';
import type { EmailProviderConfig } from './email-provider.js';
import { appendGdprFooter, resolveOptOutUrl } from '../../gdpr-email-footer.js';

type PrismaWithDemo = {
    prospect: {
        findUnique: (args: { where: { id: string } }) => Promise<Record<string, unknown> | null>;
        update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
    };
    salesActivity: {
        findFirst: (args: { where: Record<string, unknown>; orderBy?: Record<string, unknown> }) => Promise<Record<string, unknown> | null>;
        create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }>;
    };
    salesDeal: {
        findFirst: (args: { where: Record<string, unknown> }) => Promise<Record<string, unknown> | null>;
    };
};

// ---------------------------------------------------------------------------
// workspace_demo_present
// ---------------------------------------------------------------------------

export interface PresentDemoParams {
    prospectId: string;
    tenantId: string;
    botId: string;
    meetingUrl: string;
    dealId?: string;
    config: SalesAgentConfigRecord;
    demoScriptId?: string;
}

export interface PresentDemoResult {
    ok: boolean;
    delivered: boolean;
    browserTaskId?: string;
    durationMinutes?: number;
    outcome?: string;
    error?: string;
}

export async function presentDemo(
    params: PresentDemoParams,
    prisma?: PrismaClient,
): Promise<PresentDemoResult> {
    const { prospectId, tenantId, botId, meetingUrl, dealId, config } = params;

    if (!meetingUrl) {
        return { ok: false, delivered: false, error: 'meeting_url is required' };
    }

    const db = prisma ? (prisma as unknown as PrismaWithDemo) : null;

    // Load prospect
    const prospect = db ? await db.prospect.findUnique({ where: { id: prospectId } }) : null;
    if (!prospect) return { ok: false, delivered: false, error: 'Prospect not found' };
    if (String(prospect['tenantId'] ?? '') !== tenantId) {
        return { ok: false, delivered: false, error: 'Tenant isolation violation' };
    }

    const prospectName = `${String(prospect['firstName'] ?? '')} ${String(prospect['lastName'] ?? '')}`.trim();
    const company = String(prospect['company'] ?? '');

    // Load an existing demo script or generate a fresh one
    let demoScript: Awaited<ReturnType<typeof generateDemoScript>> | null = null;

    if (db) {
        const savedActivity = await db.salesActivity.findFirst({
            where: { prospectId, tenantId, activityType: 'demo_script_generated' },
            orderBy: { createdAt: 'desc' },
        });
        if (savedActivity?.['body']) {
            try {
                demoScript = JSON.parse(String(savedActivity['body'])) as typeof demoScript;
            } catch {
                // stale/corrupt — regenerate below
            }
        }
    }

    if (!demoScript) {
        demoScript = await generateDemoScript(
            { prospectId, tenantId, botId, config },
            prisma,
        );
    }

    // Build a natural-language goal for the browser executor.
    // The browser agent (Playwright + Claude brain) interprets this goal and
    // uses browser speechSynthesis to deliver each section of the presentation.
    const sectionInstructions = demoScript.sections
        .map((s, i) => {
            const speakText = s.speakingNotes.replace(/"/g, "'");
            return `SECTION ${i + 1} — "${s.title}" (~${s.durationMinutes} min):\n   Speak: "${speakText}"\n   Then pause ${s.durationMinutes <= 2 ? 15 : 30} seconds before continuing.`;
        })
        .join('\n\n');

    const objectionSummary = demoScript.sections
        .flatMap(s => s.objectionHandlers)
        .slice(0, 4)
        .map(h => `If the prospect says something like "${h.trigger}", respond: "${h.response.replace(/"/g, "'")}"`)
        .join('\n');

    const goal = `Join the video meeting at: ${meetingUrl}

Once inside the meeting room, deliver the following product demo for ${prospectName} at ${company}:

OPENER (speak first):
"${demoScript.opener.replace(/"/g, "'")}"
Pause 10 seconds.

${sectionInstructions}

CLOSE:
"${demoScript.close.replace(/"/g, "'")}"
Pause 15 seconds.

CALL TO ACTION:
"${demoScript.callToAction.replace(/"/g, "'")}"

LIVE Q&A HANDLING — if the prospect speaks or asks a question, respond naturally. Key objection handlers:
${objectionSummary}

After the demo is complete, return JSON:
{
  "delivered": true,
  "duration_minutes": <actual duration>,
  "questions_asked": <count of questions from prospect>,
  "outcome": "completed|partial|no_show"
}

Use browser speechSynthesis for all speaking: window.speechSynthesis.speak(new SpeechSynthesisUtterance("text"))
If the meeting platform requires permissions for microphone/camera, click Allow.
If the prospect does not join within 5 minutes, return: {"delivered": false, "outcome": "no_show"}`;

    const browserTask = await runBrowserTask(
        { tenantId, botId, goal, prospectId },
        config,
        prisma,
        { prospectId, dealId },
    );

    // Parse browser task result
    let delivered = browserTask.status === 'completed';
    let durationMinutes: number | undefined;
    let outcome = browserTask.status === 'completed' ? 'completed' : 'failed';

    if (browserTask.result) {
        try {
            const r = JSON.parse(browserTask.result) as Record<string, unknown>;
            delivered = r['delivered'] === true;
            durationMinutes = typeof r['duration_minutes'] === 'number' ? r['duration_minutes'] : undefined;
            outcome = typeof r['outcome'] === 'string' ? r['outcome'] : outcome;
        } catch {
            // non-fatal — use status-derived values
        }
    }

    // Persist demo_presented SalesActivity
    if (db) {
        await db.salesActivity.create({
            data: {
                tenantId,
                botId,
                prospectId,
                dealId: dealId ?? null,
                activityType: 'demo_presented',
                subject: `Demo delivered — ${prospectName} at ${company}`,
                body: JSON.stringify({
                    meetingUrl,
                    outcome,
                    durationMinutes,
                    browserTaskId: browserTask.id,
                    scriptId: demoScript.id,
                }),
                outcome,
                completedAt: new Date(),
                createdAt: new Date(),
                updatedAt: new Date(),
            },
        }).catch(() => undefined);

        // Advance prospect status to 'engaged' if demo was delivered
        if (delivered) {
            await db.prospect.update({
                where: { id: prospectId },
                data: { status: 'engaged', lastContactedAt: new Date(), updatedAt: new Date() },
            }).catch(() => undefined);
        }
    }

    return {
        ok: true,
        delivered,
        browserTaskId: browserTask.id,
        durationMinutes,
        outcome,
        error: delivered ? undefined : (browserTask.errorMessage ?? 'Demo not delivered'),
    };
}

// ---------------------------------------------------------------------------
// workspace_demo_followup
// ---------------------------------------------------------------------------

export interface DemoFollowupParams {
    prospectId: string;
    tenantId: string;
    botId: string;
    dealId?: string;
    config: SalesAgentConfigRecord;
    meetingNotes?: string;
    questionsAsked?: string[];
    demoOutcome?: 'completed' | 'partial' | 'rescheduled';
}

export interface DemoFollowupResult {
    ok: boolean;
    sent: boolean;
    subject?: string;
    error?: string;
}

export async function sendDemoFollowup(
    params: DemoFollowupParams,
    prisma?: PrismaClient,
): Promise<DemoFollowupResult> {
    const { prospectId, tenantId, botId, dealId, config, meetingNotes, questionsAsked, demoOutcome } = params;

    const db = prisma ? (prisma as unknown as PrismaWithDemo) : null;

    const prospect = db ? await db.prospect.findUnique({ where: { id: prospectId } }) : null;
    if (!prospect) return { ok: false, sent: false, error: 'Prospect not found' };
    if (String(prospect['tenantId'] ?? '') !== tenantId) {
        return { ok: false, sent: false, error: 'Tenant isolation violation' };
    }

    const email = String(prospect['email'] ?? '');
    if (!email.includes('@')) return { ok: false, sent: false, error: 'Prospect has no valid email address' };

    // Generate the follow-up email content
    const { subject, body } = await generateDemoFollowupEmail(
        { prospectId, tenantId, botId, config, meetingNotes, questionsAsked, demoOutcome },
        prisma,
    );

    if (!subject || !body) {
        return { ok: false, sent: false, error: 'Failed to generate follow-up email content' };
    }

    const fromEmail = process.env['SALES_EMAIL_FROM'] ?? process.env['SALES_FROM_EMAIL'] ?? '';
    if (!fromEmail) {
        return { ok: false, sent: false, error: 'No sender address: set SALES_EMAIL_FROM env var' };
    }

    const provider = getEmailProvider(config.emailProvider);
    const emailConfig: EmailProviderConfig = {
        apiKey: process.env['SALES_EMAIL_API_KEY'],
        fromEmail,
        fromName: process.env['SALES_FROM_NAME'],
    };

    const emailBody = appendGdprFooter(body, { optOutUrl: resolveOptOutUrl(tenantId) });
    const sendResult = await provider.sendEmail(
        { to: email, from: fromEmail, subject, body: emailBody },
        emailConfig,
    );

    if (db) {
        await db.salesActivity.create({
            data: {
                tenantId,
                botId,
                prospectId,
                dealId: dealId ?? null,
                activityType: 'demo_followup_sent',
                subject,
                body,
                outcome: sendResult.success ? 'sent' : `failed: ${sendResult.error ?? 'unknown'}`,
                completedAt: new Date(),
                createdAt: new Date(),
                updatedAt: new Date(),
            },
        }).catch(() => undefined);
    }

    return {
        ok: true,
        sent: sendResult.success,
        subject,
        error: sendResult.success ? undefined : sendResult.error,
    };
}
