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

import type { ProviderFailoverTraceRecord } from '@agentfarm/shared-types';
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
} from './domain/risk-policy.js';
import { createCodeGenFn } from './infrastructure/llm-provider-factory.js';
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
    failureClass?: 'transient_error' | 'runtime_exception' | 'role_enforcement' | 'kill_switch_blocked';
    errorMessage?: string;
    llmExecution?: LlmDecisionMetadata;
    /**
     * Raw JSON output from the workspace action, forwarded so episodic memory
     * can capture files_changed, code_diff, and test_failure_summary.
     */
    actionOutput?: string;
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
    opts?: { llmCodeGenFn?: LlmCodeGenFn },
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
    options?: { maxAttempts?: number; llmCodeGenFn?: LlmCodeGenFn },
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
                { llmCodeGenFn: options?.llmCodeGenFn },
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
    task: TaskEnvelope,
    options?: {
        maxAttempts?: number;
        modelProvider?: string;
        modelProfile?: string;
        progressSink?: ProgressSink;
        killSwitchCheckFn?: KillSwitchCheckFn;
        llmCodeGenFn?: LlmCodeGenFn;
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
    const resolvedCodeGenFn = options?.llmCodeGenFn ?? createCodeGenFn();
    const result = await executeTaskWithRetries(taskWithAuditContext, approvedDecision, 'none', llmExecution, { ...options, llmCodeGenFn: resolvedCodeGenFn });

    await reportProgress(
        progressCtx,
        result.status === 'success' ? 'completed' : 'failed',
        result.status === 'success' ? 'Approved task execution completed.' : `Approved task execution failed: ${result.errorMessage ?? 'Unknown error'}`,
        sink,
    );

    const workspaceId = typeof taskWithAuditContext.payload['workspaceId'] === 'string'
        ? taskWithAuditContext.payload['workspaceId'] : task.taskId;
    recordEpisode({ task: taskWithAuditContext, result, decision: approvedDecision, workspaceId })
        .catch(() => { /* best-effort — never fail the task */ });

    return result;
}

export async function processDeveloperTask(
    task: TaskEnvelope,
    options?: {
        maxAttempts?: number;
        modelProvider?: string;
        modelProfile?: string;
        llmDecisionResolver?: LlmDecisionResolver;
        progressSink?: ProgressSink;
        roleClassifierFn?: TaskClassifierFn;
        killSwitchCheckFn?: KillSwitchCheckFn;
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
    const episodicContext = globalEpisodicMemory.buildCompactContextBlock(recentMemories);

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
            }
        } catch {
            llmExecution = { ...llmExecution, fallbackReason: 'llm_resolution_failed' };
        }
    }

    if (decision.route === 'approval') {
        await reportProgress(progressCtx, 'waiting_for_approval', 'Task requires human approval before execution.', sink);
        return { decision, status: 'approval_required', attempts: 0, transientRetries: 0, executionPayload, payloadOverrideSource, llmExecution };
    }

    await reportProgress(progressCtx, 'coding_started', 'Executing low-risk developer task.', sink);
    const codeGenFn: LlmCodeGenFn | undefined = createCodeGenFn();
    const execResult = await executeTaskWithRetries(
        { ...taskWithAuditContext, payload: executionPayload },
        decision, payloadOverrideSource, llmExecution,
        { ...options, llmCodeGenFn: codeGenFn },
    );

    await reportProgress(
        progressCtx,
        execResult.status === 'success' ? 'completed' : 'failed',
        execResult.status === 'success' ? 'Developer task execution completed.' : `Developer task execution failed: ${execResult.errorMessage ?? 'Unknown error'}`,
        sink,
    );

    if (workspaceIdForMemory) {
        recordEpisode({ task: taskWithAuditContext, result: execResult, decision, workspaceId: workspaceIdForMemory })
            .catch(() => { /* best-effort */ });
    }

    return execResult;
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
