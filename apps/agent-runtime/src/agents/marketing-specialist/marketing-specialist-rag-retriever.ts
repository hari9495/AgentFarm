/**
 * Marketing Specialist — RAG Retriever
 *
 * Before the Marketing Specialist agent plans campaigns, builds email sequences,
 * or generates KPI reports, this module retrieves relevant prior work to inject
 * into the LLM prompt.
 *
 * Three retrieval paths run in parallel:
 *   1. Similar prior campaigns — past campaign plans, briefs, and performance
 *      reports that match the current channel/goal via cosine-similarity
 *   2. Channel best practices — platform-specific playbooks and creative
 *      guidelines from the domain library
 *   3. Marketing lessons — workspace-specific lessons from poor-performing
 *      campaigns and A/B test results (from marketing-specialist-lesson-pipeline.ts)
 */

import { normalizeIngestContent } from '../shared/rag-ingest-normalizer.js';
import { applyRagContextBudget } from '../shared/rag-context-limiter.js';
import type { MemoryRetrievalConfig } from '@agentfarm/memory-service';

export type MarketingChannel =
    | 'email'
    | 'ppc'
    | 'seo'
    | 'social'
    | 'content'
    | 'affiliate'
    | 'display'
    | 'video'
    | 'influencer'
    | 'webinar';

export type MarketingDocumentType =
    | 'campaign_plan'
    | 'email_sequence'
    | 'kpi_report'
    | 'competitor_analysis'
    | 'keyword_research'
    | 'ab_test_analysis'
    | 'creative_brief'
    | 'audience_segment'
    | 'social_calendar'
    | 'market_research';

export interface MarketingRagQuery {
    tenantId: string;
    botId?: string;
    campaignTitle: string;
    campaignDescription: string;
    documentType: MarketingDocumentType;
    channels?: MarketingChannel[];
    targetAudience?: string;
    goal?: 'awareness' | 'lead_gen' | 'conversion' | 'retention' | 'upsell';
    topKDocuments?: number;
    topKPlaybooks?: number;
    minSimilarity?: number;
}

export interface KbSearchResult {
    id: string;
    content: string;
    sourceUrl?: string;
    sourceType?: string;
    similarity: number;
}

export interface MarketingRagContext {
    contextBlock: string;
    similarCampaignCount: number;
    playbookChunkCount: number;
    lessonCount: number;
    retrievedAt: string;
}

async function searchKnowledgeBase(
    body: { tenantId: string; botId?: string; queryText: string; topK?: number; minSimilarity?: number },
    gatewayBaseUrl: string,
    serviceToken: string,
): Promise<KbSearchResult[]> {
    const base = gatewayBaseUrl.replace(/\/+$/, '');
    try {
        const res = await fetch(`${base}/v1/knowledge-base/search`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', Authorization: `Bearer ${serviceToken}` },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) return [];
        const data = (await res.json()) as { results?: Array<{ id?: string; content?: string; sourceUrl?: string; sourceType?: string; similarity?: number }> };
        return (data.results ?? []).filter((r) => r.id && r.content).map((r) => ({ id: r.id ?? '', content: r.content ?? '', sourceUrl: r.sourceUrl, sourceType: r.sourceType, similarity: r.similarity ?? 0 }));
    } catch { return []; }
}

export async function retrieveSimilarCampaigns(query: MarketingRagQuery, gatewayBaseUrl: string, serviceToken: string): Promise<KbSearchResult[]> {
    const queryText = [`Document type: ${query.documentType}`, `Campaign: ${query.campaignTitle}`, query.campaignDescription, query.channels?.length ? `Channels: ${query.channels.join(', ')}` : '', query.goal ? `Goal: ${query.goal}` : '', query.targetAudience ? `Audience: ${query.targetAudience}` : ''].filter(Boolean).join('\n');
    const results = await searchKnowledgeBase({ tenantId: query.tenantId, botId: query.botId, queryText, topK: query.topKDocuments ?? 3, minSimilarity: query.minSimilarity ?? 0.65 }, gatewayBaseUrl, serviceToken);
    return results.filter((r) => r.sourceType !== 'ms_channel_playbook_template');
}

export async function retrieveChannelPlaybooks(query: MarketingRagQuery, gatewayBaseUrl: string, serviceToken: string): Promise<KbSearchResult[]> {
    if (!query.channels?.length) return [];
    const queryText = [`Channel playbooks: ${query.channels.join(', ')}`, `Goal: ${query.goal ?? 'general'}`, query.documentType].filter(Boolean).join('\n');
    const results = await searchKnowledgeBase({ tenantId: query.tenantId, botId: query.botId, queryText, topK: query.topKPlaybooks ?? 4, minSimilarity: 0.55 }, gatewayBaseUrl, serviceToken);
    return results.filter((r) => r.sourceType === 'ms_channel_playbook_template');
}

export async function retrieveMarketingLessons(tenantId: string, workspaceId: string, gatewayBaseUrl: string, serviceToken: string): Promise<Array<{ pattern?: string; summary?: string; confidence?: number }>> {
    const base = gatewayBaseUrl.replace(/\/+$/, '');
    try {
        const res = await fetch(`${base}/v1/workspaces/${encodeURIComponent(workspaceId)}/memory/patterns`, { method: 'GET', headers: { 'content-type': 'application/json', Authorization: `Bearer ${serviceToken}`, 'x-tenant-id': tenantId }, signal: AbortSignal.timeout(10_000) });
        if (!res.ok) return [];
        const data = (await res.json()) as { patterns?: Array<{ pattern?: string; summary?: string; confidence?: number }> };
        return (data.patterns ?? []).filter((p) => typeof p.pattern === 'string' && p.pattern.startsWith('ms:lesson:'));
    } catch { return []; }
}

export async function buildMarketingRagContext(query: MarketingRagQuery, gatewayBaseUrl: string, serviceToken: string, workspaceId: string, config?: MemoryRetrievalConfig): Promise<MarketingRagContext> {
    const [similarCampaigns, playbookChunks, lessons] = await Promise.all([
        config?.usePriorWork !== false ? retrieveSimilarCampaigns(query, gatewayBaseUrl, serviceToken) : Promise.resolve([]),
        config?.useTemplates !== false ? retrieveChannelPlaybooks(query, gatewayBaseUrl, serviceToken) : Promise.resolve([]),
        config?.useLessons   !== false ? retrieveMarketingLessons(query.tenantId, workspaceId, gatewayBaseUrl, serviceToken) : Promise.resolve([]),
    ]);

    const sections: string[] = [];

    if (similarCampaigns.length > 0) {
        const lines = ['### Similar Prior Campaigns', 'Reference these past campaign artifacts. Adapt creative approach and targeting to the current brief.', ''];
        for (const c of similarCampaigns) { lines.push(`**Similarity ${Math.round(c.similarity * 100)}%${c.sourceUrl ? ` (${c.sourceUrl})` : ''}**`); lines.push(c.content.slice(0, 600) + (c.content.length > 600 ? '…' : '')); lines.push(''); }
        sections.push(lines.join('\n'));
    }
    if (playbookChunks.length > 0) {
        const lines = ['### Channel Playbooks', 'Apply the following channel-specific best practices and creative guidelines.', ''];
        for (const p of playbookChunks) { lines.push(p.content.slice(0, 800) + (p.content.length > 800 ? '…' : '')); lines.push(''); }
        sections.push(lines.join('\n'));
    }
    if (lessons.length > 0) {
        const lines = ['### Workspace Marketing Lessons', 'These lessons prevent repeated campaign mistakes. Apply proactively.', ''];
        [...lessons].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)).slice(0, 10).forEach((l) => { lines.push(`- ${l.summary ?? l.pattern ?? ''}${l.confidence !== undefined ? ` (confidence: ${Math.round(l.confidence * 100)}%)` : ''}`); });
        sections.push(lines.join('\n'));
    }

    return { contextBlock: sections.length > 0 ? applyRagContextBudget(`## Marketing Context\n\n${sections.join('\n---\n\n')}`) : '', similarCampaignCount: similarCampaigns.length, playbookChunkCount: playbookChunks.length, lessonCount: lessons.length, retrievedAt: new Date().toISOString() };
}

export async function ingestApprovedCampaign(params: { tenantId: string; botId?: string; campaignTitle: string; documentType: MarketingDocumentType; content: string; mimeType?: string; sourceUrl?: string; channels?: MarketingChannel[]; performanceScore?: number; gatewayBaseUrl: string; serviceToken: string }): Promise<boolean> {
    const { tenantId, botId, campaignTitle, documentType, content, mimeType, sourceUrl, channels, performanceScore, gatewayBaseUrl, serviceToken } = params;
    const base = gatewayBaseUrl.replace(/\/+$/, '');
    const normalizedContent = await normalizeIngestContent(content, mimeType);
    const enriched = [`[Marketing Approved: ${campaignTitle}]`, `Type: ${documentType}${channels?.length ? ` | Channels: ${channels.join(', ')}` : ''}${performanceScore !== undefined ? ` | Score: ${performanceScore}` : ''}`, '', normalizedContent].join('\n');
    try {
        const res = await fetch(`${base}/v1/knowledge-base/write`, { method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${serviceToken}` }, body: JSON.stringify({ tenantId, botId, content: enriched, sourceUrl: sourceUrl ?? `urn:agentfarm:ms:approved:${documentType}:${Date.now()}`, sourceType: 'ms_approved_campaign' }), signal: AbortSignal.timeout(15_000) });
        return res.ok;
    } catch { return false; }
}
