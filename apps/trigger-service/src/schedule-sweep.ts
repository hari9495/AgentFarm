import type { PrismaClient } from '@prisma/client';
import { isDue, getNextRun } from './cron-utils.js';

// ---------------------------------------------------------------------------
// runScheduleSweep — fire all due enabled scheduled jobs
// ---------------------------------------------------------------------------

export async function runScheduleSweep(
    prisma: PrismaClient,
): Promise<{ fired: number }> {
    let fired = 0;

    const runtimeUrl = (process.env['AGENT_RUNTIME_URL'] ?? 'http://localhost:3001').replace(
        /\/+$/,
        '',
    );
    const url = `${runtimeUrl}/run-task`;

    try {
        const jobs = await prisma.scheduledJob.findMany({
            where: { enabled: true },
        });

        const now = new Date();

        for (const job of jobs) {
            if (!isDue(job, now)) continue;

            // Attempt to fire the task
            try {
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({
                        tenantId: job.tenantId,
                        goal: job.goal,
                        agentId: job.agentId ?? undefined,
                        triggeredBy: 'schedule',
                        scheduleId: job.id,
                    }),
                });

                if (!res.ok) {
                    const body = await res.text().catch(() => '');
                    console.error(
                        `[schedule-sweep] job ${job.id} run-task failed ${res.status}: ${body.slice(0, 200)}`,
                    );
                }
            } catch (err) {
                console.error(`[schedule-sweep] job ${job.id} fetch error:`, err);
            }

            // Always update timestamps so the job advances to its next slot
            await prisma.scheduledJob.update({
                where: { id: job.id },
                data: {
                    lastRunAt: now,
                    nextRunAt: getNextRun(job.cronExpr, now),
                },
            });

            fired += 1;
        }
    } catch (err) {
        console.error('[schedule-sweep] sweep failed:', err);
    }

    return { fired };
}

// ---------------------------------------------------------------------------
// startScheduleSweep — start recurring sweep, returns handle for clearInterval
// ---------------------------------------------------------------------------

export function startScheduleSweep(
    prisma: PrismaClient,
    intervalMs = 60_000,
): NodeJS.Timeout {
    runScheduleSweep(prisma).catch(console.error);
    return setInterval(() => {
        runScheduleSweep(prisma).catch(console.error);
    }, intervalMs);
}
