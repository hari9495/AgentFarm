import type { PrismaClient } from '@prisma/client';
import type { PreMeetingBrief } from '@agentfarm/shared-types';

const RESEARCH_MODEL = 'claude-sonnet-4-20250514';

type PrismaWithSales = {
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

export async function generatePreMeetingBrief(
    prospectId: string,
    tenantId: string,
    prisma?: PrismaClient,
): Promise<PreMeetingBrief> {
    const db = prisma ? (prisma as unknown as PrismaWithSales) : null;

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
            db.salesDeal.findFirst({
                where: { prospectId, tenantId },
            }),
        ]);
    }

    const prospectName = prospect
        ? `${String(prospect['firstName'] ?? '')} ${String(prospect['lastName'] ?? '')}`.trim()
        : 'Valued Prospect';
    const company = String(prospect?.['company'] ?? '');
    const title = prospect?.['title'] ? String(prospect['title']) : undefined;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    const system = `You are an expert sales research assistant. Prepare a concise pre-meeting research brief.
Return ONLY valid JSON (no markdown):
{
  "suggestedTopics": ["..."],
  "riskSignals": ["..."]
}`;

    const userPrompt = `Prospect: ${prospectName}, ${title ?? 'unknown role'} at ${company}
Recent activities (${activities.length}): ${JSON.stringify(activities.slice(0, 3))}
Open deal: ${deal ? `${String(deal['title'])} — stage ${String(deal['stage'])}, value ${String(deal['value'] ?? 'unknown')}` : 'None'}
Generate 3-5 suggested conversation topics and 2-3 risk signals.`;

    let suggestedTopics: string[] = [`Learn more about ${company}'s needs`];
    let riskSignals: string[] = [];

    try {
        if (apiKey) {
            const llmRes = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                },
                body: JSON.stringify({
                    model: RESEARCH_MODEL,
                    max_tokens: 512,
                    system,
                    messages: [{ role: 'user', content: userPrompt }],
                }),
            });

            if (llmRes.ok) {
                const parsed = await llmRes.json() as { content: Array<{ type: string; text?: string }> };
                const raw = parsed.content.filter(b => b.type === 'text').map(b => b.text ?? '').join('');
                const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
                let llmData: unknown;
                try { llmData = JSON.parse(cleaned); } catch { llmData = null; }
                if (llmData && typeof llmData === 'object') {
                    const obj = llmData as Record<string, unknown>;
                    const topics = Array.isArray(obj['suggestedTopics'])
                        ? (obj['suggestedTopics'] as unknown[]).filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
                        : [];
                    const risks = Array.isArray(obj['riskSignals'])
                        ? (obj['riskSignals'] as unknown[]).filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
                        : [];
                    if (topics.length > 0) suggestedTopics = topics;
                    if (risks.length > 0) riskSignals = risks;
                }
            }
        }
    } catch {
        // LLM failure is non-fatal; use defaults
    }

    const brief: PreMeetingBrief = {
        prospectId,
        tenantId,
        prospectName,
        company,
        title,
        recentInteractions: activities.slice(0, 5).map(a => ({
            activityType: String(a['activityType'] ?? ''),
            subject: String(a['subject'] ?? ''),
            outcome: a['outcome'] ? String(a['outcome']) : undefined,
            completedAt: a['completedAt'] ? String(a['completedAt']) : undefined,
        })),
        openDealValue: deal?.['value'] != null ? Number(deal['value']) : undefined,
        dealStage: deal?.['stage'] ? String(deal['stage']) : undefined,
        suggestedTopics,
        riskSignals,
        generatedAt: new Date().toISOString(),
    };

    // Persist as SalesActivity for audit trail
    if (db && prospect) {
        await db.salesActivity.create({
            data: {
                tenantId,
                botId: String(prospect['botId'] ?? ''),
                prospectId,
                activityType: 'note',
                subject: 'Pre-meeting research brief',
                body: JSON.stringify(brief),
                completedAt: new Date(),
            },
        }).catch((err: unknown) => {
            console.warn('[pre-meeting-research] Failed to persist brief:', err);
        });
    }

    return brief;
}

/**
 * Schedules pre-meeting research to run `delayMs` before the meeting.
 * Fire-and-forget — never throws.
 */
export function scheduleMeetingResearch(
    prospectId: string,
    tenantId: string,
    _botId: string,
    scheduledAt: Date,
    prisma?: PrismaClient,
): void {
    const delay = Math.max(0, scheduledAt.getTime() - Date.now());
    setTimeout(() => {
        generatePreMeetingBrief(prospectId, tenantId, prisma).catch((err: unknown) => {
            console.warn('[pre-meeting-research] scheduledBrief failed:', err);
        });
    }, delay);
}
