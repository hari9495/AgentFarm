import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { SkillScheduler, cronMatches, nextCronOccurrence } from './skill-scheduler.js';

describe('skill-scheduler: cronMatches', () => {
    it('matches wildcard *', () => {
        assert.equal(cronMatches('* * * * *', new Date('2024-01-15T10:30:00Z')), true);
    });

    it('matches specific minute and hour', () => {
        const d = new Date('2024-01-15T10:30:00Z');
        assert.equal(cronMatches('30 10 * * *', d), true);
    });

    it('does not match wrong minute', () => {
        const d = new Date('2024-01-15T10:31:00Z');
        assert.equal(cronMatches('30 10 * * *', d), false);
    });

    it('matches step expression */15', () => {
        assert.equal(cronMatches('0 */15 * * *', new Date('2024-01-15T15:00:00Z')), true);
        assert.equal(cronMatches('0 */15 * * *', new Date('2024-01-15T14:00:00Z')), false);
    });

    it('matches range expression 1-5', () => {
        assert.equal(cronMatches('0 9 * * 1-5', new Date('2024-01-15T09:00:00Z')), true); // Monday
        assert.equal(cronMatches('0 9 * * 1-5', new Date('2024-01-14T09:00:00Z')), false); // Sunday
    });
});

describe('skill-scheduler: nextCronOccurrence', () => {
    it('returns a date after the reference', () => {
        const ref = new Date('2024-01-15T10:00:00Z');
        const next = nextCronOccurrence('30 10 * * *', ref);
        assert.ok(next > ref, 'next should be after reference');
    });

    it('returns within 24 hours for daily cron', () => {
        const ref = new Date('2024-01-15T10:00:00Z');
        const next = nextCronOccurrence('0 9 * * *', ref);
        assert.ok(next.getTime() - ref.getTime() <= 24 * 60 * 60 * 1000);
    });
});

describe('skill-scheduler: SkillScheduler', () => {
    let scheduler: SkillScheduler;

    beforeEach(() => {
        scheduler = new SkillScheduler();
    });

    it('createJob returns a job with an id', async () => {
        const job = await scheduler.createJob({
            name: 'Test Job',
            target: { kind: 'skill', skill_id: 'analyze_code' },
            frequency: { type: 'interval_ms', interval_ms: 10_000 },
        });
        assert.ok(job.id.length > 0);
        assert.equal(job.name, 'Test Job');
        assert.equal(job.active, true);
    });

    it('listJobs returns created jobs', async () => {
        await scheduler.createJob({
            name: 'Job A',
            target: { kind: 'skill', skill_id: 'run_tests' },
            frequency: { type: 'interval_ms', interval_ms: 5000 },
        });
        const jobs = scheduler.listJobs();
        assert.ok(jobs.length >= 1);
        assert.ok(jobs.some((j) => j.name === 'Job A'));
    });

    it('pauseJob sets active=false', async () => {
        const job = await scheduler.createJob({
            name: 'Pausable',
            target: { kind: 'skill', skill_id: 'analyze_code' },
            frequency: { type: 'interval_ms', interval_ms: 1000 },
        });
        const ok = await scheduler.pauseJob(job.id);
        assert.equal(ok, true);
        const found = scheduler.getJob(job.id);
        assert.equal(found?.active, false);
    });

    it('resumeJob sets active=true', async () => {
        const job = await scheduler.createJob({
            name: 'Resumable',
            target: { kind: 'skill', skill_id: 'analyze_code' },
            frequency: { type: 'interval_ms', interval_ms: 1000 },
        });
        await scheduler.pauseJob(job.id);
        const ok = await scheduler.resumeJob(job.id);
        assert.equal(ok, true);
        assert.equal(scheduler.getJob(job.id)?.active, true);
    });

    it('deleteJob removes job from list', async () => {
        const job = await scheduler.createJob({
            name: 'Deletable',
            target: { kind: 'skill', skill_id: 'analyze_code' },
            frequency: { type: 'interval_ms', interval_ms: 1000 },
        });
        const ok = await scheduler.deleteJob(job.id);
        assert.equal(ok, true);
        assert.equal(scheduler.getJob(job.id), undefined);
    });

    it('pauseJob returns false for nonexistent job', async () => {
        assert.equal(await scheduler.pauseJob('nonexistent'), false);
    });

    it('tick fires interval jobs that are due', async () => {
        const job = await scheduler.createJob({
            name: 'Tick Test',
            target: { kind: 'skill', skill_id: 'run_tests' },
            frequency: { type: 'interval_ms', interval_ms: 100 },
        });

        // Force next_run_at to be in the past so tick fires it
        const internalJob = scheduler.getJob(job.id)!;
        (internalJob as Record<string, unknown>).next_run_at = new Date(Date.now() - 200).toISOString();

        const { fired } = await scheduler.tick(new Date());
        assert.ok(fired.includes(job.id), 'interval job should have fired');
    });

    it('tick does not fire paused jobs', async () => {
        const job = await scheduler.createJob({
            name: 'Paused Job',
            target: { kind: 'skill', skill_id: 'run_tests' },
            frequency: { type: 'interval_ms', interval_ms: 100 },
        });
        await scheduler.pauseJob(job.id);

        const internalJob = scheduler.getJob(job.id)!;
        (internalJob as Record<string, unknown>).next_run_at = new Date(Date.now() - 200).toISOString();

        const { fired } = await scheduler.tick(new Date());
        assert.ok(!fired.includes(job.id), 'paused job should not fire');
    });

    it('getHistory returns run history array', () => {
        const history = scheduler.getHistory(10);
        assert.ok(Array.isArray(history));
    });
});
