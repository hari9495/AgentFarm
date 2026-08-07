/**
 * execution-engine.ts — task orchestration core.
 *
 * This module is the single entry point for task execution. It is intentionally
 * a thin orchestrator: it wires together domain and infrastructure modules but
 * contains no business logic of its own.
 *
 * Responsibilities:
 *   - Define the shared task/decision/result types (consumed across the runtime)
 *   - Orchestrate the execution pipeline: audit context → kill-switch → role
 *     enforcement → escalation check → LLM decision → execute-with-retries → memory
 *   - Re-export the pure classification helpers so existing call sites compile
 *     unchanged (backward-compatible re-exports from domain/risk-policy.ts)
 *
 * NOT responsible for:
 *   - Risk tier policy data         → domain/risk-policy.ts
 *   - LLM provider wiring           → infrastructure/llm-provider-factory.ts
 *   - Episodic memory recording     → application/episodic-recorder.ts
 */

import type { ProviderFailoverTraceRecord, PolicyDecision, PolicyEvaluationInput } from '@agentfarm/shared-types';
import { type ProgressSink, NoopProgressSink, reportProgress } from './task-progress-reporter.js';
import { buildErrorQuery, researchForTask, type FetchFn } from './web-research-service.js';
import { buildAuditContextPayload, buildRuntimeAuditContext } from './runtime-audit-integration.js';
import { preTaskScout } from './pre-task-scout.js';
import { evaluateEscalation } from './escalation-engine.js';
import { executeLocalWorkspaceAction, LOCAL_WORKSPACE_ACTION_TYPES, type LlmCodeGenFn } from './local-workspace-executor.js';
import { enforceRole } from './role-enforcer.js';
import type { TaskClassifierFn } from './task-classifier.js';
import { dispatchConnectorAction } from './connector-dispatcher.js';
import { globalEpisodicMemory } from './episodic-memory.js';
import { extractPersonKeyFromPayload } from './person-key-extractor.js';

// Domain + infrastructure imports (extracted modules)
import {
    buildDecision as _buildDecision,
    normalizeActionType as _normalizeActionType,
    scoreConfidence as _scoreConfidence,
    classifyRisk as _classifyRisk,
    MEDIUM_RISK_ACTIONS,
    HIGH_RISK_ACTIONS,
} from './domain/risk-policy.js';
import { createHash } from 'node:crypto';
import { getRedisClient } from '@agentfarm/redis-client';
import { getCompressedEpisodicContext } from './infrastructure/episodic-summarizer.js';
import { createCodeGenFn } from './infrastructure/llm-provider-factory.js';
import { runWithLlmTraceContext, type LlmTraceContext } from '@agentfarm/llm-trace';
import { evaluateGoal, judgeScore, resolveSpec } from './goal-judge.js';
import { checkCompletion } from './completion-gate.js';
import { distillLesson } from './dream-distill.js';
import { runMaxMode, isMaxModeEnabledForPayload, getMaxModeCandidates, shouldSkipMaxMode } from './max-mode.js';
import { isCheckpointEnabled, loadCheckpoint, saveCheckpoint, clearCheckpoint, injectCheckpointIntoPayload } from './checkpoint.js';

/**
 * Build the ambient LLM-trace context for a task so every LLM call made during
 * its execution (decision, code-gen, shared Anthropic caller, agent-specific
 * callers) nests under one trace (traceId = taskId) and is tenant-scoped.
 */
const buildTaskTraceContext = (task: TaskEnvelope): LlmTraceContext => {
    const p = task.payload ?? {};
    const str = (k: string): string | undefined => (typeof p[k] === 'string' ? (p[k] as string) : undefined);
    return {
        traceId: task.taskId,
        taskId: task.taskId,
        tenantId: str('tenantId'),
        agentId: str('botId') ?? str('agentId') ?? str('agentInstanceId'),
        sessionId: typeof task.lease?.correlationId === 'string' ? task.lease.correlationId : undefined,
    };
};
import { recordEpisode } from './application/episodic-recorder.js';

// ---------------------------------------------------------------------------
// Shared types — exported for use across the runtime
// ---------------------------------------------------------------------------

export type RiskLevel = 'low' | 'medium' | 'high';

export type TaskEnvelope = {
    taskId: string;
    payload: Record<string, unknown>;
    enqueuedAt: number;
    lease?: {
        leaseId: string;
        idempotencyKey: string;
        claimedBy: string;
        claimedAt: number;
        expiresAt: number;
        correlationId?: string;
        status: 'claimed' | 'released' | 'expired';
    };
};

export type ActionDecision = {
    actionType: string;
    confidence: number;
    riskLevel: RiskLevel;
    route: 'execute' | 'approval';
    reason: string;
};

export type LlmDecisionMetadata = {
    classificationSource: 'heuristic' | 'llm';
    modelProvider: string;
    model: string | null;
    modelProfile?: string | null;
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
    fallbackReason?: string;
    failoverTrace?: ProviderFailoverTraceRecord[];
};

export type PayloadOverrideSource = 'none' | 'llm_generated' | 'executor_inferred';

export type KillSwitchCheckFn = (params: {
    taskId: string;
    riskLevel: RiskLevel;
    tenantId: string;
    workspaceId: string;
    botId: string;
}) => Promise<{ blocked: boolean; killSwitchId?: string }>;

/**
 * Injectable customer-policy evaluator (wired in runtime-server to the
 * policy-engine OPA evaluator + cache). Kept as an injected function so the
 * execution engine carries no hard dependency on OPA/Redis and stays unit-testable.
 */
export type PolicyEvaluateFn = (input: PolicyEvaluationInput) => Promise<PolicyDecision>;

/**
 * Merges a customer PolicyDecision into the already-settled action decision.
 *
 * Customer policy may only TIGHTEN — never downgrade the heuristic/LLM floor:
 *   - deny            → block the task (denied: true); decision marked high/approval.
 *   - require_approval → force route to approval (bump low→medium); no downgrade.
 *   - allow           → leave the decision untouched.
 *
 * Pure function (no I/O) — the runtime decides what to do with `denied`.
 */
export function applyPolicyDecision(
    decision: ActionDecision,
    policy: PolicyDecision,
): { decision: ActionDecision; denied: boolean } {
    if (policy.effect === 'deny') {
        return {
            decision: {
                ...decision,
                riskLevel: 'high',
                route: 'approval',
                reason: `${decision.reason} [policy: DENY — ${policy.reason}]`,
            },
            denied: true,
        };
    }
    if (policy.effect === 'require_approval' && decision.route !== 'approval') {
        return {
            decision: {
                ...decision,
                riskLevel: decision.riskLevel === 'low' ? 'medium' : decision.riskLevel,
                route: 'approval',
                reason: `${decision.reason} [policy: requires approval — ${policy.reason}]`,
            },
            denied: false,
        };
    }
    // allow, or already at/above the policy's required strictness → no change.
    return { decision, denied: false };
}

const APPROVAL_POLICY_MIN_RISK: Record<string, RiskLevel> = {
    all: 'low',
    'medium-high': 'medium',
    'high-only': 'high',
};

/**
 * Applies the agent persona's approvalPolicy threshold (F1) — 'all' routes every
 * action to approval, 'medium-high' routes medium+high, 'high-only' (default)
 * routes only high. Tighten-only, same convention as applyPolicyDecision: never
 * downgrades a decision the OPA policy or safety net already routed to approval.
 * Pure function — no I/O.
 */
export function applyApprovalPolicyThreshold(
    decision: ActionDecision,
    approvalPolicy: string | null | undefined,
): ActionDecision {
    if (decision.route === 'approval') return decision;
    if (!approvalPolicy) return decision; // no persona/value → fail-safe, no extra restriction
    const minRisk = APPROVAL_POLICY_MIN_RISK[approvalPolicy];
    if (!minRisk) return decision; // unrecognized value — fail-safe, no extra restriction

    const order: RiskLevel[] = ['low', 'medium', 'high'];
    if (order.indexOf(decision.riskLevel) < order.indexOf(minRisk)) return decision;

    return {
        ...decision,
        route: 'approval',
        reason: `${decision.reason} [approval-policy: '${approvalPolicy}' requires approval at ${decision.riskLevel} risk]`,
    };
}

/** Builds the policy evaluation input from a settled decision + task payload. */
export function buildPolicyEvaluationInput(
    payload: Record<string, unknown>,
    actionType: string,
): PolicyEvaluationInput | null {
    const tenantId = typeof payload['tenantId'] === 'string' ? payload['tenantId'].trim() : '';
    if (!tenantId) return null; // cannot scope an evaluation without a tenant
    const str = (k: string): string | undefined =>
        typeof payload[k] === 'string' && payload[k] ? (payload[k] as string) : undefined;
    return {
        tenantId,
        workspaceId: str('workspaceId'),
        agentId: str('agentId') ?? str('botId') ?? str('audit_agent_instance_id'),
        roleKey:
            str('roleKey') ?? str('roleProfile') ?? str('audit_role') ?? 'developer',
        actionType,
        connector: str('connector') ?? str('connectorId'),
        tool: str('mcpTool') ?? str('tool'),
        env: str('env') ?? str('environment'),
        time: new Date().toISOString(),
    };
}

export type LlmDecisionResolver = (input: {
    task: TaskEnvelope;
    heuristicDecision: ActionDecision;
}) => Promise<{
    decision: ActionDecision;
    metadata: Omit<LlmDecisionMetadata, 'classificationSource'>;
    payloadOverrides?: Record<string, unknown>;
}>;

export type ProcessedTaskResult = {
    decision: ActionDecision;
    status: 'success' | 'approval_required' | 'failed';
    attempts: number;
    transientRetries: number;
    executionPayload: Record<string, unknown>;
    payloadOverrideSource: PayloadOverrideSource;
    failureClass?: 'transient_error' | 'runtime_exception' | 'role_enforcement' | 'kill_switch_blocked' | 'policy_violation';
    errorMessage?: string;
    llmExecution?: LlmDecisionMetadata;
    /** Customer-policy decision applied to this task (when a policy evaluator ran). */
    policyDecision?: PolicyDecision;
    /**
     * Raw JSON output from the workspace action, forwarded so episodic memory
     * can capture files_changed, code_diff, and test_failure_summary.
     */
    actionOutput?: string;
    /** Set by Max Mode: number of parallel candidates that were sampled. */
    maxModeCandidates?: number;
    /** Set by Max Mode: Goal Judge confidence score of the winning candidate (0–1). */
    maxModeWinnerScore?: number;
};

// ---------------------------------------------------------------------------
// Backward-compatible re-exports from domain/risk-policy.ts
// (existing imports of these functions from execution-engine.ts continue to work)
// ---------------------------------------------------------------------------

export const normalizeActionType = _normalizeActionType;
export const scoreConfidence = _scoreConfidence;
export const classifyRisk = _classifyRisk;
export const buildDecision = _buildDecision;

// ---------------------------------------------------------------------------
// Fix 1: Confidence-based LLM classification skip
//
// Pure read/query action types where heuristic classification is sufficient —
// the LLM would confirm the same route without adding a plan or overrides.
// Any action type NOT in this set always goes through the LLM when a resolver
// is configured. Requires confidence >= HEURISTIC_CONFIDENCE_SKIP_THRESHOLD
// AND riskLevel === 'low' (both conditions must hold).
// ---------------------------------------------------------------------------
const HEURISTIC_SUFFICIENT_ACTIONS = new Set([
    'code_read',
    'workspace_read_file',
    'workspace_list_files',
    'workspace_grep',
    'workspace_scout',
    // DevOps read-only: fully structured payloads, no plan generation needed
    'k8s_get',
    'k8s_logs',
    'prometheus_query',
    'vault_read',
]);
const HEURISTIC_CONFIDENCE_SKIP_THRESHOLD = 0.80;

// ---------------------------------------------------------------------------
// Fix 2: Redis classification cache
//
// Caches low-risk LLM classification results for 1 hour. Cache key is a
// sha256 of tenantId + botId + actionType + first 200 chars of the prompt.
// Medium/high-risk decisions are NOT cached — they route to approval and
// caching them could mask a legitimate policy change.
// ---------------------------------------------------------------------------
const CLASSIFICATION_CACHE_TTL_S = 3600;

type CachedClassificationEntry = {
    decision: ActionDecision;
    payloadOverrides?: Record<string, unknown>;
    metadata: Omit<LlmDecisionMetadata, 'classificationSource'>;
};

function buildClassificationCacheKey(task: TaskEnvelope): string {
    const tenantId = typeof task.payload['tenantId'] === 'string' ? task.payload['tenantId'] : 'unknown';
    const botId = typeof task.payload['botId'] === 'string' ? task.payload['botId'] : 'unknown';
    const actionType = typeof task.payload['actionType'] === 'string' ? task.payload['actionType'] : '';
    const summary =
        typeof task.payload['summary'] === 'string' ? task.payload['summary'].slice(0, 200) :
        typeof task.payload['prompt'] === 'string' ? task.payload['prompt'].slice(0, 200) :
        typeof task.payload['description'] === 'string' ? task.payload['description'].slice(0, 200) : '';
    const raw = `${tenantId}:${botId}:${actionType}:${summary}`;
    return 'af:class:v1:' + createHash('sha256').update(raw).digest('hex');
}

// ---------------------------------------------------------------------------
// High-impact safety net
//
// Small models occasionally classify destructive/production-touching actions
// as low risk. When a decision is low-risk but the action/prompt contains
// high-impact keywords, bump it to medium + approval so a human signs off.
//
// Exported and applied on BOTH the fresh-classification path AND the cache-hit
// path — a cached low-risk entry must never bypass approval for a high-impact
// prompt (defense in depth against cache poisoning).
// ---------------------------------------------------------------------------
export const HIGH_IMPACT_PATTERN =
    /\b(deploy|provision|delete|destroy|drop|remove.*(prod|server|database|infra)|production|migrate|rollback|shutdown|terminate|kill)\b/;

export function buildSafetyNetProbe(decision: ActionDecision, payload: Record<string, unknown>): string {
    const description = typeof payload['description'] === 'string' ? payload['description'] : '';
    const prompt = typeof payload['prompt'] === 'string' ? payload['prompt'] : '';
    return `${decision.actionType} ${decision.reason} ${description} ${prompt}`.toLowerCase();
}

export function applyHighImpactSafetyNet(
    decision: ActionDecision,
    payload: Record<string, unknown>,
): { decision: ActionDecision; bumped: boolean } {
    // Policy floor: an action that is risky BY POLICY (e.g. mcp_tool_call) can never
    // be downgraded to low/execute by the LLM's self-reported risk. Enforce the
    // policy minimum regardless of what the model claimed.
    if (decision.riskLevel === 'low' && HIGH_RISK_ACTIONS.has(decision.actionType)) {
        return {
            decision: { ...decision, riskLevel: 'high', route: 'approval', reason: `${decision.reason} [policy-floor: '${decision.actionType}' is high-risk by policy]` },
            bumped: true,
        };
    }
    if (decision.riskLevel === 'low' && MEDIUM_RISK_ACTIONS.has(decision.actionType)) {
        return {
            decision: { ...decision, riskLevel: 'medium', route: 'approval', reason: `${decision.reason} [policy-floor: '${decision.actionType}' is medium-risk by policy]` },
            bumped: true,
        };
    }

    if (decision.riskLevel !== 'low') return { decision, bumped: false };
    if (!HIGH_IMPACT_PATTERN.test(buildSafetyNetProbe(decision, payload))) return { decision, bumped: false };
    return {
        decision: {
            ...decision,
            riskLevel: 'medium',
            route: 'approval',
            reason: `${decision.reason} [safety-net: high-impact keywords detected, bumped to medium]`,
        },
        bumped: true,
    };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const buildProgressReporterContext = (task: TaskEnvelope) => ({
    tenantId: typeof task.payload['tenantId'] === 'string' ? task.payload['tenantId'] : 'unknown_tenant',
    workspaceId: typeof task.payload['workspaceId'] === 'string' ? task.payload['workspaceId'] : 'unknown_workspace',
    taskId: task.taskId,
    botId: typeof task.payload['botId'] === 'string' ? task.payload['botId'] : 'agent-runtime',
    correlationId: typeof task.lease?.correlationId === 'string' ? task.lease.correlationId : `task-${task.taskId}`,
});

const enrichPayloadWithAuditContext = (
    payload: Record<string, unknown>,
    taskId: string,
): Record<string, unknown> => {
    const tenantId = typeof payload['tenantId'] === 'string' ? payload['tenantId'].trim() : '';
    const workspaceId = typeof payload['workspaceId'] === 'string' ? payload['workspaceId'].trim() : '';
    const role =
        typeof payload['roleKey'] === 'string' ? payload['roleKey'] :
        typeof payload['roleProfile'] === 'string' ? payload['roleProfile'] :
        typeof payload['audit_role'] === 'string' ? payload['audit_role'] : '';

    if (!tenantId || !workspaceId || !role) return payload;

    const agentInstanceId =
        typeof payload['audit_agent_instance_id'] === 'string' ? payload['audit_agent_instance_id'] :
        typeof payload['botId'] === 'string' && payload['botId'].startsWith('agt_') ? payload['botId'] :
        undefined;
    const sessionId =
        typeof payload['session_id'] === 'string' ? payload['session_id'] :
        typeof payload['audit_session_id'] === 'string' ? payload['audit_session_id'] :
        undefined;

    const context = buildRuntimeAuditContext({ tenantId, workspaceId, role, taskId, sessionId, agentInstanceId, env: process.env });
    return { ...payload, ...buildAuditContextPayload(context) };
};

const shouldFailTransiently = (payload: Record<string, unknown>, attempt: number): boolean => {
    const configured = payload['simulate_transient_failures'];
    return typeof configured === 'number' && attempt <= configured;
};

const KILL_SWITCH_BLOCKED_MESSAGE = (killSwitchId?: string): string =>
    `[KILL_SWITCH_BLOCKED] Execution blocked by active kill-switch${killSwitchId ? ` (${killSwitchId})` : ''}. Resume requires authorized control-plane signal and incident reference.`;

// ---------------------------------------------------------------------------
// Low-level action execution
// ---------------------------------------------------------------------------

async function executeLowRiskAction(
    task: TaskEnvelope,
    attempt: number,
    opts?: { llmCodeGenFn?: LlmCodeGenFn; llmPlannerFn?: LlmCodeGenFn },
): Promise<{ actionOutput?: string }> {
    if (shouldFailTransiently(task.payload, attempt)) throw new Error('TRANSIENT_EXECUTOR_ERROR');
    if (task.payload['force_failure'] === true) throw new Error('NON_RETRYABLE_EXECUTOR_ERROR');

    const rawActionType = task.payload['actionType'];
    const rawConnector = task.payload['connector'];

    // Connector actions (GitHub, Jira, …)
    if (typeof rawConnector === 'string' && rawConnector && typeof rawActionType === 'string') {
        const result = await dispatchConnectorAction(rawConnector, rawActionType, task.payload);
        if (!result.ok) throw new Error(`Connector dispatch failed [${rawConnector}/${rawActionType}]: ${result.error}`);
        return {};
    }

    // Local workspace actions
    if (
        typeof rawActionType === 'string' &&
        (rawActionType.startsWith('workspace_') || LOCAL_WORKSPACE_ACTION_TYPES.has(rawActionType as Parameters<typeof executeLocalWorkspaceAction>[0]['actionType']))
    ) {
        const tenantId = typeof task.payload['tenantId'] === 'string' ? task.payload['tenantId'] : 'unknown';
        const botId = typeof task.payload['botId'] === 'string' ? task.payload['botId'] : 'unknown';
        const result = await executeLocalWorkspaceAction({
            tenantId, botId,
            taskId: task.taskId,
            actionType: rawActionType as Parameters<typeof executeLocalWorkspaceAction>[0]['actionType'],
            payload: task.payload,
            llmCodeGenFn: opts?.llmCodeGenFn,
            llmPlannerFn: opts?.llmPlannerFn,
        });
        if (!result.ok) {
            throw new Error(`Workspace action failed [${rawActionType}]: ${result.errorOutput ?? result.output ?? 'workspace action failed'}`);
        }
        return { actionOutput: result.output };
    }

    // Fail loudly on unroutable action types rather than silently no-op
    const resolvedActionType = typeof rawActionType === 'string' && rawActionType ? rawActionType : 'read_task';
    if (resolvedActionType !== 'read_task') {
        throw new Error(
            `Unroutable action type: '${resolvedActionType}'. ` +
            `Expected a 'workspace_*' prefixed action type or a connector action with payload.connector set.`,
        );
    }
    return {};
}

// ---------------------------------------------------------------------------
// Retry loop with auto-research enrichment on failure
// ---------------------------------------------------------------------------

async function executeTaskWithRetries(
    task: TaskEnvelope,
    decision: ActionDecision,
    payloadOverrideSource: PayloadOverrideSource,
    llmExecution?: LlmDecisionMetadata,
    options?: { maxAttempts?: number; llmCodeGenFn?: LlmCodeGenFn; llmPlannerFn?: LlmCodeGenFn },
): Promise<ProcessedTaskResult> {
    const maxAttempts = options?.maxAttempts ?? 3;
    let allowedAttempts = maxAttempts;
    let attempts = 0;
    let transientRetries = 0;
    let researchRetryTriggered = false;
    let currentPayload: Record<string, unknown> = { ...task.payload };

    while (attempts < allowedAttempts) {
        attempts += 1;
        try {
            const { actionOutput } = await executeLowRiskAction(
                { ...task, payload: currentPayload },
                attempts,
                { llmCodeGenFn: options?.llmCodeGenFn, llmPlannerFn: options?.llmPlannerFn },
            );
            return { decision, status: 'success', attempts, transientRetries, executionPayload: currentPayload, payloadOverrideSource, llmExecution, actionOutput };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            const isTransient = message.includes('TRANSIENT');

            if (isTransient && attempts < maxAttempts) {
                transientRetries += 1;
                continue;
            }

            const enrichedPayload: Record<string, unknown> = { ...currentPayload };
            const shouldAutoResearchRetry =
                currentPayload['disable_auto_research_retry'] !== true &&
                !researchRetryTriggered &&
                attempts >= 2;

            if (shouldAutoResearchRetry) {
                researchRetryTriggered = true;
                allowedAttempts += 1;
            }

            if (shouldAutoResearchRetry || currentPayload['enable_web_research'] === true) {
                try {
                    const tenantId = typeof currentPayload['tenantId'] === 'string' ? currentPayload['tenantId'] : 'unknown_tenant';
                    const workspaceId = typeof currentPayload['workspaceId'] === 'string' ? currentPayload['workspaceId'] : 'unknown_workspace';
                    const fetchFn: FetchFn = async (url: string) => {
                        const response = await fetch(url, { signal: AbortSignal.timeout(75) });
                        return { ok: response.ok, status: response.status, text: async () => response.text() };
                    };
                    const research = await researchForTask(
                        buildErrorQuery(message),
                        { tenantId, workspaceId, taskId: task.taskId, correlationId: typeof task.lease?.correlationId === 'string' ? task.lease.correlationId : `task-${task.taskId}` },
                        fetchFn,
                    );
                    if (research.sources.length > 0 || research.synthesizedAnswer) {
                        enrichedPayload['_research_query'] = message;
                        enrichedPayload['_research_summary'] = research.synthesizedAnswer;
                        enrichedPayload['_research_sources'] = research.sources.map((e) => ({ url: e.url, source: e.source, relevance: e.relevance }));
                    }
                } catch { /* best-effort enrichment only */ }
            }

            if (shouldAutoResearchRetry) {
                enrichedPayload['_research_retry_attempted'] = true;
                currentPayload = enrichedPayload;
                continue;
            }

            return {
                decision, status: 'failed', attempts, transientRetries,
                executionPayload: enrichedPayload, payloadOverrideSource,
                failureClass: isTransient ? 'transient_error' : 'runtime_exception',
                errorMessage: message, llmExecution,
            };
        }
    }

    return {
        decision, status: 'failed', attempts, transientRetries,
        executionPayload: currentPayload, payloadOverrideSource,
        failureClass: 'runtime_exception',
        errorMessage: 'Failed after exhausting retry attempts.', llmExecution,
    };
}

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

export async function processApprovedTask(
    ...args: Parameters<typeof processApprovedTaskInner>
): Promise<ProcessedTaskResult> {
    return runWithLlmTraceContext(buildTaskTraceContext(args[0]), () => processApprovedTaskInner(...args));
}

async function processApprovedTaskInner(
    task: TaskEnvelope,
    options?: {
        maxAttempts?: number;
        modelProvider?: string;
        modelProfile?: string;
        progressSink?: ProgressSink;
        killSwitchCheckFn?: KillSwitchCheckFn;
        policyEvaluateFn?: PolicyEvaluateFn;
        llmCodeGenFn?: LlmCodeGenFn;
        llmPlannerFn?: LlmCodeGenFn;
    },
): Promise<ProcessedTaskResult> {
    const taskWithAuditContext: TaskEnvelope = { ...task, payload: enrichPayloadWithAuditContext(task.payload, task.taskId) };
    const sink: ProgressSink = options?.progressSink ?? new NoopProgressSink();
    const progressCtx = buildProgressReporterContext(taskWithAuditContext);

    await reportProgress(progressCtx, 'task_received', 'Task received for approved execution.', sink);
    const baseDecision = buildDecision(taskWithAuditContext);

    // Kill-switch takes precedence over human approval
    if (options?.killSwitchCheckFn) {
        const ksResult = await options.killSwitchCheckFn({
            taskId: task.taskId,
            riskLevel: baseDecision.riskLevel,
            tenantId: typeof taskWithAuditContext.payload['tenantId'] === 'string' ? taskWithAuditContext.payload['tenantId'] : '',
            workspaceId: typeof taskWithAuditContext.payload['workspaceId'] === 'string' ? taskWithAuditContext.payload['workspaceId'] : '',
            botId: typeof taskWithAuditContext.payload['botId'] === 'string' ? taskWithAuditContext.payload['botId'] : '',
        });
        if (ksResult.blocked) {
            return { decision: baseDecision, status: 'failed', attempts: 0, transientRetries: 0, executionPayload: taskWithAuditContext.payload, payloadOverrideSource: 'none', failureClass: 'kill_switch_blocked', errorMessage: KILL_SWITCH_BLOCKED_MESSAGE(ksResult.killSwitchId) };
        }
    }

    // A1 — re-evaluate customer policy at approval-resume time. A DENY added
    // between the approval request and the grant must still block (deny always
    // wins, even over a human approval). require_approval/allow do NOT re-block
    // here — the human has already approved.
    let approvedPolicyDecision: PolicyDecision | undefined;
    if (options?.policyEvaluateFn) {
        const policyInput = buildPolicyEvaluationInput(taskWithAuditContext.payload, baseDecision.actionType);
        if (policyInput) {
            try {
                approvedPolicyDecision = await options.policyEvaluateFn(policyInput);
                if (approvedPolicyDecision.effect === 'deny') {
                    await reportProgress(progressCtx, 'failed', 'Approved task blocked by customer governance policy.', sink);
                    return {
                        decision: { ...baseDecision, route: 'approval', riskLevel: 'high', reason: `${baseDecision.reason} [policy: DENY — ${approvedPolicyDecision.reason}]` },
                        status: 'failed',
                        attempts: 0,
                        transientRetries: 0,
                        executionPayload: taskWithAuditContext.payload,
                        payloadOverrideSource: 'none',
                        failureClass: 'policy_violation',
                        errorMessage: `[POLICY_DENIED] ${approvedPolicyDecision.reason}${approvedPolicyDecision.matchedPolicyId ? ` | policy=${approvedPolicyDecision.matchedPolicyId}@v${approvedPolicyDecision.matchedPolicyVersion ?? '?'}` : ''}`,
                        policyDecision: approvedPolicyDecision,
                    };
                }
            } catch {
                // Fail-safe: an evaluator throw must not block an already-approved task.
                // The kill-switch (above) and execution-layer enforcers still apply.
            }
        }
    }

    const approvedDecision: ActionDecision = { ...baseDecision, route: 'execute', reason: 'Human approval granted via decision webhook.' };
    const llmExecution: LlmDecisionMetadata = {
        classificationSource: 'heuristic',
        modelProvider: options?.modelProvider ?? 'agentfarm',
        model: null,
        modelProfile: options?.modelProfile ?? null,
        promptTokens: null, completionTokens: null, totalTokens: null,
        fallbackReason: 'human_approved_path',
    };

    await reportProgress(progressCtx, 'coding_started', 'Executing approved task.', sink);
    const resolvedWorkerFn = options?.llmCodeGenFn ?? createCodeGenFn(process.env, 'cost_balanced');
    const resolvedPlannerFn = options?.llmPlannerFn ?? createCodeGenFn(process.env, 'quality_first');

    // Structured Checkpoints — inject prior progress if this task was requeued before
    let approvedPayload = taskWithAuditContext.payload;
    if (isCheckpointEnabled()) {
        const ckpt = await loadCheckpoint(task.taskId).catch(() => null);
        if (ckpt) approvedPayload = injectCheckpointIntoPayload(approvedPayload, ckpt);
    }
    const taskForApprovedExec = approvedPayload === taskWithAuditContext.payload
        ? taskWithAuditContext
        : { ...taskWithAuditContext, payload: approvedPayload };

    const approvedExecFn = () => executeTaskWithRetries(taskForApprovedExec, approvedDecision, 'none', llmExecution, { ...options, llmCodeGenFn: resolvedWorkerFn, llmPlannerFn: resolvedPlannerFn });
    const approvedSpec = resolveSpec(taskWithAuditContext.payload);
    let approvedResult = isMaxModeEnabledForPayload(taskWithAuditContext.payload) && !shouldSkipMaxMode(taskWithAuditContext.payload)
        ? await runMaxMode(approvedExecFn, (out) => judgeScore(approvedSpec, out), getMaxModeCandidates())
        : await approvedExecFn();

    await reportProgress(
        progressCtx,
        approvedResult.status === 'success' ? 'completed' : 'failed',
        approvedResult.status === 'success' ? 'Approved task execution completed.' : `Approved task execution failed: ${approvedResult.errorMessage ?? 'Unknown error'}`,
        sink,
    );

    const workspaceId = typeof taskWithAuditContext.payload['workspaceId'] === 'string'
        ? taskWithAuditContext.payload['workspaceId'] : task.taskId;

    // Quality gates — run only on success, never block on failure
    if (approvedResult.status === 'success') {
        const tenantId = typeof taskWithAuditContext.payload['tenantId'] === 'string'
            ? taskWithAuditContext.payload['tenantId'] : '';

        const gateResult = await checkCompletion(
            task.taskId,
            tenantId,
            typeof taskWithAuditContext.payload['_completion_gate_reentry'] === 'number'
                ? taskWithAuditContext.payload['_completion_gate_reentry'] as number : 0,
        ).catch(() => ({ pass: true as const }));

        if (!gateResult.pass) {
            approvedResult = {
                ...approvedResult,
                status: 'failed',
                errorMessage: gateResult.reentryText,
                failureClass: 'runtime_exception',
            };
            // Save checkpoint so next run resumes from this partial output
            if (isCheckpointEnabled()) {
                const reentryCount = typeof taskWithAuditContext.payload['_completion_gate_reentry'] === 'number'
                    ? taskWithAuditContext.payload['_completion_gate_reentry'] as number : 0;
                saveCheckpoint({
                    taskId: task.taskId,
                    stepIndex: reentryCount + 1,
                    partialOutput: approvedResult.actionOutput ?? '',
                    actionType: typeof taskWithAuditContext.payload['actionType'] === 'string' ? taskWithAuditContext.payload['actionType'] as string : '',
                    savedAt: new Date().toISOString(),
                }).catch(() => {});
            }
        }

        if (approvedResult.status === 'success') {
            const agentOutput = approvedResult.actionOutput ?? '';
            const judgeResult = await evaluateGoal(
                taskWithAuditContext.payload,
                agentOutput,
                typeof taskWithAuditContext.payload['_goal_judge_requeue'] === 'number'
                    ? taskWithAuditContext.payload['_goal_judge_requeue'] as number : 0,
            ).catch(() => ({ action: 'accept' as const }));

            if (judgeResult.action === 'abandon') {
                approvedResult = {
                    ...approvedResult,
                    status: 'failed',
                    errorMessage: `[GOAL_JUDGE_IMPOSSIBLE] ${judgeResult.reason}`,
                    failureClass: 'runtime_exception',
                };
                if (isCheckpointEnabled()) clearCheckpoint(task.taskId).catch(() => {});
            } else if (judgeResult.action === 'requeue') {
                if (isCheckpointEnabled()) {
                    saveCheckpoint({
                        taskId: task.taskId,
                        stepIndex: judgeResult.requeueCount,
                        partialOutput: agentOutput,
                        actionType: typeof taskWithAuditContext.payload['actionType'] === 'string' ? taskWithAuditContext.payload['actionType'] as string : '',
                        savedAt: new Date().toISOString(),
                    }).catch(() => {});
                }
            } else if (judgeResult.action === 'accept') {
                if (isCheckpointEnabled()) clearCheckpoint(task.taskId).catch(() => {});
                const tenantId = typeof taskWithAuditContext.payload['tenantId'] === 'string'
                    ? taskWithAuditContext.payload['tenantId'] : '';
                distillLesson({
                    payload: taskWithAuditContext.payload,
                    agentOutput,
                    workspaceId,
                    tenantId,
                    taskId: task.taskId,
                }).catch(() => {});
            }
        }
    }

    recordEpisode({ task: taskWithAuditContext, result: approvedResult, decision: approvedDecision, workspaceId })
        .catch(() => { /* best-effort — never fail the task */ });

    return approvedResult;
}

export async function processDeveloperTask(
    ...args: Parameters<typeof processDeveloperTaskInner>
): Promise<ProcessedTaskResult> {
    return runWithLlmTraceContext(buildTaskTraceContext(args[0]), () => processDeveloperTaskInner(...args));
}

async function processDeveloperTaskInner(
    task: TaskEnvelope,
    options?: {
        maxAttempts?: number;
        modelProvider?: string;
        modelProfile?: string;
        llmDecisionResolver?: LlmDecisionResolver;
        progressSink?: ProgressSink;
        roleClassifierFn?: TaskClassifierFn;
        killSwitchCheckFn?: KillSwitchCheckFn;
        policyEvaluateFn?: PolicyEvaluateFn;
    },
): Promise<ProcessedTaskResult> {
    const taskWithAuditContext: TaskEnvelope = { ...task, payload: enrichPayloadWithAuditContext(task.payload, task.taskId) };
    const sink: ProgressSink = options?.progressSink ?? new NoopProgressSink();
    const progressCtx = buildProgressReporterContext(taskWithAuditContext);

    await reportProgress(progressCtx, 'task_received', 'Task received for developer execution.', sink);

    // Phase 0: Role enforcement — reject out-of-role requests before spending LLM quota
    const enforcement = await enforceRole(taskWithAuditContext, 'developer', { classifierFn: options?.roleClassifierFn });
    if (!enforcement.allowed) {
        const decision = buildDecision(taskWithAuditContext);
        return { decision, status: 'failed', attempts: 0, transientRetries: 0, executionPayload: taskWithAuditContext.payload, payloadOverrideSource: 'none', failureClass: 'role_enforcement', errorMessage: `[ROLE_ENFORCEMENT] ${enforcement.reason} | suggestedRole=${enforcement.suggestedRole ?? 'none'} | declineCode=${enforcement.declineCode}` };
    }

    // Phase 0B: Kill-switch enforcement — checked before LLM to prevent quota spend on blocked tasks
    if (options?.killSwitchCheckFn) {
        const heuristic = buildDecision(taskWithAuditContext);
        const ksResult = await options.killSwitchCheckFn({
            taskId: task.taskId,
            riskLevel: heuristic.riskLevel,
            tenantId: typeof taskWithAuditContext.payload['tenantId'] === 'string' ? taskWithAuditContext.payload['tenantId'] : '',
            workspaceId: typeof taskWithAuditContext.payload['workspaceId'] === 'string' ? taskWithAuditContext.payload['workspaceId'] : '',
            botId: typeof taskWithAuditContext.payload['botId'] === 'string' ? taskWithAuditContext.payload['botId'] : '',
        });
        if (ksResult.blocked) {
            return { decision: heuristic, status: 'failed', attempts: 0, transientRetries: 0, executionPayload: taskWithAuditContext.payload, payloadOverrideSource: 'none', failureClass: 'kill_switch_blocked', errorMessage: KILL_SWITCH_BLOCKED_MESSAGE(ksResult.killSwitchId) };
        }
    }

    const heuristicDecision = buildDecision(taskWithAuditContext);
    const fallbackProvider = options?.modelProvider ?? 'agentfarm';
    let decision = heuristicDecision;
    let executionPayload = taskWithAuditContext.payload;
    let payloadOverrideSource: PayloadOverrideSource = 'none';
    let llmExecution: LlmDecisionMetadata = {
        classificationSource: 'heuristic',
        modelProvider: fallbackProvider,
        model: null,
        modelProfile: options?.modelProfile ?? null,
        promptTokens: null, completionTokens: null, totalTokens: null,
        fallbackReason: 'llm_provider_unconfigured',
    };

    // Phase 2: Scout codebase before LLM context window
    const scoutContext = await preTaskScout(taskWithAuditContext, executeLocalWorkspaceAction as Parameters<typeof preTaskScout>[1]).catch(() => '');

    // Episodic memory context injection
    const workspaceIdForMemory = typeof taskWithAuditContext.payload['workspaceId'] === 'string' ? taskWithAuditContext.payload['workspaceId'] : '';
    const recentMemories = workspaceIdForMemory
        ? await globalEpisodicMemory.readRecentForWorkspace(workspaceIdForMemory).catch(() => [])
        : [];
    const rawEpisodicContext = globalEpisodicMemory.buildCompactContextBlock(recentMemories);
    // Fix 3: compress episodic context with Haiku (speed_first) when >2 000 chars.
    // Cached in Redis for 15 min — cost ~$0.0003/compression vs. paying for 12 000
    // chars of raw history on every classification prompt.
    const episodicContext = rawEpisodicContext.length > 2_000 && workspaceIdForMemory
        ? await getCompressedEpisodicContext(workspaceIdForMemory, rawEpisodicContext).catch(() => rawEpisodicContext)
        : rawEpisodicContext;

    // Per-person episodic recall
    const personForTask = extractPersonKeyFromPayload(taskWithAuditContext.payload);
    const recentPersonMemories = personForTask
        ? await globalEpisodicMemory.readRecentForPerson(personForTask.personKey).catch(() => [])
        : [];
    const personEpisodicContext = personForTask
        ? globalEpisodicMemory.buildContextBlock(recentPersonMemories, { label: personForTask.personLabel })
        : '';

    const taskForLlm: TaskEnvelope = {
        ...taskWithAuditContext,
        payload: {
            ...taskWithAuditContext.payload,
            ...(scoutContext ? { _scout_context: scoutContext } : {}),
            ...(episodicContext ? { _episodic_context: episodicContext } : {}),
            ...(personEpisodicContext ? { _episodic_person_context: personEpisodicContext } : {}),
        },
    };

    // Phase 5: Pre-escalation check for ambiguous tasks
    const preEscalation = evaluateEscalation(taskWithAuditContext, 0);
    if (preEscalation.shouldEscalate && preEscalation.reason === 'ambiguous_task') {
        return { decision: heuristicDecision, status: 'failed', attempts: 0, transientRetries: 0, executionPayload: taskWithAuditContext.payload, payloadOverrideSource: 'none', llmExecution, failureClass: 'runtime_exception', errorMessage: preEscalation.message };
    }

    // Phase 6: LLM decision (optional — falls back to heuristic when not configured)
    if (options?.llmDecisionResolver) {
        // Fix 1: Confidence skip — pure read/query actions with high heuristic confidence
        // do not benefit from LLM classification; skip the call to save cost.
        const canSkipLlm =
            heuristicDecision.confidence >= HEURISTIC_CONFIDENCE_SKIP_THRESHOLD &&
            heuristicDecision.riskLevel === 'low' &&
            HEURISTIC_SUFFICIENT_ACTIONS.has(heuristicDecision.actionType);

        if (canSkipLlm) {
            llmExecution = { ...llmExecution, fallbackReason: 'heuristic_confidence_skip' };
        } else {
            // Fix 2: Redis classification cache — avoid re-classifying identical tasks
            const cacheKey = buildClassificationCacheKey(taskForLlm);
            const redis = getRedisClient();
            let cacheHit: CachedClassificationEntry | null = null;
            if (redis) {
                try {
                    const raw = await redis.get(cacheKey);
                    if (raw) cacheHit = JSON.parse(raw) as CachedClassificationEntry;
                } catch { /* best-effort */ }
            }

            if (cacheHit) {
                // Defense in depth: a cached low-risk entry must never bypass the
                // high-impact safety net (guards against a poisoned cache entry).
                const guarded = applyHighImpactSafetyNet(cacheHit.decision, taskWithAuditContext.payload);
                decision = guarded.decision;
                executionPayload = cacheHit.payloadOverrides
                    ? { ...taskWithAuditContext.payload, ...cacheHit.payloadOverrides }
                    : { ...taskWithAuditContext.payload };
                payloadOverrideSource = cacheHit.payloadOverrides ? 'llm_generated' : 'none';
                executionPayload['actionType'] = cacheHit.decision.actionType;
                if (!executionPayload['prompt']) {
                    executionPayload['prompt'] =
                        executionPayload['description'] ?? executionPayload['summary'] ?? executionPayload['intent'] ??
                        taskWithAuditContext.payload['description'] ?? taskWithAuditContext.payload['summary'] ?? taskWithAuditContext.payload['intent'] ?? '';
                }
                llmExecution = { classificationSource: 'llm', ...cacheHit.metadata, fallbackReason: 'classification_cache_hit' };
            } else {
                try {
                    const llmResult = await options.llmDecisionResolver({ task: taskForLlm, heuristicDecision });
                    if (llmResult) {
                        decision = llmResult.decision;
                        executionPayload = llmResult.payloadOverrides
                            ? { ...taskWithAuditContext.payload, ...llmResult.payloadOverrides }
                            : { ...taskWithAuditContext.payload };
                        payloadOverrideSource = llmResult.payloadOverrides ? 'llm_generated' : 'none';

                        // Wire the LLM's classified actionType into the execution payload
                        executionPayload['actionType'] = llmResult.decision.actionType;

                        // Map description/summary/intent → prompt for workspace_subagent_spawn
                        if (!executionPayload['prompt']) {
                            executionPayload['prompt'] =
                                executionPayload['description'] ?? executionPayload['summary'] ?? executionPayload['intent'] ??
                                taskWithAuditContext.payload['description'] ?? taskWithAuditContext.payload['summary'] ?? taskWithAuditContext.payload['intent'] ?? '';
                        }

                        llmExecution = { classificationSource: 'llm', ...llmResult.metadata };

                        // Post-LLM safety net: small models sometimes classify destructive
                        // actions as low risk. If the action or prompt contains high-impact
                        // keywords, bump low → medium so it routes to the approval queue.
                        const guarded = applyHighImpactSafetyNet(decision, taskWithAuditContext.payload);
                        decision = guarded.decision;
                        if (guarded.bumped) {
                            llmExecution = { ...llmExecution, fallbackReason: 'safety_net_risk_bump' };
                        }

                        // Cache low-risk results only — medium/high go to approval and must
                        // not be cached. Gate on the FINAL decision (post-safety-net), not the
                        // raw LLM output: a task bumped to approval must never poison the cache
                        // with a low/execute entry that future identical prompts would reuse.
                        if (redis && decision.riskLevel === 'low' && decision.route === 'execute') {
                            const entry: CachedClassificationEntry = {
                                decision,
                                payloadOverrides: llmResult.payloadOverrides,
                                metadata: llmResult.metadata,
                            };
                            redis.set(cacheKey, JSON.stringify(entry), 'EX', CLASSIFICATION_CACHE_TTL_S).catch(() => {});
                        }
                    }
                } catch {
                    llmExecution = { ...llmExecution, fallbackReason: 'llm_resolution_failed' };
                }
            }
        }
    }

    // Phase 7: Customer governance policy (OPA). Evaluated after the action is
    // classified; the injected evaluator is fail-closed and may only TIGHTEN the
    // heuristic/LLM floor (deny → block, require_approval → approval, allow → no-op).
    let policyDecision: PolicyDecision | undefined;
    if (options?.policyEvaluateFn) {
        const policyInput = buildPolicyEvaluationInput(executionPayload, decision.actionType);
        if (policyInput) {
            try {
                policyDecision = await options.policyEvaluateFn(policyInput);
                const merged = applyPolicyDecision(decision, policyDecision);
                decision = merged.decision;
                if (merged.denied) {
                    await reportProgress(progressCtx, 'failed', 'Task blocked by customer governance policy.', sink);
                    return {
                        decision,
                        status: 'failed',
                        attempts: 0,
                        transientRetries: 0,
                        executionPayload,
                        payloadOverrideSource,
                        llmExecution,
                        failureClass: 'policy_violation',
                        errorMessage: `[POLICY_DENIED] ${policyDecision.reason}${policyDecision.matchedPolicyId ? ` | policy=${policyDecision.matchedPolicyId}@v${policyDecision.matchedPolicyVersion ?? '?'}` : ''}`,
                        policyDecision,
                    };
                }
            } catch {
                // Fail-safe: an unexpected evaluator throw must never crash or downgrade.
                // The injected evaluator is itself fail-closed; keep the existing decision.
                llmExecution = { ...llmExecution, fallbackReason: 'policy_eval_failed' };
            }
        }
    }

    // F1 — agent persona's approvalPolicy threshold (attached to the task payload
    // as _persona by runtime-server before dispatch). Tighten-only, same as the
    // OPA merge above.
    const personaForApproval = taskWithAuditContext.payload['_persona'] as { approvalPolicy?: string } | undefined;
    if (personaForApproval?.approvalPolicy) {
        decision = applyApprovalPolicyThreshold(decision, personaForApproval.approvalPolicy);
    }

    if (decision.route === 'approval') {
        await reportProgress(progressCtx, 'waiting_for_approval', 'Task requires human approval before execution.', sink);
        return { decision, status: 'approval_required', attempts: 0, transientRetries: 0, executionPayload, payloadOverrideSource, llmExecution, policyDecision };
    }

    await reportProgress(progressCtx, 'coding_started', 'Executing low-risk developer task.', sink);
    // Planner (initial plan generation) uses quality_first; worker (fix attempts) uses cost_balanced.
    const plannerFn: LlmCodeGenFn | undefined = createCodeGenFn(process.env, 'quality_first');
    const workerFn: LlmCodeGenFn | undefined = createCodeGenFn(process.env, 'cost_balanced');

    // Structured Checkpoints — inject prior progress if this task was requeued before
    let devPayload = executionPayload;
    if (isCheckpointEnabled()) {
        const ckpt = await loadCheckpoint(task.taskId).catch(() => null);
        if (ckpt) devPayload = injectCheckpointIntoPayload(devPayload, ckpt);
    }

    const devExecFn = () => executeTaskWithRetries(
        { ...taskWithAuditContext, payload: devPayload },
        decision, payloadOverrideSource, llmExecution,
        { ...options, llmCodeGenFn: workerFn, llmPlannerFn: plannerFn },
    );
    const devSpec = resolveSpec(taskWithAuditContext.payload);
    const execResult = isMaxModeEnabledForPayload(taskWithAuditContext.payload) && !shouldSkipMaxMode(taskWithAuditContext.payload)
        ? await runMaxMode(devExecFn, (out) => judgeScore(devSpec, out), getMaxModeCandidates())
        : await devExecFn();

    await reportProgress(
        progressCtx,
        execResult.status === 'success' ? 'completed' : 'failed',
        execResult.status === 'success' ? 'Developer task execution completed.' : `Developer task execution failed: ${execResult.errorMessage ?? 'Unknown error'}`,
        sink,
    );

    // Quality gates — run only on success, never block on failure
    let finalResult = execResult;
    if (finalResult.status === 'success') {
        const tenantId = typeof taskWithAuditContext.payload['tenantId'] === 'string'
            ? taskWithAuditContext.payload['tenantId'] : '';

        const gateResult = await checkCompletion(
            task.taskId,
            tenantId,
            typeof taskWithAuditContext.payload['_completion_gate_reentry'] === 'number'
                ? taskWithAuditContext.payload['_completion_gate_reentry'] as number : 0,
        ).catch(() => ({ pass: true as const }));

        if (!gateResult.pass) {
            finalResult = {
                ...finalResult,
                status: 'failed',
                errorMessage: gateResult.reentryText,
                failureClass: 'runtime_exception',
            };
            if (isCheckpointEnabled()) {
                const reentryCount = typeof taskWithAuditContext.payload['_completion_gate_reentry'] === 'number'
                    ? taskWithAuditContext.payload['_completion_gate_reentry'] as number : 0;
                saveCheckpoint({
                    taskId: task.taskId,
                    stepIndex: reentryCount + 1,
                    partialOutput: finalResult.actionOutput ?? '',
                    actionType: typeof taskWithAuditContext.payload['actionType'] === 'string' ? taskWithAuditContext.payload['actionType'] as string : '',
                    savedAt: new Date().toISOString(),
                }).catch(() => {});
            }
        }

        if (finalResult.status === 'success') {
            const agentOutput = finalResult.actionOutput ?? '';
            const judgeResult = await evaluateGoal(
                taskWithAuditContext.payload,
                agentOutput,
                typeof taskWithAuditContext.payload['_goal_judge_requeue'] === 'number'
                    ? taskWithAuditContext.payload['_goal_judge_requeue'] as number : 0,
            ).catch(() => ({ action: 'accept' as const }));

            if (judgeResult.action === 'abandon') {
                finalResult = {
                    ...finalResult,
                    status: 'failed',
                    errorMessage: `[GOAL_JUDGE_IMPOSSIBLE] ${judgeResult.reason}`,
                    failureClass: 'runtime_exception',
                };
                if (isCheckpointEnabled()) clearCheckpoint(task.taskId).catch(() => {});
            } else if (judgeResult.action === 'requeue') {
                if (isCheckpointEnabled()) {
                    saveCheckpoint({
                        taskId: task.taskId,
                        stepIndex: judgeResult.requeueCount,
                        partialOutput: agentOutput,
                        actionType: typeof taskWithAuditContext.payload['actionType'] === 'string' ? taskWithAuditContext.payload['actionType'] as string : '',
                        savedAt: new Date().toISOString(),
                    }).catch(() => {});
                }
            } else if (judgeResult.action === 'accept') {
                if (isCheckpointEnabled()) clearCheckpoint(task.taskId).catch(() => {});
                const tenantId = typeof taskWithAuditContext.payload['tenantId'] === 'string'
                    ? taskWithAuditContext.payload['tenantId'] : '';
                distillLesson({
                    payload: taskWithAuditContext.payload,
                    agentOutput,
                    workspaceId: workspaceIdForMemory,
                    tenantId,
                    taskId: task.taskId,
                }).catch(() => {});
            }
        }
    }

    if (workspaceIdForMemory) {
        recordEpisode({ task: taskWithAuditContext, result: finalResult, decision, workspaceId: workspaceIdForMemory })
            .catch(() => { /* best-effort */ });
    }

    return policyDecision ? { ...finalResult, policyDecision } : finalResult;
}

/**
 * processDeveloperTask with optional memory store injection.
 * Reads recent task memories before LLM decision and merges them into the payload.
 */
export async function processDeveloperTaskWithMemory(
    task: TaskEnvelope,
    memoryStore?: { readMemoryForTask: (workspaceId: string) => Promise<unknown> },
    options?: {
        maxAttempts?: number;
        modelProvider?: string;
        modelProfile?: string;
        llmDecisionResolver?: LlmDecisionResolver;
        progressSink?: ProgressSink;
        killSwitchCheckFn?: KillSwitchCheckFn;
        policyEvaluateFn?: PolicyEvaluateFn;
    },
): Promise<ProcessedTaskResult> {
    let memoryContext: unknown = null;
    const workspaceId = task.payload['workspaceId'];

    if (memoryStore && typeof workspaceId === 'string') {
        try {
            memoryContext = await memoryStore.readMemoryForTask(workspaceId);
        } catch { /* silent — don't block execution */ }
    }

    const mc = memoryContext as Record<string, unknown> | null;
    const taskWithMemory: TaskEnvelope = {
        ...task,
        payload: {
            ...task.payload,
            ...(mc && {
                _memory_context: {
                    recentMemories: mc['recentMemories'],
                    approvalRejectionRate: mc['approvalRejectionRate'],
                    commonConnectors: mc['mostCommonConnectors'],
                    codeReviewPatterns: Array.isArray(mc['codeReviewPatterns']) ? mc['codeReviewPatterns'] : [],
                    codeReviewPrompt: Array.isArray(mc['codeReviewPatterns']) ? (mc['codeReviewPatterns'] as string[]).join('\n') : '',
                },
            }),
        },
    };

    return processDeveloperTask(taskWithMemory, options);
}
