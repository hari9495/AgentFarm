/**
 * Phase 3 — Verb-level connector/MCP governance: policy projection + merge.
 *
 * Reads the active `GovernancePolicy` at BOTH `scope=tenant` (scopeRef '') and
 * `scope=role` (scopeRef roleKey) and projects their connector/tool rules into a
 * merged, strictest-wins `ConnectorPolicy`:
 *   - per-connector denied verbs (union) + read-only flag (true if either scope),
 *   - denied MCP tool names (union).
 *
 * Tighten-only: only `deny` rules contribute. Fail-safe: missing policy or DB
 * error → empty policy (built-in allow-lists / approval floor stand).
 */

import { PrismaClient } from '@prisma/client';
import type { GovernanceRule } from '@agentfarm/shared-types';
import { getActivePoliciesForScopes } from '@agentfarm/policy-engine';
import { isWriteVerb } from './connector-verb-classifier.js';

export interface ConnectorRule {
    deniedVerbs: Set<string>;
    readOnly: boolean;
}

export interface ConnectorPolicy {
    perConnector: Map<string, ConnectorRule>;
    deniedTools: Set<string>;
}

function emptyPolicy(): ConnectorPolicy {
    return { perConnector: new Map(), deniedTools: new Set() };
}

function ensureConnector(policy: ConnectorPolicy, connector: string): ConnectorRule {
    let entry = policy.perConnector.get(connector);
    if (!entry) {
        entry = { deniedVerbs: new Set(), readOnly: false };
        policy.perConnector.set(connector, entry);
    }
    return entry;
}

/** Folds a rule list into the accumulating policy (deny rules only). */
function applyRules(policy: ConnectorPolicy, rules: GovernanceRule[]): void {
    for (const rule of rules) {
        if (rule.effect !== 'deny') continue;
        // MCP tool deny (tool name), connector optional.
        if (rule.tool) {
            policy.deniedTools.add(rule.tool);
        }
        if (rule.connector) {
            const entry = ensureConnector(policy, rule.connector);
            if (rule.mode === 'read_only') entry.readOnly = true;
            if (rule.actionType && rule.actionType !== '*') entry.deniedVerbs.add(rule.actionType);
        }
    }
}

/**
 * Merged connector/MCP policy for a tenant+role, strictest-wins across tenant and
 * role scope. Fail-safe → empty policy on any error.
 */
export async function getActiveConnectorPolicy(
    prisma: PrismaClient,
    tenantId: string,
    roleKey: string,
    opts: { workspaceId?: string; agentId?: string } = {},
): Promise<ConnectorPolicy> {
    const policy = emptyPolicy();
    try {
        const policies = await getActivePoliciesForScopes(prisma, tenantId, {
            workspaceId: opts.workspaceId,
            roleKey,
            agentId: opts.agentId,
        });
        for (const p of policies) applyRules(policy, p.rules);
    } catch {
        return emptyPolicy();
    }
    return policy;
}

/** True when the connector verb is denied: explicit deny OR read-only write. */
export function isConnectorActionDenied(
    policy: ConnectorPolicy,
    connector: string,
    actionType: string,
): boolean {
    const entry = policy.perConnector.get(connector);
    if (!entry) return false;
    if (entry.deniedVerbs.has(actionType)) return true;
    if (entry.readOnly && isWriteVerb(actionType)) return true;
    return false;
}

// ---------------------------------------------------------------------------
// Runtime convenience: cached Prisma (mirrors role-policy-store / policy-runtime).
// No DATABASE_URL → empty policy (built-ins stand).
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

/** Runtime entry point: cached-prisma connector policy load, fail-safe empty. */
export async function getActiveConnectorPolicyForTenant(
    tenantId: string,
    roleKey: string,
    opts: { workspaceId?: string; agentId?: string } = {},
): Promise<ConnectorPolicy> {
    const prisma = getCachedPrisma();
    if (!prisma) return emptyPolicy();
    return getActiveConnectorPolicy(prisma, tenantId, roleKey, opts);
}
