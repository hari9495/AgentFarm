/**
 * Output Correctness Verifier
 *
 * When the runtime fires an evaluator webhook it stores the heuristic quality
 * score for that task here.  When the external evaluator POSTs a score back
 * via /runtime/quality/signals (source=evaluator), checkEvaluatorResult()
 * compares the two scores.  A divergence ≥ DIVERGENCE_THRESHOLD triggers a
 * quality_divergence notification so operators know the LLM output may not
 * match what actually happened in the external system.
 */

const DIVERGENCE_THRESHOLD = 0.3;
const ENTRY_TTL_MS = 10 * 60 * 1_000; // 10 minutes — enough for any reasonable evaluator round-trip

type PendingEntry = {
    score: number;
    tenantId: string;
    workspaceId: string;
    botId: string;
    actionType: string;
    expiresAt: number;
};

const pending = new Map<string, PendingEntry>();

export function storeHeuristicScore(
    taskId: string,
    score: number,
    meta: { tenantId: string; workspaceId: string; botId: string; actionType: string },
): void {
    pending.set(taskId, {
        score,
        ...meta,
        expiresAt: Date.now() + ENTRY_TTL_MS,
    });
}

export async function checkEvaluatorResult(
    taskId: string,
    evaluatorScore: number,
): Promise<{ flagged: boolean; divergence: number }> {
    const entry = pending.get(taskId);
    pending.delete(taskId);

    if (!entry || Date.now() > entry.expiresAt) {
        return { flagged: false, divergence: 0 };
    }

    const divergence = Math.abs(entry.score - evaluatorScore);
    if (divergence < DIVERGENCE_THRESHOLD) {
        return { flagged: false, divergence };
    }

    console.warn(
        `[output-verifier] quality_divergence task=${taskId}` +
        ` heuristic=${entry.score.toFixed(3)} evaluator=${evaluatorScore.toFixed(3)}` +
        ` divergence=${divergence.toFixed(3)}`,
    );

    const baseUrl = process.env['API_GATEWAY_URL'] ?? 'http://localhost:3000';
    fetch(`${baseUrl}/v1/notifications/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            tenantId: entry.tenantId,
            workspaceId: entry.workspaceId,
            channel: 'internal',
            eventTrigger: 'quality_divergence',
            status: 'sent',
            payload: {
                taskId,
                botId: entry.botId,
                actionType: entry.actionType,
                heuristicScore: entry.score,
                evaluatorScore,
                divergence,
                threshold: DIVERGENCE_THRESHOLD,
            },
        }),
        signal: AbortSignal.timeout(4_000),
    }).catch((err: unknown) => {
        console.error('[output-verifier] failed to post quality_divergence notification', err);
    });

    return { flagged: true, divergence };
}

/** Purge expired entries to prevent unbounded growth on a long-lived process. */
export function purgeStalePendingEntries(): void {
    const now = Date.now();
    for (const [id, entry] of pending.entries()) {
        if (now > entry.expiresAt) {
            pending.delete(id);
        }
    }
}
