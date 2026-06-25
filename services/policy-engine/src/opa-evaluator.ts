/**
 * opa-evaluator.ts — runtime policy evaluation via Open Policy Agent (OPA).
 *
 * The agent-runtime calls `evaluate()` before executing an action. We POST the
 * evaluation input to OPA's data API and map its result to a typed
 * `PolicyDecision`.
 *
 * Safety invariants (see implementation plan, Phase 1):
 *   - FAIL-CLOSED: any error (network, timeout, malformed response, missing
 *     result) yields a decision with effect `require_approval` and
 *     `failClosed: true`. We never silently `allow` when the evaluator is
 *     unavailable. The runtime merge step then keeps the stricter of the
 *     heuristic floor and this decision, so safety is never weakened.
 *   - Customer policy can only TIGHTEN: this module returns OPA's effect as-is;
 *     the max-strictness merge that protects the hardcoded floor lives in the
 *     agent-runtime (Group D), not here.
 */

import type { PolicyDecision, PolicyEffect, PolicyEvaluationInput } from '@agentfarm/shared-types';

/** Shape of the `input` document sent to OPA. */
export interface OpaInput {
    tenantId: string;
    workspaceId: string;
    roleKey: string;
    action: string;
    connector: string;
    tool: string;
    env: string;
    estimatedCost: number;
    time: string;
}

export interface EvaluateOptions {
    /** OPA base URL. Defaults to OPA_BASE_URL env, then http://localhost:8181. */
    opaBaseUrl?: string;
    /** Injectable fetch (tests). Defaults to global fetch. */
    fetchImpl?: typeof fetch;
    /** Timeout in ms for the OPA call. Defaults to 1500ms (hot path). */
    timeoutMs?: number;
}

/** OPA decision rule path: data.agentfarm.governance.decision */
const OPA_DECISION_PATH = '/v1/data/agentfarm/governance/decision';

const VALID_EFFECTS: ReadonlySet<string> = new Set<PolicyEffect>([
    'allow',
    'require_approval',
    'deny',
]);

/**
 * Builds the OPA `input` document from a PolicyEvaluationInput. Pure — no I/O.
 * Optional fields are normalized to empty string / 0 so Rego rules can match
 * without undefined checks.
 */
export function buildOpaInput(input: PolicyEvaluationInput): OpaInput {
    return {
        tenantId: input.tenantId,
        workspaceId: input.workspaceId ?? '',
        roleKey: input.roleKey,
        action: input.actionType,
        connector: input.connector ?? '',
        tool: input.tool ?? '',
        env: input.env ?? '',
        estimatedCost: typeof input.estimatedCost === 'number' ? input.estimatedCost : 0,
        time: input.time,
    };
}

/** The fail-closed decision returned whenever OPA cannot be trusted. */
function failClosedDecision(reason: string): PolicyDecision {
    return {
        effect: 'require_approval',
        requireApproval: true,
        escalate: false,
        reasonCode: 'evaluator_unavailable',
        reason,
        failClosed: true,
    };
}

/** Maps a raw OPA `result` object to a typed PolicyDecision. */
function mapResult(result: unknown): PolicyDecision | null {
    if (!result || typeof result !== 'object') return null;
    const r = result as Record<string, unknown>;
    const effect = typeof r['effect'] === 'string' ? (r['effect'] as string) : '';
    if (!VALID_EFFECTS.has(effect)) return null;

    const typedEffect = effect as PolicyEffect;
    const reasonCode =
        typeof r['reasonCode'] === 'string'
            ? (r['reasonCode'] as PolicyDecision['reasonCode'])
            : typedEffect === 'allow'
              ? 'allowed'
              : 'policy_violation';

    return {
        effect: typedEffect,
        requireApproval: typedEffect === 'require_approval',
        escalate: r['escalate'] === true,
        reasonCode,
        reason:
            typeof r['reason'] === 'string' && r['reason'].trim()
                ? (r['reason'] as string)
                : `Policy decision: ${typedEffect}`,
        matchedPolicyId:
            typeof r['matchedPolicyId'] === 'string' ? (r['matchedPolicyId'] as string) : undefined,
        matchedPolicyVersion:
            typeof r['matchedPolicyVersion'] === 'number'
                ? (r['matchedPolicyVersion'] as number)
                : undefined,
        failClosed: false,
    };
}

/**
 * Evaluates an action against OPA. Always resolves (never throws) — errors map
 * to a fail-closed decision.
 */
export async function evaluate(
    input: PolicyEvaluationInput,
    options: EvaluateOptions = {},
): Promise<PolicyDecision> {
    const baseUrl = (
        options.opaBaseUrl ??
        process.env['OPA_BASE_URL'] ??
        'http://localhost:8181'
    ).replace(/\/$/, '');
    const fetchImpl = options.fetchImpl ?? globalThis.fetch;
    const timeoutMs = options.timeoutMs ?? 1500;

    if (typeof fetchImpl !== 'function') {
        return failClosedDecision('No fetch implementation available for OPA evaluation.');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetchImpl(`${baseUrl}${OPA_DECISION_PATH}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ input: buildOpaInput(input) }),
            signal: controller.signal,
        });

        if (!res.ok) {
            return failClosedDecision(`OPA returned HTTP ${res.status}.`);
        }

        const body = (await res.json()) as { result?: unknown };
        const decision = mapResult(body?.result);
        if (!decision) {
            return failClosedDecision('OPA returned no usable decision result.');
        }
        return decision;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return failClosedDecision(`OPA evaluation failed: ${message}`);
    } finally {
        clearTimeout(timer);
    }
}
