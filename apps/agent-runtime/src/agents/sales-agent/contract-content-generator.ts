/**
 * contract-content-generator.ts
 *
 * Sprint 22 — Closing Gaps
 *
 * workspace_contract_generate
 *   Generates a full, self-contained HTML contract document using LLM.
 *   Sections: Parties, Scope of Work, Deliverables, Pricing & Payment,
 *   SLA & Support, IP Ownership, Confidentiality, Termination, Signatures.
 *
 *   The contract HTML is stored in the SalesProposal table and optionally
 *   emailed to the prospect. A separate e-sign link (workspace_contract_send)
 *   can be sent afterwards with the finalised document.
 */

import { callAnthropic, extractText } from '../../infrastructure/anthropic-caller.js';
import type { PrismaClient } from '@prisma/client';
import type { SalesAgentConfigRecord } from '@agentfarm/shared-types';
import { getEmailProvider } from './email-provider-factory.js';
import type { EmailProviderConfig } from './email-provider.js';

// ---------------------------------------------------------------------------
// DB structural types (reuse SalesProposal table)
// ---------------------------------------------------------------------------

type PrismaWithContract = {
    prospect: {
        findUnique: (args: { where: { id: string } }) => Promise<Record<string, unknown> | null>;
    };
    salesDeal: {
        findFirst: (args: { where: Record<string, unknown>; orderBy?: Record<string, unknown> }) => Promise<Record<string, unknown> | null>;
    };
    salesProposal: {
        create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }>;
    };
    salesActivity: {
        create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }>;
    };
};

// ---------------------------------------------------------------------------
// LLM contract section generation
// ---------------------------------------------------------------------------

interface ContractSection {
    title: string;
    content: string;
}

async function generateContractSections(ctx: {
    prospectName: string;
    company: string;
    product: string;
    deliverables: string;
    listPrice: number;
    currency: string;
    discountPercent: number;
    contractDurationMonths: number;
    paymentTerms: string;
}): Promise<ContractSection[]> {
    const { prospectName, company, product, deliverables, listPrice, currency, discountPercent, contractDurationMonths, paymentTerms } = ctx;
    const finalPrice = listPrice * (1 - discountPercent / 100);
    const monthlyPayment = contractDurationMonths > 0 ? finalPrice / contractDurationMonths : finalPrice;

    const systemPrompt = `You are a legal-ops assistant drafting professional B2B SaaS contract sections.
Return ONLY valid JSON: an array of 8 objects with keys "title" and "content".
Each content is 2-4 short paragraphs of plain prose (no markdown, no bullet lists).
Sections must be exactly:
1. "Parties & Effective Date"
2. "Scope of Work & Deliverables"
3. "Pricing & Payment Terms"
4. "Service Level Agreement (SLA)"
5. "Intellectual Property & Ownership"
6. "Confidentiality & Data Protection"
7. "Term & Termination"
8. "Governing Law & Dispute Resolution"`;

    const userPrompt = `Draft an enterprise software contract between our company (the Vendor) and ${company} (the Customer).
Customer representative: ${prospectName} | Product: ${product}
Deliverables: ${deliverables || 'Full platform access and implementation support'}
Contract duration: ${contractDurationMonths} months
Total price: ${currency} ${finalPrice.toFixed(2)}${discountPercent > 0 ? ` (${discountPercent}% discount from list price ${currency} ${listPrice.toFixed(2)})` : ''}
Monthly payment: ${currency} ${monthlyPayment.toFixed(2)}
Payment terms: ${paymentTerms}`;

    try {
        const { content } = await callAnthropic({
            tier: 'balanced',
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }],
            maxTokens: 3000,
        });
        const text = extractText(content);
        const match = text.match(/\[[\s\S]*\]/);
        if (!match) throw new Error('No JSON array found');
        return JSON.parse(match[0]) as ContractSection[];
    } catch {
        // Fallback sections
        const fp = listPrice * (1 - discountPercent / 100);
        return [
            { title: 'Parties & Effective Date', content: `This Software Services Agreement ("Agreement") is entered into as of the date last signed below, by and between the Vendor ("Service Provider") and ${company} ("Customer"), represented by ${prospectName}. Both parties have the authority to bind their respective organizations to the terms herein. This Agreement supersedes all prior oral or written negotiations between the parties.` },
            { title: 'Scope of Work & Deliverables', content: `Vendor shall provide Customer with access to ${product} and associated services. ${deliverables || 'Services include full platform access, initial onboarding, and ongoing technical support as described in Schedule A.'} Vendor will use commercially reasonable efforts to meet all delivery milestones agreed in writing. Any changes to scope require a signed change order.` },
            { title: 'Pricing & Payment Terms', content: `Customer agrees to pay ${currency} ${fp.toFixed(2)} for the term of this Agreement. Payment is due ${paymentTerms}. Invoices unpaid after 30 days accrue interest at 1.5% per month. All fees are exclusive of applicable taxes, which Customer is responsible for remitting.` },
            { title: 'Service Level Agreement (SLA)', content: `Vendor guarantees 99.5% monthly uptime, excluding scheduled maintenance windows (communicated 48 hours in advance) and force majeure events. Downtime exceeding the SLA threshold entitles Customer to service credits as outlined in Schedule B. Customer's sole remedy for SLA breaches is the credit mechanism specified herein.` },
            { title: 'Intellectual Property & Ownership', content: `Vendor retains all intellectual property rights in the platform, software, and associated documentation. Customer retains all rights, title, and interest in its data. No license is granted to Customer beyond the limited right to access and use the platform during the term. Customer may not reverse-engineer, sublicense, or resell the platform.` },
            { title: 'Confidentiality & Data Protection', content: `Each party agrees to maintain strict confidentiality of all non-public information received from the other party. Vendor complies with applicable data protection laws including GDPR and CCPA where applicable. Customer data is processed solely to deliver the contracted services and is never sold or shared with third parties without explicit consent.` },
            { title: 'Term & Termination', content: `This Agreement commences on the Effective Date and continues for ${contractDurationMonths} month${contractDurationMonths !== 1 ? 's' : ''} ("Initial Term"). Either party may terminate for material breach with 30 days written notice if the breach is not cured within the notice period. Customer may terminate for convenience with 60 days written notice; prepaid fees are non-refundable unless otherwise agreed.` },
            { title: 'Governing Law & Dispute Resolution', content: `This Agreement is governed by the laws of the jurisdiction specified in Schedule B, without regard to conflict-of-law principles. The parties agree to attempt good-faith negotiation before initiating any formal dispute process. Unresolved disputes shall be submitted to binding arbitration administered by an agreed arbitration body in the agreed jurisdiction.` },
        ];
    }
}

// ---------------------------------------------------------------------------
// HTML builder
// ---------------------------------------------------------------------------

function buildContractHtml(ctx: {
    sections: ContractSection[];
    prospectName: string;
    company: string;
    product: string;
    listPrice: number;
    currency: string;
    discountPercent: number;
    contractDurationMonths: number;
    paymentTerms: string;
    effectiveDate: string;
}): string {
    const { sections, prospectName, company, product, listPrice, currency, discountPercent, contractDurationMonths, paymentTerms, effectiveDate } = ctx;
    const finalPrice = listPrice * (1 - discountPercent / 100);

    const sectionsHtml = sections.map((s, i) => `
        <div class="section">
            <h2>${i + 1}. ${s.title}</h2>
            <div class="section-body">${s.content.split('\n').map(p => p.trim() ? `<p>${p.trim()}</p>` : '').join('')}</div>
        </div>`).join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Software Services Agreement — ${company}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Georgia, 'Times New Roman', serif; background: #f5f5f5; color: #1a1a1a; font-size: 14px; line-height: 1.8; }
  .page { max-width: 820px; margin: 40px auto; background: #fff; padding: 64px 72px; border: 1px solid #d0d0d0; box-shadow: 0 2px 8px rgba(0,0,0,.06); }
  .header { text-align: center; border-bottom: 3px double #1a1a1a; padding-bottom: 24px; margin-bottom: 36px; }
  .header h1 { font-size: 20px; letter-spacing: 0.08em; text-transform: uppercase; font-weight: normal; }
  .header .subtitle { font-size: 12px; color: #666; margin-top: 8px; letter-spacing: 0.04em; text-transform: uppercase; }
  .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 36px; font-size: 13px; }
  .meta-table td { padding: 7px 12px; border: 1px solid #ccc; }
  .meta-table td:first-child { font-weight: bold; width: 36%; background: #f8f8f8; }
  .section { margin-bottom: 32px; }
  .section h2 { font-size: 14px; font-weight: bold; border-bottom: 1px solid #ccc; padding-bottom: 6px; margin-bottom: 14px; letter-spacing: 0.03em; text-transform: uppercase; }
  .section-body p { margin-bottom: 12px; text-align: justify; }
  .signature-block { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; margin-top: 56px; padding-top: 36px; border-top: 2px solid #1a1a1a; }
  .sig-col h3 { font-size: 11px; margin-bottom: 20px; text-transform: uppercase; letter-spacing: 0.08em; color: #444; }
  .sig-line { border-bottom: 1px solid #555; height: 40px; margin-bottom: 8px; }
  .sig-label { font-size: 11px; color: #888; margin-bottom: 20px; display: block; }
  .confidential { margin-top: 40px; font-size: 11px; color: #aaa; text-align: center; border-top: 1px solid #eee; padding-top: 16px; letter-spacing: 0.04em; }
  @media print { body { background: #fff; } .page { box-shadow: none; border: none; margin: 0; padding: 40px; } }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <h1>Software Services Agreement</h1>
    <div class="subtitle">${product} &middot; Confidential &amp; Legally Binding</div>
  </div>

  <table class="meta-table">
    <tr><td>Customer</td><td>${company}</td></tr>
    <tr><td>Customer Representative</td><td>${prospectName}</td></tr>
    <tr><td>Product / Service</td><td>${product}</td></tr>
    <tr><td>Contract Duration</td><td>${contractDurationMonths} month${contractDurationMonths !== 1 ? 's' : ''}</td></tr>
    <tr><td>Contract Value</td><td>${currency} ${finalPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}${discountPercent > 0 ? `&nbsp;&nbsp;<span style="text-decoration:line-through;color:#aaa;font-size:12px;">${currency} ${listPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>` : ''}</td></tr>
    <tr><td>Payment Terms</td><td>${paymentTerms}</td></tr>
    <tr><td>Effective Date</td><td>${effectiveDate}</td></tr>
  </table>

  ${sectionsHtml}

  <div class="signature-block">
    <div class="sig-col">
      <h3>Service Provider (Vendor)</h3>
      <div class="sig-line"></div>
      <span class="sig-label">Authorized Signature</span>
      <div class="sig-line"></div>
      <span class="sig-label">Printed Name &amp; Title</span>
      <div class="sig-line"></div>
      <span class="sig-label">Date</span>
    </div>
    <div class="sig-col">
      <h3>Customer — ${company}</h3>
      <div class="sig-line"></div>
      <span class="sig-label">Authorized Signature</span>
      <div class="sig-line"></div>
      <span class="sig-label">Printed Name &amp; Title</span>
      <div class="sig-line"></div>
      <span class="sig-label">Date</span>
    </div>
  </div>

  <div class="confidential">
    CONFIDENTIAL — Intended solely for ${company} &nbsp;&middot;&nbsp; Generated ${new Date().toISOString().slice(0, 10)}
  </div>
</div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Public params / result
// ---------------------------------------------------------------------------

export interface ContractGenerateParams {
    prospectId: string;
    tenantId: string;
    botId: string;
    config: SalesAgentConfigRecord;
    dealId?: string;
    listPrice?: number;
    discountPercent?: number;
    currency?: string;
    contractDurationMonths?: number;
    deliverables?: string;
    paymentTerms?: string;
    sendToProspect?: boolean;
}

export interface ContractGenerateResult {
    ok: boolean;
    contractId?: string;
    htmlContent?: string;
    sent?: boolean;
    error?: string;
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

export async function generateContract(
    params: ContractGenerateParams,
    prisma?: PrismaClient,
): Promise<ContractGenerateResult> {
    const {
        prospectId, tenantId, botId, config,
        listPrice = 0, discountPercent = 0, currency = 'USD',
        contractDurationMonths = 12, deliverables = '',
        paymentTerms = 'Net 30', sendToProspect = false,
    } = params;

    const db = prisma ? (prisma as unknown as PrismaWithContract) : null;

    const prospect = db ? await db.prospect.findUnique({ where: { id: prospectId } }) : null;
    if (!prospect) return { ok: false, error: 'Prospect not found' };
    if (String(prospect['tenantId'] ?? '') !== tenantId) return { ok: false, error: 'Tenant isolation violation' };

    const prospectName = `${String(prospect['firstName'] ?? '')} ${String(prospect['lastName'] ?? '')}`.trim();
    const company = String(prospect['company'] ?? '');
    const prospectEmail = String(prospect['email'] ?? '');
    const product = config.productDescription.slice(0, 60);

    // Resolve deal
    let dealId = params.dealId;
    if (!dealId && db) {
        const deal = await db.salesDeal.findFirst({
            where: { prospectId, tenantId },
            orderBy: { createdAt: 'desc' },
        });
        dealId = deal ? String(deal['id']) : undefined;
    }

    const effectiveDate = new Date().toISOString().slice(0, 10);

    const sections = await generateContractSections({
        prospectName, company, product, deliverables,
        listPrice, currency, discountPercent,
        contractDurationMonths, paymentTerms,
    });

    const htmlContent = buildContractHtml({
        sections, prospectName, company, product,
        listPrice, currency, discountPercent,
        contractDurationMonths, paymentTerms, effectiveDate,
    });

    const now = new Date();
    let contractId: string | undefined;

    if (db) {
        const finalPrice = listPrice * (1 - discountPercent / 100);
        const created = await db.salesProposal.create({
            data: {
                tenantId, botId, prospectId,
                dealId: dealId ?? null,
                title: `${company} — ${contractDurationMonths}-month agreement`,
                htmlContent,
                sections: JSON.stringify(sections),
                currency,
                listPrice: finalPrice,    // store the negotiated price
                createdAt: now,
                updatedAt: now,
            },
        }).catch(() => ({ id: undefined }));
        contractId = (created as { id?: string }).id;

        await db.salesActivity.create({
            data: {
                tenantId, botId, prospectId,
                dealId: dealId ?? null,
                activityType: 'contract_generated',
                subject: `Contract generated for ${company}`,
                body: `${contractDurationMonths}-month agreement · ${currency} ${(listPrice * (1 - discountPercent / 100)).toFixed(2)}`,
                outcome: 'generated',
                completedAt: now,
                createdAt: now,
                updatedAt: now,
            },
        }).catch(() => undefined);
    }

    let sent = false;
    if (sendToProspect && prospectEmail.includes('@')) {
        const fromEmail = process.env['SALES_EMAIL_FROM'] ?? process.env['SALES_FROM_EMAIL'] ?? '';
        if (fromEmail) {
            const provider = getEmailProvider(config.emailProvider);
            const emailCfg: EmailProviderConfig = {
                apiKey: process.env['SALES_EMAIL_API_KEY'],
                fromEmail,
                fromName: process.env['SALES_FROM_NAME'],
            };
            const finalPrice = listPrice * (1 - discountPercent / 100);
            const sendResult = await provider.sendEmail({
                to: prospectEmail,
                from: fromEmail,
                subject: `Your ${product} Services Agreement — ${company}`,
                body: `Dear ${prospectName},\n\nPlease find your Software Services Agreement for ${product} below.\n\nContract value: ${currency} ${finalPrice.toFixed(2)} over ${contractDurationMonths} months\nPayment terms: ${paymentTerms}\n\nPlease review and return signed at your earliest convenience. If you have any questions, I'm happy to walk through it together.\n\nBest regards`,
            }, emailCfg);
            sent = sendResult.success;

            if (db && sent) {
                await db.salesActivity.create({
                    data: {
                        tenantId, botId, prospectId,
                        dealId: dealId ?? null,
                        activityType: 'contract_generated',
                        subject: `Contract emailed to ${prospectEmail}`,
                        body: `Sent ${contractDurationMonths}-month agreement to ${prospectEmail}`,
                        outcome: 'sent',
                        completedAt: now,
                        createdAt: now,
                        updatedAt: now,
                    },
                }).catch(() => undefined);
            }
        }
    }

    return { ok: true, contractId, htmlContent, sent };
}
