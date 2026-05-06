// ============================================================================
// EVALUATOR WEBHOOK — Outbound quality evaluation notification
// ============================================================================
// After task execution, fires a webhook to a configured external evaluator
// endpoint (RUNTIME_EVALUATOR_WEBHOOK_URL). The evaluator can then POST a
// quality signal back via POST /runtime/quality/signals with source=evaluator.
// This completes the evaluator feedback loop.

export type EvaluatorWebhookPayload = {
    schema_version: '1.0.0';
    event_type: 'task_outcome';
    task_id: string;
    correlation_id: string;
    tenant_id: string;
    workspace_id: string;
    bot_id: string;
    provider: string;
    action_type: string;
    execution_status: 'success' | 'approval_required' | 'failed';
    risk_level: string;
    latency_ms: number;
    prompt_tokens: number | null;
    completion_tokens: number | null;
    heuristic_score: number;
    callback_url: string;
    observed_at: string;
};

type FireEvaluatorWebhookInput = {
    taskId: string;
    correlationId: string;
    tenantId: string;
    workspaceId: string;
    botId: string;
    provider: string;
    actionType: string;
    executionStatus: 'success' | 'approval_required' | 'failed';
    riskLevel: string;
    latencyMs: number;
    promptTokens: number | null;
    completionTokens: number | null;
    heuristicScore: number;
    callbackUrl: string;
    webhookUrl: string;
};

/**
 * Fire-and-forget outbound webhook to external evaluator.
 * Non-blocking — failures are swallowed to never affect task outcome.
 *
 * The evaluator is expected to respond synchronously with 2xx and later POST
 * a labeled quality signal to the callback_url via POST /runtime/quality/signals
 * with source=evaluator.
 */
export const fireEvaluatorWebhook = (input: FireEvaluatorWebhookInput): void => {
    const payload: EvaluatorWebhookPayload = {
        schema_version: '1.0.0',
        event_type: 'task_outcome',
        task_id: input.taskId,
        correlation_id: input.correlationId,
        tenant_id: input.tenantId,
        workspace_id: input.workspaceId,
        bot_id: input.botId,
        provider: input.provider,
        action_type: input.actionType,
        execution_status: input.executionStatus,
        risk_level: input.riskLevel,
        latency_ms: input.latencyMs,
        prompt_tokens: input.promptTokens,
        completion_tokens: input.completionTokens,
        heuristic_score: input.heuristicScore,
        callback_url: input.callbackUrl,
        observed_at: new Date().toISOString(),
    };

    // Non-blocking: fire and forget
    fetch(input.webhookUrl, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5_000),
    }).catch(() => {
        // Evaluator webhook failures must never surface to the runtime caller
    });
};

/**
 * Resolve the evaluator webhook URL from the environment.
 * Returns null if not configured.
 */
export const resolveEvaluatorWebhookUrl = (env: NodeJS.ProcessEnv): string | null => {
    const url = env.RUNTIME_EVALUATOR_WEBHOOK_URL?.trim();
    if (!url) return null;
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
            return null;
        }
        return url;
    } catch {
        return null;
    }
};
