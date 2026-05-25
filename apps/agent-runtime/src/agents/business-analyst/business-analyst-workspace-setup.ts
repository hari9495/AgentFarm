/**
 * Business Analyst — Workspace Setup Hook
 *
 * Called once when a BA bot is provisioned for a workspace.  Seeds the tenant's
 * knowledge base with the 14 domain templates from business-analyst-domain-library.ts
 * so the RAG retriever has content on day one (before any real BRDs are approved).
 *
 * Integration point:
 *   - Gateway bot-provisioning route (e.g. POST /v1/bots) should call
 *     `setupBaWorkspace()` when `role === 'business_analyst'`.
 *   - Can also be invoked manually to re-seed a workspace after a template update.
 *
 * Idempotent: re-ingesting the same templates is safe — the knowledge base
 * upserts on sourceUrl, so duplicates are overwritten rather than appended.
 */

import {
    ingestAllDomainTemplates,
    filterTemplatesByCompliance,
    BA_DOMAIN_TEMPLATES,
    type IngestAllResult,
} from './business-analyst-domain-library.js';
import type { BaComplianceFramework } from './business-analyst-rag-retriever.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BaWorkspaceSetupParams {
    tenantId: string;
    botId: string;
    workspaceId: string;
    gatewayBaseUrl: string;
    serviceToken: string;
    /**
     * Limit template ingestion to specific compliance frameworks.
     * Default: all templates are ingested.
     */
    complianceFrameworks?: BaComplianceFramework[];
    /**
     * Called with progress after each template is written.
     * Optional — useful for startup logs.
     */
    onProgress?: (ingested: number, total: number, templateId: string) => void;
}

export interface BaWorkspaceSetupResult {
    ok: boolean;
    /** Number of templates successfully written to the knowledge base. */
    ingestedCount: number;
    /** Number of templates that failed to write. */
    failedCount: number;
    /** Template IDs that failed to ingest. */
    failedTemplateIds: string[];
    /** ISO-8601 timestamp when setup ran. */
    completedAt: string;
    /** True if the workspace was already set up (templates already present). */
    wasAlreadySetUp?: boolean;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Seed a BA workspace's knowledge base with domain templates.
 *
 * Safe to call multiple times — ingesting the same template a second time
 * overwrites the existing entry (the `sourceUrl` acts as a unique key).
 *
 * Should be called:
 *   1. When a BA bot is first provisioned for a workspace
 *   2. When compliance frameworks change (re-seed with the new set)
 *   3. When the domain library is updated (re-seed to refresh templates)
 */
export async function setupBaWorkspace(
    params: BaWorkspaceSetupParams,
): Promise<BaWorkspaceSetupResult> {
    const {
        tenantId,
        botId,
        workspaceId,
        gatewayBaseUrl,
        serviceToken,
        complianceFrameworks,
        onProgress,
    } = params;

    const completedAt = new Date().toISOString();

    // If compliance frameworks are specified, only ingest relevant compliance templates
    // (always include all structural BRD templates regardless)
    let templateIds: string[] | undefined;
    if (complianceFrameworks?.length) {
        const complianceTags = complianceFrameworks.map((f) => f as string);
        const complianceTemplates = filterTemplatesByCompliance(complianceTags);
        const structuralTemplates = BA_DOMAIN_TEMPLATES.filter(
            (t) => t.category !== 'compliance_checklist',
        );
        const combined = [...structuralTemplates, ...complianceTemplates];
        templateIds = [...new Set(combined.map((t) => t.id))];
    }

    const ingestResult: IngestAllResult = await ingestAllDomainTemplates({
        gatewayBaseUrl,
        serviceToken,
        tenantId,
        botId,
        templateIds,
    });

    // Call progress hook if provided (sequential — one call after all complete)
    if (onProgress) {
        onProgress(ingestResult.succeeded, ingestResult.total, 'completed');
    }

    console.info(
        `[ba-workspace-setup] workspace=${workspaceId} tenant=${tenantId} ` +
        `ingested=${ingestResult.succeeded}/${ingestResult.total} failed=${ingestResult.failed}`,
    );

    return {
        ok: ingestResult.failed === 0,
        ingestedCount: ingestResult.succeeded,
        failedCount: ingestResult.failed,
        failedTemplateIds: ingestResult.failedIds,
        completedAt,
    };
}

/**
 * Re-seed only the compliance templates for a workspace when the tenant adds
 * a new regulatory framework (e.g. they go from GDPR-only to GDPR + HIPAA).
 *
 * Lighter than a full re-seed — only writes templates tagged with the
 * specified framework tags.
 */
export async function refreshBaComplianceTemplates(
    params: Omit<BaWorkspaceSetupParams, 'complianceFrameworks'> & {
        newFrameworks: BaComplianceFramework[];
    },
): Promise<BaWorkspaceSetupResult> {
    const { newFrameworks, ...rest } = params;
    return setupBaWorkspace({ ...rest, complianceFrameworks: newFrameworks });
}

/**
 * Check whether a BA workspace has been set up by probing for the presence of
 * at least one BA domain template in the knowledge base.
 *
 * Uses the knowledge-base search endpoint with a known template signature.
 * Returns true if at least one template is found.
 */
export async function isBaWorkspaceSetUp(params: {
    tenantId: string;
    botId?: string;
    gatewayBaseUrl: string;
    serviceToken: string;
}): Promise<boolean> {
    const { tenantId, botId, gatewayBaseUrl, serviceToken } = params;
    const base = gatewayBaseUrl.replace(/\/+$/, '');

    try {
        const res = await fetch(`${base}/v1/knowledge-base/search`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                Authorization: `Bearer ${serviceToken}`,
            },
            body: JSON.stringify({
                tenantId,
                botId,
                queryText: 'BRD sections business requirements GDPR HIPAA compliance',
                topK: 1,
                minSimilarity: 0.5,
            }),
            signal: AbortSignal.timeout(10_000),
        });

        if (!res.ok) return false;

        const data = (await res.json()) as { results?: Array<{ sourceType?: string }> };
        return (data.results ?? []).some((r) => r.sourceType === 'ba_domain_template');
    } catch {
        return false;
    }
}

/**
 * Convenience function for bot provisioning routes.
 *
 * Checks whether the workspace is already seeded; if not, runs the full
 * setup. Returns immediately if already set up (skips duplicate ingestion).
 *
 * Usage in gateway bot provisioning route:
 * ```ts
 * if (bot.role === 'business_analyst') {
 *   await ensureBaWorkspaceSetUp({ tenantId, botId: bot.id, workspaceId, ... });
 * }
 * ```
 */
export async function ensureBaWorkspaceSetUp(
    params: BaWorkspaceSetupParams,
): Promise<BaWorkspaceSetupResult> {
    const alreadySetUp = await isBaWorkspaceSetUp({
        tenantId: params.tenantId,
        botId: params.botId,
        gatewayBaseUrl: params.gatewayBaseUrl,
        serviceToken: params.serviceToken,
    });

    if (alreadySetUp) {
        return {
            ok: true,
            ingestedCount: 0,
            failedCount: 0,
            failedTemplateIds: [],
            completedAt: new Date().toISOString(),
            wasAlreadySetUp: true,
        };
    }

    return setupBaWorkspace(params);
}
