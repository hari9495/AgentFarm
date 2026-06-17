/**
 * checkpoint.ts — Structured mid-task progress snapshots.
 *
 * When a task is requeued by the Completion Gate or Goal Judge, the agent's
 * partial output is saved to Redis under a TTL key. The next run loads the
 * checkpoint and injects it as context so the agent can continue from where
 * it left off rather than starting from scratch.
 *
 * All Redis operations fail silently — checkpoints never block execution.
 *
 * See docs/QUALITY_GATES.md §7 for the full design.
 */

import { getRedisClient } from '@agentfarm/redis-client';

export type TaskCheckpoint = {
    taskId: string;
    stepIndex: number;
    partialOutput: string;
    actionType: string;
    savedAt: string;
};

function isEnabled(): boolean {
    return (
        process.env['AF_CHECKPOINT_ENABLED'] === 'true' ||
        process.env['AF_CHECKPOINT_ENABLED'] === '1'
    );
}

function getTtl(): number {
    const raw = process.env['AF_CHECKPOINT_TTL_SECONDS'];
    if (raw) {
        const n = parseInt(raw, 10);
        if (!isNaN(n) && n > 0) return n;
    }
    return 86400;
}

function checkpointKey(taskId: string): string {
    return `ckpt:${taskId}`;
}

export async function saveCheckpoint(checkpoint: TaskCheckpoint): Promise<void> {
    try {
        const redis = getRedisClient();
        if (!redis) return;
        await redis.set(checkpointKey(checkpoint.taskId), JSON.stringify(checkpoint), 'EX', getTtl());
    } catch {
        // fail silently — checkpoints are best-effort
    }
}

export async function loadCheckpoint(taskId: string): Promise<TaskCheckpoint | null> {
    try {
        const redis = getRedisClient();
        if (!redis) return null;
        const raw = await redis.get(checkpointKey(taskId));
        if (!raw) return null;
        return JSON.parse(raw) as TaskCheckpoint;
    } catch {
        return null;
    }
}

export async function clearCheckpoint(taskId: string): Promise<void> {
    try {
        const redis = getRedisClient();
        if (!redis) return;
        await redis.del(checkpointKey(taskId));
    } catch {
        // fail silently
    }
}

/**
 * Pure function — prepends a prior-progress block to the task's primary prompt
 * field so the agent continues from where it left off.
 *
 * Priority order for prompt field injection: goal_spec → prompt → description → summary.
 * If none are found, injects as a standalone `prior_checkpoint` field.
 */
export function injectCheckpointIntoPayload(
    payload: Record<string, unknown>,
    checkpoint: TaskCheckpoint,
): Record<string, unknown> {
    const prefix = [
        `[CHECKPOINT: step ${checkpoint.stepIndex}, saved ${checkpoint.savedAt}]`,
        `Prior progress:`,
        checkpoint.partialOutput.slice(0, 2000),
        `---`,
        `Continue from where you left off. Do not repeat completed work.`,
        ``,
    ].join('\n');

    const fields = ['goal_spec', 'prompt', 'description', 'summary'] as const;
    for (const field of fields) {
        if (typeof payload[field] === 'string' && payload[field]) {
            return { ...payload, [field]: `${prefix}\n${payload[field] as string}` };
        }
    }

    return { ...payload, prior_checkpoint: prefix };
}

export function isCheckpointEnabled(): boolean {
    return isEnabled();
}
