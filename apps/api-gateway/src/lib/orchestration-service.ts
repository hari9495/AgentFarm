import type { PrismaClient } from '@prisma/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StartOrchestrationInput = {
    tenantId: string;
    workspaceId: string;
    coordinatorBotId: string;
    goal: string;
    subTasks: Array<{ toAgentId: string; taskDescription: string }>;
};

export type CompleteSubTaskOutcome = {
    success: boolean;
    result?: unknown;
    errorMessage?: string;
};

// ---------------------------------------------------------------------------
// startOrchestrationRun
// ---------------------------------------------------------------------------

export async function startOrchestrationRun(
    prisma: PrismaClient,
    input: StartOrchestrationInput,
) {
    if (!input.subTasks || input.subTasks.length === 0) {
        const err = new Error('subTasks must not be empty');
        (err as any).statusCode = 400;
        throw err;
    }

    const run = await prisma.orchestrationRun.create({
        data: {
            tenantId: input.tenantId,
            workspaceId: input.workspaceId,
            coordinatorBotId: input.coordinatorBotId,
            goal: input.goal,
            status: 'running',
            subTaskCount: input.subTasks.length,
        },
    });

    const dispatches = await Promise.all(
        input.subTasks.map((subTask, index) =>
            prisma.agentDispatchRecord.create({
                data: {
                    fromAgentId: input.coordinatorBotId,
                    toAgentId: subTask.toAgentId,
                    taskDescription: subTask.taskDescription,
                    workspaceId: input.workspaceId,
                    tenantId: input.tenantId,
                    status: 'queued',
                    wakeSource: 'orchestration',
                    orchestrationRunId: run.id,
                    subTaskIndex: index,
                },
            }),
        ),
    );

    return { ...run, dispatches };
}

// ---------------------------------------------------------------------------
// completeSubTask
// ---------------------------------------------------------------------------

export async function completeSubTask(
    prisma: PrismaClient,
    dispatchId: string,
    outcome: CompleteSubTaskOutcome,
) {
    // 1. Fetch dispatch; throw 404 if not found
    const dispatch = await prisma.agentDispatchRecord.findUnique({ where: { id: dispatchId } });
    if (!dispatch) {
        const err = new Error(`AgentDispatchRecord not found: ${dispatchId}`);
        (err as any).statusCode = 404;
        throw err;
    }

    // 2. Update the dispatch row
    await prisma.agentDispatchRecord.update({
        where: { id: dispatchId },
        data: {
            status: outcome.success ? 'completed' : 'failed',
            completedAt: new Date(),
            result: outcome.result !== undefined ? (outcome.result as any) : null,
            errorMessage: outcome.errorMessage ?? null,
        },
    });

    // 3. If dispatch has no orchestration run, return early
    if (!dispatch.orchestrationRunId) return null;

    const runId = dispatch.orchestrationRunId;

    // 4. Atomically increment counters on the run
    const updatedRun = await (prisma.$transaction as any)(async (tx: any) => {
        return (tx as PrismaClient).orchestrationRun.update({
            where: { id: runId },
            data: {
                completedCount: { increment: 1 } as any,
                ...(outcome.success ? {} : { failedCount: { increment: 1 } as any }),
            },
        });
    });

    // 5. If all sub-tasks are now complete, finalize the run
    if (updatedRun.completedCount === updatedRun.subTaskCount) {
        const allDispatches = await prisma.agentDispatchRecord.findMany({
            where: { orchestrationRunId: runId },
        });

        if (updatedRun.failedCount === 0) {
            return prisma.orchestrationRun.update({
                where: { id: runId },
                data: {
                    status: 'completed',
                    result: {
                        subResults: allDispatches.map((d: any) => ({
                            index: d.subTaskIndex,
                            toAgentId: d.toAgentId,
                            result: d.result,
                        })),
                    } as any,
                    completedAt: new Date(),
                },
            });
        } else {
            return prisma.orchestrationRun.update({
                where: { id: runId },
                data: {
                    status: 'failed',
                    errorSummary: `${updatedRun.failedCount} of ${updatedRun.subTaskCount} sub-tasks failed`,
                    completedAt: new Date(),
                },
            });
        }
    }

    return updatedRun;
}

// ---------------------------------------------------------------------------
// cancelOrchestrationRun
// ---------------------------------------------------------------------------

export async function cancelOrchestrationRun(
    prisma: PrismaClient,
    runId: string,
    tenantId: string,
) {
    const run = await prisma.orchestrationRun.findUnique({ where: { id: runId } });
    if (!run || run.tenantId !== tenantId) {
        const err = new Error(`OrchestrationRun not found: ${runId}`);
        (err as any).statusCode = 404;
        throw err;
    }

    if (['completed', 'failed', 'cancelled'].includes(run.status)) {
        const err = new Error(`Cannot cancel run with status: ${run.status}`);
        (err as any).statusCode = 409;
        throw err;
    }

    await prisma.agentDispatchRecord.updateMany({
        where: { orchestrationRunId: runId, status: 'queued' },
        data: { status: 'cancelled' },
    });

    return prisma.orchestrationRun.update({
        where: { id: runId },
        data: { status: 'cancelled', completedAt: new Date() },
    });
}
