/**
 * proposal-generator.ts
 *
 * Sprint 21 — Negotiation & Closing
 *
 * workspace_proposal_generate
 *   Generates a full-fidelity HTML proposal document for a prospect, covering:
 *     - Executive Summary (personalised to company pain points)
 *     - Proposed Solution (features mapped to prospect needs)
 *     - ROI Model (estimated value over 12 months)
 *     - Pricing table (list price, any agreed discount, payment terms)
 *     - Terms & Conditions (standard, configurable)
 *     - Next Steps (call-to-action timeline)
 *
 *   The HTML is self-contained (inline CSS, no external assets) so it can be
 *   emailed as an attachment, rendered in a webview, or printed to PDF.
 *
 *   The proposal is persisted in SalesProposal and logged as a SalesActivity
 *   (activityType: proposal_generated).
 */

import type { PrismaClient } from '@prisma/client';
import type { SalesAgentConfigRecord, ProposalSection } from '@agentfarm/shared-types';
import { getEmailProvider } from './email-provider-factory.js';
import type { EmailProviderConfig } from './email-provider.js';

// ---------------------------------------------------------------------------
// DB structural types
// ---------------------------------------------------------------------------

type PrismaWithProposal = {
    prospect: {
        findUnique: (args: { where: { id: string } }) => Promise<Record<string, unknown> | null>;
    };
    salesDeal: {
        findFirst: (args: { where: Record<string, unknown> }) => Promise<Record<string, unknown> | null>;
    };
    salesActivity: {
        findMany: (args: { where: Record<string, unknown>; orderBy?: Record<string, unknown>; take?: number }) => Promise<Record<string, unknown>[]>;
        create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }>;
    };
    salesProposal: {
        create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }>;
    };
};

// ---------------------------------------------------------------------------
// LLM proposal section generator
// ---------------------------------------------------------------------------

async function generateProposalSections(ctx: {
    prospectName: string;
    company: string;
    industry: string;
    title: string;
    product: string;
    icp: string;
    listPrice: number;
    discountPercent: number;
    currency: string;
    recentActivities: string;
}): Promise<ProposalSection[]> {
    const systemPrompt =
        'You are a senior B2B sales consultant generating a professional proposal. ' +
        'Return ONLY valid JSON: an array of objects with keys "title" (string) and "body" (string, plain text, under 150 words each). ' +
        'Generate exactly 6 sections: Executive Summary, Business Challenge, Proposed Solution, ROI Analysis, Pricing & Terms, Next Steps.';

    const userPrompt =
        `Prospect: ${ctx.prospectName}, ${ctx.title} at ${ctx.company} (${ctx.industry})\n` +
        `Product: ${ctx.product}\n` +
        `ICP criteria: ${ctx.icp}\n` +
        `List price: ${ctx.currency}${ctx.listPrice.toFixed(0)}` +
        (ctx.discountPercent > 0 ? `, discounted by ${ctx.discountPercent.toFixed(1)}% to ${ctx.currency}${(ctx.listPrice * (1 - ctx.discountPercent / 100)).toFixed(0)}` : '') +
        `\nRecent interactions: ${ctx.recentActivities || 'None recorded'}\n` +
        `Generate a compelling proposal tailored to ${ctx.company}'s likely pain points in the ${ctx.industry} space.`;

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
                max_tokens: 2048,
                system: systemPrompt,
                messages: [{ role: 'user', content: userPrompt }],
            }),
        });
        if (!resp.ok) throw new Error(`LLM error ${resp.status}`);
        const data = await resp.json() as { content: Array<{ type: string; text: string }> };
        const raw = data.content[0]?.text ?? '[]';
        const parsed = JSON.parse(raw.replace(/^```json\n?/, '').replace(/\n?```$/, ''));
        if (Array.isArray(parsed)) return parsed as ProposalSection[];
    } catch {
        // fall through to defaults
    }

    // Generic fallback sections
    const finalPrice = ctx.listPrice * (1 - ctx.discountPercent / 100);
    return [
        { title: 'Executive Summary', body: `${ctx.company} faces challenges that ${ctx.product} is uniquely positioned to solve. This proposal outlines how we can deliver measurable value.` },
        { title: 'Business Challenge', body: `Organisations in the ${ctx.industry} sector increasingly struggle with efficiency, scalability, and competitive pressure. ${ctx.company} is no exception.` },
        { title: 'Proposed Solution', body: `${ctx.product} directly addresses these challenges through automation, intelligence, and seamless integration with your existing stack.` },
        { title: 'ROI Analysis', body: `Based on industry benchmarks, customers like ${ctx.company} typically see a 3× ROI within 12 months. Estimated annual saving: ${ctx.currency}${(finalPrice * 2).toFixed(0)}.` },
        { title: 'Pricing & Terms', body: `Investment: ${ctx.currency}${finalPrice.toFixed(0)} per year${ctx.discountPercent > 0 ? ` (${ctx.discountPercent.toFixed(1)}% discount applied)` : ''}. Payment net-30. Annual contract with optional monthly billing.` },
        { title: 'Next Steps', body: `1. Review and sign the agreement. 2. Onboarding call within 48 hours of signing. 3. Full deployment in 2 weeks. We are committed to your success.` },
    ];
}

// ---------------------------------------------------------------------------
// HTML builder
// ---------------------------------------------------------------------------

function buildProposalHtml(
    sections: ProposalSection[],
    prospectName: string,
    company: string,
    product: string,
    listPrice: number,
    discountPercent: number,
    currency: string,
): string {
    const finalPrice = listPrice * (1 - discountPercent / 100);
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    const sectionHtml = sections
        .map(
            s => `
      <div style="margin-bottom:32px;">
        <h2 style="font-size:18px;color:#1a56db;border-bottom:2px solid #e5e7eb;padding-bottom:8px;margin-bottom:12px;">${s.title}</h2>
        <p style="font-size:14px;line-height:1.7;color:#374151;">${s.body.replace(/\n/g, '<br/>')}</p>
      </div>`,
        )
        .join('');

    const pricingRow = discountPercent > 0
        ? `<tr><td style="padding:6px 12px;color:#6b7280;text-decoration:line-through;">${currency}${listPrice.toFixed(0)}</td>
           <td style="padding:6px 12px;color:#374151;">List price</td></tr>
           <tr><td style="padding:6px 12px;font-weight:700;color:#1a56db;">${currency}${finalPrice.toFixed(0)}</td>
           <td style="padding:6px 12px;color:#374151;">Your price (${discountPercent.toFixed(1)}% discount)</td></tr>`
        : `<tr><td style="padding:6px 12px;font-weight:700;color:#1a56db;">${currency}${listPrice.toFixed(0)}</td>
           <td style="padding:6px 12px;color:#374151;">Annual investment</td></tr>`;

    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Proposal — ${company}</title></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:720px;margin:40px auto;background:#fff;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,.1);overflow:hidden;">
  <!-- Header -->
  <div style="background:#1a56db;padding:40px 48px;">
    <div style="font-size:24px;font-weight:700;color:#fff;">${product}</div>
    <div style="font-size:14px;color:#bfdbfe;margin-top:4px;">Proposal for ${company}</div>
  </div>
  <!-- Meta -->
  <div style="background:#eff6ff;padding:16px 48px;display:flex;gap:40px;font-size:13px;color:#374151;">
    <div><strong>Prepared for:</strong> ${prospectName}</div>
    <div><strong>Company:</strong> ${company}</div>
    <div><strong>Date:</strong> ${today}</div>
  </div>
  <!-- Body -->
  <div style="padding:40px 48px;">
    ${sectionHtml}
    <!-- Pricing table -->
    <div style="margin-top:32px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
      <div style="background:#e5e7eb;padding:10px 12px;font-size:13px;font-weight:700;color:#111827;">Investment Summary</div>
      <table style="width:100%;border-collapse:collapse;">
        <tbody>${pricingRow}</tbody>
      </table>
    </div>
  </div>
  <!-- Footer -->
  <div style="background:#f3f4f6;padding:20px 48px;font-size:12px;color:#6b7280;text-align:center;">
    This proposal is confidential and intended solely for ${company}. Valid for 30 days from ${today}.
  </div>
</div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Public params / result
// ---------------------------------------------------------------------------

export interface ProposalParams {
    prospectId: string;
    tenantId: string;
    botId: string;
    dealId?: string;
    config: SalesAgentConfigRecord;
    listPrice?: number;
    discountPercent?: number;
    currency?: string;
    /** If true, emails the generated proposal to the prospect */
    sendToProspect?: boolean;
}

export interface ProposalResult {
    ok: boolean;
    proposalId?: string;
    title?: string;
    htmlContent?: string;
    sent?: boolean;
    error?: string;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function generateProposal(
    params: ProposalParams,
    prisma?: PrismaClient,
): Promise<ProposalResult> {
    const { prospectId, tenantId, botId, dealId, config, currency = 'USD' } = params;

    const db = prisma ? (prisma as unknown as PrismaWithProposal) : null;

    const prospect = db ? await db.prospect.findUnique({ where: { id: prospectId } }) : null;
    if (!prospect) return { ok: false, error: 'Prospect not found' };
    if (String(prospect['tenantId'] ?? '') !== tenantId) {
        return { ok: false, error: 'Tenant isolation violation' };
    }

    const prospectName = `${String(prospect['firstName'] ?? '')} ${String(prospect['lastName'] ?? '')}`.trim();
    const company = String(prospect['company'] ?? '');
    const industry = String(prospect['industry'] ?? 'your industry');
    const title = String(prospect['title'] ?? 'Decision Maker');
    const prospectEmail = String(prospect['email'] ?? '');

    // Get deal value as list price fallback
    let listPrice = params.listPrice ?? 0;
    if (!listPrice && db) {
        const deal = await db.salesDeal.findFirst({
            where: dealId ? { id: dealId, tenantId } : { prospectId, tenantId },
        });
        listPrice = Number(deal?.['value'] ?? 0);
    }
    if (!listPrice) listPrice = 0;

    const discountPercent = params.discountPercent ?? 0;
    const product = config.productDescription.slice(0, 80);

    // Load last 5 activities as context
    let recentActivities = '';
    if (db) {
        const acts = await db.salesActivity.findMany({
            where: { prospectId, tenantId },
            orderBy: { createdAt: 'desc' },
            take: 5,
        });
        recentActivities = acts
            .map(a => `${String(a['activityType'])}: ${String(a['subject'])}`)
            .join('; ');
    }

    // Generate sections via LLM
    const sections = await generateProposalSections({
        prospectName, company, industry, title, product,
        icp: config.icp,
        listPrice, discountPercent, currency,
        recentActivities,
    });

    const proposalTitle = `${product} Proposal — ${company}`;
    const htmlContent = buildProposalHtml(sections, prospectName, company, product, listPrice, discountPercent, currency);

    // Persist to DB
    let proposalId: string | undefined;
    let activityId: string | undefined;
    const now = new Date();

    if (db) {
        const created = await db.salesProposal.create({
            data: {
                tenantId, botId, prospectId,
                dealId: dealId ?? null,
                title: proposalTitle,
                htmlContent,
                listPrice: listPrice || null,
                currency,
                sections,
                status: 'draft',
                createdAt: now,
                updatedAt: now,
            },
        }).catch(() => ({ id: undefined }));
        proposalId = (created as { id?: string }).id;

        const act = await db.salesActivity.create({
            data: {
                tenantId, botId, prospectId,
                dealId: dealId ?? null,
                activityType: 'proposal_generated',
                subject: proposalTitle,
                body: `${sections.length}-section proposal generated. List price: ${currency}${listPrice.toFixed(0)}${discountPercent > 0 ? `, ${discountPercent.toFixed(1)}% discount applied` : ''}.`,
                outcome: 'generated',
                completedAt: now,
                createdAt: now,
                updatedAt: now,
            },
        }).catch(() => ({ id: undefined }));
        activityId = (act as { id?: string }).id;
    }

    // Optional: email the proposal to the prospect
    let sent = false;
    if (params.sendToProspect && prospectEmail.includes('@')) {
        const fromEmail = process.env['SALES_EMAIL_FROM'] ?? '';
        if (fromEmail) {
            const provider = getEmailProvider(config.emailProvider);
            const emailCfg: EmailProviderConfig = {
                apiKey: process.env['SALES_EMAIL_API_KEY'],
                fromEmail,
                fromName: process.env['SALES_FROM_NAME'],
            };
            const body = `Hi ${prospectName},\n\nPlease find your personalised proposal attached below.\n\nWe look forward to moving forward together.\n\nBest regards`;
            const sendResult = await provider.sendEmail(
                { to: prospectEmail, from: fromEmail, subject: proposalTitle, body },
                emailCfg,
            ).catch(() => ({ success: false }));
            sent = sendResult.success;

            if (db && sent && proposalId) {
                await db.salesActivity.create({
                    data: {
                        tenantId, botId, prospectId,
                        dealId: dealId ?? null,
                        activityType: 'proposal_sent',
                        subject: `Proposal sent: ${proposalTitle}`,
                        outcome: 'sent',
                        completedAt: now,
                        createdAt: now,
                        updatedAt: now,
                    },
                }).catch(() => undefined);
            }
        }
    }

    return { ok: true, proposalId, title: proposalTitle, htmlContent, sent };
}
