/**
 * Phase 2 — Data-driven RBAC: role-scope policy overlay loader.
 *
 * Reads the active `GovernancePolicy(scope='role', scopeRef=roleKey)` for a
 * tenant and projects its `deny` rules into a hard-block action set, suitable
 * for `enforceRole`'s `blockedActionsOverride`. The overlay can only TIGHTEN
 * (the enforcer unions it on top of the code registry).
 *
 * Fail-safe: any missing policy or DB error degrades to an empty set — never
 * weakens the built-in role blocklist.
 */

import { PrismaClient } from '@prisma/client';
import { getActivePolicy } from '@agentfarm/policy-engine';

/**
 * Returns the set of action types a customer role-scope policy hard-blocks for
 * the given role, or an empty set when there is no active policy (or on error).
 */
export async function getActiveRoleBlocklist(
    prisma: PrismaClient,
    tenantId: string,
    roleKey: string,
): Promise<ReadonlySet<string>> {
    try {
        const active = await getActivePolicy(prisma, tenantId, 'role', roleKey);
        if (!active) return new Set<string>();
        const blocked = new Set<string>();
        for (const rule of active.rules) {
            if (rule.effect === 'deny' && rule.actionType && rule.actionType !== '*') {
                blocked.add(rule.actionType);
            }
        }
        return blocked;
    } catch {
        return new Set<string>();
    }
}

// ---------------------------------------------------------------------------
// Runtime convenience: cached Prisma client (mirrors policy-runtime.ts).
// No DATABASE_URL → DB disabled → empty set (code registry stands).
// ---------------------------------------------------------------------------

let _prisma: PrismaClient | null | undefined;

function getCachedPrisma(): PrismaClient | null {
    if (_prisma !== undefined) return _prisma;
    if (!process.env['DATABASE_URL']?.trim()) {
        _prisma = null;
        return null;
    }
    try {
        _prisma = new PrismaClient();
    } catch {
        _prisma = null;
    }
    return _prisma;
}

/**
 * Runtime entry point: loads the customer role-scope hard-block overlay for the
 * given tenant+role using a cached Prisma client. Best-effort — returns an empty
 * set when the database is not configured or on any error.
 */
export async function getActiveRoleBlocklistForTenant(
    tenantId: string,
    roleKey: string,
): Promise<ReadonlySet<string>> {
    const prisma = getCachedPrisma();
    if (!prisma) return new Set<string>();
    return getActiveRoleBlocklist(prisma, tenantId, roleKey);
}
