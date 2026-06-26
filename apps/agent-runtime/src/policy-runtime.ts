/**
 * policy-runtime.ts — composition root for customer governance policy in the
 * agent runtime. Builds the `policyEvaluateFn` injected into the execution engine.
 *
 * A2 (consolidation): the action-level evaluator reads the SAME active
 * `GovernancePolicy` document from the database (tenant + role scope, merged) and
 * applies the SHARED matcher (`evaluateGovernanceRules`) — identical to the
 * direct-read enforcers and the dashboard simulator. This replaces the previous
 * OPA round-trip, whose overlay was never populated by the unified policy editor,
 * eliminating the dual-path inconsistency.
 *
 * Behavior:
 *   - No DATABASE_URL                  → undefined (enforcement disabled; the
 *                                        heuristic risk floor still applies).
 *   - No active tenant/role policy     → `allow` (heuristic floor already covers
 *                                        the built-in defaults).
 *   - Active policy present            → deny if any matching deny rule fires.
 *
 * Fail-safety: a DB lookup error degrades to `allow` — never weakens the floor
 * (high-risk actions still route to approval via the heuristic, and the
 * execution-layer enforcers remain as defense-in-depth).
 */

import { PrismaClient } from '@prisma/client';
import type { PolicyDecision, PolicyEvaluationInput, GovernanceRule } from '@agentfarm/shared-types';
import { evaluateGovernanceRules } from '@agentfarm/shared-types';
import { getActivePolicy } from '@agentfarm/policy-engine';

let _prisma: PrismaClient | null | undefined;

function getPrisma(): PrismaClient | null {
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

const ALLOW: PolicyDecision = {
    effect: 'allow',
    requireApproval: false,
    escalate: false,
    reasonCode: 'allowed',
    reason: 'no active customer policy',
    failClosed: false,
};

/**
 * Returns the policy evaluator to inject into processDeveloperTask, or undefined
 * when no database is configured (enforcement disabled; heuristic floor stands).
 */
export function getPolicyEvaluateFn():
    | ((input: PolicyEvaluationInput) => Promise<PolicyDecision>)
    | undefined {
    const prisma = getPrisma();
    if (!prisma) return undefined;

    return async (input: PolicyEvaluationInput): Promise<PolicyDecision> => {
        try {
            // Read the active tenant- and role-scope policies (strictest-wins: a
            // deny from either blocks). Same DB document the direct-read enforcers use.
            const [tenant, role] = await Promise.all([
                getActivePolicy(prisma, input.tenantId, 'tenant', ''),
                input.roleKey
                    ? getActivePolicy(prisma, input.tenantId, 'role', input.roleKey)
                    : Promise.resolve(null),
            ]);
            if (!tenant && !role) return ALLOW;

            const action = {
                actionType: input.actionType,
                connector: input.connector,
                tool: input.tool,
                env: input.env,
            };

            // Strictest-wins across scopes: a deny anywhere beats a require_approval anywhere.
            let approval: PolicyDecision | undefined;
            for (const policy of [tenant, role]) {
                if (!policy) continue;
                const rules = (policy.rules ?? []) as GovernanceRule[];
                const result = evaluateGovernanceRules(rules, action);
                if (result.effect === 'deny') {
                    return {
                        effect: 'deny',
                        requireApproval: false,
                        escalate: false,
                        reasonCode: 'policy_violation',
                        reason: result.reason,
                        matchedPolicyId: policy.id,
                        matchedPolicyVersion: policy.version,
                        failClosed: false,
                    };
                }
                if (result.effect === 'require_approval' && !approval) {
                    approval = {
                        effect: 'require_approval',
                        requireApproval: true,
                        escalate: false,
                        reasonCode: 'policy_violation',
                        reason: result.reason,
                        matchedPolicyId: policy.id,
                        matchedPolicyVersion: policy.version,
                        failClosed: false,
                    };
                }
            }
            return approval ?? ALLOW;
        } catch {
            // Fail-safe: DB error degrades to allow (heuristic floor + execution-layer
            // enforcers still apply). Never weakens the built-in floor.
            return ALLOW;
        }
    };
}

/**
 * No-op retained for backward compatibility. Governance is now evaluated directly
 * against the database policy document (see getPolicyEvaluateFn) — the runtime no
 * longer depends on OPA. Safe to call; does nothing.
 */
export async function initGovernancePolicyBundle(): Promise<void> {
    /* OPA no longer used by the runtime governance path. */
}
