/**
 * nps-handler.ts
 *
 * Sprint 21 — Relationship Management
 *
 * workspace_nps_send
 *   Sends an NPS (Net Promoter Score, 0-10) or CSAT (1-5) pulse survey email
 *   to a closed_won customer at 30/60/90-day intervals after deal close.
 *
 *   The email contains a one-click scoring link:
 *     POST /v1/sales/nps/respond/:token  { score: number, feedback?: string }
 *
 *   The response is logged as "nps_responded" SalesActivity and the NpsResponse
 *   record is updated with the score/feedback/respondedAt timestamp.
 *
 *   The configurable schedule (npsDelayDays default [30, 60, 90]) is driven by
 *   nps-worker.ts which sweeps for customers due for a survey.
 */

import type { PrismaClient } from '@prisma/client';
import type { SalesAgentConfigRecord } from '@agentfarm/shared-types';
import { getEmailProvider } from './email-provider-factory.js';
import type { EmailProviderConfig } from './email-provider.js';
import { randomBytes } from 'node:crypto';

// ---------------------------------------------------------------------------
// DB structural types
// ---------------------------------------------------------------------------

type PrismaWithNps = {
    prospect: {
        findUnique: (args: { where: { id: string } }) => Promise<Record<string, unknown> | null>;
    };
    salesDeal: {
        findFirst: (args: { where: Record<string, unknown>; orderBy?: Record<string, unknown> }) => Promise<Record<string, unknown> | null>;
    };
    npsResponse: {
        findFirst: (args: { where: Record<string, unknown> }) => Promise<Record<string, unknown> | null>;
        create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }>;
        update: (args: { where: { token: string }; data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
    };
    salesActivity: {
        create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }>;
    };
};

// ---------------------------------------------------------------------------
// Token generation (URL-safe base64, 24 bytes → 32 chars)
// ---------------------------------------------------------------------------

function generateToken(): string {
    try {
        return randomBytes(18).toString('base64url');
    } catch {
        // Fallback: math random (environments without crypto module)
        return Array.from({ length: 32 }, () => Math.floor(Math.random() * 36).toString(36)).join('');
    }
}

// ---------------------------------------------------------------------------
// Email builder
// ---------------------------------------------------------------------------

function buildNpsEmail(ctx: {
    prospectName: string;
    company: string;
    product: string;
    surveyType: 'nps' | 'csat';
    responseBaseUrl: string;
    token: string;
}): { subject: string; body: string } {
    const { prospectName, company, product, surveyType, responseBaseUrl, token } = ctx;

    if (surveyType === 'nps') {
        const scores = Array.from({ length: 11 }, (_, i) => i); // 0-10
        const links = scores.map(s =>
            `<a href="${responseBaseUrl}/${token}?score=${s}" style="display:inline-block;width:36px;height:36px;line-height:36px;text-align:center;background:${s <= 6 ? '#fee2e2' : s <= 8 ? '#fef9c3' : '#dcfce7'};border-radius:4px;font-weight:700;font-size:14px;color:#111;text-decoration:none;margin:2px;">${s}</a>`
        ).join('');

        return {
            subject: `How likely are you to recommend ${product}? (30-second survey)`,
            body: `Hi ${prospectName},\n\nThank you for being a ${product} customer! We'd love to know how we're doing.\n\n<b>On a scale of 0–10, how likely are you to recommend us to a colleague?</b>\n\n${links}\n\n<p style="font-size:12px;color:#6b7280;">0 = Not at all likely &nbsp;&nbsp; 10 = Extremely likely</p>\n\nYour feedback helps us improve. Thank you!\n\nBest regards`,
        };
    }

    // CSAT 1-5
    const labels = ['Very dissatisfied', 'Dissatisfied', 'Neutral', 'Satisfied', 'Very satisfied'];
    const emojis = ['😞', '😕', '😐', '😊', '😍'];
    const links = [1, 2, 3, 4, 5].map(s =>
        `<a href="${responseBaseUrl}/${token}?score=${s}" style="display:inline-block;padding:10px 16px;margin:4px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;text-decoration:none;font-size:13px;color:#374151;">${emojis[s - 1]} ${labels[s - 1]}</a>`
    ).join('');

    return {
        subject: `How satisfied are you with ${product}? (1-click survey)`,
        body: `Hi ${prospectName},\n\nWe hope ${product} is delivering value for ${company}. Please take a moment to rate your experience:\n\n${links}\n\nYour feedback means a lot to us. Thank you!`,
    };
}

// ---------------------------------------------------------------------------
// Public params / result
// ---------------------------------------------------------------------------

export interface NpsSendParams {
    prospectId: string;
    tenantId: string;
    botId: string;
    config: SalesAgentConfigRecord;
    dealId?: string;
    surveyType?: 'nps' | 'csat';
    /** Base URL for one-click response links, e.g. https://app.agentfarm.io/v1/sales/nps/respond */
    responseBaseUrl?: string;
}

export interface NpsSendResult {
    ok: boolean;
    sent: boolean;
    npsResponseId?: string;
    token?: string;
    error?: string;
}

// ---------------------------------------------------------------------------
// Send NPS survey
// ---------------------------------------------------------------------------

export async function sendNpsSurvey(
    params: NpsSendParams,
    prisma?: PrismaClient,
): Promise<NpsSendResult> {
    const { prospectId, tenantId, botId, config, surveyType = 'nps' } = params;

    const db = prisma ? (prisma as unknown as PrismaWithNps) : null;

    const prospect = db ? await db.prospect.findUnique({ where: { id: prospectId } }) : null;
    if (!prospect) return { ok: false, sent: false, error: 'Prospect not found' };
    if (String(prospect['tenantId'] ?? '') !== tenantId) {
        return { ok: false, sent: false, error: 'Tenant isolation violation' };
    }

    if (String(prospect['status'] ?? '') !== 'closed_won') {
        return { ok: false, sent: false, error: 'NPS survey only available for closed_won customers' };
    }

    const prospectEmail = String(prospect['email'] ?? '');
    if (!prospectEmail.includes('@')) {
        return { ok: false, sent: false, error: 'Prospect has no valid email address' };
    }

    const prospectName = `${String(prospect['firstName'] ?? '')} ${String(prospect['lastName'] ?? '')}`.trim();
    const company = String(prospect['company'] ?? '');
    const product = config.productDescription.slice(0, 60);

    // Resolve deal
    let dealId = params.dealId;
    if (!dealId && db) {
        const deal = await db.salesDeal.findFirst({
            where: { prospectId, tenantId, stage: 'closed_won' },
            orderBy: { closedAt: 'desc' },
        });
        dealId = deal ? String(deal['id']) : undefined;
    }

    // Deduplicate: check if a survey was already sent within 25 days
    if (db) {
        const cutoff = new Date(Date.now() - 25 * 24 * 60 * 60 * 1000);
        const existing = await db.npsResponse.findFirst({
            where: { prospectId, tenantId, surveyType, sentAt: { gte: cutoff } as unknown as Date },
        });
        if (existing) {
            return { ok: false, sent: false, error: 'NPS survey already sent within the last 25 days' };
        }
    }

    const token = generateToken();
    const responseBaseUrl = params.responseBaseUrl ?? `${process.env['API_BASE_URL'] ?? 'https://api.agentfarm.io'}/v1/sales/nps/respond`;

    const { subject, body } = buildNpsEmail({ prospectName, company, product, surveyType, responseBaseUrl, token });

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
    let npsResponseId: string | undefined;

    if (db && sendResult.success) {
        const created = await db.npsResponse.create({
            data: {
                tenantId, botId, prospectId,
                dealId: dealId ?? null,
                surveyType,
                token,
                sentAt: now,
                createdAt: now,
                updatedAt: now,
            },
        }).catch(() => ({ id: undefined }));
        npsResponseId = (created as { id?: string }).id;

        await db.salesActivity.create({
            data: {
                tenantId, botId, prospectId,
                dealId: dealId ?? null,
                activityType: 'nps_sent',
                subject: `${surveyType.toUpperCase()} survey sent`,
                body: subject,
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
        npsResponseId,
        token: sendResult.success ? token : undefined,
        error: sendResult.success ? undefined : sendResult.error,
    };
}

// ---------------------------------------------------------------------------
// Record NPS response (called by webhook route)
// ---------------------------------------------------------------------------

export interface NpsRecordParams {
    token: string;
    score: number;
    feedback?: string;
}

export interface NpsRecordResult {
    ok: boolean;
    npsResponseId?: string;
    error?: string;
}

export async function recordNpsResponse(
    params: NpsRecordParams,
    prisma?: PrismaClient,
): Promise<NpsRecordResult> {
    const { token, score, feedback } = params;
    const db = prisma ? (prisma as unknown as PrismaWithNps) : null;
    if (!db) return { ok: false, error: 'No database available' };

    const existing = await db.npsResponse.findFirst({ where: { token } });
    if (!existing) return { ok: false, error: 'Invalid or expired NPS token' };

    const now = new Date();
    const updated = await db.npsResponse.update({
        where: { token },
        data: { score, feedback: feedback ?? null, respondedAt: now, updatedAt: now },
    });

    await db.salesActivity.create({
        data: {
            tenantId: String(existing['tenantId']),
            botId: String(existing['botId']),
            prospectId: String(existing['prospectId']),
            dealId: existing['dealId'] ?? null,
            activityType: 'nps_responded',
            subject: `${String(existing['surveyType'] ?? 'nps').toUpperCase()} response: score ${score}`,
            body: feedback ?? null,
            outcome: String(score),
            completedAt: now,
            createdAt: now,
            updatedAt: now,
        },
    }).catch(() => undefined);

    return { ok: true, npsResponseId: String(updated['id']) };
}
