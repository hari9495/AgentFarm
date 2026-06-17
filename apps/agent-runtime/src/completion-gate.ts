/**
 * completion-gate.ts — DB-truth validation before marking a task complete.
 *
 * Before a task result is accepted as 'success', this gate queries for any
 * sub-tasks or child records that are still open. If the agent self-reports
 * success but open children remain, the gate returns a reentry nudge listing
 * the incomplete items so the task can be re-queued.
 *
 * "DB truth beats self-report" — the task store is authoritative, not what
 * the agent wrote in its output.
 *
 * The gate accepts an injectable query function so callers control how child
 * tasks are fetched (Prisma, REST, in-memory for tests, etc.).
 *
 * See docs/QUALITY_GATES.md for the full design.
 */

function isEnabled(): boolean {
    return (
        process.env['AF_COMPLETION_GATE_ENABLED'] === 'true' ||
        process.env['AF_COMPLETION_GATE_ENABLED'] === '1'
    );
}

function getMaxReentry(): number {
    return parseInt(process.env['AF_COMPLETION_GATE_MAX_REENTRY'] ?? '2', 10);
}

// Task statuses considered "open" (incomplete)
const OPEN_STATUSES = new Set(['todo', 'in_progress', 'blocked', 'pending']);

export type OpenChild = {
    id: string;
    title: string;
    status: string;
};

export type ChildTaskQueryFn = (taskId: string, tenantId: string) => Promise<OpenChild[]>;

export type CompletionGateResult =
    | { pass: true }
    | { pass: false; openChildren: OpenChild[]; reentryText: string; reentryCount: number }
    | { pass: true; downgraded: true; reason: string };

function buildReentryText(openChildren: OpenChild[]): string {
    return [
        'You reported completion, but these sub-tasks are still open:',
        ...openChildren.map((c) => `- ${c.id} (${c.status}): ${c.title}`),
        '',
        'For EACH: complete the work, then mark it done or abandoned.',
        'Then re-submit your result.',
    ].join('\n');
}

/**
 * Default no-op query — returns no open children.
 * Callers with DB access should supply their own queryFn.
 */
export const noopChildQueryFn: ChildTaskQueryFn = async () => [];

/**
 * Check whether all children of taskId are in a terminal state.
 *
 * Returns:
 *   { pass: true }                                    — all children terminal, proceed
 *   { pass: false, openChildren, reentryText, count } — open children remain, re-queue
 *   { pass: true, downgraded: true, reason }          — cap reached, accept as partial
 *
 * All errors return { pass: true } — gate failures never block execution.
 */
export async function checkCompletion(
    taskId: string,
    tenantId: string,
    reentryCount = 0,
    queryFn: ChildTaskQueryFn = noopChildQueryFn,
): Promise<CompletionGateResult> {
    if (!isEnabled()) return { pass: true };

    const maxReentry = getMaxReentry();

    try {
        const children = await queryFn(taskId, tenantId);
        const open = children.filter((c) => OPEN_STATUSES.has(c.status));

        if (open.length === 0) return { pass: true };

        if (reentryCount >= maxReentry) {
            console.warn(
                `[completion-gate] reentry cap reached (${reentryCount}/${maxReentry}) for task=${taskId}. ` +
                `Accepting with ${open.length} open children as partial.`,
            );
            return {
                pass: true,
                downgraded: true,
                reason: `Accepted after ${maxReentry} reentry attempts with ${open.length} open sub-tasks.`,
            };
        }

        console.info(
            `[completion-gate] task=${taskId} has ${open.length} open children. ` +
            `reentryCount=${reentryCount + 1}/${maxReentry}`,
        );

        return {
            pass: false,
            openChildren: open,
            reentryText: buildReentryText(open),
            reentryCount: reentryCount + 1,
        };
    } catch (err) {
        console.warn(`[completion-gate] query failed for task=${taskId}, skipping gate:`, err);
        return { pass: true };
    }
}

export function isCompletionGateEnabled(): boolean {
    return isEnabled();
}
