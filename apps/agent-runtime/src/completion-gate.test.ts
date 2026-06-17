import test from 'node:test';
import assert from 'node:assert/strict';
import { isCompletionGateEnabled } from './completion-gate.js';

// Completion gate is disabled by default in tests
test('isCompletionGateEnabled returns false when env var not set', () => {
    delete process.env['AF_COMPLETION_GATE_ENABLED'];
    assert.equal(isCompletionGateEnabled(), false);
});

test('isCompletionGateEnabled returns true when env var is "true"', () => {
    process.env['AF_COMPLETION_GATE_ENABLED'] = 'true';
    assert.equal(isCompletionGateEnabled(), true);
    delete process.env['AF_COMPLETION_GATE_ENABLED'];
});

test('isCompletionGateEnabled returns true when env var is "1"', () => {
    process.env['AF_COMPLETION_GATE_ENABLED'] = '1';
    assert.equal(isCompletionGateEnabled(), true);
    delete process.env['AF_COMPLETION_GATE_ENABLED'];
});

// checkCompletion with gate disabled always passes
test('checkCompletion passes when gate is disabled', async () => {
    // Import lazily to avoid module-level side effects from DB init
    const { checkCompletion } = await import('./completion-gate.js');
    delete process.env['AF_COMPLETION_GATE_ENABLED'];
    const result = await checkCompletion('task-123', 'tenant-abc');
    assert.equal(result.pass, true);
});
