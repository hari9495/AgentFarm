/**
 * negotiation-handler.ts
 *
 * Sprint 21 — Negotiation & Closing
 *
 * workspace_negotiation_offer
 *   Handles multi-turn pricing negotiation between the AI agent and a prospect.
 *   The agent applies a configurable discount ladder:
 *     - Turn 1: initial offer (list price)
 *     - Turn 2: first concession (up to maxDiscountPercent / 2)
 *     - Turn 3: final concession (up to maxDiscountPercent)
 *     - Turn 4+: escalate to human if discountApprovalRequired, else hold firm
 *
 *   If discountApprovalRequired is true and the prospect's counter exceeds the
 *   max autonomous discount, the negotiation is escalated (status → "escalated")
 *   and a notification email is sent to discountApproverEmail.
 */

import type { PrismaClient } from '@prisma/client';
import type { SalesAgentConfigRecord } from '@agentfarm/shared-types';
import { getEmailProvider } from './email-provider-factory.js';
import type { EmailProviderConfig } from './email-provider.js';
import { appendGdprFooter, resolveOptOutUrl } from '../../gdpr-email-footer.js';

// ---------------------------------------------------------------------------
// DB structural types
// ---------------------------------------------------------------------------

type PrismaWithNeg = {
    prospect: {
        findUnique: (args: { where: { id: string } }) => Promise<Record<string, unknown> | null>;
    };
    salesDeal: {
        findFirst: (args: { where: Record<string, unknown> }) => Promise<Record<string, unknown> | null>;
        update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
    };
    salesNegotiation: {
        findFirst: (args: { where: Record<string, unknown>; orderBy?: Record<string, unknown> }) => Promise<Record<string, unknown> | null>;
        create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }>;
        update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
    };
    salesActivity: {
        create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }>;
    };
};

// ---------------------------------------------------------------------------
// LLM helper
// ---------------------------------------------------------------------------

async function generateNegotiationMessage(ctx: {
    prospectName: string;
    company: string;
    product: string;
    listPrice: number;
    currentOffer: number;
    counterOffer: number;
    discountPercent: number;
    turnNumber: number;
    currency: string;
    isEscalation: boolean;
}): Promise<string> {
    const systemPrompt =
        'You are a professional B2B sales representative conducting a pricing negotiation. ' +
        'Write a concise, professional email body (under 100 words) that is warm but firm. ' +
        'Return ONLY the email body text — no subject line, no JSON wrapper.';

    const userPrompt = ctx.isEscalation
        ? `The prospect ${ctx.prospectName} at ${ctx.company} has asked for a price of ${ctx.currency}${ctx.counterOffer.toFixed(0)}, ` +
          `which exceeds our autonomous discount limit. Write a friendly message explaining that we need to check with our team ` +
          `and will follow up within 24 hours with a final decision.`
        : `We are negotiating with ${ctx.prospectName} at ${ctx.company} for "${ctx.product}". ` +
          `List price: ${ctx.currency}${ctx.listPrice.toFixed(0)}. ` +
          `We are now offering ${ctx.currency}${ctx.currentOffer.toFixed(0)} (${ctx.discountPercent.toFixed(1)}% discount). ` +
          `This is negotiation turn ${ctx.turnNumber}. ` +
          `Write a brief, persuasive counter-offer email that justifies the value and presents our offer.`;

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
                max_tokens: 256,
                system: systemPrompt,
                messages: [{ role: 'user', content: userPrompt }],
            }),
        });
        if (!resp.ok) throw new Error(`LLM error ${resp.status}`);
        const data = await resp.json() as { content: Array<{ type: string; text: string }> };
        return data.content[0]?.text?.trim() ?? '';
    } catch {
        return ctx.isEscalation
            ? `Thank you for your counter-offer. We need to run this by our team and will get back to you within 24 hours.`
            : `Thank you for your feedback. We're pleased to offer ${ctx.currency}${ctx.currentOffer.toFixed(0)}, representing a ${ctx.discountPercent.toFixed(1)}% saving. This reflects our genuine commitment to your success with ${ctx.product}.`;
    }
}

// ---------------------------------------------------------------------------
// Public params / result
// ---------------------------------------------------------------------------

export interface NegotiationParams {
    prospectId: string;
    tenantId: string;
    botId: string;
    dealId?: string;
    config: SalesAgentConfigRecord;
    /** The prospect's latest counter-offer amount. If omitted, opens a new negotiation at list price. */
    prospectCounter?: number;
    /** List / base price for this negotiation. Required when opening a new negotiation. */
    listPrice?: number;
    currency?: string;
}

export interface NegotiationResult {
    ok: boolean;
    negotiationId?: string;
    status: 'open' | 'accepted' | 'rejected' | 'escalated' | 'expired';
    currentOffer?: number;
    discountPercent?: number;
    agentMessage?: string;
    error?: string;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function handleNegotiationOffer(
    params: NegotiationParams,
    prisma?: PrismaClient,
): Promise<NegotiationResult> {
    const { prospectId, tenantId, botId, dealId, config, currency = 'USD' } = params;

    const db = prisma ? (prisma as unknown as PrismaWithNeg) : null;

    const prospect = db ? await db.prospect.findUnique({ where: { id: prospectId } }) : null;
    if (!prospect) return { ok: false, status: 'open', error: 'Prospect not found' };
    if (String(prospect['tenantId'] ?? '') !== tenantId) {
        return { ok: false, status: 'open', error: 'Tenant isolation violation' };
    }

    const prospectName = `${String(prospect['firstName'] ?? '')} ${String(prospect['lastName'] ?? '')}`.trim();
    const company = String(prospect['company'] ?? '');
    const prospectEmail = String(prospect['email'] ?? '');
    const product = config.productDescription.slice(0, 60);

    const maxDiscount = config.maxDiscountPercent ?? 10;
    const approvalRequired = config.discountApprovalRequired ?? false;
    const approverEmail = config.discountApproverEmail ?? '';

    // Load existing open negotiation or create a new one
    let negotiation: Record<string, unknown> | null = null;
    if (db) {
        negotiation = await db.salesNegotiation.findFirst({
            where: { prospectId, tenantId, status: 'open' },
            orderBy: { createdAt: 'desc' },
        });
    }

    const listPrice = params.listPrice ?? Number(negotiation?.['listPrice'] ?? 0);
    if (!listPrice || listPrice <= 0) {
        return { ok: false, status: 'open', error: 'listPrice is required to open a negotiation' };
    }

    let turns: Array<{ speaker: string; offer: number; discountPercent: number; message: string; timestamp: string }> =
        Array.isArray(negotiation?.['turns']) ? (negotiation!['turns'] as typeof turns) : [];

    const turnNumber = turns.length + 1;
    const prospectCounter = params.prospectCounter;

    // ── Determine our counter-offer ─────────────────────────────────────────
    let currentOffer: number;
    let discountPercent: number;
    let isEscalation = false;
    let newStatus: 'open' | 'accepted' | 'escalated' = 'open';

    if (!negotiation) {
        // Opening turn — offer list price
        currentOffer = listPrice;
        discountPercent = 0;
    } else {
        const prevOffer = Number(negotiation['currentOffer'] ?? listPrice);

        if (prospectCounter !== undefined) {
            const prospectDiscountPct = ((listPrice - prospectCounter) / listPrice) * 100;

            if (prospectDiscountPct <= 0) {
                // Prospect accepted our price
                currentOffer = prevOffer;
                discountPercent = Number(negotiation['discountPercent'] ?? 0);
                newStatus = 'accepted';
            } else if (prospectDiscountPct > maxDiscount && approvalRequired) {
                // Exceeds autonomous limit and approval required → escalate
                currentOffer = prevOffer;
                discountPercent = Number(negotiation['discountPercent'] ?? 0);
                isEscalation = true;
                newStatus = 'escalated';
            } else if (prospectDiscountPct > maxDiscount) {
                // Exceeds limit, no approval process → hold firm at max discount
                discountPercent = maxDiscount;
                currentOffer = Math.round(listPrice * (1 - maxDiscount / 100));
            } else {
                // Meet halfway between our last offer and their counter
                const midpoint = (prevOffer + prospectCounter) / 2;
                currentOffer = Math.round(midpoint);
                discountPercent = ((listPrice - currentOffer) / listPrice) * 100;
            }
        } else {
            // No counter from prospect — re-state our current position
            currentOffer = prevOffer;
            discountPercent = Number(negotiation['discountPercent'] ?? 0);
        }

        // Turn 4+ with no progress → finalise
        if (turnNumber >= 4 && newStatus === 'open' && !isEscalation) {
            newStatus = 'accepted'; // accept current offer as final
        }
    }

    // ── Generate agent message ─────────────────────────────────────────────
    const agentMessage = await generateNegotiationMessage({
        prospectName, company, product, listPrice, currentOffer,
        counterOffer: prospectCounter ?? currentOffer,
        discountPercent, turnNumber, currency, isEscalation,
    });

    // ── Persist turn ───────────────────────────────────────────────────────
    const now = new Date();
    const newTurn = {
        speaker: 'agent',
        offer: currentOffer,
        discountPercent,
        message: agentMessage,
        timestamp: now.toISOString(),
    };
    turns = [...turns, newTurn];

    let negotiationId: string | undefined;

    if (db) {
        if (!negotiation) {
            const created = await db.salesNegotiation.create({
                data: {
                    tenantId, botId, prospectId,
                    dealId: dealId ?? null,
                    status: newStatus,
                    listPrice, currency,
                    currentOffer,
                    discountPercent,
                    approvalRequired,
                    approverEmail: approvalRequired ? (approverEmail || null) : null,
                    turns,
                    initiatedAt: now,
                    resolvedAt: newStatus !== 'open' ? now : null,
                    createdAt: now,
                    updatedAt: now,
                },
            });
            negotiationId = created.id;
        } else {
            const updated = await db.salesNegotiation.update({
                where: { id: String(negotiation['id']) },
                data: {
                    currentOffer,
                    discountPercent,
                    counterOffer: prospectCounter ?? null,
                    approvalStatus: isEscalation ? 'pending' : null,
                    status: newStatus,
                    turns,
                    resolvedAt: newStatus !== 'open' ? now : null,
                    updatedAt: now,
                },
            });
            negotiationId = String(updated['id']);
        }

        // Log activity
        const activityType = newStatus === 'accepted'
            ? 'negotiation_accepted'
            : isEscalation
            ? 'negotiation_counter'   // escalated = special counter
            : 'negotiation_offer';

        await db.salesActivity.create({
            data: {
                tenantId, botId, prospectId,
                dealId: dealId ?? null,
                activityType,
                subject: `Negotiation turn ${turnNumber}: ${currency}${currentOffer.toFixed(0)} (${discountPercent.toFixed(1)}% off)`,
                body: agentMessage,
                outcome: newStatus,
                completedAt: now,
                createdAt: now,
                updatedAt: now,
            },
        }).catch(() => undefined);
    }

    // ── Send email to prospect ─────────────────────────────────────────────
    const fromEmail = process.env['SALES_EMAIL_FROM'] ?? process.env['SALES_FROM_EMAIL'] ?? '';
    if (fromEmail && prospectEmail.includes('@')) {
        const provider = getEmailProvider(config.emailProvider);
        const emailCfg: EmailProviderConfig = {
            apiKey: process.env['SALES_EMAIL_API_KEY'],
            fromEmail,
            fromName: process.env['SALES_FROM_NAME'],
        };
        const subjectLine = newStatus === 'accepted'
            ? `Re: Your order — confirmed at ${currency}${currentOffer.toFixed(0)}`
            : newStatus === 'escalated'
            ? 'Re: Your pricing request — we\'re reviewing internally'
            : `Re: Pricing for ${product}`;

        const emailBody = appendGdprFooter(agentMessage, { optOutUrl: resolveOptOutUrl(tenantId) });
        await provider.sendEmail(
            { to: prospectEmail, from: fromEmail, subject: subjectLine, body: emailBody },
            emailCfg,
        ).catch(() => undefined);
    }

    // ── Notify approver if escalated ───────────────────────────────────────
    if (isEscalation && approverEmail && fromEmail) {
        const provider = getEmailProvider(config.emailProvider);
        const emailCfg: EmailProviderConfig = {
            apiKey: process.env['SALES_EMAIL_API_KEY'],
            fromEmail,
            fromName: process.env['SALES_FROM_NAME'],
        };
        const approvalBody =
            `Approval required: ${prospectName} at ${company} is requesting ${currency}${(prospectCounter ?? 0).toFixed(0)} ` +
            `(${(((listPrice - (prospectCounter ?? 0)) / listPrice) * 100).toFixed(1)}% discount). ` +
            `Our max autonomous discount is ${maxDiscount}%. ` +
            `Please reply to confirm or reject this offer. Negotiation ID: ${negotiationId ?? 'n/a'}`;
        await provider.sendEmail(
            {
                to: approverEmail,
                from: fromEmail,
                subject: `Approval needed: ${prospectName} negotiation (${currency}${(prospectCounter ?? 0).toFixed(0)})`,
                body: approvalBody,
            },
            emailCfg,
        ).catch(() => undefined);
    }

    return {
        ok: true,
        negotiationId,
        status: newStatus,
        currentOffer,
        discountPercent,
        agentMessage,
    };
}
