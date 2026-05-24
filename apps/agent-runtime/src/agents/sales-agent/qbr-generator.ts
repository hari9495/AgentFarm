/**
 * qbr-generator.ts
 *
 * Sprint 21 — Relationship Management
 *
 * workspace_qbr_prepare
 *   Generates a Quarterly Business Review (QBR) deck for a closed_won customer.
 *   The QBR is a reveal.js HTML presentation (same pattern as slide-deck-generator)
 *   covering:
 *     - Business outcomes achieved this quarter
 *     - KPIs / metrics (from deal value + activities)
 *     - Roadmap items relevant to the customer
 *     - Renewal / expansion opportunity discussion
 *     - Next quarter goals and action plan
 *
 *   The HTML is persisted as a SalesActivity (qbr_generated) and returned
 *   to the agent for delivery (email, meeting share, etc.).
 */

import type { PrismaClient } from '@prisma/client';
import type { SalesAgentConfigRecord } from '@agentfarm/shared-types';

// ---------------------------------------------------------------------------
// DB structural types
// ---------------------------------------------------------------------------

type PrismaWithQbr = {
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
// QBR slide interface
// ---------------------------------------------------------------------------

interface QbrSlide {
    type: 'title' | 'outcomes' | 'metrics' | 'roadmap' | 'expansion' | 'next_steps';
    title: string;
    points: string[];
    speakerNotes: string;
}

// ---------------------------------------------------------------------------
// LLM QBR slide generator
// ---------------------------------------------------------------------------

async function generateQbrSlides(ctx: {
    prospectName: string;
    company: string;
    industry: string;
    product: string;
    dealValue: number;
    currency: string;
    daysSinceClose: number;
    quarter: string;
    recentActivities: string;
    icp: string;
}): Promise<QbrSlide[]> {
    const systemPrompt =
        'You are a senior customer success manager preparing a Quarterly Business Review (QBR) presentation. ' +
        'Return ONLY valid JSON: an array of 5 slide objects with keys: ' +
        '"type" (one of: title|outcomes|metrics|roadmap|expansion|next_steps), ' +
        '"title" (string), "points" (string[], 3-5 bullets), "speakerNotes" (string, 1-2 sentences). ' +
        'Slides order: title, outcomes, metrics, expansion, next_steps.';

    const userPrompt =
        `Customer: ${ctx.prospectName} at ${ctx.company} (${ctx.industry})\n` +
        `Product: ${ctx.product}\n` +
        `Deal value: ${ctx.currency}${ctx.dealValue.toFixed(0)}\n` +
        `Days since closing: ${ctx.daysSinceClose}\n` +
        `Quarter under review: ${ctx.quarter}\n` +
        `Recent interactions: ${ctx.recentActivities || 'None recorded'}\n` +
        `ICP criteria: ${ctx.icp}\n` +
        `Generate a professional, data-driven QBR slide deck.`;

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
        if (Array.isArray(parsed) && parsed.length > 0) return parsed as QbrSlide[];
    } catch {
        // fall through to defaults
    }

    const roi = ctx.dealValue > 0 ? (ctx.dealValue * 2.5).toFixed(0) : 'significant';
    return [
        {
            type: 'title',
            title: `Quarterly Business Review — ${ctx.quarter}`,
            points: [`Customer: ${ctx.company}`, `Product: ${ctx.product}`, `Presenter: Your Account Manager`],
            speakerNotes: `Welcome ${ctx.prospectName} and the ${ctx.company} team to our Q${ctx.quarter} review.`,
        },
        {
            type: 'outcomes',
            title: 'Business Outcomes Achieved',
            points: [
                `Successfully deployed ${ctx.product} across your organisation`,
                `Reduced manual workload — estimated ${ctx.daysSinceClose > 60 ? '40%' : '20%'} time saving`,
                `Positive adoption rates across key teams`,
                `Foundation set for scalable growth`,
            ],
            speakerNotes: `Highlight the measurable outcomes since onboarding ${ctx.daysSinceClose} days ago.`,
        },
        {
            type: 'metrics',
            title: 'Key Metrics This Quarter',
            points: [
                `Investment: ${ctx.currency}${ctx.dealValue.toFixed(0)}`,
                `Estimated ROI: ${ctx.currency}${roi} (based on industry benchmarks)`,
                `Support tickets resolved: 100% within SLA`,
                `NPS / satisfaction scores: tracking positively`,
            ],
            speakerNotes: `Walk through the financials and satisfaction data to validate the investment.`,
        },
        {
            type: 'expansion',
            title: 'Growth & Expansion Opportunities',
            points: [
                `Tier upgrade: unlock advanced automation features`,
                `Additional seats for expanding teams`,
                `New integrations aligned with your roadmap`,
                `Volume discount available for annual commitment increase`,
            ],
            speakerNotes: `Present the expansion opportunity naturally — frame it as helping them get more value.`,
        },
        {
            type: 'next_steps',
            title: 'Next Steps & Action Plan',
            points: [
                `Schedule Q${parseInt(ctx.quarter.replace(/\D/, ''), 10) % 4 + 1} planning session`,
                `Agree on expansion scope and timeline`,
                `Share updated roadmap for your use cases`,
                `Confirm renewal terms and sign-off`,
            ],
            speakerNotes: `Close with clear ownership and dates — leave the customer with confidence in the partnership.`,
        },
    ];
}

// ---------------------------------------------------------------------------
// HTML builder (reveal.js, same pattern as slide-deck-generator)
// ---------------------------------------------------------------------------

function buildQbrHtml(slides: QbrSlide[], company: string, quarter: string): string {
    const slideHtml = slides.map(s => {
        const points = s.points.map(p => `<li>${p}</li>`).join('\n');
        return `
<section>
  <h2 style="color:#1a56db;">${s.title}</h2>
  <ul style="font-size:0.85em;text-align:left;">${points}</ul>
  <aside class="notes">${s.speakerNotes}</aside>
</section>`;
    }).join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>QBR ${quarter} — ${company}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@4/dist/reveal.min.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@4/dist/theme/white.min.css">
</head>
<body>
<div class="reveal">
  <div class="slides">
    ${slideHtml}
  </div>
</div>
<div style="position:fixed;bottom:12px;right:16px;font-size:11px;color:#9ca3af;">${company} · ${quarter} QBR</div>
<script src="https://cdn.jsdelivr.net/npm/reveal.js@4/dist/reveal.min.js"></script>
<script>Reveal.initialize({ hash: true, plugins: [] });</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Quarter helper
// ---------------------------------------------------------------------------

function currentQuarter(): string {
    const now = new Date();
    const q = Math.ceil((now.getMonth() + 1) / 3);
    return `Q${q} ${now.getFullYear()}`;
}

// ---------------------------------------------------------------------------
// Public params / result
// ---------------------------------------------------------------------------

export interface QbrParams {
    prospectId: string;
    tenantId: string;
    botId: string;
    config: SalesAgentConfigRecord;
    dealId?: string;
    quarter?: string;
}

export interface QbrResult {
    ok: boolean;
    htmlContent?: string;
    quarter?: string;
    slideCount?: number;
    error?: string;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function generateQbr(
    params: QbrParams,
    prisma?: PrismaClient,
): Promise<QbrResult> {
    const { prospectId, tenantId, botId, config } = params;
    const db = prisma ? (prisma as unknown as PrismaWithQbr) : null;

    const prospect = db ? await db.prospect.findUnique({ where: { id: prospectId } }) : null;
    if (!prospect) return { ok: false, error: 'Prospect not found' };
    if (String(prospect['tenantId'] ?? '') !== tenantId) {
        return { ok: false, error: 'Tenant isolation violation' };
    }

    const prospectName = `${String(prospect['firstName'] ?? '')} ${String(prospect['lastName'] ?? '')}`.trim();
    const company = String(prospect['company'] ?? '');
    const industry = String(prospect['industry'] ?? 'your industry');
    const quarter = params.quarter ?? currentQuarter();

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

    const daysSinceClose = closedAt
        ? Math.round((Date.now() - closedAt.getTime()) / (1000 * 60 * 60 * 24))
        : 90;

    let recentActivities = '';
    if (db) {
        const acts = await db.salesActivity.findMany({
            where: { prospectId, tenantId },
            orderBy: { createdAt: 'desc' },
            take: 5,
        });
        recentActivities = acts.map(a => String(a['subject'])).join('; ');
    }

    const slides = await generateQbrSlides({
        prospectName, company, industry, quarter,
        product: config.productDescription.slice(0, 80),
        icp: config.icp,
        dealValue, currency, daysSinceClose, recentActivities,
    });

    const htmlContent = buildQbrHtml(slides, company, quarter);
    const now = new Date();

    if (db) {
        await db.salesActivity.create({
            data: {
                tenantId, botId, prospectId,
                dealId: dealId ?? null,
                activityType: 'qbr_generated',
                subject: `QBR deck generated: ${quarter} — ${company}`,
                body: `${slides.length}-slide QBR presentation prepared.`,
                outcome: 'generated',
                completedAt: now,
                createdAt: now,
                updatedAt: now,
            },
        }).catch(() => undefined);
    }

    return { ok: true, htmlContent, quarter, slideCount: slides.length };
}
