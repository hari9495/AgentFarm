/**
 * demo-script-generator.ts
 *
 * LLM engine for all product demo content.
 *
 * Exports:
 *   generateDemoScript()       — full personalized demo script (workspace_demo_script_generate)
 *   generateDemoFollowupEmail() — post-demo summary email body (workspace_demo_followup)
 */

import type { PrismaClient } from '@prisma/client';
import type {
    DemoScript,
    DemoScriptSection,
    SalesAgentConfigRecord,
} from '@agentfarm/shared-types';

const DEMO_MODEL = 'claude-sonnet-4-20250514';

// ---------------------------------------------------------------------------
// Prisma shape
// ---------------------------------------------------------------------------

type PrismaWithDemo = {
    prospect: {
        findUnique: (args: { where: { id: string } }) => Promise<Record<string, unknown> | null>;
    };
    salesActivity: {
        findMany: (args: {
            where: Record<string, unknown>;
            orderBy?: Record<string, unknown>;
            take?: number;
        }) => Promise<Record<string, unknown>[]>;
        create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }>;
    };
    salesDeal: {
        findFirst: (args: { where: Record<string, unknown> }) => Promise<Record<string, unknown> | null>;
    };
};

// ---------------------------------------------------------------------------
// Demo script generation
// ---------------------------------------------------------------------------

export interface GenerateDemoScriptParams {
    prospectId: string;
    tenantId: string;
    botId: string;
    config: SalesAgentConfigRecord;
    durationMinutes?: number;
    focusAreas?: string[];
}

function buildFallbackDemoScript(
    prospectId: string,
    tenantId: string,
    prospectName: string,
    company: string,
    industry: string | undefined,
    title: string | undefined,
    config: SalesAgentConfigRecord,
    durationMinutes: number,
): DemoScript {
    const section: DemoScriptSection = {
        title: 'Product Walkthrough',
        durationMinutes: durationMinutes - 5,
        speakingNotes: `Let me show you how ${config.productDescription} works for companies like ${company}.`,
        slideTitle: 'Product Walkthrough',
        slidePoints: ['Key capabilities overview', 'Live demonstration', 'Integration overview'],
        objectionHandlers: [
            { trigger: 'too expensive', response: 'Our pricing is flexible — let me walk you through the ROI calculation.' },
            { trigger: 'not right time', response: 'Completely understand. When would be a better time to revisit this?' },
        ],
    };

    return {
        id: `demo-${Date.now()}`,
        prospectId,
        tenantId,
        prospectName,
        company,
        industry,
        title,
        totalDurationMinutes: durationMinutes,
        opener: `Thank you for joining today, ${prospectName}. I'll give you a quick ${durationMinutes}-minute overview of ${config.productDescription} and how it's helped companies like ${company}.`,
        sections: [section],
        close: `That covers the key features. Based on what you've seen, how does this align with what ${company} is looking to achieve?`,
        callToAction: 'Can we schedule a follow-up to discuss next steps?',
        postDemoNextSteps: ['Send proposal', 'Schedule follow-up', 'Share case studies'],
        generatedAt: new Date().toISOString(),
    };
}

export async function generateDemoScript(
    params: GenerateDemoScriptParams,
    prisma?: PrismaClient,
): Promise<DemoScript> {
    const { prospectId, tenantId, botId, config, durationMinutes = 30, focusAreas } = params;

    const db = prisma ? (prisma as unknown as PrismaWithDemo) : null;

    // Load prospect + recent activities + open deal for personalization
    let prospect: Record<string, unknown> | null = null;
    let activities: Record<string, unknown>[] = [];
    let deal: Record<string, unknown> | null = null;

    if (db) {
        [prospect, activities, deal] = await Promise.all([
            db.prospect.findUnique({ where: { id: prospectId } }),
            db.salesActivity.findMany({
                where: { prospectId, tenantId },
                orderBy: { createdAt: 'desc' },
                take: 10,
            }),
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
    const companySize = prospect?.['companySize'] ? String(prospect['companySize']) : undefined;

    const dealStage = deal?.['stage'] ? String(deal['stage']) : undefined;
    const dealValue = deal?.['value'] != null ? String(deal['value']) : undefined;

    const recentActivitySummary = activities
        .slice(0, 5)
        .map(a => `${String(a['activityType'])}: ${String(a['subject'] ?? '')}`)
        .join('; ');

    const apiKey = process.env['ANTHROPIC_API_KEY'];

    if (!apiKey) {
        return buildFallbackDemoScript(prospectId, tenantId, prospectName, company, industry, title, config, durationMinutes);
    }

    const system = `You are an expert sales engineer and demo coach. Generate a personalized product demo script.
Return ONLY valid JSON (no markdown) matching this exact schema:
{
  "opener": "string",
  "sections": [
    {
      "title": "string",
      "durationMinutes": number,
      "speakingNotes": "string",
      "slideTitle": "string",
      "slidePoints": ["string"],
      "objectionHandlers": [{"trigger": "string", "response": "string"}]
    }
  ],
  "close": "string",
  "callToAction": "string",
  "postDemoNextSteps": ["string"]
}
Generate 3-5 sections. Each section must have speakingNotes of at least 2 sentences.
Objection handlers should address real objections someone in this role/industry would raise.`;

    const focusStr = focusAreas?.length ? `\nFocus areas requested: ${focusAreas.join(', ')}` : '';
    const dealStr = dealStage ? `\nDeal stage: ${dealStage}${dealValue ? ` | Value: ${dealValue}` : ''}` : '';
    const activityStr = recentActivitySummary ? `\nRecent interactions: ${recentActivitySummary}` : '';

    const userPrompt = `Generate a ${durationMinutes}-minute demo script.

Prospect: ${prospectName}
Role: ${title ?? 'professional'}
Company: ${company}
Industry: ${industry ?? 'not specified'}
Company size: ${companySize ?? 'not specified'}
Product: ${config.productDescription}
ICP: ${config.icp}
Tone: ${config.emailTone}${focusStr}${dealStr}${activityStr}

Tailor the pain points, use cases, and objection handlers specifically to this person's role and industry.
Do not invent company names or pricing. Focus on value.`;

    let parsedScript: Partial<DemoScript> = {};

    try {
        const llmRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: DEMO_MODEL,
                max_tokens: 4096,
                system,
                messages: [{ role: 'user', content: userPrompt }],
            }),
        });

        if (llmRes.ok) {
            const parsed = await llmRes.json() as { content: Array<{ type: string; text?: string }> };
            const raw = parsed.content.filter(b => b.type === 'text').map(b => b.text ?? '').join('');
            const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
            const obj = JSON.parse(cleaned) as Record<string, unknown>;

            parsedScript = {
                opener: typeof obj['opener'] === 'string' ? obj['opener'] : undefined,
                sections: Array.isArray(obj['sections']) ? (obj['sections'] as DemoScriptSection[]) : undefined,
                close: typeof obj['close'] === 'string' ? obj['close'] : undefined,
                callToAction: typeof obj['callToAction'] === 'string' ? obj['callToAction'] : undefined,
                postDemoNextSteps: Array.isArray(obj['postDemoNextSteps'])
                    ? (obj['postDemoNextSteps'] as string[])
                    : undefined,
            };
        }
    } catch {
        // LLM failure is non-fatal — use fallback
    }

    const fallback = buildFallbackDemoScript(prospectId, tenantId, prospectName, company, industry, title, config, durationMinutes);

    const script: DemoScript = {
        id: `demo-${Date.now()}`,
        prospectId,
        tenantId,
        prospectName,
        company,
        industry,
        title,
        totalDurationMinutes: durationMinutes,
        opener: parsedScript.opener ?? fallback.opener,
        sections: parsedScript.sections ?? fallback.sections,
        close: parsedScript.close ?? fallback.close,
        callToAction: parsedScript.callToAction ?? fallback.callToAction,
        postDemoNextSteps: parsedScript.postDemoNextSteps ?? fallback.postDemoNextSteps,
        generatedAt: new Date().toISOString(),
    };

    // Persist as SalesActivity for audit + retrieval
    if (db) {
        await db.salesActivity.create({
            data: {
                tenantId,
                botId,
                prospectId,
                dealId: deal?.['id'] ? String(deal['id']) : null,
                activityType: 'demo_script_generated',
                subject: `Demo script generated — ${prospectName} at ${company}`,
                body: JSON.stringify(script),
                outcome: 'generated',
                completedAt: new Date(),
                createdAt: new Date(),
                updatedAt: new Date(),
            },
        }).catch(() => undefined);
    }

    return script;
}

// ---------------------------------------------------------------------------
// Post-demo follow-up email generation
// ---------------------------------------------------------------------------

export interface GenerateFollowupParams {
    prospectId: string;
    tenantId: string;
    botId: string;
    config: SalesAgentConfigRecord;
    meetingNotes?: string;
    questionsAsked?: string[];
    demoOutcome?: 'completed' | 'partial' | 'rescheduled';
}

export interface FollowupEmailContent {
    subject: string;
    body: string;
}

export async function generateDemoFollowupEmail(
    params: GenerateFollowupParams,
    prisma?: PrismaClient,
): Promise<FollowupEmailContent> {
    const { prospectId, tenantId, config, meetingNotes, questionsAsked, demoOutcome = 'completed' } = params;

    const db = prisma ? (prisma as unknown as PrismaWithDemo) : null;
    const prospect = db ? await db.prospect.findUnique({ where: { id: prospectId } }) : null;

    if (prospect && String(prospect['tenantId'] ?? '') !== tenantId) {
        throw new Error('Tenant isolation violation');
    }

    const prospectName = prospect
        ? `${String(prospect['firstName'] ?? '')} ${String(prospect['lastName'] ?? '')}`.trim()
        : 'there';
    const company = String(prospect?.['company'] ?? '');

    const fallback: FollowupEmailContent = {
        subject: `Follow-up from our demo — next steps`,
        body: `Hi ${prospectName},\n\nThank you for taking the time today. I hope the overview of ${config.productDescription} was helpful.\n\nPlease feel free to reply with any questions. I'd love to discuss next steps.\n\nBest,`,
    };

    const apiKey = process.env['ANTHROPIC_API_KEY'];
    if (!apiKey) return fallback;

    const system = `You are an expert sales follow-up writer. Write a concise, warm post-demo follow-up email (under 150 words).
Summarize what was covered, address any questions raised, and propose a clear next step.
Return ONLY valid JSON (no markdown): { "subject": "...", "body": "..." }`;

    const questionsStr = questionsAsked?.length
        ? `\nQuestions the prospect asked: ${questionsAsked.join('; ')}`
        : '';
    const notesStr = meetingNotes ? `\nMeeting notes: ${meetingNotes}` : '';

    const userPrompt = `Write a post-demo follow-up email.
Prospect: ${prospectName} at ${company}
Product: ${config.productDescription}
Demo outcome: ${demoOutcome}${notesStr}${questionsStr}
Tone: ${config.emailTone}`;

    try {
        const llmRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: DEMO_MODEL,
                max_tokens: 512,
                system,
                messages: [{ role: 'user', content: userPrompt }],
            }),
        });

        if (llmRes.ok) {
            const parsed = await llmRes.json() as { content: Array<{ type: string; text?: string }> };
            const raw = parsed.content.filter(b => b.type === 'text').map(b => b.text ?? '').join('');
            const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
            const obj = JSON.parse(cleaned) as Record<string, unknown>;
            const subject = typeof obj['subject'] === 'string' ? obj['subject'].trim() : '';
            const body = typeof obj['body'] === 'string' ? obj['body'].trim() : '';
            if (subject && body) return { subject, body };
        }
    } catch {
        // non-fatal — fall back
    }

    return fallback;
}
