/**
 * Approval Rejection Rate Alerter
 *
 * Tracks approval outcomes across recent tasks in a sliding window.  When the
 * rejection rate exceeds REJECTION_RATE_THRESHOLD (default 40%), an
 * approval_rejection_high notification is fired so an operator can review
 * whether the agent is systematically proposing out-of-policy actions.
 *
 * The window is per-process, not per-workspace, because each runtime process
 * serves a single bot.  A multi-bot host would need a per-workspace window —
 * but that's not the current deployment model.
 */

const REJECTION_RATE_THRESHOLD = 0.4;
const WINDOW_SIZE = 20; // last N tasks

const recentOutcomes: boolean[] = []; // true = that task had at least one rejection

export function trackApprovalOutcomes(
    approvalOutcomes: Array<{ decision: 'approved' | 'rejected' }>,
): { currentRate: number; shouldAlert: boolean } {
    const hadRejection = approvalOutcomes.some((o) => o.decision === 'rejected');
    recentOutcomes.push(hadRejection);
    if (recentOutcomes.length > WINDOW_SIZE) {
        recentOutcomes.shift();
    }

    const rejectedCount = recentOutcomes.filter(Boolean).length;
    const currentRate = recentOutcomes.length > 0 ? rejectedCount / recentOutcomes.length : 0;
    return { currentRate, shouldAlert: currentRate >= REJECTION_RATE_THRESHOLD };
}

export async function emitApprovalRejectionAlert(params: {
    tenantId: string;
    workspaceId: string;
    botId: string;
    taskId: string;
    currentRate: number;
}): Promise<void> {
    const pct = Math.round(params.currentRate * 100);
    const thresholdPct = Math.round(REJECTION_RATE_THRESHOLD * 100);

    console.warn(
        `[approval-alert] approval_rejection_high bot=${params.botId}` +
        ` rate=${pct}% (threshold ${thresholdPct}%) task=${params.taskId}`,
    );

    const baseUrl = process.env['API_GATEWAY_URL'] ?? 'http://localhost:3000';
    try {
        await fetch(`${baseUrl}/v1/notifications/log`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tenantId: params.tenantId,
                workspaceId: params.workspaceId,
                channel: 'internal',
                eventTrigger: 'approval_rejection_high',
                status: 'sent',
                payload: {
                    botId: params.botId,
                    taskId: params.taskId,
                    rejectionRate: params.currentRate,
                    rejectionPct: pct,
                    threshold: REJECTION_RATE_THRESHOLD,
                    thresholdPct,
                    windowSize: WINDOW_SIZE,
                },
            }),
            signal: AbortSignal.timeout(4_000),
        });
    } catch (err) {
        console.error('[approval-alert] failed to post approval_rejection_high notification', err);
    }
}

/** Exposed for tests that need a clean slate. */
export function resetApprovalWindow(): void {
    recentOutcomes.length = 0;
}
