/**
 * DevOps — RAG Retriever
 *
 * Before the DevOps agent generates Terraform, Kubernetes manifests, runbooks,
 * or incident response plans, this module retrieves relevant prior work to
 * inject into the LLM prompt.
 *
 * Three retrieval paths run in parallel:
 *   1. Similar prior ops artifacts — past runbooks, incident reports, and IaC
 *      configs that match the current infrastructure context
 *   2. Infrastructure templates & compliance — CIS benchmarks, Helm chart
 *      templates, and deployment checklists from the domain library
 *   3. Ops lessons — workspace-specific lessons from post-mortems and infra
 *      failures (from devops-lesson-pipeline.ts)
 */

import { normalizeIngestContent } from '../shared/rag-ingest-normalizer.js';
import type { MemoryRetrievalConfig } from '@agentfarm/memory-service';

export type DevOpsDocumentType =
    | 'runbook'
    | 'incident_report'
    | 'terraform_config'
    | 'k8s_manifest'
    | 'helm_chart'
    | 'deployment_plan'
    | 'security_scan'
    | 'dora_report'
    | 'release_plan'
    | 'on_call_guide';

export type CloudProvider = 'aws' | 'azure' | 'gcp' | 'on_prem' | 'hybrid';

export interface DevOpsRagQuery {
    tenantId: string;
    botId?: string;
    serviceOrComponent: string;
    contextDescription: string;
    documentType: DevOpsDocumentType;
    cloudProvider?: CloudProvider;
    stack?: string[];
    complianceFrameworks?: ('cis' | 'nist' | 'soc2' | 'pci_dss' | 'hipaa')[];
    topKDocuments?: number;
    topKTemplates?: number;
    minSimilarity?: number;
}

export interface KbSearchResult {
    id: string;
    content: string;
    sourceUrl?: string;
    sourceType?: string;
    similarity: number;
}

export interface DevOpsRagContext {
    contextBlock: string;
    similarArtifactCount: number;
    templateChunkCount: number;
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
        const res = await fetch(`${base}/v1/knowledge-base/search`, { method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${serviceToken}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
        if (!res.ok) return [];
        const data = (await res.json()) as { results?: Array<{ id?: string; content?: string; sourceUrl?: string; sourceType?: string; similarity?: number }> };
        return (data.results ?? []).filter((r) => r.id && r.content).map((r) => ({ id: r.id ?? '', content: r.content ?? '', sourceUrl: r.sourceUrl, sourceType: r.sourceType, similarity: r.similarity ?? 0 }));
    } catch { return []; }
}

export async function retrieveSimilarOpsArtifacts(query: DevOpsRagQuery, gatewayBaseUrl: string, serviceToken: string): Promise<KbSearchResult[]> {
    const queryText = [`Document type: ${query.documentType}`, `Service: ${query.serviceOrComponent}`, query.contextDescription, query.cloudProvider ? `Cloud: ${query.cloudProvider}` : '', query.stack?.length ? `Stack: ${query.stack.join(', ')}` : ''].filter(Boolean).join('\n');
    const results = await searchKnowledgeBase({ tenantId: query.tenantId, botId: query.botId, queryText, topK: query.topKDocuments ?? 3, minSimilarity: query.minSimilarity ?? 0.65 }, gatewayBaseUrl, serviceToken);
    return results.filter((r) => r.sourceType !== 'devops_infra_template');
}

export async function retrieveInfraTemplates(query: DevOpsRagQuery, gatewayBaseUrl: string, serviceToken: string): Promise<KbSearchResult[]> {
    const queryText = [`Infrastructure template for: ${query.documentType}`, query.cloudProvider ? `Cloud: ${query.cloudProvider}` : '', query.complianceFrameworks?.length ? `Compliance: ${query.complianceFrameworks.join(', ')}` : '', query.stack?.join(', ') ?? ''].filter(Boolean).join('\n');
    const results = await searchKnowledgeBase({ tenantId: query.tenantId, botId: query.botId, queryText, topK: query.topKTemplates ?? 5, minSimilarity: 0.55 }, gatewayBaseUrl, serviceToken);
    return results.filter((r) => r.sourceType === 'devops_infra_template');
}

export async function retrieveDevOpsLessons(tenantId: string, workspaceId: string, gatewayBaseUrl: string, serviceToken: string): Promise<Array<{ pattern?: string; summary?: string; confidence?: number }>> {
    const base = gatewayBaseUrl.replace(/\/+$/, '');
    try {
        const res = await fetch(`${base}/v1/workspaces/${encodeURIComponent(workspaceId)}/memory/patterns`, { method: 'GET', headers: { 'content-type': 'application/json', Authorization: `Bearer ${serviceToken}`, 'x-tenant-id': tenantId }, signal: AbortSignal.timeout(10_000) });
        if (!res.ok) return [];
        const data = (await res.json()) as { patterns?: Array<{ pattern?: string; summary?: string; confidence?: number }> };
        return (data.patterns ?? []).filter((p) => typeof p.pattern === 'string' && p.pattern.startsWith('devops:lesson:'));
    } catch { return []; }
}

export async function buildDevOpsRagContext(query: DevOpsRagQuery, gatewayBaseUrl: string, serviceToken: string, workspaceId: string, config?: MemoryRetrievalConfig): Promise<DevOpsRagContext> {
    const [similarArtifacts, templateChunks, lessons] = await Promise.all([
        config?.usePriorWork !== false ? retrieveSimilarOpsArtifacts(query, gatewayBaseUrl, serviceToken) : Promise.resolve([]),
        config?.useTemplates !== false ? retrieveInfraTemplates(query, gatewayBaseUrl, serviceToken) : Promise.resolve([]),
        config?.useLessons   !== false ? retrieveDevOpsLessons(query.tenantId, workspaceId, gatewayBaseUrl, serviceToken) : Promise.resolve([]),
    ]);

    const sections: string[] = [];
    if (similarArtifacts.length > 0) {
        const lines = ['### Similar Prior Ops Artifacts', 'Reference these past runbooks and configs. Adapt to the current service and environment.', ''];
        for (const a of similarArtifacts) { lines.push(`**Similarity ${Math.round(a.similarity * 100)}%${a.sourceUrl ? ` (${a.sourceUrl})` : ''}**`); lines.push(a.content.slice(0, 600) + (a.content.length > 600 ? '…' : '')); lines.push(''); }
        sections.push(lines.join('\n'));
    }
    if (templateChunks.length > 0) {
        const lines = ['### Infrastructure Templates & Compliance', 'Apply the following templates and compliance requirements.', ''];
        for (const t of templateChunks) { lines.push(t.content.slice(0, 800) + (t.content.length > 800 ? '…' : '')); lines.push(''); }
        sections.push(lines.join('\n'));
    }
    if (lessons.length > 0) {
        const lines = ['### Workspace Ops Lessons', 'These lessons prevent repeated incidents. Apply before every deployment or config change.', ''];
        [...lessons].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)).slice(0, 10).forEach((l) => { lines.push(`- ${l.summary ?? l.pattern ?? ''}${l.confidence !== undefined ? ` (confidence: ${Math.round(l.confidence * 100)}%)` : ''}`); });
        sections.push(lines.join('\n'));
    }

    return { contextBlock: sections.length > 0 ? `## Ops Context\n\n${sections.join('\n---\n\n')}` : '', similarArtifactCount: similarArtifacts.length, templateChunkCount: templateChunks.length, lessonCount: lessons.length, retrievedAt: new Date().toISOString() };
}

export async function ingestApprovedOpsArtifact(params: { tenantId: string; botId?: string; artifactTitle: string; documentType: DevOpsDocumentType; content: string; mimeType?: string; sourceUrl?: string; cloudProvider?: CloudProvider; stack?: string[]; gatewayBaseUrl: string; serviceToken: string }): Promise<boolean> {
    const { tenantId, botId, artifactTitle, documentType, content, mimeType, sourceUrl, cloudProvider, stack, gatewayBaseUrl, serviceToken } = params;
    const base = gatewayBaseUrl.replace(/\/+$/, '');
    const normalizedContent = await normalizeIngestContent(content, mimeType);
    const enriched = [`[DevOps Approved: ${artifactTitle}]`, `Type: ${documentType}${cloudProvider ? ` | Cloud: ${cloudProvider}` : ''}${stack?.length ? ` | Stack: ${stack.join(', ')}` : ''}`, '', normalizedContent].join('\n');
    try {
        const res = await fetch(`${base}/v1/knowledge-base/write`, { method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${serviceToken}` }, body: JSON.stringify({ tenantId, botId, content: enriched, sourceUrl: sourceUrl ?? `urn:agentfarm:devops:approved:${documentType}:${Date.now()}`, sourceType: 'devops_approved_artifact' }), signal: AbortSignal.timeout(15_000) });
        return res.ok;
    } catch { return false; }
}
