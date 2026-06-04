/**
 * Business Analyst — RAG Retriever
 *
 * Before the BA agent drafts any document, this module retrieves relevant
 * prior work and domain knowledge to inject into the LLM prompt.
 *
 * Three retrieval paths run in parallel:
 *   1. Similar prior BRDs / specs — finds past approved documents that match
 *      the current project description via cosine-similarity search
 *   2. Compliance requirements — targeted search for regulatory checklists
 *      that apply to the stated compliance frameworks
 *   3. BA lessons — workspace-specific lessons learned from past stakeholder
 *      feedback (from business-analyst-lesson-pipeline.ts)
 *
 * All three results are formatted into a single `## Prior Knowledge` context
 * block that gets prepended to the BA agent's system prompt.
 *
 * API used:
 *   POST /v1/knowledge-base/search  — cosine-similarity search
 *   POST /v1/memory/patterns        — long-term lesson patterns
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

import { normalizeIngestContent } from '../shared/rag-ingest-normalizer.js';
import { applyRagContextBudget } from '../shared/rag-context-limiter.js';
import type { MemoryRetrievalConfig } from '@agentfarm/memory-service';

export type BaComplianceFramework =
    | 'gdpr'
    | 'hipaa'
    | 'pci-dss'
    | 'soc2'
    | 'mifid2'
    | 'finra'
    | 'hl7'
    | 'fhir'
    | 'iso27001'
    | 'nist';

/** Parameters for a RAG retrieval request. */
export interface BaRagQuery {
    tenantId: string;
    botId?: string;
    /** Title or one-line description of the current project / document being drafted. */
    projectTitle: string;
    /** Longer description of the project — used as the primary search query. */
    projectDescription: string;
    /** The type of document being drafted — shapes which sources are searched. */
    documentType:
        | 'brd'
        | 'user_story'
        | 'acceptance_criteria'
        | 'gap_analysis'
        | 'process_map'
        | 'impact_analysis'
        | 'uat_checklist';
    /** Compliance frameworks that apply to this project. */
    complianceFrameworks?: BaComplianceFramework[];
    /** Domain hint for more precise retrieval. */
    domain?: 'healthcare' | 'finance' | 'ecommerce' | 'saas' | 'government' | 'logistics' | 'hr';
    /** Maximum number of similar documents to retrieve. Default: 3. */
    topKDocuments?: number;
    /** Maximum number of compliance chunks to retrieve. Default: 5. */
    topKCompliance?: number;
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

export interface BaRagContext {
    /** Full formatted context block for LLM injection. Empty string if nothing was found. */
    contextBlock: string;
    /** How many similar documents were retrieved. */
    similarDocumentCount: number;
    /** IDs of retrieved similar documents — used to write derived_from edges on approval. */
    similarDocumentIds: string[];
    /** How many compliance chunks were retrieved. */
    complianceChunkCount: number;
    /** How many BA lesson patterns were retrieved. */
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
// Retrieval path 1 — Similar prior BRDs and specifications
// ---------------------------------------------------------------------------

/**
 * Find past approved documents semantically similar to the current project.
 *
 * Searches across all knowledge-base chunks that are NOT domain templates
 * (sourceType !== 'ba_domain_template') to find real prior work.
 */
export async function retrieveSimilarPriorWork(
    query: BaRagQuery,
    gatewayBaseUrl: string,
    serviceToken: string,
): Promise<KbSearchResult[]> {
    const queryText = [
        `Document type: ${query.documentType}`,
        `Project: ${query.projectTitle}`,
        query.projectDescription,
        query.domain ? `Domain: ${query.domain}` : '',
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

    // Filter out domain templates — we want real prior work, not the library
    return results.filter((r) => r.sourceType !== 'ba_domain_template');
}

// ---------------------------------------------------------------------------
// Retrieval path 2 — Compliance checklists
// ---------------------------------------------------------------------------

/**
 * Retrieve compliance requirement chunks relevant to the stated frameworks.
 *
 * Searches specifically within 'ba_domain_template' content (the library
 * pre-loaded by business-analyst-domain-library.ts) to surface checklists.
 */
export async function retrieveComplianceRequirements(
    query: BaRagQuery,
    gatewayBaseUrl: string,
    serviceToken: string,
): Promise<KbSearchResult[]> {
    if (!query.complianceFrameworks || query.complianceFrameworks.length === 0) {
        return [];
    }

    // Build a compliance-focused query combining framework names and domain
    const frameworkText = query.complianceFrameworks.join(', ');
    const queryText = [
        `Compliance requirements: ${frameworkText}`,
        `Project: ${query.projectTitle}`,
        query.domain ? `Domain: ${query.domain}` : '',
        `Document type: ${query.documentType}`,
    ]
        .filter(Boolean)
        .join('\n');

    const results = await searchKnowledgeBase(
        {
            tenantId: query.tenantId,
            botId: query.botId,
            queryText,
            topK: query.topKCompliance ?? 5,
            minSimilarity: 0.55, // Lower threshold for compliance — better recall
        },
        gatewayBaseUrl,
        serviceToken,
    );

    // Keep only domain template content for compliance retrieval
    return results.filter((r) => r.sourceType === 'ba_domain_template');
}

// ---------------------------------------------------------------------------
// Retrieval path 3 — BA lesson patterns from long-term memory
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

/**
 * Retrieve stored BA lessons from long-term memory patterns.
 *
 * Returns patterns whose key starts with 'ba:lesson:' — written by the
 * lesson pipeline (business-analyst-lesson-pipeline.ts).
 */
export async function retrieveBaLessons(
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
            (p) => typeof p.pattern === 'string' && p.pattern.startsWith('ba:lesson:'),
        );
    } catch {
        return [];
    }
}

// ---------------------------------------------------------------------------
// Context block formatter
// ---------------------------------------------------------------------------

function formatSimilarDocuments(docs: KbSearchResult[]): string {
    if (docs.length === 0) return '';
    const lines: string[] = [
        '### Similar Prior Work',
        'The following approved documents from past projects are relevant to this draft.',
        'Reference their patterns and structure, but adapt to the current project context.',
        '',
    ];
    for (const doc of docs) {
        const pct = Math.round(doc.similarity * 100);
        const label = doc.sourceUrl ? ` (${doc.sourceUrl})` : '';
        lines.push(`**Similarity ${pct}%${label}**`);
        // Truncate long chunks — keep enough for pattern recognition
        lines.push(doc.content.slice(0, 600) + (doc.content.length > 600 ? '…' : ''));
        lines.push('');
    }
    return lines.join('\n');
}

function formatComplianceRequirements(chunks: KbSearchResult[]): string {
    if (chunks.length === 0) return '';
    const lines: string[] = [
        '### Compliance Requirements',
        'Include ALL of the following in the document being drafted.',
        'These are regulatory obligations, not suggestions.',
        '',
    ];
    for (const chunk of chunks) {
        lines.push(chunk.content.slice(0, 800) + (chunk.content.length > 800 ? '…' : ''));
        lines.push('');
    }
    return lines.join('\n');
}

function formatLessons(patterns: MemoryPatternRecord[]): string {
    if (patterns.length === 0) return '';
    const lines: string[] = [
        '### Workspace BA Lessons',
        'These lessons were learned from past stakeholder feedback in this workspace.',
        'Apply them proactively — do not wait for the same rejection.',
        '',
    ];
    // Sort by confidence descending, cap at 10
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

/**
 * Run all three retrieval paths in parallel and assemble a single context
 * block for injection into the BA agent's system prompt.
 *
 * Returns an empty contextBlock when nothing useful was found — the caller
 * should only inject non-empty blocks into the prompt.
 */
export async function buildBaRagContext(
    query: BaRagQuery,
    gatewayBaseUrl: string,
    serviceToken: string,
    workspaceId: string,
    config?: MemoryRetrievalConfig,
): Promise<BaRagContext> {
    const [similarDocs, complianceChunks, lessons] = await Promise.all([
        config?.usePriorWork !== false ? retrieveSimilarPriorWork(query, gatewayBaseUrl, serviceToken)                              : Promise.resolve([]),
        config?.useTemplates !== false ? retrieveComplianceRequirements(query, gatewayBaseUrl, serviceToken)                       : Promise.resolve([]),
        config?.useLessons   !== false ? retrieveBaLessons(query.tenantId, workspaceId, gatewayBaseUrl, serviceToken)              : Promise.resolve([]),
    ]);

    const sections: string[] = [];

    const docsSection = formatSimilarDocuments(similarDocs);
    if (docsSection) sections.push(docsSection);

    const complianceSection = formatComplianceRequirements(complianceChunks);
    if (complianceSection) sections.push(complianceSection);

    const lessonsSection = formatLessons(lessons);
    if (lessonsSection) sections.push(lessonsSection);

    const contextBlock =
        sections.length > 0
            ? applyRagContextBudget(`## Prior Knowledge\n\n${sections.join('\n---\n\n')}`)
            : '';

    return {
        contextBlock,
        similarDocumentCount: similarDocs.length,
        similarDocumentIds: similarDocs.map((d) => d.id),
        complianceChunkCount: complianceChunks.length,
        lessonCount: lessons.length,
        retrievedAt: new Date().toISOString(),
    };
}

/**
 * Ingest a completed, approved BA document into the knowledge base so it
 * becomes available as prior work for future RAG retrievals.
 *
 * Call this after a BRD or specification receives final stakeholder approval.
 */
export async function ingestApprovedDocument(params: {
    tenantId: string;
    botId?: string;
    documentTitle: string;
    documentType: BaRagQuery['documentType'];
    content: string;
    mimeType?: string;
    sourceUrl?: string;
    domain?: string;
    complianceFrameworks?: string[];
    gatewayBaseUrl: string;
    serviceToken: string;
}): Promise<string | null> {
    const {
        tenantId, botId, documentTitle, documentType, content, mimeType,
        sourceUrl, domain, complianceFrameworks, gatewayBaseUrl, serviceToken,
    } = params;

    const base = gatewayBaseUrl.replace(/\/+$/, '');
    const normalizedContent = await normalizeIngestContent(content, mimeType);
    const enrichedContent = [
        `[BA Approved Document: ${documentTitle}]`,
        `Type: ${documentType}${domain ? ` | Domain: ${domain}` : ''}${complianceFrameworks?.length ? ` | Compliance: ${complianceFrameworks.join(', ')}` : ''}`,
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
                sourceUrl: sourceUrl ?? `urn:agentfarm:ba:approved:${documentType}:${Date.now()}`,
                sourceType: 'ba_approved_document',
            }),
            signal: AbortSignal.timeout(15_000),
        });

        if (!res.ok) return null;
        const data = await res.json() as { record?: { id?: string } };
        return data.record?.id ?? null;
    } catch {
        return null;
    }
}
