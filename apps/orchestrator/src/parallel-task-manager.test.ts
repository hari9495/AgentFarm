import test from 'node:test';
import assert from 'node:assert/strict';
import {
    ParallelTaskManager,
    getParallelConfig,
    PLAN_PARALLEL_CONFIGS,
    type PendingTask,
} from './parallel-task-manager.js';

const proConfig = getParallelConfig('pro');
const freeConfig = getParallelConfig('free');

function makeManager(maxSlots = 3) {
    return new ParallelTaskManager('w1', 't1', {
        maxConcurrentTasks: maxSlots,
        allowedWaitReasons: ['waiting_ci', 'waiting_approval', 'waiting_answer'],
    });
}

test('B8: getParallelConfig returns plan slot counts', () => {
    assert.equal(PLAN_PARALLEL_CONFIGS['free']!.maxConcurrentTasks, 1);
    assert.equal(PLAN_PARALLEL_CONFIGS['pro']!.maxConcurrentTasks, 3);
    assert.equal(PLAN_PARALLEL_CONFIGS['enterprise']!.maxConcurrentTasks, 10);
    assert.equal(getParallelConfig('enterprise_plus').maxConcurrentTasks, 1);
});

test('B8: manager creates expected slot counts by plan', () => {
    const pro = new ParallelTaskManager('w1', 't1', proConfig);
    assert.equal(pro.getSlots().length, 3);
    assert.equal(pro.countIdleSlots(), 3);

    const free = new ParallelTaskManager('w1', 't1', freeConfig);
    assert.equal(free.getSlots().length, 1);
});

test('B8: tick starts tasks up to slot capacity', async () => {
    const mgr = makeManager(2);
    let calls = 0;
    const executor = async (_taskId: string, _slotId: string) => {
        calls += 1;
    };
    const pending: PendingTask[] = [
        { taskId: 'task-1' },
        { taskId: 'task-2' },
        { taskId: 'task-3' },
    ];

    const started = await mgr.tick(pending, executor);
    assert.equal(started.length, 2);
    assert.equal(mgr.countIdleSlots(), 0);
    assert.equal(mgr.countActiveSlots(), 2);
    assert.equal(calls, 2);
});

test('B8: tick prioritizes higher priority tasks first', async () => {
    const mgr = makeManager(1);
    const started: string[] = [];
    const executor = async (taskId: string, _slotId: string) => {
        started.push(taskId);
    };

    await mgr.tick(
        [
            { taskId: 'low', priority: 1 },
            { taskId: 'high', priority: 10 },
        ],
        executor,
    );

    assert.equal(started[0], 'high');
});

test('B8: blocked slots are skipped when assigning new work', async () => {
    const mgr = makeManager(2);
    const executor = async () => undefined;

    await mgr.tick([{ taskId: 'task-1' }], executor);
    const slot0 = mgr.getSlots()[0]!;

    mgr.parkSlot(slot0.slotId, 'waiting_ci', 'ci_complete');
    assert.equal(mgr.getSlots()[0]!.status, 'waiting_ci');

    const started = await mgr.tick([{ taskId: 'task-2' }, { taskId: 'task-3' }], executor);
    assert.equal(started.length, 1);
});

test('B8: slot unblock and release lifecycle works', async () => {
    const mgr = makeManager(1);
    const executor = async () => undefined;
    await mgr.tick([{ taskId: 'task-1' }], executor);
    const slot = mgr.getSlots()[0]!;

    mgr.parkSlot(slot.slotId, 'waiting_approval', 'approval_received');
    assert.equal(mgr.getSlots()[0]!.status, 'waiting_approval');

    mgr.unblockSlot(slot.slotId);
    assert.equal(mgr.getSlots()[0]!.status, 'active');

    mgr.releaseSlot(slot.slotId);
    assert.equal(mgr.getSlots()[0]!.status, 'idle');
    assert.equal(mgr.getSlots()[0]!.currentTaskId, undefined);
});

test('B8: snapshot returns copy of slot state', async () => {
    const mgr = makeManager(2);
    const executor = async () => undefined;
    await mgr.tick([{ taskId: 'task-1' }], executor);

    const snap = mgr.snapshot();
    assert.equal(snap.length, 2);
    (snap[0] as { status: string }).status = 'idle';
    assert.equal(mgr.getSlots()[0]!.status, 'active');
});
