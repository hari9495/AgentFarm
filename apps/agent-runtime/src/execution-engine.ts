import type { ProviderFailoverTraceRecord } from '@agentfarm/shared-types';
import { type ProgressSink, NoopProgressSink, reportProgress } from './task-progress-reporter.js';
import { buildErrorQuery, researchForTask, type FetchFn } from './web-research-service.js';
import { buildAuditContextPayload, buildRuntimeAuditContext } from './runtime-audit-integration.js';
import { preTaskScout } from './pre-task-scout.js';
import { evaluateEscalation } from './escalation-engine.js';
import { executeLocalWorkspaceAction, LOCAL_WORKSPACE_ACTION_TYPES, type LlmCodeGenFn, type AutonomousStep } from './local-workspace-executor.js';
import { enforceRole } from './role-enforcer.js';
import type { TaskClassifierFn } from './task-classifier.js';
import { dispatchConnectorAction } from './connector-dispatcher.js';
import { globalEpisodicMemory, type TaskMemoryEntry } from './episodic-memory.js';

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

/**
 * B2: Injectable kill-switch check function.
 * Returns { blocked: true } when an active kill-switch halts execution for the given scope.
 * Defaults to no-op (allow) when not provided.
 */
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
    // MCP tool invocation — external side-effects possible, content unknown
    'mcp_tool_call',
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

function enrichPayloadWithAuditContext(payload: Record<string, unknown>, taskId: string): Record<string, unknown> {
    const tenantId = typeof payload['tenantId'] === 'string' ? payload['tenantId'].trim() : '';
    const workspaceId = typeof payload['workspaceId'] === 'string' ? payload['workspaceId'].trim() : '';
    const role = typeof payload['roleKey'] === 'string'
        ? payload['roleKey']
        : typeof payload['roleProfile'] === 'string'
            ? payload['roleProfile']
            : typeof payload['audit_role'] === 'string'
                ? payload['audit_role']
                : '';

    const agentInstanceId = typeof payload['audit_agent_instance_id'] === 'string'
        ? payload['audit_agent_instance_id']
        : typeof payload['botId'] === 'string' && payload['botId'].startsWith('agt_')
            ? payload['botId']
            : undefined;
    const sessionId = typeof payload['session_id'] === 'string'
        ? payload['session_id']
        : typeof payload['audit_session_id'] === 'string'
            ? payload['audit_session_id']
            : undefined;

    if (!tenantId || !workspaceId || !role) {
        return payload;
    }

    const context = buildRuntimeAuditContext({
        tenantId,
        workspaceId,
        role,
        taskId,
        sessionId,
        agentInstanceId,
        env: process.env,
    });

    return {
        ...payload,
        ...buildAuditContextPayload(context),
    };
}

/**
 * Build an LlmCodeGenFn from environment variables.
 *
 * Makes a direct chat-completions call (OpenAI-compatible) to ask the LLM to
 * produce a JSON array of AutonomousStep objects that implement the requested
 * code change.  Returns `undefined` when no LLM provider is configured so the
 * executor falls back gracefully to keyword-based plan inference.
 *
 * Supported via AF_MODEL_PROVIDER: openai | github_models | azure_openai.
 */
function createCodeGenFn(env: NodeJS.ProcessEnv = process.env): LlmCodeGenFn | undefined {
    const provider = (env['AF_MODEL_PROVIDER'] ?? env['AGENTFARM_MODEL_PROVIDER'] ?? 'agentfarm').toLowerCase().trim();
    if (provider === 'agentfarm' || provider === 'mock') return undefined;

    let apiKey: string;
    let baseUrl: string;
    let model: string;

    if (provider === 'github_models') {
        apiKey = env['AF_GITHUB_MODELS_API_KEY'] ?? env['AGENTFARM_GITHUB_MODELS_API_KEY'] ?? '';
        baseUrl = (env['AF_GITHUB_MODELS_BASE_URL'] ?? env['AGENTFARM_GITHUB_MODELS_BASE_URL'] ?? 'https://models.inference.ai.azure.com').replace(/\/+$/, '');
        model = env['AF_GITHUB_MODELS_MODEL'] ?? env['AGENTFARM_GITHUB_MODELS_MODEL'] ?? 'openai/gpt-4.1-mini';
    } else if (provider === 'azure_openai' || provider === 'azure-openai') {
        const endpoint = (env['AF_AZURE_OPENAI_ENDPOINT'] ?? env['AGENTFARM_AZURE_OPENAI_ENDPOINT'] ?? '').replace(/\/+$/, '');
        const deployment = env['AF_AZURE_OPENAI_DEPLOYMENT'] ?? env['AGENTFARM_AZURE_OPENAI_DEPLOYMENT'] ?? '';
        const apiVersion = env['AF_AZURE_OPENAI_API_VERSION'] ?? env['AGENTFARM_AZURE_OPENAI_API_VERSION'] ?? '2024-06-01';
        apiKey = env['AF_AZURE_OPENAI_API_KEY'] ?? env['AGENTFARM_AZURE_OPENAI_API_KEY'] ?? '';
        baseUrl = endpoint && deployment
            ? `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`
            : '';
        model = deployment;
        if (!apiKey || !baseUrl) return undefined;
    } else {
        // openai and openai-compatible providers
        apiKey = env['AF_OPENAI_API_KEY'] ?? env['AGENTFARM_OPENAI_API_KEY'] ?? '';
        baseUrl = (env['AF_OPENAI_BASE_URL'] ?? env['AGENTFARM_OPENAI_BASE_URL'] ?? 'https://api.openai.com/v1').replace(/\/+$/, '');
        model = env['AF_OPENAI_MODEL'] ?? env['AGENTFARM_OPENAI_MODEL'] ?? 'gpt-4o-mini';
    }

    if (!apiKey || !apiKey.trim()) return undefined;

    return async (taskPrompt, fileContents, targetFiles) => {
        const fileContext = Object.entries(fileContents)
            .map(([p, c]) => `=== ${p} ===\n${c}`)
            .join('\n\n');

        const systemPrompt = [
            'You are an expert software developer agent.',
            'Analyze the task description and current code, then produce a JSON implementation plan.',
            'Return ONLY a valid JSON array. Do NOT include markdown fences, explanations, or prose.',
            'Each element in the array is a step with this shape:',
            '  { "description": string, "actions": Action[] }',
            'Where Action is one of:',
            '  { "action": "code_edit", "file_path": string, "content": string }',
            '  { "action": "code_edit_patch", "file_path": string, "old_text": string, "new_text": string }',
            '  { "action": "run_tests", "command"?: string }',
            '  { "action": "run_build", "command"?: string }',
            'Use code_edit_patch for targeted edits to existing files.',
            'Use code_edit only when creating new files or rewriting a file completely.',
            'Return ONLY the JSON array. No surrounding text.',
        ].join('\n');

        const userMsg = [
            `Task: ${taskPrompt}`,
            targetFiles.length > 0 ? `Target files: ${targetFiles.join(', ')}` : '',
            fileContext ? `\nCurrent code:\n${fileContext}` : '',
            '\nGenerate the complete implementation plan as a JSON array.',
        ].filter(Boolean).join('\n');

        try {
            // For Azure OpenAI, baseUrl already contains the full deployment path
            const fetchUrl = (provider === 'azure_openai' || provider === 'azure-openai')
                ? baseUrl
                : `${baseUrl}/chat/completions`;
            const headers: Record<string, string> = { 'content-type': 'application/json' };
            if (provider === 'azure_openai' || provider === 'azure-openai') {
                headers['api-key'] = apiKey;
            } else {
                headers['authorization'] = `Bearer ${apiKey}`;
            }
            const response = await fetch(fetchUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    model,
                    temperature: 0,
                    response_format: { type: 'json_object' },
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userMsg },
                    ],
                }),
                signal: AbortSignal.timeout(120_000),
            });
            if (!response.ok) return [];
            const parsed = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
            const content = parsed.choices?.[0]?.message?.content;
            if (!content) return [];

            let raw: unknown = JSON.parse(content);
            // LLM may wrap the array under a key such as "steps", "plan", "initial_plan"
            if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
                const obj = raw as Record<string, unknown>;
                raw = obj['steps'] ?? obj['plan'] ?? obj['initial_plan'] ?? obj['actions'] ?? [];
            }
            if (!Array.isArray(raw)) return [];
            return (raw as Record<string, unknown>[]).filter(
                (s) => s !== null && typeof s === 'object' && Array.isArray(s['actions']),
            ) as AutonomousStep[];
        } catch {
            return [];
        }
    };
}

async function executeLowRiskAction(task: TaskEnvelope, attempt: number, opts?: { llmCodeGenFn?: LlmCodeGenFn }): Promise<void> {
    if (shouldFailTransiently(task.payload, attempt)) {
        throw new Error('TRANSIENT_EXECUTOR_ERROR');
    }

    if (task.payload['force_failure'] === true) {
        throw new Error('NON_RETRYABLE_EXECUTOR_ERROR');
    }

    const rawActionType = task.payload['actionType'];
    const rawConnector = task.payload['connector'];

    // ── Connector actions (GitHub, Jira, …) ──────────────────────────────────
    if (typeof rawConnector === 'string' && rawConnector && typeof rawActionType === 'string') {
        const result = await dispatchConnectorAction(
            rawConnector,
            rawActionType,
            task.payload,
        );
        if (!result.ok) {
            throw new Error(`Connector dispatch failed [${rawConnector}/${rawActionType}]: ${result.error}`);
        }
        return;
    }

    // ── Local workspace actions ───────────────────────────────────────────────
    // Route workspace_* prefixed actions AND all non-prefixed action types that
    // are registered in LOCAL_WORKSPACE_ACTION_TYPES (e.g. autonomous_loop,
    // mcp_tool_call, code_edit, git_commit). Previously only workspace_* was
    // routed; the rest were silently dropped as no-ops.
    if (
        typeof rawActionType === 'string' &&
        (rawActionType.startsWith('workspace_') || LOCAL_WORKSPACE_ACTION_TYPES.has(rawActionType as import('./local-workspace-executor.js').LocalWorkspaceActionType))
    ) {
        const tenantId = typeof task.payload['tenantId'] === 'string' ? task.payload['tenantId'] : 'unknown';
        const botId = typeof task.payload['botId'] === 'string' ? task.payload['botId'] : 'unknown';
        const result = await executeLocalWorkspaceAction({
            tenantId,
            botId,
            taskId: task.taskId,
            actionType: rawActionType as import('./local-workspace-executor.js').LocalWorkspaceActionType,
            payload: task.payload,
            llmCodeGenFn: opts?.llmCodeGenFn,
        });
        if (!result.ok) {
            const msg = result.errorOutput ?? result.output ?? 'workspace action failed';
            throw new Error(`Workspace action failed [${rawActionType}]: ${msg}`);
        }
        return;
    }

    // GAP 4 FIX: Fail loudly instead of silently succeeding when no routing path
    // matches. A silent no-op masks misconfigured tasks as successes and hides
    // every routing bug (e.g. missing workspace_ prefix, unknown action type).
    const resolvedActionType = typeof rawActionType === 'string' && rawActionType ? rawActionType : 'read_task';
    if (resolvedActionType !== 'read_task') {
        throw new Error(
            `Unroutable action type: '${resolvedActionType}'. ` +
            `Expected a 'workspace_*' prefixed action type (e.g. workspace_subagent_spawn) ` +
            `or a connector action with payload.connector set.`,
        );
    }
}

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
            await executeLowRiskAction({ ...task, payload: currentPayload }, attempts, { llmCodeGenFn: options?.llmCodeGenFn });
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
    options?: {
        maxAttempts?: number;
        modelProvider?: string;
        modelProfile?: string;
        progressSink?: ProgressSink;
        /** B2: Kill-switch check — blocks execution even when human approval was granted. */
        killSwitchCheckFn?: KillSwitchCheckFn;
    },
): Promise<ProcessedTaskResult> {
    const taskWithAuditContext: TaskEnvelope = {
        ...task,
        payload: enrichPayloadWithAuditContext(task.payload, task.taskId),
    };
    const sink: ProgressSink = options?.progressSink ?? new NoopProgressSink();
    const progressCtx = buildProgressReporterContext(taskWithAuditContext);
    await reportProgress(progressCtx, 'task_received', 'Task received for approved execution.', sink);
    const baseDecision = buildDecision(taskWithAuditContext);

    // B2: Kill-switch takes precedence over human approval.
    if (options?.killSwitchCheckFn) {
        const tenantId = typeof taskWithAuditContext.payload['tenantId'] === 'string' ? taskWithAuditContext.payload['tenantId'] : '';
        const workspaceId = typeof taskWithAuditContext.payload['workspaceId'] === 'string' ? taskWithAuditContext.payload['workspaceId'] : '';
        const botId = typeof taskWithAuditContext.payload['botId'] === 'string' ? taskWithAuditContext.payload['botId'] : '';
        const ksResult = await options.killSwitchCheckFn({
            taskId: task.taskId,
            riskLevel: baseDecision.riskLevel,
            tenantId,
            workspaceId,
            botId,
        });
        if (ksResult.blocked) {
            return {
                decision: baseDecision,
                status: 'failed',
                attempts: 0,
                transientRetries: 0,
                executionPayload: taskWithAuditContext.payload,
                payloadOverrideSource: 'none',
                failureClass: 'kill_switch_blocked',
                errorMessage: `[KILL_SWITCH_BLOCKED] Execution blocked by active kill-switch${ksResult.killSwitchId ? ` (${ksResult.killSwitchId})` : ''}. Resume requires authorized control-plane signal and incident reference.`,
            };
        }
    }

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
    const result = await executeTaskWithRetries(taskWithAuditContext, approvedDecision, 'none', llmExecution, options);
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
        /** Injectable classifier fn for role enforcement soft-block (default: keyword heuristic). */
        roleClassifierFn?: TaskClassifierFn;
        /** B2: Kill-switch check — halts risky execution within the active control window. */
        killSwitchCheckFn?: KillSwitchCheckFn;
    },
): Promise<ProcessedTaskResult> {
    const taskWithAuditContext: TaskEnvelope = {
        ...task,
        payload: enrichPayloadWithAuditContext(task.payload, task.taskId),
    };
    const sink: ProgressSink = options?.progressSink ?? new NoopProgressSink();
    const progressCtx = buildProgressReporterContext(taskWithAuditContext);
    await reportProgress(progressCtx, 'task_received', 'Task received for developer execution.', sink);

    // Phase 0: Role enforcement — reject tasks that belong to a different agent role.
    // Runs before LLM classification to prevent quota spend on out-of-role requests.
    const enforcement = await enforceRole(taskWithAuditContext, 'developer', {
        classifierFn: options?.roleClassifierFn,
    });
    if (!enforcement.allowed) {
        const heuristicDecisionForBlock = buildDecision(taskWithAuditContext);
        return {
            decision: heuristicDecisionForBlock,
            status: 'failed',
            attempts: 0,
            transientRetries: 0,
            executionPayload: taskWithAuditContext.payload,
            payloadOverrideSource: 'none',
            failureClass: 'role_enforcement',
            errorMessage: `[ROLE_ENFORCEMENT] ${enforcement.reason} | suggestedRole=${enforcement.suggestedRole ?? 'none'} | declineCode=${enforcement.declineCode}`,
        };
    }

    // Phase 0B (B2): Kill-switch enforcement — halts all task types when an active kill-switch
    // covers this scope. Checked before LLM decision to prevent quota spend on blocked tasks.
    if (options?.killSwitchCheckFn) {
        const tenantId = typeof taskWithAuditContext.payload['tenantId'] === 'string' ? taskWithAuditContext.payload['tenantId'] : '';
        const workspaceId = typeof taskWithAuditContext.payload['workspaceId'] === 'string' ? taskWithAuditContext.payload['workspaceId'] : '';
        const botId = typeof taskWithAuditContext.payload['botId'] === 'string' ? taskWithAuditContext.payload['botId'] : '';
        const heuristicForKsCheck = buildDecision(taskWithAuditContext);
        const ksResult = await options.killSwitchCheckFn({
            taskId: task.taskId,
            riskLevel: heuristicForKsCheck.riskLevel,
            tenantId,
            workspaceId,
            botId,
        });
        if (ksResult.blocked) {
            return {
                decision: heuristicForKsCheck,
                status: 'failed',
                attempts: 0,
                transientRetries: 0,
                executionPayload: taskWithAuditContext.payload,
                payloadOverrideSource: 'none',
                failureClass: 'kill_switch_blocked',
                errorMessage: `[KILL_SWITCH_BLOCKED] Execution blocked by active kill-switch${ksResult.killSwitchId ? ` (${ksResult.killSwitchId})` : ''}. Resume requires authorized control-plane signal and incident reference.`,
            };
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
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
        fallbackReason: 'llm_provider_unconfigured',
    };

    // Phase 2: Scout the codebase before handing context to the LLM
    const scoutContext = await preTaskScout(taskWithAuditContext, executeLocalWorkspaceAction as Parameters<typeof preTaskScout>[1]).catch(() => '');

    // Gap A: inject episodic memory context so the LLM knows what was tried before
    const workspaceIdForMemory =
        typeof taskWithAuditContext.payload['workspaceId'] === 'string'
            ? taskWithAuditContext.payload['workspaceId']
            : '';
    const recentMemories = workspaceIdForMemory
        ? await globalEpisodicMemory.readRecentForWorkspace(workspaceIdForMemory).catch(() => [])
        : [];
    const episodicContext = globalEpisodicMemory.buildContextBlock(recentMemories);

    const taskForLlm: TaskEnvelope = {
        ...taskWithAuditContext,
        payload: {
            ...taskWithAuditContext.payload,
            ...(scoutContext ? { _scout_context: scoutContext } : {}),
            ...(episodicContext ? { _episodic_context: episodicContext } : {}),
        },
    };

    // Phase 5: Check for ambiguous task before LLM call
    const preEscalation = evaluateEscalation(taskWithAuditContext, 0);
    if (preEscalation.shouldEscalate && preEscalation.reason === 'ambiguous_task') {
        return {
            decision: heuristicDecision,
            status: 'failed',
            attempts: 0,
            transientRetries: 0,
            executionPayload: taskWithAuditContext.payload,
            payloadOverrideSource: 'none',
            llmExecution,
            failureClass: 'runtime_exception',
            errorMessage: preEscalation.message,
        };
    }

    if (options?.llmDecisionResolver) {
        try {
            const llmResult = await options.llmDecisionResolver({
                task: taskForLlm,
                heuristicDecision,
            });

            if (llmResult) {
                decision = llmResult.decision;
                if (llmResult.payloadOverrides && typeof llmResult.payloadOverrides === 'object') {
                    executionPayload = {
                        ...taskWithAuditContext.payload,
                        ...llmResult.payloadOverrides,
                    };
                    payloadOverrideSource = 'llm_generated';
                } else {
                    executionPayload = { ...taskWithAuditContext.payload };
                }
                // GAP 1 FIX: Wire the LLM's classified actionType into the execution payload.
                // executeLowRiskAction routes on payload['actionType'] (camelCase). Customers
                // submit payload['action_type'] (snake_case). Without this line the LLM's
                // routing decision is ignored and every task silently no-ops.
                executionPayload['actionType'] = llmResult.decision.actionType;

                // GAP 2 FIX: workspace_subagent_spawn requires payload.prompt. Customers
                // send the task description as 'description', 'summary', or 'intent'.
                // Map whichever is present so the subagent handler always has a prompt.
                if (!executionPayload['prompt']) {
                    executionPayload['prompt'] =
                        executionPayload['description'] ??
                        executionPayload['summary'] ??
                        executionPayload['intent'] ??
                        taskWithAuditContext.payload['description'] ??
                        taskWithAuditContext.payload['summary'] ??
                        taskWithAuditContext.payload['intent'] ??
                        '';
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
    // Auto-create a code-gen function from env if none was provided externally.
    // This is used inside workspace_subagent_spawn to generate real code_edit
    // steps when the caller did not supply a pre-baked initial_plan.
    const codeGenFn: LlmCodeGenFn | undefined = createCodeGenFn();
    const execResult = await executeTaskWithRetries(
        { ...taskWithAuditContext, payload: executionPayload },
        decision,
        payloadOverrideSource,
        llmExecution,
        { ...options, llmCodeGenFn: codeGenFn },
    );
    await reportProgress(
        progressCtx,
        execResult.status === 'success' ? 'completed' : 'failed',
        execResult.status === 'success' ? 'Developer task execution completed.' : `Developer task execution failed: ${execResult.errorMessage ?? 'Unknown error'}`,
        sink,
    );

    // Gap A: record this task's outcome in episodic memory for future context
    if (workspaceIdForMemory) {
        const promptSummary = (
            typeof executionPayload['prompt'] === 'string' ? executionPayload['prompt'] :
                typeof executionPayload['description'] === 'string' ? executionPayload['description'] :
                    typeof executionPayload['summary'] === 'string' ? executionPayload['summary'] :
                        decision.actionType
        ).slice(0, 200);
        const outcome: TaskMemoryEntry['outcome'] =
            execResult.status === 'success' ? 'success' :
                execResult.status === 'approval_required' ? 'approval_required' :
                    execResult.errorMessage?.toLowerCase().includes('escalat') ? 'escalated' :
                        'failed';
        await globalEpisodicMemory.record({
            taskId: task.taskId,
            workspaceId: workspaceIdForMemory,
            botId: typeof taskWithAuditContext.payload['botId'] === 'string'
                ? taskWithAuditContext.payload['botId'] : 'unknown',
            actionType: decision.actionType,
            promptSummary,
            outcome,
            timestamp: Date.now(),
            errorMessage: execResult.errorMessage?.slice(0, 120),
        }).catch(() => { /* best-effort */ });
    }

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
