/**
 * slide-deck-generator.ts
 *
 * Generates a tailored reveal.js HTML slide deck for a product demo.
 *
 * workspace_slide_deck_generate
 *   payload: { prospect_id, deal_id?, custom_sections? }
 *
 * The LLM produces structured slide content; this module wraps it in a
 * self-contained reveal.js HTML page (CDN-loaded) that the agent can open
 * in the browser executor for screen-sharing, or email as an attachment URL.
 */

import type { PrismaClient } from '@prisma/client';
import type { SalesAgentConfigRecord, SlideDeck, SlideDeckSlide } from '@agentfarm/shared-types';

const SLIDE_MODEL = 'claude-sonnet-4-20250514';

type PrismaWithSlides = {
    prospect: {
        findUnique: (args: { where: { id: string } }) => Promise<Record<string, unknown> | null>;
    };
    salesDeal: {
        findFirst: (args: { where: Record<string, unknown> }) => Promise<Record<string, unknown> | null>;
    };
    salesActivity: {
        create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }>;
    };
};

// ---------------------------------------------------------------------------
// HTML template
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function buildSlideHtml(slide: SlideDeckSlide): string {
    const pointsHtml = slide.points.length > 0
        ? `<ul>\n${slide.points.map(p => `      <li>${escapeHtml(p)}</li>`).join('\n')}\n    </ul>`
        : '';
    const notesHtml = slide.speakerNotes
        ? `\n    <aside class="notes">${escapeHtml(slide.speakerNotes)}</aside>`
        : '';
    return `  <section>\n    <h2>${escapeHtml(slide.title)}</h2>\n    ${pointsHtml}${notesHtml}\n  </section>`;
}

function buildRevealHtml(slides: SlideDeckSlide[], prospectName: string, company: string): string {
    const slidesHtml = slides.map(buildSlideHtml).join('\n');
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Product Demo — ${escapeHtml(company)}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@4/dist/reset.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@4/dist/reveal.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@4/dist/theme/simple.css">
  <style>
    .reveal h1, .reveal h2 { color: #1d4ed8; }
    .reveal ul { text-align: left; line-height: 1.7; }
    .reveal li { margin-bottom: 8px; }
    .reveal .slides section { padding: 24px 40px; }
    .reveal h2 { font-size: 1.5em; margin-bottom: 0.6em; }
    .prospect-label {
      position: fixed; bottom: 12px; right: 20px;
      font-size: 0.65em; color: #9ca3af; font-family: sans-serif;
    }
  </style>
</head>
<body>
<div class="reveal">
  <div class="slides">
${slidesHtml}
  </div>
</div>
<div class="prospect-label">Prepared for ${escapeHtml(prospectName)} · ${escapeHtml(company)}</div>
<script src="https://cdn.jsdelivr.net/npm/reveal.js@4/dist/reveal.js"></script>
<script>Reveal.initialize({ hash: true, transition: 'slide', controls: true, progress: true });</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Fallback slide content (used when LLM is unavailable)
// ---------------------------------------------------------------------------

function buildFallbackSlides(
    company: string,
    productDescription: string,
): SlideDeckSlide[] {
    return [
        {
            type: 'title',
            title: 'Welcome',
            points: [`Prepared for ${company}`, productDescription],
        },
        {
            type: 'problem',
            title: 'The Challenge',
            points: ['Growing complexity in your space', 'Pressure to do more with less', 'Need for reliable, scalable solutions'],
        },
        {
            type: 'solution',
            title: 'Our Approach',
            points: [productDescription, 'Purpose-built for your industry', 'Proven results with similar companies'],
        },
        {
            type: 'feature',
            title: 'Key Capabilities',
            points: ['Core feature 1', 'Core feature 2', 'Core feature 3'],
        },
        {
            type: 'social_proof',
            title: 'Trusted by Teams Like Yours',
            points: ['Rapid time-to-value', 'Dedicated support', 'Flexible deployment'],
        },
        {
            type: 'close',
            title: 'Next Steps',
            points: ['Review proposal', 'Pilot / proof-of-concept', 'Go live'],
        },
    ];
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export interface GenerateSlideDeckParams {
    prospectId: string;
    tenantId: string;
    botId: string;
    config: SalesAgentConfigRecord;
    customSections?: string[];
}

export async function generateSlideDeck(
    params: GenerateSlideDeckParams,
    prisma?: PrismaClient,
): Promise<SlideDeck> {
    const { prospectId, tenantId, botId, config, customSections } = params;

    const db = prisma ? (prisma as unknown as PrismaWithSlides) : null;

    let prospect: Record<string, unknown> | null = null;
    let deal: Record<string, unknown> | null = null;

    if (db) {
        [prospect, deal] = await Promise.all([
            db.prospect.findUnique({ where: { id: prospectId } }),
            db.salesDeal.findFirst({ where: { prospectId, tenantId } }),
        ]);
        if (prospect && String(prospect['tenantId'] ?? '') !== tenantId) {
            throw new Error(`Tenant isolation violation: prospect ${prospectId}`);
        }
    }

    const prospectName = prospect
        ? `${String(prospect['firstName'] ?? '')} ${String(prospect['lastName'] ?? '')}`.trim()
        : 'Valued Prospect';
    const company = String(prospect?.['company'] ?? '');
    const industry = prospect?.['industry'] ? String(prospect['industry']) : undefined;
    const title = prospect?.['title'] ? String(prospect['title']) : undefined;
    const dealStage = deal?.['stage'] ? String(deal['stage']) : undefined;

    const apiKey = process.env['ANTHROPIC_API_KEY'];

    let slides: SlideDeckSlide[] = buildFallbackSlides(company, config.productDescription);

    if (apiKey) {
        const system = `You are an expert sales presentation designer. Create a concise, tailored slide deck outline.
Return ONLY valid JSON (no markdown) as an array of slide objects:
[
  {
    "type": "title|problem|solution|feature|social_proof|close",
    "title": "string",
    "points": ["string", "string"],
    "speakerNotes": "string"
  }
]
Generate 6-8 slides. Each slide must have 2-4 bullet points. Speaker notes should be 1-2 sentences.
Do NOT invent specific company names, logos, or exact pricing figures.
Focus on the prospect's specific industry and role pain points.`;

        const customStr = customSections?.length
            ? `\nInclude sections on: ${customSections.join(', ')}`
            : '';
        const dealStr = dealStage ? `\nDeal stage: ${dealStage}` : '';

        const userPrompt = `Create a product demo slide deck.
Prospect: ${prospectName}, ${title ?? 'professional'} at ${company}
Industry: ${industry ?? 'not specified'}
Product: ${config.productDescription}
ICP: ${config.icp}${customStr}${dealStr}
Tailor every slide to ${company}'s specific context and pain points.`;

        try {
            const llmRes = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                },
                body: JSON.stringify({
                    model: SLIDE_MODEL,
                    max_tokens: 2048,
                    system,
                    messages: [{ role: 'user', content: userPrompt }],
                }),
            });

            if (llmRes.ok) {
                const parsed = await llmRes.json() as { content: Array<{ type: string; text?: string }> };
                const raw = parsed.content.filter(b => b.type === 'text').map(b => b.text ?? '').join('');
                const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
                const arr = JSON.parse(cleaned) as SlideDeckSlide[];
                if (Array.isArray(arr) && arr.length > 0) {
                    slides = arr;
                }
            }
        } catch {
            // LLM failure is non-fatal — use fallback slides
        }
    }

    const htmlContent = buildRevealHtml(slides, prospectName, company);

    const deck: SlideDeck = {
        prospectId,
        prospectName,
        company,
        totalSlides: slides.length,
        slides,
        htmlContent,
        generatedAt: new Date().toISOString(),
    };

    if (db) {
        await db.salesActivity.create({
            data: {
                tenantId,
                botId,
                prospectId,
                dealId: deal?.['id'] ? String(deal['id']) : null,
                activityType: 'slide_deck_generated',
                subject: `Slide deck generated — ${prospectName} at ${company} (${slides.length} slides)`,
                body: JSON.stringify({ totalSlides: slides.length, slides: slides.map(s => s.title), generatedAt: deck.generatedAt }),
                outcome: 'generated',
                completedAt: new Date(),
                createdAt: new Date(),
                updatedAt: new Date(),
            },
        }).catch(() => undefined);
    }

    return deck;
}
