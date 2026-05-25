import type { PrismaClient } from '@prisma/client';
import type { SalesAgentConfigRecord } from '@agentfarm/shared-types';
import { getEmailProvider } from './email-provider-factory.js';
import type { EmailProviderConfig } from './email-provider.js';
import { appendGdprFooter, resolveOptOutUrl } from '../../gdpr-email-footer.js';

const REFERRAL_MODEL = 'claude-sonnet-4-20250514';
// Referral-sourced leads are high-signal — add a score bonus (capped at 100)
const REFERRAL_SCORE_BONUS = 20;

type PrismaWithReferral = {
    prospect: {
        findUnique: (args: { where: { id: string } }) => Promise<Record<string, unknown> | null>;
        update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
    };
    salesActivity: {
        create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }>;
    };
};

// ---------------------------------------------------------------------------
// workspace_referral_log — record an inbound referral for a prospect
// ---------------------------------------------------------------------------

export interface ReferralLogParams {
    prospectId: string;
    tenantId: string;
    botId: string;
    referredByEmail: string;
    referredByName?: string;
    referralNotes?: string;
}

export interface ReferralLogResult {
    ok: boolean;
    prospectId: string;
    newIcpScore?: number;
    error?: string;
}

export async function logReferral(
    params: ReferralLogParams,
    prisma?: PrismaClient,
): Promise<ReferralLogResult> {
    const { prospectId, tenantId, botId, referredByEmail, referredByName, referralNotes } = params;

    const db = prisma ? (prisma as unknown as PrismaWithReferral) : null;
    if (!db) return { ok: true, prospectId };

    const prospect = await db.prospect.findUnique({ where: { id: prospectId } });
    if (!prospect) return { ok: false, prospectId, error: 'Prospect not found' };
    if (String(prospect['tenantId'] ?? '') !== tenantId) {
        return { ok: false, prospectId, error: 'Tenant isolation violation' };
    }

    const currentScore = typeof prospect['icpScore'] === 'number' ? prospect['icpScore'] : 0;
    const newIcpScore = Math.min(100, currentScore + REFERRAL_SCORE_BONUS);

    await db.prospect.update({
        where: { id: prospectId },
        data: {
            referralSource: 'referral',
            referredBy: referredByEmail,
            referralNotes: referralNotes ?? null,
            icpScore: newIcpScore,
            updatedAt: new Date(),
        },
    });

    await db.salesActivity.create({
        data: {
            tenantId,
            botId,
            prospectId,
            activityType: 'referral_received',
            subject: `Referral received — referred by ${referredByName ?? referredByEmail}`,
            body: referralNotes ?? null,
            outcome: 'received',
            completedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });

    return { ok: true, prospectId, newIcpScore };
}

// ---------------------------------------------------------------------------
// workspace_referral_request — ask a closed_won customer to refer colleagues
// ---------------------------------------------------------------------------

export interface ReferralRequestParams {
    prospectId: string;
    tenantId: string;
    botId: string;
    config: SalesAgentConfigRecord;
}

export interface ReferralRequestResult {
    ok: boolean;
    sent: boolean;
    subject?: string;
    error?: string;
}

export async function requestReferral(
    params: ReferralRequestParams,
    prisma?: PrismaClient,
): Promise<ReferralRequestResult> {
    const { prospectId, tenantId, botId, config } = params;

    const db = prisma ? (prisma as unknown as PrismaWithReferral) : null;
    if (!db) return { ok: false, sent: false, error: 'No database connection' };

    const prospect = await db.prospect.findUnique({ where: { id: prospectId } });
    if (!prospect) return { ok: false, sent: false, error: 'Prospect not found' };
    if (String(prospect['tenantId'] ?? '') !== tenantId) {
        return { ok: false, sent: false, error: 'Tenant isolation violation' };
    }
    if (String(prospect['status'] ?? '') !== 'closed_won') {
        return {
            ok: false,
            sent: false,
            error: 'Referral requests can only be sent to closed_won customers',
        };
    }

    const email = String(prospect['email'] ?? '');
    if (!email.includes('@')) return { ok: false, sent: false, error: 'No valid email address' };

    const apiKey = process.env['ANTHROPIC_API_KEY'];
    if (!apiKey) return { ok: false, sent: false, error: 'ANTHROPIC_API_KEY not set' };

    const system = `You are an expert sales assistant. Write a warm, concise referral request email to a happy existing customer.
Do not be pushy. Keep it under 120 words. Do not mention competitors or pricing.
Return ONLY valid JSON (no markdown): { "subject": "...", "body": "..." }`;

    const prospectName = `${String(prospect['firstName'] ?? '')} ${String(prospect['lastName'] ?? '')}`.trim();
    const userPrompt = `Customer: ${prospectName} at ${String(prospect['company'] ?? '')}
Product: ${config.productDescription}
Tone: ${config.emailTone}
Write a referral request email asking if they know anyone else in their network who might benefit from ${config.productDescription}.`;

    const llmRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model: REFERRAL_MODEL,
            max_tokens: 512,
            system,
            messages: [{ role: 'user', content: userPrompt }],
        }),
    });

    if (!llmRes.ok) return { ok: false, sent: false, error: `LLM error: ${llmRes.status}` };

    const parsed = await llmRes.json() as { content: Array<{ type: string; text?: string }> };
    const raw = parsed.content.filter(b => b.type === 'text').map(b => b.text ?? '').join('');
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();

    let llmObj: Record<string, unknown>;
    try {
        llmObj = JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
        return { ok: false, sent: false, error: 'LLM returned invalid JSON' };
    }

    const subject = typeof llmObj['subject'] === 'string' ? llmObj['subject'].trim() : '';
    const body = typeof llmObj['body'] === 'string' ? llmObj['body'].trim() : '';
    if (!subject || !body) return { ok: false, sent: false, error: 'LLM returned empty subject or body' };

    const fromEmail = process.env['SALES_EMAIL_FROM'] ?? process.env['SALES_FROM_EMAIL'] ?? '';
    if (!fromEmail) return { ok: false, sent: false, error: 'No sender address: set SALES_EMAIL_FROM env var' };

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

    await db.salesActivity.create({
        data: {
            tenantId,
            botId,
            prospectId,
            activityType: 'referral_requested',
            subject,
            body,
            outcome: sendResult.success ? 'sent' : `failed: ${sendResult.error ?? 'unknown'}`,
            completedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    }).catch(() => undefined);

    return { ok: true, sent: sendResult.success, subject, error: sendResult.error };
}
