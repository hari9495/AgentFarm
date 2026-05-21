import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assessTaskClarity, buildClarificationMessage } from './intent-clarifier.js';
import type { TaskEnvelope } from './execution-engine.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTask(payload: Record<string, unknown>): TaskEnvelope {
    return {
        taskId: 'test-task-1',
        payload,
        enqueuedAt: Date.now(),
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('assessTaskClarity', () => {
    it('returns clear=true for a well-described task', async () => {
        const task = makeTask({
            prompt: 'Refactor the authentication module to use JWT tokens instead of sessions, updating all related tests.',
            action_type: 'code_edit',
            file_path: 'src/auth/auth.service.ts',
        });
        const result = await assessTaskClarity(task);
        assert.equal(result.clear, true, `Expected clear but got: ${result.reason}`);
        assert.equal(result.questions.length, 0);
    });

    it('returns clear=false for an empty description', async () => {
        const task = makeTask({});
        const result = await assessTaskClarity(task);
        assert.equal(result.clear, false);
        assert.ok(result.questions.length > 0);
        assert.equal(result.clarityScore, 0);
    });

    it('returns clear=false for a very short description', async () => {
        const task = makeTask({ prompt: 'fix bug' });
        const result = await assessTaskClarity(task);
        assert.equal(result.clear, false);
        assert.ok(result.clarityScore < 0.65);
    });

    it('flags code_edit without file_path as unclear', async () => {
        const task = makeTask({
            prompt: 'Update the login component to use the new design system',
            action_type: 'code_edit',
        });
        const result = await assessTaskClarity(task);
        assert.equal(result.clear, false);
        assert.ok(result.questions.some((q) => q.includes('file') || q.includes('component')));
    });

    it('allows code_edit when target_files is provided', async () => {
        const task = makeTask({
            prompt: 'Update the login component to use the new design system and match the Figma mockup exactly.',
            action_type: 'code_edit',
            target_files: ['src/components/Login.tsx'],
        });
        const result = await assessTaskClarity(task);
        assert.equal(result.clear, true);
    });

    it('returns clear=false for a vague opener pattern', async () => {
        const task = makeTask({ prompt: 'fix it' });
        const result = await assessTaskClarity(task);
        assert.equal(result.clear, false);
    });

    it('uses objective field when prompt is absent', async () => {
        const task = makeTask({
            objective: 'Write comprehensive unit tests for the payment processing module, covering edge cases for failed transactions.',
            action_type: 'workspace_generate_test',
            file_path: 'src/payments/payment.service.ts',
        });
        const result = await assessTaskClarity(task);
        assert.equal(result.clear, true);
    });

    it('does not call llmFn when heuristic score is clearly low', async () => {
        let called = false;
        const task = makeTask({});
        await assessTaskClarity(task, async (_prompt) => {
            called = true;
            return '{"clear": true, "score": 0.9, "questions": [], "reason": "fine"}';
        });
        assert.equal(called, false, 'LLM should not be called when score is 0');
    });

    it('calls llmFn in borderline range and respects unclear result', async () => {
        // 4 words < MINIMUM_WORD_COUNT(5) → -0.40 → score=0.60, in borderline [0.45,0.65)
        // action_type not in TARGET_REQUIRED_ACTIONS so no extra penalty
        const task = makeTask({
            prompt: 'Update the configuration settings',
            action_type: 'run_tests',
        });
        const result = await assessTaskClarity(task, async (_prompt) => {
            return JSON.stringify({
                clear: false,
                score: 0.5,
                questions: ['Which config file should be updated?'],
                reason: 'Missing specific target',
            });
        });
        assert.equal(result.clear, false);
        assert.ok(result.questions.some((q) => q.includes('config')));
    });

    it('falls through to heuristic result when LLM throws', async () => {
        const task = makeTask({
            prompt: 'Update the config settings',
            action_type: 'code_edit',
        });
        const result = await assessTaskClarity(task, async () => {
            throw new Error('LLM unavailable');
        });
        // LLM threw, should still return a result (heuristic fallthrough)
        assert.ok(typeof result.clear === 'boolean');
    });
});

describe('buildClarificationMessage', () => {
    it('builds a message with numbered questions', () => {
        const assessment = {
            clear: false,
            clarityScore: 0.3,
            questions: ['Which file should be updated?', 'What is the expected behaviour?'],
            reason: 'Too vague',
        };
        const msg = buildClarificationMessage(assessment, 'task-123', 'Alex');
        assert.ok(msg.includes('Alex'));
        assert.ok(msg.includes('task-123'));
        assert.ok(msg.includes('1.'));
        assert.ok(msg.includes('2.'));
    });
});
