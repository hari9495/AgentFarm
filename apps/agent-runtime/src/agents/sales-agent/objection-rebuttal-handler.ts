/**
 * objection-rebuttal-handler.ts
 *
 * Sprint 22 — Closing Gaps
 *
 * workspace_objection_rebuttal
 *   Composes and sends a tailored rebuttal email when workspace_reply_classify
 *   returns an objection classification. The LLM selects the right strategy
 *   (price, timing, competitor, features, authority, need, or other) and
 *   generates a personalized, empathetic response addressed to the prospect.
 *
 *   This closes the gap where reply-classifier.ts classifies an objection but
 *   no module automatically composes and sends a rebuttal.
 */

import type { PrismaClient } from '@prisma/client';
import type { SalesAgentConfigRecord } from '@agentfarm/shared-types';
import { getEmailProvider } from './email-provider-factory.js';
import type { EmailProviderConfig } from './email-provider.js';

// ---------------------------------------------------------------------------
// Objection type
// ---------------------------------------------------------------------------

export type ObjectionType =
    | 'price'
    | 'timing'
    | 'competitor'
    | 'features'
    | 'authority'
    | 'need'
    | 'other';

// ---------------------------------------------------------------------------
// DB structural types
// ---------------------------------------------------------------------------

type PrismaWithRebuttal = {
    prospect: {
        findUnique: (args: { where: { id: string } }) => Promise<Record<string, unknown> | null>;
    };
    salesActivity: {
        create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }>;
    };
};

// ---------------------------------------------------------------------------
// Rebuttal strategy hints per objection type
// ---------------------------------------------------------------------------

const REBUTTAL_STRATEGIES: Record<ObjectionType, string> = {
    price: 'Focus on ROI, total cost of ownership vs. competitors, and value delivered. Offer to model the business case together or discuss phased payment options.',
    timing: 'Acknowledge the constraint empathetically. Highlight the opportunity cost of delay, any limited-time terms in the current offer, and offer a flexible start date.',
    competitor: 'Acknowledge the alternative professionally. Highlight your unique differentiators: depth of support, specific integrations, proven outcomes for similar customers, and roadmap momentum.',
    features: 'Acknowledge the gap honestly. Describe existing adjacent capabilities that address the need, share the product roadmap, and offer a tailored demo of the most relevant features.',
    authority: 'Offer to prepare an executive summary, ROI one-pager, or an executive briefing session to equip the internal champion.',
    need: 'Re-open discovery with curiosity. Ask a single open-ended question about current pain, then share a brief case study of a similar company that had the same hesitation.',
    other: 'Use empathy and curiosity. Acknowledge the concern, ask one clear question to surface the real blocker, and offer to address it directly on a short call.',
};

// ---------------------------------------------------------------------------
// LLM rebuttal generation
// ---------------------------------------------------------------------------

async function generateRebuttalEmail(ctx: {
    prospectName: string;
    company: string;
    title: string;
    product: string;
    objectionType: ObjectionType;
    objectionText: string;
    strategy: string;
}): Promise<{ subject: string; body: string }> {
    const { prospectName, company, title, product, objectionType, objectionText, strategy } = ctx;

    const systemPrompt = `You are a senior B2B sales executive writing a persuasive, empathetic objection-rebuttal email.
Return ONLY valid JSON: { "subject": "...", "body": "..." }
The body should be 3-4 short paragraphs of plain prose (no bullet points, no markdown, no HTML).
Tone: warm, confident, consultative — never pushy, never defensive.
Maximum 180 words in the body. End with a low-friction call to action (e.g. "Would a 20-minute call this week work?").`;

    const userPrompt = `Write a rebuttal email to ${prospectName} (${title || 'Decision Maker'} at ${company}) about their ${objectionType} objection regarding ${product}.
Their concern: "${objectionText || `Unspecified ${objectionType} concern`}"
Strategy to apply: ${strategy}`;

    try {
        const resp = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'x-api-key': process.env['ANTHROPIC_API_KEY'] ?? '',
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 600,
                system: systemPrompt,
                messages: [{ role: 'user', content: userPrompt }],
            }),
        });

        if (!resp.ok) throw new Error(`LLM API error: ${resp.status}`);
        const data = await resp.json() as { content: Array<{ type: string; text: string }> };
        const text = data.content.find((c) => c.type === 'text')?.text ?? '';
        const match = text.match(/\{[\s\S]*\}/);
        if (!match) throw new Error('No JSON found');
        return JSON.parse(match[0]) as { subject: string; body: string };
    } catch {
        // Fallback subjects per type
        const subjects: Record<ObjectionType, string> = {
            price: `Re: The ROI case for ${product} at ${company}`,
            timing: `Re: The right time for ${company} to move forward`,
            competitor: `Re: Why ${company} teams choose ${product}`,
            features: `Re: ${product} capabilities — a closer look`,
            authority: `Re: Helping your team evaluate ${product}`,
            need: `Re: How ${product} solves ${company}'s challenge`,
            other: `Re: Your questions about ${product}`,
        };
        return {
            subject: subjects[objectionType],
            body: `Hi ${prospectName},\n\nThank you for sharing your perspective — I genuinely appreciate you being candid.\n\n${strategy}\n\nI'd love to address this directly in a quick 20-minute call and make sure ${product} is truly the right fit for ${company}.\n\nWould later this week work for you?\n\nBest regards`,
        };
    }
}

// ---------------------------------------------------------------------------
// Public params / result
// ---------------------------------------------------------------------------

export interface ObjectionRebuttalParams {
    prospectId: string;
    tenantId: string;
    botId: string;
    config: SalesAgentConfigRecord;
    dealId?: string;
    /** Objection category — defaults to 'other' if not specified */
    objectionType?: ObjectionType;
    /** The prospect's exact objection text for context */
    objectionText?: string;
}

export interface ObjectionRebuttalResult {
    ok: boolean;
    sent: boolean;
    subject?: string;
    error?: string;
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

export async function handleObjectionRebuttal(
    params: ObjectionRebuttalParams,
    prisma?: PrismaClient,
): Promise<ObjectionRebuttalResult> {
    const { prospectId, tenantId, botId, config, objectionType = 'other', objectionText = '' } = params;

    const db = prisma ? (prisma as unknown as PrismaWithRebuttal) : null;

    const prospect = db ? await db.prospect.findUnique({ where: { id: prospectId } }) : null;
    if (!prospect) return { ok: false, sent: false, error: 'Prospect not found' };
    if (String(prospect['tenantId'] ?? '') !== tenantId) {
        return { ok: false, sent: false, error: 'Tenant isolation violation' };
    }

    const prospectEmail = String(prospect['email'] ?? '');
    if (!prospectEmail.includes('@')) {
        return { ok: false, sent: false, error: 'Prospect has no valid email address' };
    }

    const prospectName = `${String(prospect['firstName'] ?? '')} ${String(prospect['lastName'] ?? '')}`.trim();
    const company = String(prospect['company'] ?? '');
    const title = String(prospect['title'] ?? '');
    const product = config.productDescription.slice(0, 60);

    const strategy = REBUTTAL_STRATEGIES[objectionType];
    const { subject, body } = await generateRebuttalEmail({
        prospectName, company, title, product, objectionType, objectionText, strategy,
    });

    const fromEmail = process.env['SALES_EMAIL_FROM'] ?? process.env['SALES_FROM_EMAIL'] ?? '';
    if (!fromEmail) {
        return { ok: false, sent: false, error: 'No sender address: set SALES_EMAIL_FROM env var' };
    }

    const provider = getEmailProvider(config.emailProvider);
    const emailCfg: EmailProviderConfig = {
        apiKey: process.env['SALES_EMAIL_API_KEY'],
        fromEmail,
        fromName: process.env['SALES_FROM_NAME'],
    };

    const sendResult = await provider.sendEmail(
        { to: prospectEmail, from: fromEmail, subject, body },
        emailCfg,
    );

    const now = new Date();

    if (db && sendResult.success) {
        await db.salesActivity.create({
            data: {
                tenantId, botId, prospectId,
                dealId: params.dealId ?? null,
                activityType: 'objection_rebuttal_sent',
                subject,
                body: objectionText
                    ? `Objection (${objectionType}): "${objectionText.slice(0, 200)}"`
                    : `Objection type: ${objectionType}`,
                outcome: 'sent',
                completedAt: now,
                createdAt: now,
                updatedAt: now,
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
