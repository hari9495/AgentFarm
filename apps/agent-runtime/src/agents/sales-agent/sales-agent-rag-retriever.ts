/**
 * Sales Agent — RAG Retriever
 *
 * Before the Sales agent drafts emails, proposals, scripts, or objection responses,
 * this module retrieves relevant prior work and domain knowledge to inject into the
 * LLM prompt.
 *
 * Three retrieval paths run in parallel:
 *   1. Similar prior work — past proposals, outreach emails, and deal artifacts that
 *      match the current prospect/deal context via cosine-similarity search
 *   2. Objection & playbook templates — winning rebuttal scripts and negotiation
 *      playbooks from the domain library
 *   3. Deal lessons — workspace-specific lessons learned from won/lost deals and
 *      stakeholder feedback (from sales-agent-lesson-pipeline.ts)
 *
 * All three results are formatted into a single `## Sales Context` block injected
 * into the sales agent's system prompt before every generative action.
 *
 * APIs used:
 *   POST /v1/knowledge-base/search  — cosine-similarity search
 *   GET  /v1/workspaces/:id/memory/patterns — long-term lesson patterns
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

import { normalizeIngestContent } from '../shared/rag-ingest-normalizer.js';
import { applyRagContextBudget } from '../shared/rag-context-limiter.js';
import type { MemoryRetrievalConfig } from '@agentfarm/memory-service';

export type SalesDomain =
    | 'saas'
    | 'enterprise'
    | 'smb'
    | 'ecommerce'
    | 'finance'
    | 'healthcare'
    | 'logistics'
    | 'hr_tech'
    | 'marketplace';

export type SalesDocumentType =
    | 'outreach_email'
    | 'follow_up_sequence'
    | 'proposal'
    | 'contract'
    | 'demo_script'
    | 'objection_rebuttal'
    | 'qbr'
    | 'negotiation_playbook'
    | 'upsell_email'
    | 'nps_survey';

export interface SalesRagQuery {
    tenantId: string;
    botId?: string;
    /** Prospect company name or deal title. */
    prospectName: string;
    /** Description of the prospect's pain points, industry, or deal context. */
    contextDescription: string;
    /** The type of sales artifact being generated. */
    documentType: SalesDocumentType;
    /** Industry/domain of the prospect. */
    domain?: SalesDomain;
    /** Deal stage for targeted retrieval. */
    dealStage?: 'prospecting' | 'qualification' | 'demo' | 'proposal' | 'negotiation' | 'closed';
    /** ICP (Ideal Customer Profile) vertical tags. */
    icpTags?: string[];
    /** Maximum number of similar prior artifacts to retrieve. Default: 3. */
    topKDocuments?: number;
    /** Maximum number of playbook/template chunks to retrieve. Default: 4. */
    topKPlaybooks?: number;
    /** Minimum cosine similarity threshold. Default: 0.65. */
    minSimilarity?: number;
}

export interface KbSearchResult {
    id: string;
    content: string;
    sourceUrl?: string;
    sourceType?: string;
    similarity: number;
}

export interface SalesRagContext {
    contextBlock: string;
    similarArtifactCount: number;
    playbookChunkCount: number;
    lessonCount: number;
    retrievedAt: string;
}

// ---------------------------------------------------------------------------
// Knowledge base search client
// ---------------------------------------------------------------------------

interface KbSearchBody {
    tenantId: string;
    botId?: string;
    queryText: string;
    topK?: number;
    minSimilarity?: number;
}

interface KbSearchResponse {
    results?: Array<{
        id?: string;
        content?: string;
        sourceUrl?: string;
        sourceType?: string;
        similarity?: number;
    }>;
}

async function searchKnowledgeBase(
    body: KbSearchBody,
    gatewayBaseUrl: string,
    serviceToken: string,
): Promise<KbSearchResult[]> {
    const base = gatewayBaseUrl.replace(/\/+$/, '');
    try {
        const res = await fetch(`${base}/v1/knowledge-base/search`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                Authorization: `Bearer ${serviceToken}`,
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) return [];
        const data = (await res.json()) as KbSearchResponse;
        return (data.results ?? [])
            .filter((r) => r.id && r.content)
            .map((r) => ({
                id: r.id ?? '',
                content: r.content ?? '',
                sourceUrl: r.sourceUrl,
                sourceType: r.sourceType,
                similarity: r.similarity ?? 0,
            }));
    } catch {
        return [];
    }
}

// ---------------------------------------------------------------------------
// Retrieval path 1 — Similar prior sales artifacts
// ---------------------------------------------------------------------------

export async function retrieveSimilarSalesArtifacts(
    query: SalesRagQuery,
    gatewayBaseUrl: string,
    serviceToken: string,
): Promise<KbSearchResult[]> {
    const queryText = [
        `Document type: ${query.documentType}`,
        `Prospect: ${query.prospectName}`,
        query.contextDescription,
        query.domain ? `Industry: ${query.domain}` : '',
        query.dealStage ? `Deal stage: ${query.dealStage}` : '',
        query.icpTags?.length ? `ICP tags: ${query.icpTags.join(', ')}` : '',
    ]
        .filter(Boolean)
        .join('\n');

    const results = await searchKnowledgeBase(
        {
            tenantId: query.tenantId,
            botId: query.botId,
            queryText,
            topK: query.topKDocuments ?? 3,
            minSimilarity: query.minSimilarity ?? 0.65,
        },
        gatewayBaseUrl,
        serviceToken,
    );

    return results.filter((r) => r.sourceType !== 'sales_playbook_template');
}

// ---------------------------------------------------------------------------
// Retrieval path 2 — Objection scripts & playbook templates
// ---------------------------------------------------------------------------

export async function retrieveSalesPlaybooks(
    query: SalesRagQuery,
    gatewayBaseUrl: string,
    serviceToken: string,
): Promise<KbSearchResult[]> {
    const playbookQueryText = [
        `Sales playbook for: ${query.documentType}`,
        query.domain ? `Industry: ${query.domain}` : '',
        query.dealStage ? `Stage: ${query.dealStage}` : '',
        query.contextDescription.slice(0, 300),
    ]
        .filter(Boolean)
        .join('\n');

    const results = await searchKnowledgeBase(
        {
            tenantId: query.tenantId,
            botId: query.botId,
            queryText: playbookQueryText,
            topK: query.topKPlaybooks ?? 4,
            minSimilarity: 0.55,
        },
        gatewayBaseUrl,
        serviceToken,
    );

    return results.filter((r) => r.sourceType === 'sales_playbook_template');
}

// ---------------------------------------------------------------------------
// Retrieval path 3 — Deal lessons from long-term memory
// ---------------------------------------------------------------------------

interface MemoryPatternRecord {
    pattern?: string;
    summary?: string;
    confidence?: number;
    observedCount?: number;
    lastSeen?: string;
}

interface MemoryPatternsResponse {
    patterns?: MemoryPatternRecord[];
}

export async function retrieveSalesLessons(
    tenantId: string,
    workspaceId: string,
    gatewayBaseUrl: string,
    serviceToken: string,
): Promise<MemoryPatternRecord[]> {
    const base = gatewayBaseUrl.replace(/\/+$/, '');
    try {
        const res = await fetch(
            `${base}/v1/workspaces/${encodeURIComponent(workspaceId)}/memory/patterns`,
            {
                method: 'GET',
                headers: {
                    'content-type': 'application/json',
                    Authorization: `Bearer ${serviceToken}`,
                    'x-tenant-id': tenantId,
                },
                signal: AbortSignal.timeout(10_000),
            },
        );
        if (!res.ok) return [];
        const data = (await res.json()) as MemoryPatternsResponse;
        return (data.patterns ?? []).filter(
            (p) => typeof p.pattern === 'string' && p.pattern.startsWith('sales:lesson:'),
        );
    } catch {
        return [];
    }
}

// ---------------------------------------------------------------------------
// Context block formatter
// ---------------------------------------------------------------------------

function formatSimilarArtifacts(artifacts: KbSearchResult[]): string {
    if (artifacts.length === 0) return '';
    const lines: string[] = [
        '### Similar Prior Sales Artifacts',
        'Reference these successful past artifacts when drafting. Adapt to the current prospect context.',
        '',
    ];
    for (const a of artifacts) {
        const pct = Math.round(a.similarity * 100);
        const label = a.sourceUrl ? ` (${a.sourceUrl})` : '';
        lines.push(`**Similarity ${pct}%${label}**`);
        lines.push(a.content.slice(0, 600) + (a.content.length > 600 ? '…' : ''));
        lines.push('');
    }
    return lines.join('\n');
}

function formatPlaybooks(chunks: KbSearchResult[]): string {
    if (chunks.length === 0) return '';
    const lines: string[] = [
        '### Sales Playbooks & Scripts',
        'Apply the following proven scripts and frameworks. These are validated by deal outcomes.',
        '',
    ];
    for (const chunk of chunks) {
        lines.push(chunk.content.slice(0, 800) + (chunk.content.length > 800 ? '…' : ''));
        lines.push('');
    }
    return lines.join('\n');
}

function formatSalesLessons(patterns: MemoryPatternRecord[]): string {
    if (patterns.length === 0) return '';
    const lines: string[] = [
        '### Workspace Sales Lessons',
        'These lessons were derived from past deals in this workspace. Apply them proactively.',
        '',
    ];
    const sorted = [...patterns]
        .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
        .slice(0, 10);
    for (const p of sorted) {
        const summary = p.summary ?? p.pattern ?? '';
        const conf = p.confidence !== undefined ? ` (confidence: ${Math.round(p.confidence * 100)}%)` : '';
        lines.push(`- ${summary}${conf}`);
    }
    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function buildSalesRagContext(
    query: SalesRagQuery,
    gatewayBaseUrl: string,
    serviceToken: string,
    workspaceId: string,
    config?: MemoryRetrievalConfig,
): Promise<SalesRagContext> {
    const [similarArtifacts, playbookChunks, lessons] = await Promise.all([
        config?.usePriorWork !== false ? retrieveSimilarSalesArtifacts(query, gatewayBaseUrl, serviceToken) : Promise.resolve([]),
        config?.useTemplates !== false ? retrieveSalesPlaybooks(query, gatewayBaseUrl, serviceToken) : Promise.resolve([]),
        config?.useLessons   !== false ? retrieveSalesLessons(query.tenantId, workspaceId, gatewayBaseUrl, serviceToken) : Promise.resolve([]),
    ]);

    const sections: string[] = [];

    const artifactsSection = formatSimilarArtifacts(similarArtifacts);
    if (artifactsSection) sections.push(artifactsSection);

    const playbookSection = formatPlaybooks(playbookChunks);
    if (playbookSection) sections.push(playbookSection);

    const lessonsSection = formatSalesLessons(lessons);
    if (lessonsSection) sections.push(lessonsSection);

    const contextBlock =
        sections.length > 0
            ? applyRagContextBudget(`## Sales Context\n\n${sections.join('\n---\n\n')}`)
            : '';

    return {
        contextBlock,
        similarArtifactCount: similarArtifacts.length,
        playbookChunkCount: playbookChunks.length,
        lessonCount: lessons.length,
        retrievedAt: new Date().toISOString(),
    };
}

/**
 * Ingest a completed, high-performing sales artifact into the knowledge base
 * so it becomes available as prior work for future RAG retrievals.
 *
 * Call after a deal is won, a proposal is accepted, or an email sequence
 * achieves strong reply/conversion rates.
 */
export async function ingestApprovedSalesArtifact(params: {
    tenantId: string;
    botId?: string;
    artifactTitle: string;
    documentType: SalesDocumentType;
    content: string;
    mimeType?: string;
    sourceUrl?: string;
    domain?: SalesDomain;
    dealStage?: string;
    outcome?: 'won' | 'high_open_rate' | 'accepted' | 'positive_reply';
    gatewayBaseUrl: string;
    serviceToken: string;
}): Promise<boolean> {
    const {
        tenantId, botId, artifactTitle, documentType, content, mimeType,
        sourceUrl, domain, dealStage, outcome, gatewayBaseUrl, serviceToken,
    } = params;

    const base = gatewayBaseUrl.replace(/\/+$/, '');
    const normalizedContent = await normalizeIngestContent(content, mimeType);
    const enrichedContent = [
        `[Sales Approved Artifact: ${artifactTitle}]`,
        `Type: ${documentType}${domain ? ` | Industry: ${domain}` : ''}${dealStage ? ` | Stage: ${dealStage}` : ''}${outcome ? ` | Outcome: ${outcome}` : ''}`,
        '',
        normalizedContent,
    ].join('\n');

    try {
        const res = await fetch(`${base}/v1/knowledge-base/write`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                Authorization: `Bearer ${serviceToken}`,
            },
            body: JSON.stringify({
                tenantId,
                botId,
                content: enrichedContent,
                sourceUrl: sourceUrl ?? `urn:agentfarm:sales:approved:${documentType}:${Date.now()}`,
                sourceType: 'sales_approved_artifact',
            }),
            signal: AbortSignal.timeout(15_000),
        });
        return res.ok;
    } catch {
        return false;
    }
}
