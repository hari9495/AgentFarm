/**
 * Governance policy contracts — customer-configurable, runtime-enforced policy.
 *
 * A GovernancePolicy is authored per tenant (optionally narrowed to a workspace,
 * role, or agent), versioned, and its structured rules are evaluated at runtime
 * by the policy engine (OPA). These contracts are the wire/types shared between
 * the api-gateway (authoring), the policy-engine service (evaluation), and the
 * agent-runtime (enforcement).
 *
 * Invariant: customer policy may only *tighten* the built-in hardcoded floor —
 * it can never downgrade an action below its default risk tier. See
 * docs/audit/2026-06-25/GOVERNANCE-POLICY-ENGINE-IMPLEMENTATION-PLAN.md.
 */

export type GovernancePolicyScope = 'tenant' | 'workspace' | 'role' | 'agent';

export type GovernancePolicyStatus = 'draft' | 'active' | 'archived';

export type PolicyDocumentStatus = 'uploaded' | 'parsed' | 'failed';

/** The effect the evaluator returns for a single action evaluation. */
export type PolicyEffect = 'allow' | 'require_approval' | 'deny';

/** Why a policy produced its effect — drives audit + UI surfacing. */
export type PolicyReasonCode =
    | 'allowed'
    | 'policy_violation'
    | 'risk_threshold_exceeded'
    | 'environment_restricted'
    | 'time_restricted'
    | 'budget_exceeded'
    | 'connector_restricted'
    | 'tool_restricted'
    | 'evaluator_unavailable';

/**
 * A single structured governance rule. `rulesJson` on a GovernancePolicy is an
 * array of these. Phase 1 supports action-level effects; later phases extend
 * the match surface (connectors, tools, env, time, budget).
 */
export interface GovernanceRule {
    /** Normalized action type this rule matches (e.g. 'deploy_production'). '*' matches any. */
    actionType: string;
    /** Effect to apply when matched. */
    effect: PolicyEffect;
    /** Optional connector this rule is scoped to (e.g. 'salesforce'). */
    connector?: string;
    /** Optional MCP tool / verb this rule is scoped to (e.g. 'jira.delete'). */
    tool?: string;
    /** Optional environment scope (e.g. 'production' | 'staging'). */
    env?: string;
    /** Human-readable reason surfaced in audit + dashboard. */
    reason?: string;
    /** Reason code for machine handling; defaults to 'policy_violation' for deny. */
    reasonCode?: PolicyReasonCode;
}

/** Persisted governance policy record (mirrors the GovernancePolicy Prisma model). */
export interface GovernancePolicyRecord {
    id: string;
    tenantId: string;
    scope: GovernancePolicyScope;
    /** workspaceId / roleKey / agentId depending on scope; null for tenant scope. */
    scopeRef?: string | null;
    version: number;
    status: GovernancePolicyStatus;
    name: string;
    description?: string | null;
    rules: GovernanceRule[];
    createdBy: string;
    updatedBy: string;
    createdAt: string;
    updatedAt: string;
}

/**
 * Input passed to the policy engine for a single action evaluation.
 * Assembled by the agent-runtime from the task envelope + execution context.
 */
export interface PolicyEvaluationInput {
    tenantId: string;
    workspaceId?: string;
    roleKey: string;
    actionType: string;
    connector?: string;
    /** MCP tool / verb being invoked, if any. */
    tool?: string;
    /** Target environment, if known (e.g. 'production'). */
    env?: string;
    /** Estimated cost of the action in the tenant's billing unit, if known. */
    estimatedCost?: number;
    /** ISO timestamp of the evaluation (for time-window rules). */
    time: string;
}

/** Typed decision returned by the policy engine. */
export interface PolicyDecision {
    effect: PolicyEffect;
    /** Convenience flag: true when effect === 'require_approval'. */
    requireApproval: boolean;
    /** True when the decision should be routed to an escalation path. */
    escalate: boolean;
    reasonCode: PolicyReasonCode;
    reason: string;
    /** The policy that produced this decision, if any matched. */
    matchedPolicyId?: string;
    /** Version of the matched policy, for audit traceability. */
    matchedPolicyVersion?: number;
    /**
     * True when this decision is the fail-closed fallback (evaluator error /
     * unreachable). Callers must not weaken the heuristic floor in this case.
     */
    failClosed: boolean;
}
