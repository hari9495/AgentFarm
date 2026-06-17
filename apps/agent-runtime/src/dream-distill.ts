/**
 * dream-distill.ts — Self-reflection lesson extraction after task success.
 *
 * After GoalJudge accepts a completed task, distillLesson() makes a
 * fire-and-forget Haiku call to extract a generalizable best-practice from
 * the interaction and writes it to /v1/memory/patterns. RAG retrievers on
 * future runs surface these distilled lessons alongside human-validated ones.
 *
 * Key design choices:
 *   - Fire-and-forget: never awaited, never throws, never blocks the caller.
 *   - Cheap model (Haiku): lesson extraction needs no reasoning depth.
 *   - Confidence 0.65: lower than human-validated lessons (0.75) to reflect
 *     that machine-distilled lessons haven't been human-confirmed.
 *   - Skips read-only action types: no generalizable lesson in read operations.
 *
 * See docs/QUALITY_GATES.md §5 for the full design.
 */

import { randomUUID } from 'node:crypto';

function isEnabled(): boolean {
    return (
        process.env['AF_DREAM_DISTILL_ENABLED'] === 'true' ||
        process.env['AF_DREAM_DISTILL_ENABLED'] === '1'
    );
}

function getModel(): string {
    return process.env['AF_DREAM_DISTILL_MODEL'] ?? 'claude-haiku-4-5-20251001';
}

const SKIP_ACTION_TYPES = new Set([
    'code_read',
    'workspace_read_file',
    'workspace_list_files',
    'workspace_grep',
    'workspace_scout',
    'k8s_get',
    'k8s_logs',
    'prometheus_query',
    'vault_read',
]);

const DISTILL_SYSTEM = `You are a lesson-extraction system for an AI agent platform.

You will be given a task description and the agent's successful output.

Extract ONE generalizable lesson — a principle that would help the same agent handle similar tasks better in the future. Do NOT summarize what happened. Write a reusable best-practice.

Respond with ONLY a JSON object in this exact shape:
{
  "lesson": string
}

Rules:
- "lesson": 1–2 sentences, written as a reusable principle (e.g. "When X, always Y because Z.")
- Do not include task-specific details like file names, IDs, or user names
- Focus on patterns, not outcomes
- Do not include any text outside the JSON object`;

function buildDistillUserMessage(spec: string, agentOutput: string): string {
    return [
        `## Task Description`,
        spec.slice(0, 1500),
        ``,
        `## Agent Output`,
        agentOutput.slice(0, 3000),
        ``,
        `Extract a generalizable lesson from this successful task completion.`,
    ].join('\n');
}

function resolveSpec(payload: Record<string, unknown>): string {
    if (typeof payload['goal_spec'] === 'string' && payload['goal_spec']) return payload['goal_spec'];
    if (typeof payload['summary'] === 'string' && payload['summary']) return payload['summary'];
    if (typeof payload['description'] === 'string' && payload['description']) return payload['description'];
    if (typeof payload['prompt'] === 'string' && payload['prompt']) return payload['prompt'];
    return '';
}

async function callDistill(spec: string, agentOutput: string): Promise<string | null> {
    const apiKey = process.env['AF_ANTHROPIC_API_KEY'] ?? process.env['AGENTFARM_ANTHROPIC_API_KEY'] ?? '';
    if (!apiKey) return null;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model: getModel(),
            max_tokens: 256,
            temperature: 0.3,
            system: DISTILL_SYSTEM,
            messages: [{ role: 'user', content: buildDistillUserMessage(spec, agentOutput) }],
        }),
        signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) return null;

    const data = await response.json() as {
        content?: Array<{ type: string; text?: string }>;
    };

    const text = data.content?.find((b) => b.type === 'text')?.text ?? '';
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1) return null;

    const parsed = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    const lesson = typeof parsed['lesson'] === 'string' ? parsed['lesson'].trim() : '';
    return lesson || null;
}

async function writeLesson(params: {
    lesson: string;
    actionType: string;
    workspaceId: string;
    tenantId: string;
    taskId: string;
}): Promise<void> {
    const { lesson, actionType, workspaceId, tenantId, taskId } = params;
    const base = (process.env['API_GATEWAY_URL'] ?? 'http://localhost:3000').replace(/\/+$/, '');
    const token = process.env['AGENTFARM_RUNTIME_TASK_SHARED_TOKEN'] ?? '';
    if (!token) return;

    const now = new Date().toISOString();
    const patternKey = `dream:${actionType}:${workspaceId}:${randomUUID()}`;

    await fetch(`${base}/v1/memory/patterns`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
            tenantId,
            workspaceId,
            pattern: patternKey,
            summary: lesson,
            confidence: 0.65,
            observedCount: 1,
            lastSeen: now,
            metadata: {
                sourceTaskId: taskId,
                actionType,
                workspaceId,
                tenantId,
                distilledAt: now,
            },
        }),
        signal: AbortSignal.timeout(10_000),
    });
}

export type DistillParams = {
    payload: Record<string, unknown>;
    agentOutput: string;
    workspaceId: string;
    tenantId: string;
    taskId: string;
};

/**
 * Extract a generalizable lesson from a successful task and write it to
 * long-term memory. Fire-and-forget — callers must NOT await this.
 *
 * Returns true if a lesson was distilled and written, false otherwise.
 * Errors are swallowed; this function never throws.
 */
export async function distillLesson(params: DistillParams): Promise<boolean> {
    if (!isEnabled()) return false;

    const { payload, agentOutput, workspaceId, tenantId, taskId } = params;

    const actionType = typeof payload['actionType'] === 'string' ? payload['actionType'] : 'unknown';
    if (SKIP_ACTION_TYPES.has(actionType)) return false;

    const spec = resolveSpec(payload);
    if (!spec || !agentOutput) return false;

    try {
        const lesson = await callDistill(spec, agentOutput);
        if (!lesson) return false;

        await writeLesson({ lesson, actionType, workspaceId, tenantId, taskId });
        return true;
    } catch {
        return false;
    }
}

export function isDreamDistillEnabled(): boolean {
    return isEnabled();
}
