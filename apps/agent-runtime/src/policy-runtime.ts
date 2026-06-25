/**
 * policy-runtime.ts — composition root for customer governance policy in the
 * agent runtime. Builds the `policyEvaluateFn` injected into the execution
 * engine and loads the OPA bundle at startup.
 *
 * Behavior:
 *   - No DATABASE_URL          → returns undefined (no custom-policy enforcement;
 *                                the heuristic risk floor still applies).
 *   - Tenant has no active     → returns `allow` WITHOUT calling OPA (the
 *     custom policy               heuristic floor already encodes the defaults,
 *                                so OPA is only consulted when a tenant has
 *                                actually published a policy).
 *   - Tenant has an active     → OPA evaluation via the version-keyed cache.
 *     policy
 *
 * Fail-safety: a DB lookup error degrades to `allow` (never weakens the floor —
 * high-risk actions still route to approval via the heuristic). An OPA outage is
 * handled inside evaluate(), which returns a fail-closed `require_approval`.
 */

import { PrismaClient } from '@prisma/client';
import type { PolicyDecision, PolicyEvaluationInput } from '@agentfarm/shared-types';
import {
    evaluate as opaEvaluate,
    evaluateWithCache,
    getActivePolicy,
    loadPolicyBundle,
    type CacheClient,
} from '@agentfarm/policy-engine';
import { getRedisClient } from '@agentfarm/redis-client';

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
    const cache = getRedisClient() as unknown as CacheClient | null;

    return async (input: PolicyEvaluationInput): Promise<PolicyDecision> => {
        const active = await getActivePolicy(prisma, input.tenantId).catch(() => null);
        if (!active) return ALLOW; // no custom policy → heuristic floor already applies
        // Self-heal: ensure the bundle is loaded (covers an OPA-not-ready-at-boot race).
        await initGovernancePolicyBundle();
        return evaluateWithCache(input, {
            cache,
            policyVersion: active.version,
            evaluateFn: (i) => opaEvaluate(i),
        });
    };
}

let _bundleLoaded = false;

/** Loads the governance Rego bundle into OPA. Best-effort, idempotent. */
export async function initGovernancePolicyBundle(): Promise<void> {
    if (_bundleLoaded) return;
    try {
        await loadPolicyBundle();
        _bundleLoaded = true;
        // eslint-disable-next-line no-console
        console.log('[governance] OPA policy bundle loaded.');
    } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(
            '[governance] failed to load OPA policy bundle (custom policies inactive until loaded):',
            err instanceof Error ? err.message : String(err),
        );
    }
}
