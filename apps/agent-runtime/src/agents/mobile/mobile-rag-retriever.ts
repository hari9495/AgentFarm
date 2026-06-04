/**
 * Mobile Agent — RAG Retriever
 *
 * Before the Mobile agent generates SwiftUI/Compose components, API clients, or
 * deep-link handlers, this module retrieves relevant prior work to inject into
 * the LLM prompt.
 *
 * Three retrieval paths run in parallel:
 *   1. Similar prior components — past SwiftUI/Compose implementations that
 *      match the current feature via cosine-similarity
 *   2. Design system & platform guidelines — HIG/Material Design rules and
 *      component library standards from the domain library
 *   3. Mobile lessons — workspace-specific lessons from App Store rejections,
 *      crash reports, and UX review feedback (from mobile-lesson-pipeline.ts)
 */

import { normalizeIngestContent } from '../shared/rag-ingest-normalizer.js';
import type { MemoryRetrievalConfig } from '@agentfarm/memory-service';

export type MobilePlatform = 'ios' | 'android' | 'cross_platform';
export type MobileDocumentType = 'ui_component' | 'api_client' | 'push_notification' | 'deep_link' | 'navigation' | 'state_management' | 'widget' | 'accessibility';

export interface MobileRagQuery {
    tenantId: string;
    botId?: string;
    componentTitle: string;
    componentDescription: string;
    documentType: MobileDocumentType;
    platform?: MobilePlatform;
    framework?: 'swiftui' | 'uikit' | 'compose' | 'flutter' | 'react_native';
    topKDocuments?: number;
    topKGuidelines?: number;
    minSimilarity?: number;
}

export interface KbSearchResult { id: string; content: string; sourceUrl?: string; sourceType?: string; similarity: number; }
export interface MobileRagContext { contextBlock: string; similarComponentCount: number; guidelineChunkCount: number; lessonCount: number; retrievedAt: string; }

async function searchKnowledgeBase(body: { tenantId: string; botId?: string; queryText: string; topK?: number; minSimilarity?: number }, gatewayBaseUrl: string, serviceToken: string): Promise<KbSearchResult[]> {
    const base = gatewayBaseUrl.replace(/\/+$/, '');
    try {
        const res = await fetch(`${base}/v1/knowledge-base/search`, { method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${serviceToken}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
        if (!res.ok) return [];
        const data = (await res.json()) as { results?: Array<{ id?: string; content?: string; sourceUrl?: string; sourceType?: string; similarity?: number }> };
        return (data.results ?? []).filter((r) => r.id && r.content).map((r) => ({ id: r.id ?? '', content: r.content ?? '', sourceUrl: r.sourceUrl, sourceType: r.sourceType, similarity: r.similarity ?? 0 }));
    } catch { return []; }
}

export async function retrieveSimilarComponents(query: MobileRagQuery, gatewayBaseUrl: string, serviceToken: string): Promise<KbSearchResult[]> {
    const queryText = [`Type: ${query.documentType}`, `Component: ${query.componentTitle}`, query.componentDescription, query.platform ? `Platform: ${query.platform}` : '', query.framework ? `Framework: ${query.framework}` : ''].filter(Boolean).join('\n');
    const results = await searchKnowledgeBase({ tenantId: query.tenantId, botId: query.botId, queryText, topK: query.topKDocuments ?? 3, minSimilarity: query.minSimilarity ?? 0.65 }, gatewayBaseUrl, serviceToken);
    return results.filter((r) => r.sourceType !== 'mobile_platform_guideline');
}

export async function retrievePlatformGuidelines(query: MobileRagQuery, gatewayBaseUrl: string, serviceToken: string): Promise<KbSearchResult[]> {
    const queryText = [`Platform guideline for: ${query.documentType}`, query.platform ? `Platform: ${query.platform}` : '', query.framework ?? ''].filter(Boolean).join('\n');
    const results = await searchKnowledgeBase({ tenantId: query.tenantId, botId: query.botId, queryText, topK: query.topKGuidelines ?? 4, minSimilarity: 0.55 }, gatewayBaseUrl, serviceToken);
    return results.filter((r) => r.sourceType === 'mobile_platform_guideline');
}

export async function retrieveMobileLessons(tenantId: string, workspaceId: string, gatewayBaseUrl: string, serviceToken: string): Promise<Array<{ pattern?: string; summary?: string; confidence?: number }>> {
    const base = gatewayBaseUrl.replace(/\/+$/, '');
    try {
        const res = await fetch(`${base}/v1/workspaces/${encodeURIComponent(workspaceId)}/memory/patterns`, { method: 'GET', headers: { 'content-type': 'application/json', Authorization: `Bearer ${serviceToken}`, 'x-tenant-id': tenantId }, signal: AbortSignal.timeout(10_000) });
        if (!res.ok) return [];
        const data = (await res.json()) as { patterns?: Array<{ pattern?: string; summary?: string; confidence?: number }> };
        return (data.patterns ?? []).filter((p) => typeof p.pattern === 'string' && p.pattern.startsWith('mobile:lesson:'));
    } catch { return []; }
}

export async function buildMobileRagContext(query: MobileRagQuery, gatewayBaseUrl: string, serviceToken: string, workspaceId: string, config?: MemoryRetrievalConfig): Promise<MobileRagContext> {
    const [similarComponents, guidelineChunks, lessons] = await Promise.all([
        config?.usePriorWork !== false ? retrieveSimilarComponents(query, gatewayBaseUrl, serviceToken) : Promise.resolve([]),
        config?.useTemplates !== false ? retrievePlatformGuidelines(query, gatewayBaseUrl, serviceToken) : Promise.resolve([]),
        config?.useLessons   !== false ? retrieveMobileLessons(query.tenantId, workspaceId, gatewayBaseUrl, serviceToken) : Promise.resolve([]),
    ]);

    const sections: string[] = [];
    if (similarComponents.length > 0) {
        const lines = ['### Similar Prior Components', 'Reference these past approved implementations. Adapt to current requirements.', ''];
        for (const c of similarComponents) { lines.push(`**Similarity ${Math.round(c.similarity * 100)}%${c.sourceUrl ? ` (${c.sourceUrl})` : ''}**`); lines.push(c.content.slice(0, 600) + (c.content.length > 600 ? '…' : '')); lines.push(''); }
        sections.push(lines.join('\n'));
    }
    if (guidelineChunks.length > 0) {
        const lines = ['### Platform Guidelines', 'Apply these HIG/Material Design rules and platform constraints.', ''];
        for (const g of guidelineChunks) { lines.push(g.content.slice(0, 800) + (g.content.length > 800 ? '…' : '')); lines.push(''); }
        sections.push(lines.join('\n'));
    }
    if (lessons.length > 0) {
        const lines = ['### Workspace Mobile Lessons', 'These lessons prevent App Store rejections and crash regressions.', ''];
        [...lessons].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)).slice(0, 10).forEach((l) => { lines.push(`- ${l.summary ?? l.pattern ?? ''}${l.confidence !== undefined ? ` (confidence: ${Math.round(l.confidence * 100)}%)` : ''}`); });
        sections.push(lines.join('\n'));
    }

    return { contextBlock: sections.length > 0 ? `## Mobile Dev Context\n\n${sections.join('\n---\n\n')}` : '', similarComponentCount: similarComponents.length, guidelineChunkCount: guidelineChunks.length, lessonCount: lessons.length, retrievedAt: new Date().toISOString() };
}

export async function ingestApprovedMobileComponent(params: { tenantId: string; botId?: string; componentTitle: string; documentType: MobileDocumentType; content: string; mimeType?: string; sourceUrl?: string; platform?: MobilePlatform; framework?: string; gatewayBaseUrl: string; serviceToken: string }): Promise<boolean> {
    const { tenantId, botId, componentTitle, documentType, content, mimeType, sourceUrl, platform, framework, gatewayBaseUrl, serviceToken } = params;
    const base = gatewayBaseUrl.replace(/\/+$/, '');
    const normalizedContent = await normalizeIngestContent(content, mimeType);
    const enriched = [`[Mobile Approved: ${componentTitle}]`, `Type: ${documentType}${platform ? ` | Platform: ${platform}` : ''}${framework ? ` | Framework: ${framework}` : ''}`, '', normalizedContent].join('\n');
    try {
        const res = await fetch(`${base}/v1/knowledge-base/write`, { method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${serviceToken}` }, body: JSON.stringify({ tenantId, botId, content: enriched, sourceUrl: sourceUrl ?? `urn:agentfarm:mobile:approved:${documentType}:${Date.now()}`, sourceType: 'mobile_approved_component' }), signal: AbortSignal.timeout(15_000) });
        return res.ok;
    } catch { return false; }
}
