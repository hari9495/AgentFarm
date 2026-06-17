import test from 'node:test';
import assert from 'node:assert/strict';
import { runWorkflow, getWorkflowStepMaxRetries } from './workflow-runtime.js';
import type { WorkflowStep, StepResult } from './workflow-runtime.js';

function okStep(id: string, output?: string): WorkflowStep {
    return {
        id,
        name: `Step ${id}`,
        execute: () => Promise.resolve({ ok: true, output }),
    };
}

function failStep(id: string, error = 'something broke'): WorkflowStep {
    return {
        id,
        name: `Step ${id}`,
        execute: () => Promise.resolve({ ok: false, error }),
        maxRetries: 0,
    };
}

function throwStep(id: string, message = 'thrown error'): WorkflowStep {
    return {
        id,
        name: `Step ${id}`,
        execute: () => Promise.reject(new Error(message)),
        maxRetries: 0,
    };
}

// --- getWorkflowStepMaxRetries ---

test('getWorkflowStepMaxRetries returns 2 by default', () => {
    delete process.env['AF_WORKFLOW_STEP_MAX_RETRIES'];
    assert.equal(getWorkflowStepMaxRetries(), 2);
});

test('getWorkflowStepMaxRetries respects env var', () => {
    process.env['AF_WORKFLOW_STEP_MAX_RETRIES'] = '5';
    assert.equal(getWorkflowStepMaxRetries(), 5);
    delete process.env['AF_WORKFLOW_STEP_MAX_RETRIES'];
});

test('getWorkflowStepMaxRetries allows 0 (no retries)', () => {
    process.env['AF_WORKFLOW_STEP_MAX_RETRIES'] = '0';
    assert.equal(getWorkflowStepMaxRetries(), 0);
    delete process.env['AF_WORKFLOW_STEP_MAX_RETRIES'];
});

test('getWorkflowStepMaxRetries falls back to 2 for invalid value', () => {
    process.env['AF_WORKFLOW_STEP_MAX_RETRIES'] = 'bad';
    assert.equal(getWorkflowStepMaxRetries(), 2);
    delete process.env['AF_WORKFLOW_STEP_MAX_RETRIES'];
});

// --- runWorkflow: empty and single-step ---

test('runWorkflow with empty steps returns ok=true', async () => {
    const result = await runWorkflow([]);
    assert.equal(result.ok, true);
    assert.deepEqual(result.completedSteps, []);
    assert.equal(result.failedStep, null);
    assert.deepEqual(result.rolledBackSteps, []);
});

test('runWorkflow with single successful step returns ok=true', async () => {
    const result = await runWorkflow([okStep('a', 'done')]);
    assert.equal(result.ok, true);
    assert.deepEqual(result.completedSteps, ['a']);
    assert.equal(result.outputs['a'], 'done');
});

// --- runWorkflow: all succeed ---

test('runWorkflow executes all steps in order and collects outputs', async () => {
    const order: string[] = [];
    const steps: WorkflowStep[] = ['s1', 's2', 's3'].map((id) => ({
        id,
        name: id,
        execute: async () => { order.push(id); return { ok: true, output: `out-${id}` }; },
    }));

    const result = await runWorkflow(steps);
    assert.equal(result.ok, true);
    assert.deepEqual(order, ['s1', 's2', 's3']);
    assert.deepEqual(result.completedSteps, ['s1', 's2', 's3']);
    assert.equal(result.outputs['s2'], 'out-s2');
});

// --- runWorkflow: step failure ---

test('runWorkflow returns ok=false when a step fails', async () => {
    const result = await runWorkflow([okStep('a'), failStep('b'), okStep('c')]);
    assert.equal(result.ok, false);
    assert.equal(result.failedStep, 'b');
    assert.deepEqual(result.completedSteps, ['a']);
});

test('runWorkflow sets error message including step name and attempt count', async () => {
    const result = await runWorkflow([failStep('x', 'db timeout')]);
    assert.ok(result.error?.includes('Step "Step x"'));
    assert.ok(result.error?.includes('db timeout'));
    assert.ok(result.error?.includes('1 attempt'));
});

test('runWorkflow handles step that throws instead of returning ok=false', async () => {
    const result = await runWorkflow([throwStep('boom', 'network error')]);
    assert.equal(result.ok, false);
    assert.equal(result.failedStep, 'boom');
    assert.ok(result.error?.includes('network error'));
});

// --- runWorkflow: retry logic ---

test('runWorkflow retries a failing step up to maxRetries times', async () => {
    let callCount = 0;
    const step: WorkflowStep = {
        id: 'flaky',
        name: 'Flaky step',
        maxRetries: 2,
        execute: async (): Promise<StepResult> => {
            callCount++;
            return { ok: false, error: 'not yet' };
        },
    };
    const result = await runWorkflow([step]);
    assert.equal(callCount, 3); // 1 attempt + 2 retries
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes('3 attempt'));
});

test('runWorkflow succeeds if step passes on a retry', async () => {
    let attempt = 0;
    const step: WorkflowStep = {
        id: 'recovers',
        name: 'Recovers on second try',
        maxRetries: 2,
        execute: async (): Promise<StepResult> => {
            attempt++;
            if (attempt < 2) return { ok: false, error: 'not ready' };
            return { ok: true, output: 'recovered' };
        },
    };
    const result = await runWorkflow([step]);
    assert.equal(result.ok, true);
    assert.equal(result.outputs['recovers'], 'recovered');
});

test('runWorkflow respects per-step maxRetries override', async () => {
    let callCount = 0;
    const step: WorkflowStep = {
        id: 'quick-fail',
        name: 'Quick fail',
        maxRetries: 0,
        execute: async (): Promise<StepResult> => { callCount++; return { ok: false, error: 'fail' }; },
    };
    await runWorkflow([step]);
    assert.equal(callCount, 1); // no retries
});

// --- runWorkflow: rollback ---

test('runWorkflow rolls back completed steps in reverse order on failure', async () => {
    const rolled: string[] = [];

    const steps: WorkflowStep[] = [
        { id: 'a', name: 'A', execute: () => Promise.resolve({ ok: true }), rollback: async () => { rolled.push('a'); } },
        { id: 'b', name: 'B', execute: () => Promise.resolve({ ok: true }), rollback: async () => { rolled.push('b'); } },
        { id: 'c', name: 'C', execute: () => Promise.resolve({ ok: false, error: 'fail' }), maxRetries: 0 },
    ];

    const result = await runWorkflow(steps);
    assert.equal(result.ok, false);
    assert.deepEqual(rolled, ['b', 'a']); // reverse order
    assert.deepEqual(result.rolledBackSteps, ['b', 'a']);
});

test('runWorkflow skips steps without rollback during rollback pass', async () => {
    const rolled: string[] = [];

    const steps: WorkflowStep[] = [
        { id: 'a', name: 'A', execute: () => Promise.resolve({ ok: true }) },
        { id: 'b', name: 'B', execute: () => Promise.resolve({ ok: true }), rollback: async () => { rolled.push('b'); } },
        { id: 'c', name: 'C', execute: () => Promise.resolve({ ok: false, error: 'fail' }), maxRetries: 0 },
    ];

    const result = await runWorkflow(steps);
    assert.deepEqual(rolled, ['b']); // 'a' has no rollback — skipped
    assert.deepEqual(result.rolledBackSteps, ['b']);
});

test('runWorkflow swallows rollback errors and continues rolling back', async () => {
    const rolled: string[] = [];

    const steps: WorkflowStep[] = [
        { id: 'a', name: 'A', execute: () => Promise.resolve({ ok: true }), rollback: async () => { rolled.push('a'); } },
        { id: 'b', name: 'B', execute: () => Promise.resolve({ ok: true }), rollback: async () => { throw new Error('rollback exploded'); } },
        { id: 'c', name: 'C', execute: () => Promise.resolve({ ok: false, error: 'fail' }), maxRetries: 0 },
    ];

    const result = await runWorkflow(steps);
    assert.equal(result.ok, false);
    assert.deepEqual(rolled, ['a']); // b's rollback threw, a still ran
    // b is NOT in rolledBackSteps because its rollback threw
    assert.ok(!result.rolledBackSteps.includes('b'));
});

test('runWorkflow returns no rolledBackSteps when first step fails', async () => {
    const result = await runWorkflow([failStep('first')]);
    assert.equal(result.ok, false);
    assert.deepEqual(result.rolledBackSteps, []);
});

// --- runWorkflow: steps after failure are not executed ---

test('runWorkflow does not execute steps after a failed step', async () => {
    const executed: string[] = [];
    const steps: WorkflowStep[] = [
        { id: 'a', name: 'A', execute: async () => { executed.push('a'); return { ok: true }; } },
        { id: 'b', name: 'B', execute: async () => { executed.push('b'); return { ok: false, error: 'stop' }; }, maxRetries: 0 },
        { id: 'c', name: 'C', execute: async () => { executed.push('c'); return { ok: true }; } },
    ];
    await runWorkflow(steps);
    assert.deepEqual(executed, ['a', 'b']); // 'c' never ran
});
