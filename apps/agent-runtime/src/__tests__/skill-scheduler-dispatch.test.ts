import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SkillScheduler } from '../skill-scheduler.js';

// Helper: tick a scheduler 60 seconds into the future so interval jobs are due.
const tickFuture = (s: SkillScheduler) => s.tick(new Date(Date.now() + 60_000));

test('setRunCallback: dry-run job does not invoke callback', async () => {
    const scheduler = new SkillScheduler();
    let callbackInvoked = false;

    scheduler.setRunCallback(async (_target, dryRun) => {
        if (!dryRun) callbackInvoked = true;
        return { ok: true, summary: '[dry-run]' };
    });

    await scheduler.createJob({
        name: 'dry-run-job',
        target: { kind: 'skill', skill_id: 'dry-skill' },
        frequency: { type: 'interval_ms', interval_ms: 1_000 },
        dry_run: true,
    });

    const result = await tickFuture(scheduler);
    assert.equal(result.fired.length, 1, 'job should fire');

    // callback is invoked but dryRun=true branch should not set callbackInvoked
    assert.equal(callbackInvoked, false, 'fetch path must not be reached for dry-run jobs');

    const history = scheduler.getHistory(1);
    assert.equal(history[0].ok, true);
    assert.equal(history[0].summary, '[dry-run]');

    scheduler.stop();
});

test('setRunCallback: real job callback receives correct target and dryRun=false', async () => {
    const scheduler = new SkillScheduler();
    const calls: Array<{ skillId: string; dryRun: boolean }> = [];

    scheduler.setRunCallback(async (target, dryRun) => {
        const skillId = target.kind === 'skill' ? target.skill_id : target.pipeline_id;
        calls.push({ skillId, dryRun });
        return { ok: true, summary: 'queued' };
    });

    await scheduler.createJob({
        name: 'real-job',
        target: { kind: 'skill', skill_id: 'my-skill' },
        frequency: { type: 'interval_ms', interval_ms: 1_000 },
        dry_run: false,
    });

    await tickFuture(scheduler);

    assert.equal(calls.length, 1, 'callback should be called once');
    assert.equal(calls[0].skillId, 'my-skill');
    assert.equal(calls[0].dryRun, false);

    scheduler.stop();
});

test('setRunCallback: callback that throws records failure in history', async () => {
    const scheduler = new SkillScheduler();

    scheduler.setRunCallback(async () => {
        throw new Error('tasks/intake failed: 500');
    });

    await scheduler.createJob({
        name: 'failing-job',
        target: { kind: 'skill', skill_id: 'bad-skill' },
        frequency: { type: 'interval_ms', interval_ms: 1_000 },
        dry_run: false,
    });

    await tickFuture(scheduler);

    const history = scheduler.getHistory(1);
    assert.equal(history.length, 1, 'should have one history entry');
    assert.equal(history[0].ok, false, 'history entry should be failure');
    assert.match(history[0].summary, /tasks\/intake failed: 500/);

    scheduler.stop();
});

test('scheduler tick fires only due jobs and updates run counts', async () => {
    const scheduler = new SkillScheduler();
    let firedCount = 0;

    scheduler.setRunCallback(async () => {
        firedCount++;
        return { ok: true, summary: 'done' };
    });

    // Two jobs with 1-second interval (will be due 60s from now)
    await scheduler.createJob({
        name: 'job-a',
        target: { kind: 'skill', skill_id: 'skill-a' },
        frequency: { type: 'interval_ms', interval_ms: 1_000 },
        dry_run: false,
    });
    await scheduler.createJob({
        name: 'job-b',
        target: { kind: 'pipeline', pipeline_id: 'pipe-b' },
        frequency: { type: 'interval_ms', interval_ms: 1_000 },
        dry_run: false,
    });
    // One job with 10-minute interval (NOT due after only 60 seconds)
    await scheduler.createJob({
        name: 'job-far-future',
        target: { kind: 'skill', skill_id: 'skill-c' },
        frequency: { type: 'interval_ms', interval_ms: 600_000 },
        dry_run: false,
    });

    const result = await tickFuture(scheduler);

    assert.equal(result.fired.length, 2, 'exactly 2 jobs should fire');
    assert.equal(firedCount, 2, 'callback should be invoked twice');

    // Verify run_count incremented on fired jobs
    const jobs = scheduler.listJobs();
    const fired = jobs.filter((j) => j.run_count > 0);
    assert.equal(fired.length, 2);
    fired.forEach((j) => assert.equal(j.run_count, 1));

    scheduler.stop();
});
