/**
 * compliance-export.ts — Phase 6 per-tenant compliance report.
 *
 * Read-only aggregation of the tenant's governance posture:
 *   - active GovernancePolicies (all scopes)
 *   - uploaded policy documents (with applied status)
 *   - recent policy-violation history
 *
 * Tenant-scoped by the caller (tenantId always from session). Pure read.
 */

import type { PrismaClient } from '@prisma/client';
import type {
    ComplianceExport,
    GovernancePolicyRecord,
    PolicyDocumentRecord,
    PolicyViolationRecord,
    ExtractedRuleCandidate,
    GovernanceRule,
    GovernancePolicyScope,
} from '@agentfarm/shared-types';

export type PrismaLike = Pick<PrismaClient, 'governancePolicy' | 'policyDocument' | 'policyViolation'>;

const VIOLATION_LIMIT = 500;

export async function getComplianceExport(
    prisma: PrismaLike,
    tenantId: string,
): Promise<ComplianceExport> {
    const [policies, documents, violations] = await Promise.all([
        prisma.governancePolicy.findMany({
            where: { tenantId, status: 'active' },
            orderBy: [{ scope: 'asc' }, { version: 'desc' }],
        }),
        prisma.policyDocument.findMany({
            where: { tenantId },
            orderBy: { createdAt: 'desc' },
        }),
        prisma.policyViolation.findMany({
            where: { tenantId },
            orderBy: { createdAt: 'desc' },
            take: VIOLATION_LIMIT,
        }),
    ]);

    const activePolicies: GovernancePolicyRecord[] = policies.map((p) => ({
        id: p.id,
        tenantId: p.tenantId,
        scope: p.scope as GovernancePolicyScope,
        scopeRef: p.scopeRef,
        version: p.version,
        status: p.status as GovernancePolicyRecord['status'],
        name: p.name,
        description: p.description,
        rules: Array.isArray(p.rulesJson) ? (p.rulesJson as unknown as GovernanceRule[]) : [],
        createdBy: p.createdBy,
        updatedBy: p.updatedBy,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
    }));

    const policyDocuments: PolicyDocumentRecord[] = documents.map((d) => ({
        id: d.id,
        tenantId: d.tenantId,
        fileName: d.fileName,
        mimeType: d.mimeType,
        status: d.status as PolicyDocumentRecord['status'],
        candidates: Array.isArray(d.extractedRulesJson)
            ? (d.extractedRulesJson as unknown as ExtractedRuleCandidate[])
            : [],
        failureReason: d.failureReason,
        appliedPolicyId: d.appliedPolicyId,
        appliedAt: d.appliedAt ? d.appliedAt.toISOString() : null,
        createdBy: d.createdBy,
        createdAt: d.createdAt.toISOString(),
        updatedAt: d.updatedAt.toISOString(),
    }));

    const violationRecords: PolicyViolationRecord[] = violations.map((v) => ({
        id: v.id,
        tenantId: v.tenantId,
        workspaceId: v.workspaceId,
        botId: v.botId,
        taskId: v.taskId,
        actionType: v.actionType,
        connector: v.connector,
        riskLevel: v.riskLevel,
        effect: v.effect,
        reason: v.reason,
        matchedPolicyId: v.matchedPolicyId,
        policyVersion: v.policyVersion,
        source: v.source,
        correlationId: v.correlationId,
        createdAt: v.createdAt.toISOString(),
    }));

    return {
        tenantId,
        generatedAt: new Date().toISOString(),
        activePolicies,
        policyDocuments,
        violations: violationRecords,
        summary: {
            activePolicyCount: activePolicies.length,
            appliedDocumentCount: policyDocuments.filter((d) => d.appliedPolicyId).length,
            violationCount: violationRecords.length,
        },
    };
}
