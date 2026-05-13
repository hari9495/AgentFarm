import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ActionPlan } from '@agentfarm/shared-types';
import { executePlan, type StepExecutor } from './plan-executor.js';

// ---------------------------------------------------------------------------
// Stub helpers
// ---------------------------------------------------------------------------

const OK_RESULT = { ok: true as const, output: 'mock-output' };
const FAIL_RESULT = { ok: false as const, output: '', errorOutput: 'action failed' };

function makeOkExecutor(): StepExecutor {
    return async (_input) => OK_RESULT;
}

function makeFailExecutor(): StepExecutor {
    return async (_input) => FAIL_RESULT;
}

/**
 * Executor that fails calls whose actionType matches `failAction`,
 * and records all actionTypes in `order`.
 */
function makeSelectiveExecutor(
    failAction: string,
    order: string[] = [],
): StepExecutor {
    return async (input) => {
        order.push(input.actionType as string);
        if ((input.actionType as string) === failAction) {
            return FAIL_RESULT;
        }
        return OK_RESULT;
    };
}

// ---------------------------------------------------------------------------
// Baseline tests — sequential path (no depends_on on any step)
// ---------------------------------------------------------------------------

describe('executePlan — baseline (sequential path)', () => {

    it('executes empty plan and returns empty results', async () => {
        const plan: ActionPlan = { goal: 'test', steps: [], estimated_steps: 0 };
        const result = await executePlan(plan, 'tenant1', 'bot1', makeOkExecutor());
        assert.strictEqual(result.length, 0);
    });

    it('executes a single-step plan and returns one result', async () => {
        const plan: ActionPlan = {
            goal: 'test',
            steps: [
                { action: 'workspace_read_file', params: { path: 'test.ts' }, description: 'read a file' },
            ],
            estimated_steps: 1,
        };
        const result = await executePlan(plan, 'tenant1', 'bot1', makeOkExecutor());
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0]!.success, true);
        assert.strictEqual(result[0]!.action, 'workspace_read_file');
        assert.strictEqual(result[0]!.step_index, 0);
    });

    it('executes a multi-step plan and all steps run', async () => {
        const order: string[] = [];
        const executor: StepExecutor = async (input) => {
            order.push(input.actionType as string);
            return OK_RESULT;
        };
        const plan: ActionPlan = {
            goal: 'test',
            steps: [
                { action: 'workspace_list_files', params: {}, description: 'list' },
                { action: 'workspace_grep', params: { pattern: 'foo' }, description: 'grep' },
                { action: 'workspace_read_file', params: { path: 'a.ts' }, description: 'read' },
            ],
            estimated_steps: 3,
        };
        const result = await executePlan(plan, 'tenant1', 'bot1', executor);
        assert.strictEqual(result.length, 3);
        assert.ok(result.every((r) => r.success === true));
        // steps must execute in order
        assert.deepEqual(order, ['workspace_list_files', 'workspace_grep', 'workspace_read_file']);
    });

    it('hard-fail action abort: remaining steps do not execute after a hard-fail step fails', async () => {
        // 'workspace_web_login' is the only entry in HARD_FAIL_ACTIONS
        const order: string[] = [];
        const executor = makeSelectiveExecutor('workspace_web_login', order);
        const plan: ActionPlan = {
            goal: 'test',
            steps: [
                { action: 'workspace_web_login', params: { url: 'https://example.com', username: 'u', password: 'p' }, description: 'login' },
                { action: 'workspace_web_navigate', params: { url: 'https://example.com/dashboard' }, description: 'navigate' },
                { action: 'workspace_web_read_page', params: {}, description: 'read page' },
            ],
            estimated_steps: 3,
        };
        const result = await executePlan(plan, 'tenant1', 'bot1', executor);
        // Hard-fail aborts: only step 0 ran
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0]!.success, false);
        assert.strictEqual(order.length, 1);
        assert.strictEqual(order[0], 'workspace_web_login');
    });

    it('failed non-hard-fail step does not abort: subsequent steps still run', async () => {
        const order: string[] = [];
        // workspace_web_navigate fails but is NOT a hard-fail action
        const executor = makeSelectiveExecutor('workspace_web_navigate', order);
        const plan: ActionPlan = {
            goal: 'test',
            steps: [
                { action: 'workspace_web_navigate', params: { url: 'https://example.com' }, description: 'navigate' },
                { action: 'workspace_web_read_page', params: {}, description: 'read page' },
            ],
            estimated_steps: 2,
        };
        const result = await executePlan(plan, 'tenant1', 'bot1', executor);
        // All steps ran
        assert.strictEqual(result.length, 2);
        assert.strictEqual(result[0]!.success, false);
        assert.strictEqual(result[1]!.success, true);
        assert.strictEqual(order.length, 2);
    });

    it('executor exception is caught and recorded as a failed step', async () => {
        let callCount = 0;
        const executor: StepExecutor = async () => {
            callCount++;
            throw new Error('network error');
        };
        const plan: ActionPlan = {
            goal: 'test',
            steps: [
                { action: 'workspace_read_file', params: { path: 'foo.ts' }, description: 'read' },
                { action: 'workspace_list_files', params: {}, description: 'list' },
            ],
            estimated_steps: 2,
        };
        const result = await executePlan(plan, 'tenant1', 'bot1', executor);
        // Both steps attempted (workspace_read_file is not a hard-fail action)
        assert.strictEqual(result.length, 2);
        assert.strictEqual(result[0]!.success, false);
        assert.ok(result[0]!.error?.includes('network error'));
        assert.strictEqual(callCount, 2);
    });

    it('hard-fail executor throw aborts remaining steps', async () => {
        let callCount = 0;
        const executor: StepExecutor = async (input) => {
            callCount++;
            if ((input.actionType as string) === 'workspace_web_login') {
                throw new Error('login threw');
            }
            return OK_RESULT;
        };
        const plan: ActionPlan = {
            goal: 'test',
            steps: [
                { action: 'workspace_web_login', params: { url: 'https://x.com', username: 'u', password: 'p' }, description: 'login' },
                { action: 'workspace_web_navigate', params: { url: 'https://x.com' }, description: 'navigate' },
            ],
            estimated_steps: 2,
        };
        const result = await executePlan(plan, 'tenant1', 'bot1', executor);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0]!.success, false);
        assert.strictEqual(callCount, 1);
    });

    it('step_index in results matches step position in plan', async () => {
        const plan: ActionPlan = {
            goal: 'test',
            steps: [
                { action: 'workspace_list_files', params: {}, description: 'a' },
                { action: 'workspace_grep', params: { pattern: 'x' }, description: 'b' },
                { action: 'workspace_read_file', params: { path: 'c.ts' }, description: 'c' },
            ],
            estimated_steps: 3,
        };
        const result = await executePlan(plan, 'tenant1', 'bot1', makeOkExecutor());
        assert.strictEqual(result[0]!.step_index, 0);
        assert.strictEqual(result[1]!.step_index, 1);
        assert.strictEqual(result[2]!.step_index, 2);
    });

    it('failed step error field is populated from errorOutput', async () => {
        const executor: StepExecutor = async () => ({
            ok: false,
            output: 'stdout',
            errorOutput: 'stderr detail',
        });
        const plan: ActionPlan = {
            goal: 'test',
            steps: [{ action: 'workspace_list_files', params: {}, description: 'list' }],
            estimated_steps: 1,
        };
        const result = await executePlan(plan, 'tenant1', 'bot1', executor);
        assert.strictEqual(result[0]!.success, false);
        assert.strictEqual(result[0]!.error, 'stderr detail');
    });

    it('successful step output field is populated', async () => {
        const executor: StepExecutor = async () => ({
            ok: true,
            output: 'file contents here',
        });
        const plan: ActionPlan = {
            goal: 'test',
            steps: [{ action: 'workspace_read_file', params: { path: 'f.ts' }, description: 'read' }],
            estimated_steps: 1,
        };
        const result = await executePlan(plan, 'tenant1', 'bot1', executor);
        assert.strictEqual(result[0]!.success, true);
        assert.strictEqual(result[0]!.output, 'file contents here');
    });

});

// ---------------------------------------------------------------------------
// Phase-aware tests — parallel path (at least one step has depends_on)
// ---------------------------------------------------------------------------

describe('executePlan — phase-aware (with depends_on)', () => {

    it('parallel steps in same phase all execute and dependent step runs after', async () => {
        const executed: string[] = [];
        const executor: StepExecutor = async (input) => {
            executed.push(input.actionType as string);
            return OK_RESULT;
        };
        // step 0 and 1 are independent (phase 0); step 2 depends on both (phase 1)
        const plan: ActionPlan = {
            goal: 'test',
            steps: [
                { action: 'workspace_list_files', params: {}, description: 'a', depends_on: [] },
                { action: 'workspace_grep', params: { pattern: 'x' }, description: 'b', depends_on: [] },
                { action: 'workspace_read_file', params: { path: 'f.ts' }, description: 'c', depends_on: [0, 1] },
            ],
            estimated_steps: 3,
        };
        const result = await executePlan(plan, 't1', 'b1', executor);
        assert.strictEqual(result.length, 3);
        assert.ok(result.every((r) => r.success === true));
        // workspace_read_file must have run last
        assert.strictEqual(executed[executed.length - 1], 'workspace_read_file');
        // the other two ran (order within phase 0 is non-deterministic)
        assert.ok(executed.includes('workspace_list_files'));
        assert.ok(executed.includes('workspace_grep'));
    });

    it('results are returned in step-index order regardless of execution order', async () => {
        const plan: ActionPlan = {
            goal: 'test',
            steps: [
                { action: 'workspace_list_files', params: {}, description: 'a', depends_on: [] },
                { action: 'workspace_grep', params: { pattern: 'x' }, description: 'b', depends_on: [] },
                { action: 'workspace_read_file', params: { path: 'c.ts' }, description: 'c', depends_on: [0, 1] },
            ],
            estimated_steps: 3,
        };
        const result = await executePlan(plan, 't1', 'b1', makeOkExecutor());
        assert.strictEqual(result[0]!.step_index, 0);
        assert.strictEqual(result[1]!.step_index, 1);
        assert.strictEqual(result[2]!.step_index, 2);
        assert.strictEqual(result[0]!.action, 'workspace_list_files');
        assert.strictEqual(result[1]!.action, 'workspace_grep');
        assert.strictEqual(result[2]!.action, 'workspace_read_file');
    });

    it('hard-fail step in phase 0 aborts phase 1 — dependent step does not execute', async () => {
        let callCount = 0;
        const executor: StepExecutor = async (input) => {
            callCount++;
            if ((input.actionType as string) === 'workspace_web_login') {
                return FAIL_RESULT;
            }
            return OK_RESULT;
        };
        // step 0 is hard-fail, step 1 depends on it (phase 1)
        const plan: ActionPlan = {
            goal: 'test',
            steps: [
                { action: 'workspace_web_login', params: { url: 'https://x.com', username: 'u', password: 'p' }, description: 'login', depends_on: [] },
                { action: 'workspace_web_navigate', params: { url: 'https://x.com' }, description: 'navigate', depends_on: [0] },
            ],
            estimated_steps: 2,
        };
        const result = await executePlan(plan, 't1', 'b1', executor);
        // aborted after phase 0 — only step 0's result returned
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0]!.success, false);
        assert.strictEqual(callCount, 1);
    });

    it('cycle in depends_on throws before any execution', async () => {
        let callCount = 0;
        const executor: StepExecutor = async () => {
            callCount++;
            return OK_RESULT;
        };
        // step 0 depends on 1, step 1 depends on 0 → cycle
        const plan: ActionPlan = {
            goal: 'test',
            steps: [
                { action: 'workspace_list_files', params: {}, description: 'a', depends_on: [1] },
                { action: 'workspace_grep', params: { pattern: 'x' }, description: 'b', depends_on: [0] },
            ],
            estimated_steps: 2,
        };
        await assert.rejects(
            () => executePlan(plan, 't1', 'b1', executor),
            /dependency errors/,
        );
        // no execution should have happened
        assert.strictEqual(callCount, 0);
    });

    it('plan with empty depends_on arrays still uses the phase-aware path', async () => {
        // Every step has depends_on: [] — triggers the hasDeps=true path
        // but all steps land in phase 0 (no actual constraints).
        const plan: ActionPlan = {
            goal: 'test',
            steps: [
                { action: 'workspace_list_files', params: {}, description: 'a', depends_on: [] },
                { action: 'workspace_grep', params: { pattern: 'x' }, description: 'b', depends_on: [] },
            ],
            estimated_steps: 2,
        };
        // hasDeps = plan.steps.some(s => (s.depends_on?.length ?? 0) > 0)
        // All depends_on are empty arrays → hasDeps = false → sequential path
        // Because empty array length is 0, not > 0
        const result = await executePlan(plan, 't1', 'b1', makeOkExecutor());
        assert.strictEqual(result.length, 2);
        assert.ok(result.every((r) => r.success === true));
    });

    it('plan without depends_on property uses sequential path (hasDeps=false)', async () => {
        const order: string[] = [];
        const executor: StepExecutor = async (input) => {
            order.push(input.actionType as string);
            return OK_RESULT;
        };
        // steps without depends_on property at all → hasDeps = false
        const plan: ActionPlan = {
            goal: 'test',
            steps: [
                { action: 'workspace_list_files', params: {}, description: 'a' },
                { action: 'workspace_grep', params: { pattern: 'x' }, description: 'b' },
            ],
            estimated_steps: 2,
        };
        const result = await executePlan(plan, 't1', 'b1', executor);
        assert.strictEqual(result.length, 2);
        assert.deepEqual(order, ['workspace_list_files', 'workspace_grep']);
    });

    it('three-phase chain executes in dependency order', async () => {
        const executed: string[] = [];
        const executor: StepExecutor = async (input) => {
            executed.push(input.actionType as string);
            return OK_RESULT;
        };
        // step 0 → step 1 → step 2 (linear chain, 3 phases)
        const plan: ActionPlan = {
            goal: 'test',
            steps: [
                { action: 'workspace_list_files', params: {}, description: 'phase0', depends_on: [] },
                { action: 'workspace_grep', params: { pattern: 'x' }, description: 'phase1', depends_on: [0] },
                { action: 'workspace_read_file', params: { path: 'f.ts' }, description: 'phase2', depends_on: [1] },
            ],
            estimated_steps: 3,
        };
        const result = await executePlan(plan, 't1', 'b1', executor);
        assert.strictEqual(result.length, 3);
        assert.deepEqual(executed, [
            'workspace_list_files',
            'workspace_grep',
            'workspace_read_file',
        ]);
    });

    it('non-hard-fail dep failure does not abort subsequent phases', async () => {
        // step 0 fails (non-hard-fail), step 1 depends on step 0
        // aborted should NOT be true (workspace_list_files is not hard-fail)
        // step 1 should still execute
        const executor: StepExecutor = async (input) => {
            if ((input.actionType as string) === 'workspace_list_files') {
                return FAIL_RESULT;
            }
            return OK_RESULT;
        };
        const plan: ActionPlan = {
            goal: 'test',
            steps: [
                { action: 'workspace_list_files', params: {}, description: 'list', depends_on: [] },
                { action: 'workspace_grep', params: { pattern: 'x' }, description: 'grep', depends_on: [0] },
            ],
            estimated_steps: 2,
        };
        const result = await executePlan(plan, 't1', 'b1', executor);
        // Both phases run — 2 results
        assert.strictEqual(result.length, 2);
        assert.strictEqual(result[0]!.success, false);
        assert.strictEqual(result[1]!.success, true);
    });

});
