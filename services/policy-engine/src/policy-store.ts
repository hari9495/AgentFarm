/**
 * policy-store.ts — persistence + lifecycle for GovernancePolicy rows (group C).
 *
 *   - getActivePolicy()  → the highest-version `active` policy for a scope (C1)
 *   - publishPolicy()    → flip a draft to active, archive the prior active
 *                          version, and push the overlay to OPA (C2)
 *
 * Tenant-scope (scope='tenant', scopeRef='') is the Phase 1 enforcement level:
 * publishPolicy pushes the published policy's rules as the tenant's OPA overlay.
 * Multi-scope aggregation (workspace/role/agent) lands in Phase 2.
 */

import type { PrismaClient } from '@prisma/client';
import type {
    GovernancePolicyRecord,
    GovernancePolicyScope,
    GovernanceRule,
} from '@agentfarm/shared-types';
import { pushTenantOverlay } from './opa-loader.js';

const TENANT_SCOPE_REF = '';

type Row = {
    id: string;
    tenantId: string;
    scope: string;
    scopeRef: string;
    version: number;
    status: string;
    name: string;
    description: string | null;
    rulesJson: unknown;
    createdBy: string;
    updatedBy: string;
    createdAt: Date;
    updatedAt: Date;
};

function toRecord(row: Row): GovernancePolicyRecord {
    return {
        id: row.id,
        tenantId: row.tenantId,
        scope: row.scope as GovernancePolicyScope,
        scopeRef: row.scopeRef,
        version: row.version,
        status: row.status as GovernancePolicyRecord['status'],
        name: row.name,
        description: row.description,
        rules: Array.isArray(row.rulesJson) ? (row.rulesJson as GovernanceRule[]) : [],
        createdBy: row.createdBy,
        updatedBy: row.updatedBy,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
    };
}

/**
 * Returns the highest-version `active` policy for a scope, or null.
 * `scopeRef` defaults to '' (tenant scope).
 */
export async function getActivePolicy(
    prisma: PrismaClient,
    tenantId: string,
    scope: GovernancePolicyScope = 'tenant',
    scopeRef: string = TENANT_SCOPE_REF,
): Promise<GovernancePolicyRecord | null> {
    const row = await prisma.governancePolicy.findFirst({
        where: { tenantId, scope, scopeRef, status: 'active' },
        orderBy: { version: 'desc' },
    });
    return row ? toRecord(row as Row) : null;
}

/** Returns the next version number for a scope (max existing + 1). */
export async function nextVersion(
    prisma: PrismaClient,
    tenantId: string,
    scope: GovernancePolicyScope = 'tenant',
    scopeRef: string = TENANT_SCOPE_REF,
): Promise<number> {
    const top = await prisma.governancePolicy.findFirst({
        where: { tenantId, scope, scopeRef },
        orderBy: { version: 'desc' },
        select: { version: true },
    });
    return (top?.version ?? 0) + 1;
}

export interface PublishResult {
    policy: GovernancePolicyRecord;
    archivedVersions: number[];
}

/**
 * Publishes a draft policy: archives any currently-active version for the same
 * scope, flips the draft to active (atomically), then syncs the overlay to OPA.
 *
 * OPA sync runs after the DB commit; if it fails the error propagates so the
 * caller can retry — the DB already reflects the published state and a later
 * re-sync is idempotent (PUT replaces the overlay).
 */
export async function publishPolicy(
    prisma: PrismaClient,
    policyId: string,
    opts: { opaBaseUrl?: string; fetchImpl?: typeof fetch; skipOpaSync?: boolean } = {},
): Promise<PublishResult> {
    const archivedVersions: number[] = [];

    const published = await prisma.$transaction(async (tx) => {
        const draft = (await tx.governancePolicy.findUnique({ where: { id: policyId } })) as Row | null;
        if (!draft) throw new Error(`GovernancePolicy not found: ${policyId}`);
        if (draft.status === 'archived') {
            throw new Error(`Cannot publish an archived policy: ${policyId}`);
        }

        // Archive the current active version(s) for this exact scope.
        const currentlyActive = (await tx.governancePolicy.findMany({
            where: {
                tenantId: draft.tenantId,
                scope: draft.scope as GovernancePolicyScope,
                scopeRef: draft.scopeRef,
                status: 'active',
                id: { not: draft.id },
            },
            select: { id: true, version: true },
        })) as { id: string; version: number }[];

        for (const a of currentlyActive) {
            archivedVersions.push(a.version);
            await tx.governancePolicy.update({ where: { id: a.id }, data: { status: 'archived' } });
        }

        const updated = (await tx.governancePolicy.update({
            where: { id: draft.id },
            data: { status: 'active' },
        })) as Row;
        return toRecord(updated);
    });

    if (!opts.skipOpaSync) {
        await pushTenantOverlay(
            published.tenantId,
            { policyId: published.id, version: published.version, rules: published.rules },
            { opaBaseUrl: opts.opaBaseUrl, fetchImpl: opts.fetchImpl },
        );
    }

    return { policy: published, archivedVersions };
}
