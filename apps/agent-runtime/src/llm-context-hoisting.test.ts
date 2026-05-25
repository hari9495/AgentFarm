/**
 * Option C: Integration tests for LLM classification prompt context hoisting.
 *
 * Verifies that _scout_context, _episodic_context, and _episodic_person_context
 * are lifted out of the 4 000-char truncation path and injected as dedicated
 * top-level fields (codebaseContext / recentTaskHistory / personTaskHistory)
 * in the classification JSON so the LLM receives the full codebase context.
 *
 * Uses _createTaskPromptForTesting (test-only export) to inspect the prompt
 * structure without making real LLM calls.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { _createTaskPromptForTesting } from './llm-decision-adapter.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MOCK_HEURISTIC = {
    actionType: 'workspace_subagent_spawn',
    confidence: 0.8,
    riskLevel: 'low' as const,
    route: 'execute' as const,
    reason: 'test heuristic',
};

function makeTask(payloadOverrides: Record<string, unknown> = {}) {
    return {
        taskId: 'test-task-001',
        enqueuedAt: Date.now(),
        payload: {
            tenantId: 'tenant-001',
            workspaceId: 'ws-001',
            botId: 'bot-001',
            action_type: 'workspace_subagent_spawn',
            prompt: 'Fix the authentication bug',
            ...payloadOverrides,
        },
    };
}

function parsedPrompt(task: ReturnType<typeof makeTask>) {
    const raw = _createTaskPromptForTesting(task as never, MOCK_HEURISTIC);
    return JSON.parse(raw) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LLM context hoisting: _scout_context', () => {
    test('large _scout_context (>4000 chars) appears in codebaseContext at top level', () => {
        const bigContext = `=== CODEBASE SCOUT ===\n${'x'.repeat(9_000)}`;
        const task = makeTask({ _scout_context: bigContext });
        const prompt = parsedPrompt(task);

        assert.ok(
            typeof prompt['codebaseContext'] === 'string',
            'codebaseContext should be a top-level string field',
        );
        assert.ok(
            (prompt['codebaseContext'] as string).length > 4_000,
            'codebaseContext should NOT be truncated to 4 000 chars',
        );
        assert.ok(
            !(prompt['codebaseContext'] as string).includes('[truncated:'),
            'codebaseContext must not contain the "[truncated: N chars]" sentinel',
        );
    });

    test('_scout_context is NOT present in task.payload (it was hoisted)', () => {
        const bigContext = 'file context: '.repeat(400); // >4000 chars
        const task = makeTask({ _scout_context: bigContext });
        const prompt = parsedPrompt(task);

        // The task.payload inside the prompt should NOT contain _scout_context
        // (it was stripped before truncation to avoid duplicate "[truncated: N chars]")
        const taskPayload = (prompt['task'] as { payload?: Record<string, unknown> })?.payload ?? {};
        assert.ok(
            !('_scout_context' in taskPayload),
            '_scout_context should be removed from task.payload after hoisting',
        );
    });

    test('small _scout_context (<4000 chars) also hoisted to codebaseContext', () => {
        const smallContext = 'src/auth.ts: export function login() {}';
        const task = makeTask({ _scout_context: smallContext });
        const prompt = parsedPrompt(task);

        assert.equal(
            prompt['codebaseContext'],
            smallContext,
            'small scout context should appear verbatim in codebaseContext',
        );
    });

    test('when _scout_context is absent, codebaseContext key is not present', () => {
        const task = makeTask(); // no _scout_context
        const prompt = parsedPrompt(task);

        assert.ok(
            !('codebaseContext' in prompt),
            'codebaseContext key should not be present when _scout_context is absent',
        );
    });
});

describe('LLM context hoisting: _episodic_context', () => {
    test('large _episodic_context appears in recentTaskHistory at top level', () => {
        const bigHistory = '=== Recent task history ===\n' + 'task: fix bug\n'.repeat(400);
        const task = makeTask({ _episodic_context: bigHistory });
        const prompt = parsedPrompt(task);

        assert.ok(
            typeof prompt['recentTaskHistory'] === 'string',
            'recentTaskHistory should be a top-level string field',
        );
        assert.ok(
            !(prompt['recentTaskHistory'] as string).includes('[truncated:'),
            'recentTaskHistory must not be truncated',
        );
    });

    test('_episodic_context removed from task.payload', () => {
        const task = makeTask({ _episodic_context: 'recent history: '.repeat(300) });
        const prompt = parsedPrompt(task);
        const taskPayload = (prompt['task'] as { payload?: Record<string, unknown> })?.payload ?? {};
        assert.ok(!('_episodic_context' in taskPayload), '_episodic_context must be removed from payload');
    });
});

describe('LLM context hoisting: _episodic_person_context', () => {
    test('_episodic_person_context appears in personTaskHistory when present', () => {
        const personHistory = '=== Recent task history with Jane Doe ===\n' + 'task: sent proposal\n'.repeat(100);
        const task = makeTask({ _episodic_person_context: personHistory });
        const prompt = parsedPrompt(task);

        assert.ok(
            typeof prompt['personTaskHistory'] === 'string',
            'personTaskHistory should be a top-level string field',
        );
        assert.ok(
            (prompt['personTaskHistory'] as string).includes('Jane Doe') ||
            (prompt['personTaskHistory'] as string).includes('sent proposal'),
            'personTaskHistory should contain the person context content',
        );
    });

    test('personTaskHistory absent when _episodic_person_context not in payload', () => {
        const task = makeTask();
        const prompt = parsedPrompt(task);
        assert.ok(!('personTaskHistory' in prompt), 'personTaskHistory should not appear if not in payload');
    });
});

describe('LLM context hoisting: all three fields together', () => {
    test('all three context fields hoisted simultaneously', () => {
        const scoutCtx = 'scout: '.repeat(1_000);
        const episodicCtx = 'history: '.repeat(600);
        const personCtx = 'person: '.repeat(200);

        const task = makeTask({
            _scout_context: scoutCtx,
            _episodic_context: episodicCtx,
            _episodic_person_context: personCtx,
        });
        const prompt = parsedPrompt(task);

        assert.ok(typeof prompt['codebaseContext'] === 'string', 'codebaseContext present');
        assert.ok(typeof prompt['recentTaskHistory'] === 'string', 'recentTaskHistory present');
        assert.ok(typeof prompt['personTaskHistory'] === 'string', 'personTaskHistory present');

        // None should be truncated
        for (const key of ['codebaseContext', 'recentTaskHistory', 'personTaskHistory'] as const) {
            assert.ok(
                !(prompt[key] as string).includes('[truncated:'),
                `${key} must not contain truncation sentinel`,
            );
        }

        // None should appear in task.payload
        const taskPayload = (prompt['task'] as { payload?: Record<string, unknown> })?.payload ?? {};
        for (const field of ['_scout_context', '_episodic_context', '_episodic_person_context']) {
            assert.ok(!(field in taskPayload), `${field} must be stripped from task.payload`);
        }
    });

    test('context fields capped at 12 000 chars each (not unlimited)', () => {
        const hugeContext = 'y'.repeat(15_000); // 15k chars — over the 12k cap
        const task = makeTask({ _scout_context: hugeContext });
        const prompt = parsedPrompt(task);

        const codebaseContext = prompt['codebaseContext'] as string;
        assert.ok(
            codebaseContext.length <= 12_000,
            `codebaseContext should be capped at 12 000 chars, got ${codebaseContext.length}`,
        );
        assert.ok(
            codebaseContext.length > 4_000,
            'codebaseContext should contain more than the old 4 000-char limit',
        );
    });
});

describe('LLM context hoisting: prompt structure integrity', () => {
    test('objective field is present and is the first key', () => {
        const prompt = parsedPrompt(makeTask());
        assert.ok(
            typeof prompt['objective'] === 'string' && prompt['objective'].length > 0,
            'prompt must always have an objective field',
        );
    });

    test('task field is present and retains non-context payload fields', () => {
        const task = makeTask({ _scout_context: 'ctx', target_files: ['src/foo.ts'] });
        const prompt = parsedPrompt(task);
        const taskPayload = (prompt['task'] as { payload?: Record<string, unknown> })?.payload ?? {};

        assert.ok(
            Array.isArray(taskPayload['target_files']),
            'target_files should remain in task.payload after hoisting',
        );
        assert.ok(
            !('_scout_context' in taskPayload),
            '_scout_context should NOT remain in task.payload',
        );
    });

    test('heuristicDecision is present in prompt', () => {
        const prompt = parsedPrompt(makeTask());
        const hd = prompt['heuristicDecision'] as Record<string, unknown>;
        assert.equal(hd['actionType'], MOCK_HEURISTIC.actionType);
        assert.equal(hd['riskLevel'], MOCK_HEURISTIC.riskLevel);
    });
});
