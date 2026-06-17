/**
 * goal-judge.ts — Independent completion verification for task results.
 *
 * After an agent reports success, an independent LLM call reads the task spec
 * alongside the agent output and returns a structured verdict. This catches
 * "optimistic stops" — agents that mark tasks complete before the objective
 * is actually met.
 *
 * The judge runs cold (no shared context with the working agent) and uses a
 * cheaper model by default. All errors are swallowed — the judge never blocks
 * task completion.
 *
 * See docs/QUALITY_GATES.md for the full design.
 */

const ENABLED = process.env['AF_GOAL_JUDGE_ENABLED'] === 'true' || process.env['AF_GOAL_JUDGE_ENABLED'] === '1';
const JUDGE_MODEL = process.env['AF_GOAL_JUDGE_MODEL'] ?? 'claude-haiku-4-5-20251001';
const CONFIDENCE_THRESHOLD = parseFloat(process.env['AF_GOAL_JUDGE_CONFIDENCE_THRESHOLD'] ?? '0.7');
const MAX_REQUEUE = parseInt(process.env['AF_GOAL_JUDGE_MAX_REQUEUE'] ?? '2', 10);

// Read-only action types where judging adds no value
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

export type GoalVerdict = {
    ok: boolean;
    confidence: number;
    reason: string;
    impossible?: boolean;
};

export type GoalJudgeResult =
    | { action: 'accept' }
    | { action: 'requeue'; requeueCount: number; feedback: string }
    | { action: 'abandon'; reason: string };

const JUDGE_SYSTEM = `You are an independent quality judge for an AI agent task system.

You will be given:
1. A task specification (the goal the agent was asked to achieve)
2. The agent's output (what it produced)

Your job is to determine whether the task goal has actually been satisfied.

Respond with ONLY a valid JSON object in this exact shape:
{
  "ok": boolean,
  "confidence": number,
  "reason": string,
  "impossible": boolean
}

Rules:
- "ok": true only if the goal is clearly and fully satisfied by the output
- "confidence": 0.0 to 1.0 — how certain you are of your verdict
- "reason": when ok=true, quote specific evidence from the output; when ok=false, explain what is missing
- "impossible": true only if the goal is structurally unreachable (e.g., asked to modify a file that doesn't exist and cannot be created)
- When uncertain, set ok=false with a lower confidence rather than guessing ok=true
- Do not include any text outside the JSON object`;

function buildJudgeUserMessage(spec: string, agentOutput: string): string {
    return [
        `## Task Specification`,
        spec.slice(0, 2000),
        ``,
        `## Agent Output`,
        agentOutput.slice(0, 4000),
        ``,
        `Has the task goal been fully satisfied? Respond with the JSON verdict.`,
    ].join('\n');
}

async function callJudge(spec: string, agentOutput: string): Promise<GoalVerdict | null> {
    const apiKey = process.env['AF_ANTHROPIC_API_KEY'] ?? process.env['AGENTFARM_ANTHROPIC_API_KEY'] ?? '';
    if (!apiKey) return null;

    try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: JUDGE_MODEL,
                max_tokens: 512,
                temperature: 0,
                system: JUDGE_SYSTEM,
                messages: [{ role: 'user', content: buildJudgeUserMessage(spec, agentOutput) }],
            }),
            signal: AbortSignal.timeout(30_000),
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
        const ok = parsed['ok'] === true;
        const confidence = typeof parsed['confidence'] === 'number'
            ? Math.max(0, Math.min(1, parsed['confidence']))
            : 0.5;
        const reason = typeof parsed['reason'] === 'string' ? parsed['reason'] : '';
        const impossible = parsed['impossible'] === true;

        return { ok, confidence, reason, impossible };
    } catch {
        return null;
    }
}

export function resolveSpec(payload: Record<string, unknown>): string {
    if (typeof payload['goal_spec'] === 'string' && payload['goal_spec']) return payload['goal_spec'];
    if (typeof payload['summary'] === 'string' && payload['summary']) return payload['summary'];
    if (typeof payload['description'] === 'string' && payload['description']) return payload['description'];
    if (typeof payload['prompt'] === 'string' && payload['prompt']) return payload['prompt'];
    return '';
}

function shouldSkip(payload: Record<string, unknown>): boolean {
    if (payload['skip_goal_judge'] === true) return true;
    const actionType = typeof payload['actionType'] === 'string' ? payload['actionType'] : '';
    return SKIP_ACTION_TYPES.has(actionType);
}

/**
 * Evaluate whether a completed task actually satisfied its goal.
 *
 * Returns:
 *   { action: 'accept' }                      — goal satisfied, proceed
 *   { action: 'requeue', feedback, count }    — not satisfied, re-queue with feedback
 *   { action: 'abandon', reason }             — impossible goal, surface to operator
 *
 * All errors return { action: 'accept' } — judge failures never block execution.
 */
export async function evaluateGoal(
    payload: Record<string, unknown>,
    agentOutput: string,
    requeueCount = 0,
): Promise<GoalJudgeResult> {
    if (!ENABLED) return { action: 'accept' };
    if (shouldSkip(payload)) return { action: 'accept' };

    const spec = resolveSpec(payload);
    if (!spec) return { action: 'accept' };

    try {
        const verdict = await callJudge(spec, agentOutput);

        if (!verdict) return { action: 'accept' };

        if (verdict.impossible) {
            return { action: 'abandon', reason: verdict.reason };
        }

        if (verdict.ok && verdict.confidence >= CONFIDENCE_THRESHOLD) {
            return { action: 'accept' };
        }

        if (requeueCount >= MAX_REQUEUE) {
            // Cap reached — downgrade to accept to avoid infinite loops
            console.warn(
                `[goal-judge] requeue cap reached (${requeueCount}/${MAX_REQUEUE}), accepting despite low confidence. reason=${verdict.reason}`,
            );
            return { action: 'accept' };
        }

        const feedback = verdict.ok
            ? `Goal may be satisfied but judge confidence is low (${verdict.confidence.toFixed(2)} < ${CONFIDENCE_THRESHOLD}). ${verdict.reason}`
            : `Goal not yet satisfied. ${verdict.reason}`;

        console.info(
            `[goal-judge] requeue count=${requeueCount + 1} ok=${verdict.ok} confidence=${verdict.confidence.toFixed(2)} reason=${verdict.reason}`,
        );

        return { action: 'requeue', requeueCount: requeueCount + 1, feedback };
    } catch {
        return { action: 'accept' };
    }
}

export function isGoalJudgeEnabled(): boolean {
    return ENABLED;
}

/**
 * Score a single agent output against a task spec.
 * Returns confidence 0–1 (0.5 when judge is unavailable or errors).
 * Used by Max Mode to rank parallel candidates without a pass/fail verdict.
 */
export async function judgeScore(spec: string, agentOutput: string): Promise<number> {
    if (!spec || !agentOutput) return 0.5;
    try {
        const verdict = await callJudge(spec, agentOutput);
        return verdict?.confidence ?? 0.5;
    } catch {
        return 0.5;
    }
}
