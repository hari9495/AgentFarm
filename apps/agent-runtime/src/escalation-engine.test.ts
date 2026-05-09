import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateEscalation, buildEscalationMessage, type EscalationDecision } from './escalation-engine.js';

function makeTask(payloadOverrides: Record<string, unknown> = {}) {
    return {
        taskId: 'test-task-003',
        payload: {
            action_type: 'code_edit',
            summary: 'Refactor the authentication middleware to support OAuth 2.0',
            ...payloadOverrides,
        } as Record<string, unknown>,
    };
}

// --- No escalation: happy path ---

test('no escalation at attempt 0 with a clear, sufficiently long task summary', () => {
    const decision = evaluateEscalation(makeTask(), 0);
    assert.strictEqual(decision.shouldEscalate, false);
    assert.strictEqual(decision.reason, undefined);
    assert.ok(decision.message.length > 0);
});

// --- Ambiguous task ---

test('escalates with ambiguous_task when summary is too short at attempt 0', () => {
    const decision = evaluateEscalation(makeTask({ summary: 'fix it' }), 0);
    assert.strictEqual(decision.shouldEscalate, true);
    assert.strictEqual(decision.reason, 'ambiguous_task');
    assert.strictEqual(decision.suggestedAction, 'ask_human');
});

test('does NOT escalate as ambiguous_task after first attempt even with short summary', () => {
    const decision = evaluateEscalation(makeTask({ summary: 'fix it' }), 1);
    // May escalate for another reason, but not ambiguous_task at attempt > 0
    if (decision.shouldEscalate) {
        assert.notStrictEqual(decision.reason, 'ambiguous_task');
    }
});

// --- Max retries exceeded ---

test('escalates with max_retries_exceeded when attempt >= default max_attempts (3)', () => {
    const decision = evaluateEscalation(makeTask(), 3);
    assert.strictEqual(decision.shouldEscalate, true);
    assert.strictEqual(decision.reason, 'max_retries_exceeded');
    assert.strictEqual(decision.suggestedAction, 'ask_human');
});

test('escalates with max_retries_exceeded when attempt >= custom max_attempts', () => {
    const decision = evaluateEscalation(makeTask({ max_attempts: 5 }), 5);
    assert.strictEqual(decision.shouldEscalate, true);
    assert.strictEqual(decision.reason, 'max_retries_exceeded');
});

test('does NOT escalate for max_retries when attempt is below threshold', () => {
    const decision = evaluateEscalation(makeTask(), 2);
    // Should not escalate for max_retries at attempt 2 with default max 3
    if (decision.shouldEscalate) {
        assert.notStrictEqual(decision.reason, 'max_retries_exceeded');
    }
});

// --- Scope too large ---

test('escalates with scope_too_large when files_to_change has more than 10 entries', () => {
    const files = Array.from({ length: 11 }, (_, i) => `file${i}.ts`);
    const decision = evaluateEscalation(makeTask({ files_to_change: files }), 0);
    assert.strictEqual(decision.shouldEscalate, true);
    assert.strictEqual(decision.reason, 'scope_too_large');
    assert.strictEqual(decision.suggestedAction, 'reduce_scope');
});

test('does NOT escalate for scope when files_to_change has exactly 10 entries', () => {
    const files = Array.from({ length: 10 }, (_, i) => `file${i}.ts`);
    const decision = evaluateEscalation(makeTask({ files_to_change: files }), 0);
    if (decision.shouldEscalate) {
        assert.notStrictEqual(decision.reason, 'scope_too_large');
    }
});

// --- Test failures unresolved ---

test('escalates with test_failures_unresolved when test failure pattern detected at attempt >= 2', () => {
    const decision = evaluateEscalation(makeTask(), 2, 'FAIL: 3 tests failed\nexit code 1');
    assert.strictEqual(decision.shouldEscalate, true);
    assert.strictEqual(decision.reason, 'test_failures_unresolved');
    assert.strictEqual(decision.suggestedAction, 'ask_human');
});

test('does NOT escalate for test_failures at attempt 1 even with failure output', () => {
    const decision = evaluateEscalation(makeTask(), 1, 'FAIL: tests failed');
    if (decision.shouldEscalate) {
        assert.notStrictEqual(decision.reason, 'test_failures_unresolved');
    }
});

// --- Approval rejected twice ---

test('escalates with approval_rejected_twice when rejection count >= 2', () => {
    const decision = evaluateEscalation(makeTask({ _approval_rejection_count: 2 }), 0);
    assert.strictEqual(decision.shouldEscalate, true);
    assert.strictEqual(decision.reason, 'approval_rejected_twice');
    assert.strictEqual(decision.suggestedAction, 'request_approval');
});

// --- buildEscalationMessage ---

test('buildEscalationMessage returns a non-empty string with escalation context', () => {
    const decision: EscalationDecision = {
        shouldEscalate: true,
        reason: 'max_retries_exceeded',
        message: 'Too many attempts.',
        suggestedAction: 'ask_human',
    };
    const msg = buildEscalationMessage(decision, makeTask());
    assert.ok(typeof msg === 'string' && msg.length > 0);
    assert.ok(msg.includes('ESCALATION REQUIRED'), 'should include escalation header');
    assert.ok(msg.includes('max_retries_exceeded'), 'should include reason');
    assert.ok(msg.includes('test-task-003'), 'should include task id');
});

test('buildEscalationMessage returns short message when no escalation required', () => {
    const decision: EscalationDecision = {
        shouldEscalate: false,
        message: 'All good.',
        suggestedAction: 'stop',
    };
    const msg = buildEscalationMessage(decision, makeTask());
    assert.strictEqual(msg, 'No escalation required.');
});
