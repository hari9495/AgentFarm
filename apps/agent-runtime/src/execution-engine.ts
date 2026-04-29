import type { ProviderFailoverTraceRecord } from '@agentfarm/shared-types';

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

export type LlmDecisionResolver = (input: {
    task: TaskEnvelope;
    heuristicDecision: ActionDecision;
}) => Promise<{
    decision: ActionDecision;
    metadata: Omit<LlmDecisionMetadata, 'classificationSource'>;
}>;

export type ProcessedTaskResult = {
    decision: ActionDecision;
    status: 'success' | 'approval_required' | 'failed';
    attempts: number;
    transientRetries: number;
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
]);

const MEDIUM_RISK_ACTIONS = new Set([
    'update_status',
    'create_comment',
    'create_pr_comment',
    'create_pr',
    'send_message',
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
    llmExecution?: LlmDecisionMetadata,
    options?: { maxAttempts?: number },
): Promise<ProcessedTaskResult> {
    const maxAttempts = options?.maxAttempts ?? 3;
    let attempts = 0;
    let transientRetries = 0;

    while (attempts < maxAttempts) {
        attempts += 1;
        try {
            await executeLowRiskAction(task, attempts);
            return {
                decision,
                status: 'success',
                attempts,
                transientRetries,
                llmExecution,
            };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            const isTransient = message.includes('TRANSIENT');

            if (isTransient && attempts < maxAttempts) {
                transientRetries += 1;
                continue;
            }

            return {
                decision,
                status: 'failed',
                attempts,
                transientRetries,
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
        failureClass: 'runtime_exception',
        errorMessage: 'Failed after exhausting retry attempts.',
        llmExecution,
    };
}

export async function processApprovedTask(
    task: TaskEnvelope,
    options?: { maxAttempts?: number; modelProvider?: string; modelProfile?: string },
): Promise<ProcessedTaskResult> {
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

    return executeTaskWithRetries(task, approvedDecision, llmExecution, options);
}

export async function processDeveloperTask(
    task: TaskEnvelope,
    options?: {
        maxAttempts?: number;
        modelProvider?: string;
        modelProfile?: string;
        llmDecisionResolver?: LlmDecisionResolver;
    },
): Promise<ProcessedTaskResult> {
    const heuristicDecision = buildDecision(task);
    const fallbackProvider = options?.modelProvider ?? 'agentfarm';
    let decision = heuristicDecision;
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
        return {
            decision,
            status: 'approval_required',
            attempts: 0,
            transientRetries: 0,
            llmExecution,
        };
    }

    return executeTaskWithRetries(task, decision, llmExecution, options);
}
