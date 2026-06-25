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

import type { PrismaClient } from '@prisma/client';
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
