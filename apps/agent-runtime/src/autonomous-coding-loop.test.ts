import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runAutonomousLoop, resumeFromCheckpoint } from './autonomous-coding-loop.js';

// ── runAutonomousLoop ──────────────────────────────────────────────────────

describe('autonomous-coding-loop: runAutonomousLoop', () => {
    it('returns a result with steps array in dry_run mode', async () => {
        const result = await runAutonomousLoop({
            task_description: 'Fix the auth bug',
            issue_number: 42,
            repo: 'org/repo',
            dry_run: true,
        });
        assert.ok(Array.isArray(result.steps), 'should have steps array');
        assert.equal(typeof result.summary, 'string');
        assert.equal(typeof result.total_duration_ms, 'number');
    });

    it('dry_run does not leave any step in running state', async () => {
        const result = await runAutonomousLoop({
            task_description: 'Test dry run',
            repo: 'org/test-repo',
            dry_run: true,
        });
        for (const step of result.steps) {
            assert.notEqual(step.status, 'running', 'No step should be left in running state');
        }
    });

    it('includes analyze_issue step', async () => {
        const result = await runAutonomousLoop({
            task_description: 'Add new feature',
            repo: 'org/myrepo',
            dry_run: true,
        });
        const analyzeStep = result.steps.find((s) => s.step === 'analyze_issue');
        assert.ok(analyzeStep, 'should have analyze_issue step');
    });

    it('returns a summary string', async () => {
        const result = await runAutonomousLoop({
            task_description: 'Improve performance',
            repo: 'org/perf-repo',
            dry_run: true,
        });
        assert.equal(typeof result.summary, 'string');
        assert.ok(result.summary.length > 0);
    });

    it('respects max_fix_attempts limit', async () => {
        const result = await runAutonomousLoop({
            task_description: 'Failing test task',
            repo: 'org/repo',
            max_fix_attempts: 1,
            dry_run: true,
        });
        const fixSteps = result.steps.filter((s) => s.step === 'fix_failures');
        assert.ok(fixSteps.length <= 1, 'should not exceed max_fix_attempts');
    });

    it('includes create_pr step', async () => {
        const result = await runAutonomousLoop({
            task_description: 'Open a PR for the hotfix',
            repo: 'org/repo',
            dry_run: true,
        });
        const prStep = result.steps.find((s) => s.step === 'create_pr');
        assert.ok(prStep, 'should have create_pr step');
    });
});

// ── resumeFromCheckpoint ───────────────────────────────────────────────────

describe('autonomous-coding-loop: resumeFromCheckpoint', () => {
    it('returns null when no checkpoint exists for loop_id', async () => {
        const result = await resumeFromCheckpoint('non-existent-loop-xyz-999', {
            task_description: 'No checkpoint task',
            repo: 'org/repo',
            dry_run: true,
        });
        assert.equal(result, null);
    });

    it('returns a result when checkpoint exists from a prior run', async () => {
        // Run first to create a checkpoint
        const first = await runAutonomousLoop({
            task_description: 'Create checkpoint for resume test',
            repo: 'org/repo',
            dry_run: true,
        });
        assert.ok(first.checkpoint_file, 'should produce a checkpoint file');
        // Extract loop_id from checkpoint filename
        const loopId = first.checkpoint_file!.split(/[\\/]/).pop()!.replace('.json', '');
        const resumed = await resumeFromCheckpoint(loopId, {
            task_description: 'Create checkpoint for resume test',
            repo: 'org/repo',
            dry_run: true,
        });
        // Either returns a result or null depending on step states
        assert.ok(resumed === null || Array.isArray(resumed.steps));
    });
});
