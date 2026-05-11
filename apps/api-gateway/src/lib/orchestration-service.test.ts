import test from 'node:test';
import assert from 'node:assert/strict';
import {
    startOrchestrationRun,
    completeSubTask,
    cancelOrchestrationRun,
} from './orchestration-service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeRun = (overrides: Record<string, unknown> = {}) => ({
    id: 'run_1',
    tenantId: 'tenant_1',
    workspaceId: 'ws_1',
    coordinatorBotId: 'bot_1',
    goal: 'Analyse and fix',
    status: 'running',
    subTaskCount: 2,
    completedCount: 0,
    failedCount: 0,
    result: null,
    errorSummary: null,
    startedAt: new Date(),
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
});

const makeDispatch = (overrides: Record<string, unknown> = {}) => ({
    id: 'dispatch_1',
    fromAgentId: 'bot_1',
    toAgentId: 'agent_security',
    workspaceId: 'ws_1',
    tenantId: 'tenant_1',
    taskDescription: 'Run security review',
    status: 'queued',
    wakeSource: 'orchestration',
    orchestrationRunId: 'run_1',
    subTaskIndex: 0,
    completedAt: null,
    result: null,
    errorMessage: null,
    queuedAt: new Date(),
    createdAt: new Date(),
    ...overrides,
});

const baseInput = {
    tenantId: 'tenant_1',
    workspaceId: 'ws_1',
    coordinatorBotId: 'bot_1',
    goal: 'Analyse and fix',
    subTasks: [
        { toAgentId: 'agent_security', taskDescription: 'Security review' },
        { toAgentId: 'agent_lint', taskDescription: 'Lint check' },
    ],
};

// ---------------------------------------------------------------------------
// startOrchestrationRun tests
// ---------------------------------------------------------------------------

// 1. throws on empty subTasks array
test('startOrchestrationRun — throws on empty subTasks array', async () => {
    const prisma: any = {};
    await assert.rejects(
        () => startOrchestrationRun(prisma, { ...baseInput, subTasks: [] }),
        (err: any) => {
            assert.equal(err.statusCode, 400);
            assert.match(err.message, /subTasks must not be empty/);
            return true;
        },
    );
});

// 2. creates OrchestrationRun with correct subTaskCount
test('startOrchestrationRun — creates OrchestrationRun with correct subTaskCount', async () => {
    let createdRunData: any;
    const dispatches: any[] = [];

    const prisma: any = {
        orchestrationRun: {
            create: async ({ data }: any) => {
                createdRunData = data;
                return makeRun({ ...data, id: 'run_1' });
            },
        },
        agentDispatchRecord: {
            create: async ({ data }: any) => {
                const d = makeDispatch({ ...data, id: `d_${dispatches.length}` });
                dispatches.push(d);
                return d;
            },
        },
    };

    const result = await startOrchestrationRun(prisma, baseInput);
    assert.equal(createdRunData.subTaskCount, 2);
    assert.equal(result.subTaskCount, 2);
});

// 3. creates one AgentDispatchRecord per subTask
test('startOrchestrationRun — creates one AgentDispatchRecord per subTask', async () => {
    const created: any[] = [];
    const prisma: any = {
        orchestrationRun: {
            create: async ({ data }: any) => makeRun({ ...data, id: 'run_1' }),
        },
        agentDispatchRecord: {
            create: async ({ data }: any) => {
                const d = makeDispatch({ ...data, id: `d_${created.length}` });
                created.push(d);
                return d;
            },
        },
    };

    const input = {
        ...baseInput,
        subTasks: [
            { toAgentId: 'agent_a', taskDescription: 'Task A' },
            { toAgentId: 'agent_b', taskDescription: 'Task B' },
            { toAgentId: 'agent_c', taskDescription: 'Task C' },
        ],
    };

    const result = await startOrchestrationRun(prisma, input);
    assert.equal(created.length, 3);
    assert.equal(result.dispatches.length, 3);
});

// 4. sets orchestrationRunId and subTaskIndex on each dispatch
test('startOrchestrationRun — sets orchestrationRunId and subTaskIndex on each dispatch', async () => {
    const created: any[] = [];
    const prisma: any = {
        orchestrationRun: {
            create: async ({ data }: any) => makeRun({ ...data, id: 'run_42' }),
        },
        agentDispatchRecord: {
            create: async ({ data }: any) => {
                created.push(data);
                return makeDispatch({ ...data, id: `d_${created.length - 1}` });
            },
        },
    };

    await startOrchestrationRun(prisma, baseInput);

    assert.equal(created[0].orchestrationRunId, 'run_42');
    assert.equal(created[0].subTaskIndex, 0);
    assert.equal(created[1].orchestrationRunId, 'run_42');
    assert.equal(created[1].subTaskIndex, 1);
});

// 5. sets wakeSource 'orchestration' on all dispatches
test('startOrchestrationRun — sets wakeSource \'orchestration\' on all dispatches', async () => {
    const created: any[] = [];
    const prisma: any = {
        orchestrationRun: {
            create: async ({ data }: any) => makeRun({ ...data, id: 'run_1' }),
        },
        agentDispatchRecord: {
            create: async ({ data }: any) => {
                created.push(data);
                return makeDispatch(data);
            },
        },
    };

    await startOrchestrationRun(prisma, baseInput);
    assert.ok(created.every((d) => d.wakeSource === 'orchestration'));
});

// ---------------------------------------------------------------------------
// completeSubTask tests
// ---------------------------------------------------------------------------

// 6. updates dispatch status to 'completed' on success
test('completeSubTask — updates dispatch status to \'completed\' on success', async () => {
    let updatedDispatchData: any;
    const dispatch = makeDispatch();

    const prisma: any = {
        agentDispatchRecord: {
            findUnique: async () => dispatch,
            update: async ({ data }: any) => {
                updatedDispatchData = data;
                return { ...dispatch, ...data };
            },
            findMany: async () => [dispatch],
        },
        orchestrationRun: {
            update: async ({ data }: any) =>
                makeRun({ completedCount: 1, subTaskCount: 2, ...data }),
        },
        $transaction: async (fn: any) => fn(prisma),
    };

    await completeSubTask(prisma, 'dispatch_1', { success: true });
    assert.equal(updatedDispatchData.status, 'completed');
});

// 7. updates dispatch status to 'failed' on failure
test('completeSubTask — updates dispatch status to \'failed\' on failure', async () => {
    let updatedDispatchData: any;
    const dispatch = makeDispatch();

    const prisma: any = {
        agentDispatchRecord: {
            findUnique: async () => dispatch,
            update: async ({ data }: any) => {
                updatedDispatchData = data;
                return { ...dispatch, ...data };
            },
            findMany: async () => [dispatch],
        },
        orchestrationRun: {
            update: async ({ data }: any) =>
                makeRun({ completedCount: 1, failedCount: 1, subTaskCount: 2, ...data }),
        },
        $transaction: async (fn: any) => fn(prisma),
    };

    await completeSubTask(prisma, 'dispatch_1', {
        success: false,
        errorMessage: 'Agent crashed',
    });
    assert.equal(updatedDispatchData.status, 'failed');
});

// 8. increments completedCount and failedCount correctly
test('completeSubTask — increments completedCount and failedCount correctly', async () => {
    const runUpdateCalls: any[] = [];
    const dispatch = makeDispatch();

    const prisma: any = {
        agentDispatchRecord: {
            findUnique: async () => dispatch,
            update: async () => dispatch,
            findMany: async () => [dispatch],
        },
        orchestrationRun: {
            update: async ({ data }: any) => {
                runUpdateCalls.push(data);
                return makeRun({ completedCount: 1, failedCount: 1, subTaskCount: 2 });
            },
        },
        $transaction: async (fn: any) => fn(prisma),
    };

    await completeSubTask(prisma, 'dispatch_1', { success: false });

    // First run update (inside $transaction) should increment completedCount and failedCount
    const txData = runUpdateCalls[0];
    assert.deepEqual(txData.completedCount, { increment: 1 });
    assert.deepEqual(txData.failedCount, { increment: 1 });
});

// 9. sets run status to 'completed' when all sub-tasks done
test('completeSubTask — sets run status to \'completed\' when all sub-tasks done', async () => {
    const finalRunUpdates: any[] = [];
    const dispatch = makeDispatch();
    // After transaction: completedCount === subTaskCount, failedCount === 0
    const runAfterTx = makeRun({ completedCount: 2, failedCount: 0, subTaskCount: 2 });

    const prisma: any = {
        agentDispatchRecord: {
            findUnique: async () => dispatch,
            update: async () => dispatch,
            findMany: async () => [dispatch, makeDispatch({ id: 'dispatch_2', subTaskIndex: 1 })],
        },
        orchestrationRun: {
            update: async ({ data }: any) => {
                finalRunUpdates.push(data);
                return { ...runAfterTx, ...data };
            },
        },
        $transaction: async (fn: any) => fn({
            orchestrationRun: {
                update: async () => runAfterTx,
            },
        }),
    };

    const result: any = await completeSubTask(prisma, 'dispatch_1', { success: true });
    assert.equal(result.status, 'completed');
    // The final update call should set status to 'completed'
    const finalUpdate = finalRunUpdates[finalRunUpdates.length - 1];
    assert.equal(finalUpdate.status, 'completed');
});

// 10. sets run status to 'failed' when all done but some failed
test('completeSubTask — sets run status to \'failed\' when all done but some failed', async () => {
    const finalRunUpdates: any[] = [];
    const dispatch = makeDispatch();
    const runAfterTx = makeRun({ completedCount: 2, failedCount: 1, subTaskCount: 2 });

    const prisma: any = {
        agentDispatchRecord: {
            findUnique: async () => dispatch,
            update: async () => dispatch,
            findMany: async () => [dispatch],
        },
        orchestrationRun: {
            update: async ({ data }: any) => {
                finalRunUpdates.push(data);
                return { ...runAfterTx, ...data };
            },
        },
        $transaction: async (fn: any) => fn({
            orchestrationRun: {
                update: async () => runAfterTx,
            },
        }),
    };

    const result: any = await completeSubTask(prisma, 'dispatch_1', { success: false });
    assert.equal(result.status, 'failed');
    const finalUpdate = finalRunUpdates[finalRunUpdates.length - 1];
    assert.ok(typeof finalUpdate.errorSummary === 'string');
    assert.match(finalUpdate.errorSummary, /1 of 2 sub-tasks failed/);
});

// 11. does not finalise run when sub-tasks still pending
test('completeSubTask — does not finalise run when sub-tasks still pending', async () => {
    let finalizeCallCount = 0;
    const dispatch = makeDispatch();
    // After transaction: completedCount (1) < subTaskCount (3) — not all done
    const runAfterTx = makeRun({ completedCount: 1, failedCount: 0, subTaskCount: 3 });

    const prisma: any = {
        agentDispatchRecord: {
            findUnique: async () => dispatch,
            update: async () => dispatch,
            findMany: async () => [dispatch],
        },
        orchestrationRun: {
            update: async ({ data }: any) => {
                finalizeCallCount++;
                return { ...runAfterTx, ...data };
            },
        },
        $transaction: async (fn: any) => fn({
            orchestrationRun: {
                update: async () => runAfterTx,
            },
        }),
    };

    const result: any = await completeSubTask(prisma, 'dispatch_1', { success: true });
    // Should return runAfterTx without calling orchestrationRun.update at all
    assert.equal(finalizeCallCount, 0);
    assert.equal(result.completedCount, 1);
    assert.equal(result.subTaskCount, 3);
});

// ---------------------------------------------------------------------------
// cancelOrchestrationRun tests
// ---------------------------------------------------------------------------

// 12. throws 404 when run not found
test('cancelOrchestrationRun — throws 404 when run not found', async () => {
    const prisma: any = {
        orchestrationRun: {
            findUnique: async () => null,
        },
    };

    await assert.rejects(
        () => cancelOrchestrationRun(prisma, 'run_missing', 'tenant_1'),
        (err: any) => {
            assert.equal(err.statusCode, 404);
            return true;
        },
    );
});

// 13. throws 409 when run already completed
test('cancelOrchestrationRun — throws 409 when run already completed', async () => {
    const prisma: any = {
        orchestrationRun: {
            findUnique: async () => makeRun({ status: 'completed' }),
        },
    };

    await assert.rejects(
        () => cancelOrchestrationRun(prisma, 'run_1', 'tenant_1'),
        (err: any) => {
            assert.equal(err.statusCode, 409);
            return true;
        },
    );
});

// 14. cancels queued dispatches and updates run status
test('cancelOrchestrationRun — cancels queued dispatches and updates run status', async () => {
    let updateManyWhere: any;
    let updateManyData: any;
    let runUpdateData: any;

    const prisma: any = {
        orchestrationRun: {
            findUnique: async () => makeRun({ status: 'running' }),
            update: async ({ data }: any) => {
                runUpdateData = data;
                return makeRun({ ...data });
            },
        },
        agentDispatchRecord: {
            updateMany: async ({ where, data }: any) => {
                updateManyWhere = where;
                updateManyData = data;
                return { count: 2 };
            },
        },
    };

    const result: any = await cancelOrchestrationRun(prisma, 'run_1', 'tenant_1');

    assert.equal(updateManyWhere.orchestrationRunId, 'run_1');
    assert.equal(updateManyWhere.status, 'queued');
    assert.equal(updateManyData.status, 'cancelled');
    assert.equal(runUpdateData.status, 'cancelled');
    assert.equal(result.status, 'cancelled');
});
