/**
 * upsell-handler.ts
 *
 * Sprint 21 — Relationship Management
 *
 * workspace_upsell
 *   Sends a personalised upsell / cross-sell email to a closed_won customer.
 *   The LLM generates a check-in + upgrade suggestion tailored to:
 *     - The prospect's industry and title
 *     - The original deal value (signals budget capacity)
 *     - Days since closing (adjusts tone: warm check-in vs. active pitch)
 *     - Recent activities (avoids repeating what was already discussed)
 *
 *   The activity is logged as "upsell_sent" and the prospect status remains
 *   unchanged (closed_won customers are not re-sequenced).
 *
 * Used by:
 *   - workspace_upsell action (immediate, agent-triggered)
 *   - upsell-worker.ts (scheduled, sweeps customers due for check-in)
 */

import type { PrismaClient } from '@prisma/client';
import type { SalesAgentConfigRecord } from '@agentfarm/shared-types';
import { getEmailProvider } from './email-provider-factory.js';
import type { EmailProviderConfig } from './email-provider.js';
import { appendGdprFooter, resolveOptOutUrl } from '../../gdpr-email-footer.js';

// ---------------------------------------------------------------------------
// DB structural types
// ---------------------------------------------------------------------------

type PrismaWithUpsell = {
    prospect: {
        findUnique: (args: { where: { id: string } }) => Promise<Record<string, unknown> | null>;
    };
    salesDeal: {
        findFirst: (args: { where: Record<string, unknown>; orderBy?: Record<string, unknown> }) => Promise<Record<string, unknown> | null>;
    };
    salesActivity: {
        findMany: (args: { where: Record<string, unknown>; orderBy?: Record<string, unknown>; take?: number }) => Promise<Record<string, unknown>[]>;
        create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }>;
    };
};

// ---------------------------------------------------------------------------
// LLM email generator
// ---------------------------------------------------------------------------

async function generateUpsellEmail(ctx: {
    prospectName: string;
    company: string;
    industry: string;
    title: string;
    product: string;
    dealValue: number;
    currency: string;
    daysSinceClose: number;
    recentActivities: string;
}): Promise<{ subject: string; body: string }> {
    const systemPrompt =
        'You are a senior customer success manager writing a warm check-in email to an existing customer. ' +
        'Return ONLY valid JSON: {"subject": "...", "body": "..."} ' +
        'The email should be conversational, under 120 words, focus on customer success first, then gently introduce an upgrade. ' +
        'Do not use high-pressure tactics.';

    const tone = ctx.daysSinceClose < 90
        ? 'early check-in — focus on adoption and success, mention upgrade opportunity briefly'
        : ctx.daysSinceClose < 180
        ? 'mid-term — check on ROI realised, suggest a natural expansion'
        : 'long-term — celebrate the partnership, propose strategic expansion or upgrade tier';

    const userPrompt =
        `Customer: ${ctx.prospectName} (${ctx.title}) at ${ctx.company}, ${ctx.industry} sector\n` +
        `Product they bought: ${ctx.product}\n` +
        `Original deal value: ${ctx.currency}${ctx.dealValue.toFixed(0)}\n` +
        `Days since closing: ${ctx.daysSinceClose}\n` +
        `Recent interactions: ${ctx.recentActivities || 'None'}\n` +
        `Email tone: ${tone}`;

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
                max_tokens: 512,
                system: systemPrompt,
                messages: [{ role: 'user', content: userPrompt }],
            }),
        });
        if (!resp.ok) throw new Error(`LLM error ${resp.status}`);
        const data = await resp.json() as { content: Array<{ type: string; text: string }> };
        const raw = data.content[0]?.text ?? '{}';
        const parsed = JSON.parse(raw.replace(/^```json\n?/, '').replace(/\n?```$/, ''));
        if (typeof parsed?.subject === 'string' && typeof parsed?.body === 'string') {
            return { subject: parsed.subject as string, body: parsed.body as string };
        }
    } catch {
        // fall through
    }

    return {
        subject: `Checking in — how is ${ctx.product} working for ${ctx.company}?`,
        body: `Hi ${ctx.prospectName},\n\nI hope ${ctx.product} has been delivering value for your team. I wanted to touch base and see how things are going.\n\nWe also have some exciting new capabilities that could build on what you have. Would you be open to a brief call this week?\n\nBest regards`,
    };
}

// ---------------------------------------------------------------------------
// Public params / result
// ---------------------------------------------------------------------------

export interface UpsellParams {
    prospectId: string;
    tenantId: string;
    botId: string;
    config: SalesAgentConfigRecord;
    dealId?: string;
    /** Override: days since close for tone calculation (default: calculated from closedAt) */
    daysSinceCloseOverride?: number;
}

export interface UpsellResult {
    ok: boolean;
    sent: boolean;
    subject?: string;
    error?: string;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function sendUpsellEmail(
    params: UpsellParams,
    prisma?: PrismaClient,
): Promise<UpsellResult> {
    const { prospectId, tenantId, botId, config } = params;

    const db = prisma ? (prisma as unknown as PrismaWithUpsell) : null;

    const prospect = db ? await db.prospect.findUnique({ where: { id: prospectId } }) : null;
    if (!prospect) return { ok: false, sent: false, error: 'Prospect not found' };
    if (String(prospect['tenantId'] ?? '') !== tenantId) {
        return { ok: false, sent: false, error: 'Tenant isolation violation' };
    }

    if (String(prospect['status'] ?? '') !== 'closed_won') {
        return { ok: false, sent: false, error: 'Upsell only available for closed_won customers' };
    }

    const prospectEmail = String(prospect['email'] ?? '');
    if (!prospectEmail.includes('@')) {
        return { ok: false, sent: false, error: 'Prospect has no valid email address' };
    }

    const prospectName = `${String(prospect['firstName'] ?? '')} ${String(prospect['lastName'] ?? '')}`.trim();
    const company = String(prospect['company'] ?? '');
    const industry = String(prospect['industry'] ?? 'your industry');
    const title = String(prospect['title'] ?? 'Decision Maker');

    // Load most recent closed_won deal
    let dealValue = 0;
    let currency = 'USD';
    let closedAt: Date | null = null;
    let dealId = params.dealId;

    if (db) {
        const where: Record<string, unknown> = { prospectId, tenantId, stage: 'closed_won' };
        if (dealId) where['id'] = dealId;
        const deal = await db.salesDeal.findFirst({ where, orderBy: { closedAt: 'desc' } });
        if (deal) {
            dealValue = Number(deal['value'] ?? 0);
            currency = String(deal['currency'] ?? 'USD');
            closedAt = deal['closedAt'] instanceof Date ? deal['closedAt'] : (deal['closedAt'] ? new Date(String(deal['closedAt'])) : null);
            dealId = String(deal['id']);
        }
    }

    const daysSinceClose = params.daysSinceCloseOverride ??
        (closedAt ? Math.round((Date.now() - closedAt.getTime()) / (1000 * 60 * 60 * 24)) : 60);

    // Load recent activities
    let recentActivities = '';
    if (db) {
        const acts = await db.salesActivity.findMany({
            where: { prospectId, tenantId },
            orderBy: { createdAt: 'desc' },
            take: 3,
        });
        recentActivities = acts.map(a => String(a['subject'])).join('; ');
    }

    const { subject, body } = await generateUpsellEmail({
        prospectName, company, industry, title,
        product: config.productDescription.slice(0, 80),
        dealValue, currency, daysSinceClose, recentActivities,
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

    const emailBody = appendGdprFooter(body, { optOutUrl: resolveOptOutUrl(tenantId) });
    const sendResult = await provider.sendEmail(
        { to: prospectEmail, from: fromEmail, subject, body: emailBody },
        emailCfg,
    );

    const now = new Date();
    if (db) {
        await db.salesActivity.create({
            data: {
                tenantId, botId, prospectId,
                dealId: dealId ?? null,
                activityType: 'upsell_sent',
                subject,
                body: emailBody,
                outcome: sendResult.success ? 'sent' : `failed: ${sendResult.error ?? 'unknown'}`,
                completedAt: now,
                createdAt: now,
                updatedAt: now,
            },
        }).catch(() => undefined);
    }

    return { ok: true, sent: sendResult.success, subject, error: sendResult.success ? undefined : sendResult.error };
}
