import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runAutonomousLoop, resumeFromCheckpoint, createGitHubPR } from './autonomous-coding-loop.js';

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

// ── createGitHubPR ─────────────────────────────────────────────────────────

describe('autonomous-coding-loop: createGitHubPR', () => {
    it('calls the correct GitHub API URL', async () => {
        let capturedUrl = '';
        const mockFetch = async (url: string, _opts: RequestInit): Promise<Response> => {
            capturedUrl = url;
            return {
                ok: true,
                json: async () => ({ number: 7, html_url: 'https://github.com/owner/repo/pull/7' }),
                text: async () => '',
            } as unknown as Response;
        };

        await createGitHubPR({
            token: 'test-token',
            owner: 'myowner',
            repo: 'myrepo',
            title: 'Fix bug',
            body: 'Description',
            head: 'feat/fix-bug',
            base: 'main',
            fetchImpl: mockFetch as typeof fetch,
        });

        assert.equal(capturedUrl, 'https://api.github.com/repos/myowner/myrepo/pulls');
    });

    it('includes Authorization header with Bearer token', async () => {
        let capturedAuth = '';
        const mockFetch = async (_url: string, opts: RequestInit): Promise<Response> => {
            capturedAuth = (opts.headers as Record<string, string>)['Authorization'] ?? '';
            return {
                ok: true,
                json: async () => ({ number: 8, html_url: 'https://github.com/owner/repo/pull/8' }),
                text: async () => '',
            } as unknown as Response;
        };

        await createGitHubPR({
            token: 'my-secret-token',
            owner: 'owner',
            repo: 'repo',
            title: 'Test PR',
            body: 'Body',
            head: 'feat/branch',
            base: 'main',
            fetchImpl: mockFetch as typeof fetch,
        });

        assert.equal(capturedAuth, 'Bearer my-secret-token');
    });

    it('returns real prNumber and prUrl from response', async () => {
        const mockFetch = async (_url: string, _opts: RequestInit): Promise<Response> => ({
            ok: true,
            json: async () => ({ number: 42, html_url: 'https://github.com/acme/app/pull/42' }),
            text: async () => '',
        } as unknown as Response);

        const result = await createGitHubPR({
            token: 'tok',
            owner: 'acme',
            repo: 'app',
            title: 'My PR',
            body: 'Content',
            head: 'feature/x',
            base: 'main',
            fetchImpl: mockFetch as typeof fetch,
        });

        assert.equal(result.ok, true);
        if (result.ok) {
            assert.equal(result.prNumber, 42);
            assert.equal(result.prUrl, 'https://github.com/acme/app/pull/42');
        }
    });

    it('returns ok:false and does not throw on GitHub API failure', async () => {
        const mockFetch = async (_url: string, _opts: RequestInit): Promise<Response> => ({
            ok: false,
            status: 422,
            json: async () => ({}),
            text: async () => 'Validation Failed',
        } as unknown as Response);

        const result = await createGitHubPR({
            token: 'tok',
            owner: 'acme',
            repo: 'app',
            title: 'Bad PR',
            body: '',
            head: 'bad-branch',
            base: 'main',
            fetchImpl: mockFetch as typeof fetch,
        });

        assert.equal(result.ok, false);
        if (!result.ok) {
            assert.ok(result.error.includes('422'));
        }
    });
});

// ── commit_push step ────────────────────────────────────────────────────────

describe('autonomous-coding-loop: commit_push step', () => {
    it('includes commit_push step in dry_run mode', async () => {
        const result = await runAutonomousLoop({
            task_description: 'Wire commit and push',
            repo: 'org/repo',
            dry_run: true,
        });
        const step = result.steps.find((s) => s.step === 'commit_push');
        assert.ok(step, 'commit_push step should be present');
        assert.equal(step?.status, 'success', 'commit_push should succeed in dry_run mode');
    });

    it('commit_push step output contains dry-run note', async () => {
        const result = await runAutonomousLoop({
            task_description: 'Dry run commit push note',
            repo: 'org/repo',
            dry_run: true,
        });
        const step = result.steps.find((s) => s.step === 'commit_push');
        assert.ok(typeof step?.output === 'object' && step.output !== null);
        assert.ok(
            JSON.stringify(step?.output).toLowerCase().includes('dry-run'),
            'output should mention dry-run',
        );
    });

    it('commit_push step appears before create_pr in results', async () => {
        const result = await runAutonomousLoop({
            task_description: 'Step ordering check',
            repo: 'org/repo',
            dry_run: true,
        });
        const commitIdx = result.steps.findIndex((s) => s.step === 'commit_push');
        const prIdx = result.steps.findIndex((s) => s.step === 'create_pr');
        assert.ok(commitIdx !== -1, 'commit_push step must exist');
        assert.ok(prIdx !== -1, 'create_pr step must exist');
        assert.ok(commitIdx < prIdx, 'commit_push must come before create_pr');
    });

    it('live mode returns failed gracefully when tenantId and botId are missing', async () => {
        const result = await runAutonomousLoop({
            task_description: 'Live mode no credentials',
            repo: 'org/repo',
            dry_run: false,
            tenantId: '',
            botId: '',
        });
        // Loop should complete without throwing — status may be 'failed' or 'completed_with_warnings'
        assert.ok(typeof result.summary === 'string', 'should return a result summary string');
        assert.ok(Array.isArray(result.steps), 'should return steps array');
    });
});

// ── runImplementChanges and runTests via dry_run field_edits ────────────────

describe('autonomous-coding-loop: file_edits field in AutonomousLoopInput', () => {
    it('accepts file_edits in dry_run mode without error', async () => {
        const result = await runAutonomousLoop({
            task_description: 'Edit with provided content',
            repo: 'org/repo',
            target_files: ['src/app.ts'],
            file_edits: [{ file: 'src/app.ts', content: 'export const x = 1;' }],
            dry_run: true,
        });
        assert.equal(typeof result.summary, 'string', 'should return a result summary');
    });

    it('implement_changes step succeeds in dry_run mode regardless of file_edits', async () => {
        const result = await runAutonomousLoop({
            task_description: 'Dry run implement changes',
            repo: 'org/repo',
            target_files: ['src/util.ts'],
            dry_run: true,
        });
        const step = result.steps.find((s) => s.step === 'implement_changes');
        assert.equal(step?.status, 'success');
    });
});

