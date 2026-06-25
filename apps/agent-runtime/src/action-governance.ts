/**
 * Phase 4 — Environment + time action governance (direct-read).
 *
 * Loads the merged active tenant+role policy rules and evaluates env / time-window
 * deny rules against a task's action context. Sits alongside the Phase 2 role
 * blocklist and Phase 3 connector enforcement, reading the SAME policy document.
 *
 * Tighten-only: only `deny` rules contribute. Fail-safe: missing policy or DB
 * error → no rules → no extra restriction.
 */

import { PrismaClient } from '@prisma/client';
import type { GovernanceRule } from '@agentfarm/shared-types';
import { getActivePolicy } from '@agentfarm/policy-engine';
import { isTimeDenied } from './time-window.js';

export interface ActionContext {
    actionType: string;
    connector?: string;
    env?: string;
    now?: Date;
}

/** Does a rule's action/connector scope match this context? */
function scopeMatches(rule: GovernanceRule, ctx: { actionType: string; connector?: string }): boolean {
    const connectorOk = !rule.connector || rule.connector === ctx.connector;
    const actionOk = !rule.actionType || rule.actionType === '*' || rule.actionType === ctx.actionType;
    return connectorOk && actionOk;
}

/** Returns the first env-deny rule matching the task env + action scope, or null. */
export function isEnvDenied(
    rules: GovernanceRule[],
    ctx: { actionType: string; connector?: string; env?: string },
): GovernanceRule | null {
    if (!ctx.env) return null;
    for (const rule of rules) {
        if (rule.effect !== 'deny' || !rule.env) continue;
        if (rule.env !== ctx.env) continue;
        if (scopeMatches(rule, ctx)) return rule;
    }
    return null;
}

/** Returns the first time-window deny rule violated at `now` for this action, or null. */
export function isActionTimeDenied(
    rules: GovernanceRule[],
    ctx: { actionType: string; connector?: string; now: Date },
): GovernanceRule | null {
    for (const rule of rules) {
        if (rule.effect !== 'deny' || !rule.timeWindow) continue;
        if (!scopeMatches(rule, ctx)) continue;
        if (isTimeDenied(rule, ctx.now)) return rule;
    }
    return null;
}

/** Merged active tenant + role policy rules. Fail-safe → []. */
export async function getActiveGovernanceRules(
    prisma: PrismaClient,
    tenantId: string,
    roleKey: string,
): Promise<GovernanceRule[]> {
    try {
        const [tenantPolicy, rolePolicy] = await Promise.all([
            getActivePolicy(prisma, tenantId, 'tenant', '').catch(() => null),
            getActivePolicy(prisma, tenantId, 'role', roleKey).catch(() => null),
        ]);
        return [...(tenantPolicy?.rules ?? []), ...(rolePolicy?.rules ?? [])];
    } catch {
        return [];
    }
}

// ---------------------------------------------------------------------------
// Runtime convenience: cached Prisma (mirrors connector/role policy stores).
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

/** Runtime entry: cached-prisma merged rules load, fail-safe []. */
export async function getActiveGovernanceRulesForTenant(
    tenantId: string,
    roleKey: string,
): Promise<GovernanceRule[]> {
    const prisma = getCachedPrisma();
    if (!prisma) return [];
    return getActiveGovernanceRules(prisma, tenantId, roleKey);
}
