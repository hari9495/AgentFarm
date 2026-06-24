// ============================================================================
// Deferred-task sweep (C5) — releases shift-deferred tasks.
//
// Tasks parked off-shift (DeferredTask, runAfter = next shift open) are re-posted
// to the runtime once their shift opens. Durable across restarts: the queue
// lives in Postgres, not memory.
// ============================================================================

import type { PrismaClient } from '@prisma/client';

export type DeferredTaskSweepDeps = {
    fetcher?: (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<Response>;
    agentRuntimeUrl?: string;
    now?: () => Date;
};

const MAX_ATTEMPTS = 5;

export async function runDeferredTaskSweep(
    prisma: PrismaClient,
    deps: DeferredTaskSweepDeps = {},
): Promise<{ released: number; failed: number }> {
    const fetcher = deps.fetcher ?? ((url, init) => fetch(url, init as RequestInit));
    const now = deps.now ? deps.now() : new Date();
    const runtimeUrl = (deps.agentRuntimeUrl ?? process.env['AGENT_RUNTIME_URL'] ?? 'http://localhost:4000').replace(
        /\/+$/,
        '',
    );
    const runTaskUrl = `${runtimeUrl}/run-task`;

    let released = 0;
    let failed = 0;

    let due: Array<{ id: string; payload: unknown; attempts: number }>;
    try {
        due = (await (prisma as any).deferredTask.findMany({
            where: { status: 'pending', runAfter: { lte: now } },
            orderBy: { runAfter: 'asc' },
            take: 100,
        })) as typeof due;
    } catch (err) {
        console.error('[deferred-task-sweep] load failed:', err);
        return { released, failed };
    }

    for (const task of due) {
        try {
            const res = await fetcher(runTaskUrl, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(task.payload ?? {}),
            });
            if (!res.ok) {
                const body = await res.text().catch(() => '');
                throw new Error(`run-task ${res.status}: ${body.slice(0, 200)}`);
            }
            await (prisma as any).deferredTask.update({
                where: { id: task.id },
                data: { status: 'released', releasedAt: now, attempts: task.attempts + 1, lastError: null },
            });
            released += 1;
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            const attempts = task.attempts + 1;
            await (prisma as any).deferredTask
                .update({
                    where: { id: task.id },
                    data: {
                        attempts,
                        lastError: message,
                        // Give up after MAX_ATTEMPTS so a poisoned task can't loop forever.
                        status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
                    },
                })
                .catch(() => undefined);
            failed += 1;
            console.error(`[deferred-task-sweep] task ${task.id} release failed:`, message);
        }
    }

    return { released, failed };
}

export function startDeferredTaskSweep(
    prisma: PrismaClient,
    deps: DeferredTaskSweepDeps = {},
    intervalMs = 60_000,
): NodeJS.Timeout {
    runDeferredTaskSweep(prisma, deps).catch(console.error);
    return setInterval(() => {
        runDeferredTaskSweep(prisma, deps).catch(console.error);
    }, intervalMs);
}
