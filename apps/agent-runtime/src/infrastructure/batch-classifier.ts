/**
 * batch-classifier.ts — classify multiple tasks in a single LLM call.
 *
 * When the trigger service receives N similar tasks (same tenant/agent, e.g. 10
 * files to patch from a webhook), the default path fires N separate LLM
 * classification calls — each loading the full system prompt. This module
 * batches them: one call classifies all N tasks, the system prompt is loaded
 * once (prompt-cache hit on Anthropic), and the model returns a JSON array with
 * one decision per task.
 *
 * Intended use: call before dispatching tasks to processDeveloperTask so the
 * heuristic decisions can be pre-enriched or the results stored for replay.
 *
 * Constraints:
 *   - Only tasks from the same tenant+agent may be batched (security boundary).
 *   - Returns routing decisions only — no payloadOverrides / initial_plan.
 *     For plan generation, still call processDeveloperTask per task.
 *   - Falls back to per-task heuristic when the LLM call fails.
 */

import type { TaskEnvelope, ActionDecision, LlmDecisionMetadata } from '../execution-engine.js';
import { buildDecision } from '../execution-engine.js';

export type BatchClassifiedTask = {
    taskId: string;
    decision: ActionDecision;
    source: 'llm_batch' | 'heuristic_fallback';
    metadata: Pick<LlmDecisionMetadata, 'modelProvider' | 'model' | 'promptTokens' | 'completionTokens' | 'totalTokens'>;
};

type LlmBatchDecision = {
    taskId: string;
    actionType: string;
    confidence: number;
    riskLevel: 'low' | 'medium' | 'high';
    route: 'execute' | 'approval';
    reason: string;
};

type OpenAiLikeUsage = {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
};

// ---------------------------------------------------------------------------
// Provider resolution (mirrors llm-provider-factory env var conventions)
// ---------------------------------------------------------------------------

type BatchProviderConfig =
    | { kind: 'anthropic'; apiKey: string; model: string }
    | { kind: 'openai_compatible'; apiKey: string; baseUrl: string; model: string; isAzure: boolean };

function resolveBatchProviderConfig(env: NodeJS.ProcessEnv): BatchProviderConfig | null {
    const provider = (env['AF_MODEL_PROVIDER'] ?? env['AGENTFARM_MODEL_PROVIDER'] ?? 'agentfarm')
        .toLowerCase().trim();

    if (provider === 'agentfarm' || provider === 'mock') return null;

    if (provider === 'anthropic') {
        const apiKey = env['AF_ANTHROPIC_API_KEY'] ?? env['AGENTFARM_ANTHROPIC_API_KEY'] ?? '';
        const model = env['AF_ANTHROPIC_MODEL_SPEED_FIRST'] ?? env['AGENTFARM_ANTHROPIC_MODEL_SPEED_FIRST'] ?? 'claude-haiku-4-5';
        if (!apiKey.trim()) return null;
        return { kind: 'anthropic', apiKey, model };
    }

    const apiKey = env['AF_OPENAI_API_KEY'] ?? env['AGENTFARM_OPENAI_API_KEY'] ?? '';
    const baseUrl = (env['AF_OPENAI_BASE_URL'] ?? env['AGENTFARM_OPENAI_BASE_URL'] ?? 'https://api.openai.com/v1').replace(/\/+$/, '');
    const model = env['AF_OPENAI_MODEL_SPEED_FIRST'] ?? env['AGENTFARM_OPENAI_MODEL_SPEED_FIRST'] ?? 'gpt-4o-mini';
    if (!apiKey.trim()) return null;
    return { kind: 'openai_compatible', apiKey, baseUrl, model, isAzure: false };
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

function parseBatchResponse(raw: string, tasks: TaskEnvelope[]): LlmBatchDecision[] {
    const fallbackIds = new Set(tasks.map((t) => t.taskId));
    let data: unknown;
    try {
        const s = raw.indexOf('[');
        const e = raw.lastIndexOf(']');
        if (s === -1 || e === -1) return [];
        data = JSON.parse(raw.slice(s, e + 1));
    } catch {
        return [];
    }
    if (!Array.isArray(data)) return [];
    return (data as Record<string, unknown>[]).filter((item) => {
        const id = typeof item['taskId'] === 'string' ? item['taskId'] : '';
        return fallbackIds.has(id) && typeof item['actionType'] === 'string';
    }).map((item) => ({
        taskId: item['taskId'] as string,
        actionType: (item['actionType'] as string).trim().toLowerCase(),
        confidence: typeof item['confidence'] === 'number' ? Math.min(1, Math.max(0, item['confidence'])) : 0.5,
        riskLevel: (item['riskLevel'] === 'high' || item['riskLevel'] === 'medium') ? item['riskLevel'] : 'low',
        route: (item['route'] === 'approval') ? 'approval' : 'execute',
        reason: typeof item['reason'] === 'string' ? item['reason'] : '',
    }));
}

// ---------------------------------------------------------------------------
// LLM call — Anthropic
// ---------------------------------------------------------------------------

async function callAnthropicBatch(
    config: Extract<BatchProviderConfig, { kind: 'anthropic' }>,
    tasks: TaskEnvelope[],
): Promise<{ decisions: LlmBatchDecision[]; usage: OpenAiLikeUsage }> {
    const taskList = tasks.map((t) => ({
        taskId: t.taskId,
        actionType: t.payload['actionType'],
        summary: t.payload['summary'] ?? t.payload['prompt'] ?? t.payload['description'],
        complexity: t.payload['complexity'],
        target: t.payload['target'],
    }));

    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-api-key': config.apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-beta': 'prompt-caching-2024-07-31',
        },
        body: JSON.stringify({
            model: config.model,
            max_tokens: tasks.length * 80 + 128,
            temperature: 0,
            system: [
                {
                    type: 'text',
                    text: [
                        'You classify AgentFarm tasks for routing. Return ONLY a JSON array.',
                        'Each element: { "taskId": string, "actionType": string, "confidence": 0-1, "riskLevel": "low"|"medium"|"high", "route": "execute"|"approval", "reason": string }',
                        'For medium or high risk, route must be approval.',
                        'Return the array in the same order as the input tasks.',
                    ].join('\n'),
                    cache_control: { type: 'ephemeral' },
                },
            ],
            messages: [
                {
                    role: 'user',
                    content: `Classify these tasks:\n${JSON.stringify(taskList, null, 2)}\n\nReturn ONLY the JSON array.`,
                },
            ],
        }),
        signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) throw new Error(`anthropic_batch_failed:${response.status}`);

    const parsed = await response.json() as {
        content?: Array<{ type: string; text?: string }>;
        usage?: { input_tokens?: number; output_tokens?: number };
    };

    const text = parsed.content?.find((b) => b.type === 'text')?.text ?? '';
    return {
        decisions: parseBatchResponse(text, tasks),
        usage: { prompt_tokens: parsed.usage?.input_tokens, completion_tokens: parsed.usage?.output_tokens, total_tokens: (parsed.usage?.input_tokens ?? 0) + (parsed.usage?.output_tokens ?? 0) },
    };
}

// ---------------------------------------------------------------------------
// LLM call — OpenAI-compatible
// ---------------------------------------------------------------------------

async function callOpenAiBatch(
    config: Extract<BatchProviderConfig, { kind: 'openai_compatible' }>,
    tasks: TaskEnvelope[],
): Promise<{ decisions: LlmBatchDecision[]; usage: OpenAiLikeUsage }> {
    const taskList = tasks.map((t) => ({
        taskId: t.taskId,
        actionType: t.payload['actionType'],
        summary: t.payload['summary'] ?? t.payload['prompt'] ?? t.payload['description'],
        complexity: t.payload['complexity'],
    }));

    const fetchUrl = config.isAzure ? config.baseUrl : `${config.baseUrl}/chat/completions`;
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (config.isAzure) {
        headers['api-key'] = config.apiKey;
    } else {
        headers['authorization'] = `Bearer ${config.apiKey}`;
    }

    const response = await fetch(fetchUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            model: config.model,
            temperature: 0,
            max_tokens: tasks.length * 80 + 128,
            messages: [
                {
                    role: 'system',
                    content: 'You classify AgentFarm tasks for routing. Return ONLY a JSON array. Each element: { "taskId": string, "actionType": string, "confidence": 0-1, "riskLevel": "low"|"medium"|"high", "route": "execute"|"approval", "reason": string }. For medium or high risk, route must be approval.',
                },
                {
                    role: 'user',
                    content: `Classify these tasks:\n${JSON.stringify(taskList, null, 2)}\n\nReturn ONLY the JSON array.`,
                },
            ],
        }),
        signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) throw new Error(`openai_batch_failed:${response.status}`);

    const parsed = await response.json() as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: OpenAiLikeUsage;
    };

    const content = parsed.choices?.[0]?.message?.content ?? '';
    return {
        decisions: parseBatchResponse(content, tasks),
        usage: parsed.usage ?? {},
    };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Classify multiple tasks from the same tenant/agent in a single LLM call.
 *
 * Returns a map of taskId → BatchClassifiedTask. Tasks with no LLM result fall
 * back to the heuristic decision so callers always get a full result set.
 *
 * @param tasks   - tasks to classify (must share the same tenantId + botId)
 * @param env     - process.env (injectable for testing)
 */
export async function classifyTasksBatch(
    tasks: TaskEnvelope[],
    env: NodeJS.ProcessEnv = process.env,
): Promise<Map<string, BatchClassifiedTask>> {
    const results = new Map<string, BatchClassifiedTask>();
    if (tasks.length === 0) return results;

    const config = resolveBatchProviderConfig(env);
    let batchDecisions: LlmBatchDecision[] = [];
    let usage: OpenAiLikeUsage = {};
    let modelProvider = 'agentfarm';
    let model: string | null = null;

    if (config) {
        try {
            let raw: { decisions: LlmBatchDecision[]; usage: OpenAiLikeUsage };
            if (config.kind === 'anthropic') {
                raw = await callAnthropicBatch(config, tasks);
                modelProvider = 'anthropic';
            } else {
                raw = await callOpenAiBatch(config, tasks);
                modelProvider = 'openai_compatible';
            }
            batchDecisions = raw.decisions;
            usage = raw.usage;
            model = config.model;
        } catch {
            batchDecisions = [];
        }
    }

    const decisionMap = new Map(batchDecisions.map((d) => [d.taskId, d]));

    for (const task of tasks) {
        const llm = decisionMap.get(task.taskId);
        if (llm) {
            results.set(task.taskId, {
                taskId: task.taskId,
                decision: {
                    actionType: llm.actionType,
                    confidence: llm.confidence,
                    riskLevel: llm.riskLevel,
                    route: llm.route,
                    reason: llm.reason,
                },
                source: 'llm_batch',
                metadata: {
                    modelProvider,
                    model,
                    promptTokens: typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : null,
                    completionTokens: typeof usage.completion_tokens === 'number' ? usage.completion_tokens : null,
                    totalTokens: typeof usage.total_tokens === 'number' ? usage.total_tokens : null,
                },
            });
        } else {
            const heuristic = buildDecision(task);
            results.set(task.taskId, {
                taskId: task.taskId,
                decision: heuristic,
                source: 'heuristic_fallback',
                metadata: { modelProvider: 'agentfarm', model: null, promptTokens: null, completionTokens: null, totalTokens: null },
            });
        }
    }

    return results;
}
