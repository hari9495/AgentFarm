/**
 * Recruiter — RAG Retriever
 *
 * Before the Recruiter agent drafts job descriptions, offer letters, outreach
 * emails, or interview guides, this module retrieves relevant prior work and
 * domain knowledge to inject into the LLM prompt.
 *
 * Three retrieval paths run in parallel:
 *   1. Similar prior JDs / hiring artifacts — past approved job descriptions,
 *      offer letters, and interview guides that match the current role via
 *      cosine-similarity search
 *   2. Compliance & template library — DEI guidelines, EEOC disclosures, FCRA
 *      notices, and role-specific interview frameworks from the domain library
 *   3. Hiring lessons — workspace-specific lessons from past offer rejections,
 *      bad hires, and interviewer feedback (from recruiter-lesson-pipeline.ts)
 *
 * APIs used:
 *   POST /v1/knowledge-base/search  — cosine-similarity search
 *   GET  /v1/workspaces/:id/memory/patterns — long-term lesson patterns
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RecruiterDomain =
    | 'engineering'
    | 'sales'
    | 'marketing'
    | 'finance'
    | 'operations'
    | 'product'
    | 'design'
    | 'legal'
    | 'hr'
    | 'executive';

export type RecruiterDocumentType =
    | 'job_description'
    | 'outreach_email'
    | 'offer_letter'
    | 'interview_guide'
    | 'phone_screen_script'
    | 'rejection_email'
    | 'reference_check'
    | 'pipeline_report'
    | 'market_intel';

export interface RecruiterRagQuery {
    tenantId: string;
    botId?: string;
    roleTitle: string;
    roleDescription: string;
    documentType: RecruiterDocumentType;
    domain?: RecruiterDomain;
    seniorityLevel?: 'junior' | 'mid' | 'senior' | 'staff' | 'principal' | 'director' | 'vp' | 'c_level';
    complianceFrameworks?: ('eeoc' | 'fcra' | 'gdpr' | 'ir35' | 'right_to_work')[];
    topKDocuments?: number;
    topKCompliance?: number;
    minSimilarity?: number;
}

export interface KbSearchResult {
    id: string;
    content: string;
    sourceUrl?: string;
    sourceType?: string;
    similarity: number;
}

export interface RecruiterRagContext {
    contextBlock: string;
    similarDocumentCount: number;
    complianceChunkCount: number;
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
    results?: Array<{ id?: string; content?: string; sourceUrl?: string; sourceType?: string; similarity?: number }>;
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
            headers: { 'content-type': 'application/json', Authorization: `Bearer ${serviceToken}` },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) return [];
        const data = (await res.json()) as KbSearchResponse;
        return (data.results ?? [])
            .filter((r) => r.id && r.content)
            .map((r) => ({ id: r.id ?? '', content: r.content ?? '', sourceUrl: r.sourceUrl, sourceType: r.sourceType, similarity: r.similarity ?? 0 }));
    } catch {
        return [];
    }
}

// ---------------------------------------------------------------------------
// Retrieval path 1 — Similar prior hiring artifacts
// ---------------------------------------------------------------------------

export async function retrieveSimilarHiringArtifacts(
    query: RecruiterRagQuery,
    gatewayBaseUrl: string,
    serviceToken: string,
): Promise<KbSearchResult[]> {
    const queryText = [
        `Document type: ${query.documentType}`,
        `Role: ${query.roleTitle}`,
        query.roleDescription,
        query.domain ? `Domain: ${query.domain}` : '',
        query.seniorityLevel ? `Seniority: ${query.seniorityLevel}` : '',
    ].filter(Boolean).join('\n');

    const results = await searchKnowledgeBase(
        { tenantId: query.tenantId, botId: query.botId, queryText, topK: query.topKDocuments ?? 3, minSimilarity: query.minSimilarity ?? 0.65 },
        gatewayBaseUrl,
        serviceToken,
    );

    return results.filter((r) => r.sourceType !== 'recruiter_compliance_template');
}

// ---------------------------------------------------------------------------
// Retrieval path 2 — Compliance requirements & interview frameworks
// ---------------------------------------------------------------------------

export async function retrieveRecruiterCompliance(
    query: RecruiterRagQuery,
    gatewayBaseUrl: string,
    serviceToken: string,
): Promise<KbSearchResult[]> {
    if (!query.complianceFrameworks?.length) return [];

    const queryText = [
        `Compliance: ${query.complianceFrameworks.join(', ')}`,
        `Role: ${query.roleTitle}`,
        query.domain ? `Domain: ${query.domain}` : '',
        `Document: ${query.documentType}`,
    ].filter(Boolean).join('\n');

    const results = await searchKnowledgeBase(
        { tenantId: query.tenantId, botId: query.botId, queryText, topK: query.topKCompliance ?? 5, minSimilarity: 0.55 },
        gatewayBaseUrl,
        serviceToken,
    );

    return results.filter((r) => r.sourceType === 'recruiter_compliance_template');
}

// ---------------------------------------------------------------------------
// Retrieval path 3 — Hiring lessons from long-term memory
// ---------------------------------------------------------------------------

interface MemoryPatternRecord {
    pattern?: string;
    summary?: string;
    confidence?: number;
    observedCount?: number;
    lastSeen?: string;
}

export async function retrieveRecruiterLessons(
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
                headers: { 'content-type': 'application/json', Authorization: `Bearer ${serviceToken}`, 'x-tenant-id': tenantId },
                signal: AbortSignal.timeout(10_000),
            },
        );
        if (!res.ok) return [];
        const data = (await res.json()) as { patterns?: MemoryPatternRecord[] };
        return (data.patterns ?? []).filter(
            (p) => typeof p.pattern === 'string' && p.pattern.startsWith('rec:lesson:'),
        );
    } catch {
        return [];
    }
}

// ---------------------------------------------------------------------------
// Context block formatter
// ---------------------------------------------------------------------------

function formatSimilarArtifacts(docs: KbSearchResult[]): string {
    if (docs.length === 0) return '';
    const lines: string[] = [
        '### Similar Prior Hiring Artifacts',
        'Reference these past approved artifacts when drafting. Adapt to the current role and candidate context.',
        '',
    ];
    for (const doc of docs) {
        const pct = Math.round(doc.similarity * 100);
        const label = doc.sourceUrl ? ` (${doc.sourceUrl})` : '';
        lines.push(`**Similarity ${pct}%${label}**`);
        lines.push(doc.content.slice(0, 600) + (doc.content.length > 600 ? '…' : ''));
        lines.push('');
    }
    return lines.join('\n');
}

function formatComplianceChunks(chunks: KbSearchResult[]): string {
    if (chunks.length === 0) return '';
    const lines: string[] = [
        '### Compliance Requirements',
        'Include ALL of the following in the artifact being drafted. These are legal obligations.',
        '',
    ];
    for (const chunk of chunks) {
        lines.push(chunk.content.slice(0, 800) + (chunk.content.length > 800 ? '…' : ''));
        lines.push('');
    }
    return lines.join('\n');
}

function formatRecruiterLessons(patterns: MemoryPatternRecord[]): string {
    if (patterns.length === 0) return '';
    const lines: string[] = [
        '### Workspace Hiring Lessons',
        'These lessons were learned from past hiring decisions in this workspace. Apply them proactively.',
        '',
    ];
    const sorted = [...patterns].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)).slice(0, 10);
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

export async function buildRecruiterRagContext(
    query: RecruiterRagQuery,
    gatewayBaseUrl: string,
    serviceToken: string,
    workspaceId: string,
): Promise<RecruiterRagContext> {
    const [similarDocs, complianceChunks, lessons] = await Promise.all([
        retrieveSimilarHiringArtifacts(query, gatewayBaseUrl, serviceToken),
        retrieveRecruiterCompliance(query, gatewayBaseUrl, serviceToken),
        retrieveRecruiterLessons(query.tenantId, workspaceId, gatewayBaseUrl, serviceToken),
    ]);

    const sections: string[] = [];
    const docsSection = formatSimilarArtifacts(similarDocs);
    if (docsSection) sections.push(docsSection);
    const complianceSection = formatComplianceChunks(complianceChunks);
    if (complianceSection) sections.push(complianceSection);
    const lessonsSection = formatRecruiterLessons(lessons);
    if (lessonsSection) sections.push(lessonsSection);

    const contextBlock = sections.length > 0
        ? `## Hiring Context\n\n${sections.join('\n---\n\n')}`
        : '';

    return {
        contextBlock,
        similarDocumentCount: similarDocs.length,
        complianceChunkCount: complianceChunks.length,
        lessonCount: lessons.length,
        retrievedAt: new Date().toISOString(),
    };
}

export async function ingestApprovedHiringArtifact(params: {
    tenantId: string;
    botId?: string;
    artifactTitle: string;
    documentType: RecruiterDocumentType;
    content: string;
    sourceUrl?: string;
    domain?: RecruiterDomain;
    seniorityLevel?: string;
    outcome?: 'hired' | 'offer_accepted' | 'high_quality_pipeline' | 'approved';
    gatewayBaseUrl: string;
    serviceToken: string;
}): Promise<boolean> {
    const { tenantId, botId, artifactTitle, documentType, content, sourceUrl, domain, seniorityLevel, outcome, gatewayBaseUrl, serviceToken } = params;
    const base = gatewayBaseUrl.replace(/\/+$/, '');
    const enrichedContent = [
        `[Recruiter Approved Artifact: ${artifactTitle}]`,
        `Type: ${documentType}${domain ? ` | Domain: ${domain}` : ''}${seniorityLevel ? ` | Seniority: ${seniorityLevel}` : ''}${outcome ? ` | Outcome: ${outcome}` : ''}`,
        '',
        content,
    ].join('\n');

    try {
        const res = await fetch(`${base}/v1/knowledge-base/write`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', Authorization: `Bearer ${serviceToken}` },
            body: JSON.stringify({ tenantId, botId, content: enrichedContent, sourceUrl: sourceUrl ?? `urn:agentfarm:rec:approved:${documentType}:${Date.now()}`, sourceType: 'recruiter_approved_artifact' }),
            signal: AbortSignal.timeout(15_000),
        });
        return res.ok;
    } catch {
        return false;
    }
}
