import type { ProviderFailoverTraceRecord } from '@agentfarm/shared-types';
import { type ProgressSink, NoopProgressSink, reportProgress } from './task-progress-reporter.js';
import { buildErrorQuery, researchForTask, type FetchFn } from './web-research-service.js';

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
    failureClass?: 'transient_error' | 'runtime_exception';
    errorMessage?: string;
    llmExecution?: LlmDecisionMetadata;
};

const HIGH_RISK_ACTIONS = new Set([
    'merge_release',
    'merge_pr',
    'delete_resource',
    'change_permissions',
    'deploy_production',
    // Local workspace: pushing code to a remote branch is high-risk
    'git_push',
    // Local workspace: arbitrary shell commands require explicit approval
    'run_shell_command',
    // Tier 5: REPL can execute arbitrary code
    'workspace_repl_start',
    'workspace_repl_execute',
    // Tier 7: Dry-run with approval chain (prepares for external approval)
    'workspace_dry_run_with_approval_chain',
    // Tier 11: Local desktop and browser control
    'workspace_browser_open',
    'workspace_app_launch',
    'workspace_meeting_join',
    'workspace_meeting_speak',
    'workspace_meeting_interview_live',
    // Tier 12: Sub-agent delegation and GitHub issue auto-fix
    'workspace_subagent_spawn',
    'workspace_github_issue_fix',
]);

const MEDIUM_RISK_ACTIONS = new Set([
    'update_status',
    'create_comment',
    'create_pr_comment',
    'create_pr',
    'send_message',
    // Local workspace: executing code or committing changes is medium-risk
    'code_edit',
    'code_edit_patch',
    'code_search_replace',
    'run_build',
    'run_tests',
    'git_commit',
    'autonomous_loop',
    // Generating PR content is medium-risk (no remote side-effects)
    'create_pr_from_workspace',
    // Persisting memory notes is medium-risk (mutates workspace state)
    'workspace_memory_write',
    // Tier 2 features — mutate workspace state
    'git_stash',
    'apply_patch',
    'file_move',
    'file_delete',
    'run_linter',
    'workspace_install_deps',
    'workspace_checkpoint',
    // Tier 3: IDE refactoring operations (modify code)
    'workspace_rename_symbol',
    'workspace_extract_function',
    'workspace_analyze_imports',
    'workspace_security_scan',
    // Tier 4: Multi-file coordination (modify multiple files)
    'workspace_bulk_refactor',
    'workspace_atomic_edit_set',
    'workspace_generate_from_template',
    'workspace_migration_helper',
    // Tier 5: Code review and profiling (might affect code state)
    'workspace_debug_breakpoint',
    'workspace_profiler_run',
    // Tier 7: Governance operations (modify state)
    'workspace_rollback_to_checkpoint',
    // Tier 8: Code generation and formatting (modify files)
    'workspace_generate_test',
    'workspace_format_code',
    'workspace_version_bump',
    'workspace_changelog_generate',
    // Tier 9: Pilot roadmap productivity actions
    'workspace_create_pr',
    'workspace_run_ci_checks',
    'workspace_fix_test_failures',
    'workspace_release_notes_generate',
    'workspace_incident_patch_pack',
    'workspace_memory_profile',
    'workspace_autonomous_plan_execute',
    // Tier 10: Connector hardening, code intelligence, observability (mutating subset)
    'workspace_pr_auto_assign',
    'workspace_ci_watch',
    'workspace_add_docstring',
    'workspace_diff_preview',
    'workspace_audit_export',
    // Tier 12: GitHub intelligence (read, but sends external request) and Slack notify
    'workspace_github_pr_status',
    'workspace_github_issue_triage',
    'workspace_slack_notify',
]);
function clamp01(value: number): number {
    if (value < 0) {
        return 0;
    }
    if (value > 1) {
        return 1;
    }
    return Number(value.toFixed(2));
}

export function normalizeActionType(payload: Record<string, unknown>): string {
    const fromActionType = payload['action_type'];
    if (typeof fromActionType === 'string' && fromActionType.trim()) {
        return fromActionType.trim().toLowerCase();
    }

    const fromIntent = payload['intent'];
    if (typeof fromIntent === 'string' && fromIntent.trim()) {
        return fromIntent.trim().toLowerCase().replace(/\s+/g, '_');
    }

    return 'read_task';
}

export function scoreConfidence(payload: Record<string, unknown>): number {
    let score = 0.92;

    const summary = payload['summary'];
    if (typeof summary !== 'string' || summary.trim().length < 8) {
        score -= 0.18;
    }

    const target = payload['target'];
    if (typeof target !== 'string' || !target.trim()) {
        score -= 0.1;
    }

    const complexity = payload['complexity'];
    if (complexity === 'high') {
        score -= 0.16;
    } else if (complexity === 'medium') {
        score -= 0.08;
    }

    const ambiguous = payload['ambiguous'];
    if (ambiguous) {
        score -= 0.2;
    }

    return clamp01(score);
}

export function classifyRisk(
    actionType: string,
    confidence: number,
    payload: Record<string, unknown>,
): { riskLevel: RiskLevel; reason: string } {
    if (HIGH_RISK_ACTIONS.has(actionType)) {
        return { riskLevel: 'high', reason: `Action '${actionType}' is high-risk by policy.` };
    }

    if (MEDIUM_RISK_ACTIONS.has(actionType)) {
        return { riskLevel: 'medium', reason: `Action '${actionType}' is medium-risk by policy.` };
    }

    if (payload['risk_hint'] === 'high') {
        return { riskLevel: 'high', reason: 'Task payload includes risk_hint=high.' };
    }

    if (payload['risk_hint'] === 'medium') {
        return { riskLevel: 'medium', reason: 'Task payload includes risk_hint=medium.' };
    }

    if (payload['risk_hint'] === 'low') {
        return { riskLevel: 'low', reason: 'Task payload explicitly overrides risk to low.' };
    }

    if (confidence < 0.6) {
        return { riskLevel: 'medium', reason: 'Low confidence requires human review.' };
    }

    return { riskLevel: 'low', reason: 'Read/update safe action with sufficient confidence.' };
}

export function buildDecision(task: TaskEnvelope): ActionDecision {
    const actionType = normalizeActionType(task.payload);
    const confidence = scoreConfidence(task.payload);
    const classification = classifyRisk(actionType, confidence, task.payload);
    const route = classification.riskLevel === 'low' ? 'execute' : 'approval';

    return {
        actionType,
        confidence,
        riskLevel: classification.riskLevel,
        route,
        reason: classification.reason,
    };
}

function shouldFailTransiently(payload: Record<string, unknown>, attempt: number): boolean {
    const configured = payload['simulate_transient_failures'];
    const transientFailures = typeof configured === 'number' ? configured : 0;
    return attempt <= transientFailures;
}

function buildProgressReporterContext(task: TaskEnvelope): {
    tenantId: string;
    workspaceId: string;
    taskId: string;
    botId: string;
    correlationId: string;
} {
    const tenantId = typeof task.payload['tenantId'] === 'string' ? task.payload['tenantId'] : 'unknown_tenant';
    const workspaceId = typeof task.payload['workspaceId'] === 'string' ? task.payload['workspaceId'] : 'unknown_workspace';
    const botId = typeof task.payload['botId'] === 'string' ? task.payload['botId'] : 'agent-runtime';
    const correlationId =
        typeof task.lease?.correlationId === 'string'
            ? task.lease.correlationId
            : `task-${task.taskId}`;

    return {
        tenantId,
        workspaceId,
        taskId: task.taskId,
        botId,
        correlationId,
    };
}

async function executeLowRiskAction(task: TaskEnvelope, attempt: number): Promise<void> {
    if (shouldFailTransiently(task.payload, attempt)) {
        throw new Error('TRANSIENT_EXECUTOR_ERROR');
    }

    if (task.payload['force_failure'] === true) {
        throw new Error('NON_RETRYABLE_EXECUTOR_ERROR');
    }
}

async function executeTaskWithRetries(
    task: TaskEnvelope,
    decision: ActionDecision,
    payloadOverrideSource: PayloadOverrideSource,
    llmExecution?: LlmDecisionMetadata,
    options?: { maxAttempts?: number },
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
            await executeLowRiskAction({ ...task, payload: currentPayload }, attempts);
            return {
                decision,
                status: 'success',
                attempts,
                transientRetries,
                executionPayload: currentPayload,
                payloadOverrideSource,
                llmExecution,
            };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            const isTransient = message.includes('TRANSIENT');

            if (isTransient && attempts < maxAttempts) {
                transientRetries += 1;
                continue;
            }

            const enrichedPayload: Record<string, unknown> = { ...currentPayload };
            const shouldAutoResearchRetry =
                currentPayload['disable_auto_research_retry'] !== true
                && !researchRetryTriggered
                && attempts >= 2;

            if (shouldAutoResearchRetry) {
                researchRetryTriggered = true;
                allowedAttempts += 1;
            }

            if (shouldAutoResearchRetry || currentPayload['enable_web_research'] === true) {
                try {
                    const tenantId = typeof currentPayload['tenantId'] === 'string'
                        ? currentPayload['tenantId']
                        : 'unknown_tenant';
                    const workspaceId = typeof currentPayload['workspaceId'] === 'string'
                        ? currentPayload['workspaceId']
                        : 'unknown_workspace';
                    const fetchFn: FetchFn = async (url: string) => {
                        const response = await fetch(url, { signal: AbortSignal.timeout(75) });
                        return {
                            ok: response.ok,
                            status: response.status,
                            text: async () => response.text(),
                        };
                    };
                    const query = buildErrorQuery(message);
                    const research = await researchForTask(
                        query,
                        {
                            tenantId,
                            workspaceId,
                            taskId: task.taskId,
                            correlationId:
                                typeof task.lease?.correlationId === 'string'
                                    ? task.lease.correlationId
                                    : `task-${task.taskId}`,
                        },
                        fetchFn,
                    );

                    if (research.sources.length > 0 || research.synthesizedAnswer) {
                        enrichedPayload['_research_query'] = message;
                        enrichedPayload['_research_summary'] = research.synthesizedAnswer;
                        enrichedPayload['_research_sources'] = research.sources.map((entry) => ({
                            url: entry.url,
                            source: entry.source,
                            relevance: entry.relevance,
                        }));
                    }
                } catch {
                    // Best-effort enrichment only.
                }
            }

            if (shouldAutoResearchRetry) {
                enrichedPayload['_research_retry_attempted'] = true;
                currentPayload = enrichedPayload;
                continue;
            }

            return {
                decision,
                status: 'failed',
                attempts,
                transientRetries,
                executionPayload: enrichedPayload,
                payloadOverrideSource,
                failureClass: isTransient ? 'transient_error' : 'runtime_exception',
                errorMessage: message,
                llmExecution,
            };
        }
    }

    return {
        decision,
        status: 'failed',
        attempts,
        transientRetries,
        executionPayload: currentPayload,
        payloadOverrideSource,
        failureClass: 'runtime_exception',
        errorMessage: 'Failed after exhausting retry attempts.',
        llmExecution,
    };
}

export async function processApprovedTask(
    task: TaskEnvelope,
    options?: { maxAttempts?: number; modelProvider?: string; modelProfile?: string; progressSink?: ProgressSink },
): Promise<ProcessedTaskResult> {
    const sink: ProgressSink = options?.progressSink ?? new NoopProgressSink();
    const progressCtx = buildProgressReporterContext(task);
    await reportProgress(progressCtx, 'task_received', 'Task received for approved execution.', sink);
    const baseDecision = buildDecision(task);
    const approvedDecision: ActionDecision = {
        ...baseDecision,
        route: 'execute',
        reason: 'Human approval granted via decision webhook.',
    };

    const llmExecution: LlmDecisionMetadata = {
        classificationSource: 'heuristic',
        modelProvider: options?.modelProvider ?? 'agentfarm',
        model: null,
        modelProfile: options?.modelProfile ?? null,
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
        fallbackReason: 'human_approved_path',
    };

    await reportProgress(progressCtx, 'coding_started', 'Executing approved task.', sink);
    const result = await executeTaskWithRetries(task, approvedDecision, 'none', llmExecution, options);
    await reportProgress(
        progressCtx,
        result.status === 'success' ? 'completed' : 'failed',
        result.status === 'success' ? 'Approved task execution completed.' : `Approved task execution failed: ${result.errorMessage ?? 'Unknown error'}`,
        sink,
    );
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
    },
): Promise<ProcessedTaskResult> {
    const sink: ProgressSink = options?.progressSink ?? new NoopProgressSink();
    const progressCtx = buildProgressReporterContext(task);
    await reportProgress(progressCtx, 'task_received', 'Task received for developer execution.', sink);
    const heuristicDecision = buildDecision(task);
    const fallbackProvider = options?.modelProvider ?? 'agentfarm';
    let decision = heuristicDecision;
    let executionPayload = task.payload;
    let payloadOverrideSource: PayloadOverrideSource = 'none';
    let llmExecution: LlmDecisionMetadata = {
        classificationSource: 'heuristic',
        modelProvider: fallbackProvider,
        model: null,
        modelProfile: options?.modelProfile ?? null,
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
        fallbackReason: 'llm_provider_unconfigured',
    };

    if (options?.llmDecisionResolver) {
        try {
            const llmResult = await options.llmDecisionResolver({
                task,
                heuristicDecision,
            });

            if (llmResult) {
                decision = llmResult.decision;
                if (llmResult.payloadOverrides && typeof llmResult.payloadOverrides === 'object') {
                    executionPayload = {
                        ...task.payload,
                        ...llmResult.payloadOverrides,
                    };
                    payloadOverrideSource = 'llm_generated';
                }
                llmExecution = {
                    classificationSource: 'llm',
                    ...llmResult.metadata,
                };
            }
        } catch {
            llmExecution = {
                ...llmExecution,
                fallbackReason: 'llm_resolution_failed',
            };
        }
    }

    if (decision.route === 'approval') {
        await reportProgress(progressCtx, 'waiting_for_approval', 'Task requires human approval before execution.', sink);
        return {
            decision,
            status: 'approval_required',
            attempts: 0,
            transientRetries: 0,
            executionPayload,
            payloadOverrideSource,
            llmExecution,
        };
    }

    await reportProgress(progressCtx, 'coding_started', 'Executing low-risk developer task.', sink);
    const execResult = await executeTaskWithRetries(
        { ...task, payload: executionPayload },
        decision,
        payloadOverrideSource,
        llmExecution,
        options,
    );
    await reportProgress(
        progressCtx,
        execResult.status === 'success' ? 'completed' : 'failed',
        execResult.status === 'success' ? 'Developer task execution completed.' : `Developer task execution failed: ${execResult.errorMessage ?? 'Unknown error'}`,
        sink,
    );
    return execResult;

}

/**
 * Extension: processDeveloperTask with memory injection
 * Reads recent task memories before LLM decision, writes memory after execution
 * @param task Task envelope with workspaceId in payload
 * @param memoryStore Optional memory store for context injection
 * @param options Execution options (maxAttempts, modelProvider, etc.)
 */
export async function processDeveloperTaskWithMemory(
    task: TaskEnvelope,
    memoryStore?: { readMemoryForTask: (workspaceId: string) => Promise<any> },
    options?: {
        maxAttempts?: number;
        modelProvider?: string;
        modelProfile?: string;
        llmDecisionResolver?: LlmDecisionResolver;
        progressSink?: ProgressSink;
    },
): Promise<ProcessedTaskResult> {
    const workspaceId = task.payload['workspaceId'];

    // Read memory for context injection (optional)
    let memoryContext = null;
    if (memoryStore && typeof workspaceId === 'string') {
        try {
            memoryContext = await memoryStore.readMemoryForTask(workspaceId);
        } catch {
            // Silently fail if memory read errors; don't block execution
        }
    }

    // Inject memory context into payload for LLM prompt
    const taskWithMemory: TaskEnvelope = {
        ...task,
        payload: {
            ...task.payload,
            ...(memoryContext && {
                _memory_context: {
                    recentMemories: memoryContext.recentMemories,
                    approvalRejectionRate: memoryContext.approvalRejectionRate,
                    commonConnectors: memoryContext.mostCommonConnectors,
                    codeReviewPatterns: Array.isArray(memoryContext.codeReviewPatterns)
                        ? memoryContext.codeReviewPatterns
                        : [],
                    codeReviewPrompt: Array.isArray(memoryContext.codeReviewPatterns)
                        ? memoryContext.codeReviewPatterns.join('\n')
                        : '',
                },
            }),
        },
    };

    // Execute task normally
    const result = await processDeveloperTask(taskWithMemory, options);

    return result;
}
