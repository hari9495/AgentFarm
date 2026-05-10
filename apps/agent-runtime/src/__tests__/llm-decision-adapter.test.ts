import test from 'node:test';
import assert from 'node:assert/strict';
import { createMockResolver } from '../llm-decision-adapter.js';
import type { TaskEnvelope, ActionDecision } from '../execution-engine.js';

const makeTask = (payload: Record<string, unknown>): TaskEnvelope => ({
    taskId: 'test-mock-task-1',
    payload,
    enqueuedAt: Date.now(),
});

const makeHeuristic = (): ActionDecision => ({
    actionType: 'workspace_read_file',
    confidence: 0.85,
    riskLevel: 'low',
    route: 'execute',
    reason: 'heuristic baseline',
});

// ---------------------------------------------------------------------------
// Basic determinism
// ---------------------------------------------------------------------------

test('mock resolver returns deterministic result with confidence 0.85', async () => {
    const resolver = createMockResolver();
    const result = await resolver({
        task: makeTask({ action_type: 'workspace_read_file', target: 'src/index.ts' }),
        heuristicDecision: makeHeuristic(),
    });

    assert.equal(result.decision.confidence, 0.85);
    assert.equal(result.decision.actionType, 'workspace_read_file');
    assert.equal(result.metadata.model, 'mock-v1');
    assert.equal(result.metadata.modelProvider, 'mock');
});

test('mock resolver reads action_type from task payload', async () => {
    const resolver = createMockResolver();
    const result = await resolver({
        task: makeTask({ action_type: 'workspace_list_files' }),
        heuristicDecision: makeHeuristic(),
    });
    assert.equal(result.decision.actionType, 'workspace_list_files');
});

test('mock resolver falls back to heuristic actionType when action_type is absent', async () => {
    const resolver = createMockResolver();
    const heuristic = makeHeuristic();
    heuristic.actionType = 'code_read';
    const result = await resolver({
        task: makeTask({}),
        heuristicDecision: heuristic,
    });
    assert.equal(result.decision.actionType, 'code_read');
});

// ---------------------------------------------------------------------------
// Risk classification
// ---------------------------------------------------------------------------

test('mock resolver classifies HIGH_RISK action_type as riskLevel high', async () => {
    const resolver = createMockResolver();

    const highRiskActions = ['merge_release', 'merge_pr', 'delete_resource', 'deploy_production', 'git_push', 'run_shell_command'];

    for (const actionType of highRiskActions) {
        const result = await resolver({
            task: makeTask({ action_type: actionType }),
            heuristicDecision: makeHeuristic(),
        });
        assert.equal(result.decision.riskLevel, 'high', `Expected high risk for '${actionType}'`);
        assert.equal(result.decision.route, 'approval', `Expected approval route for '${actionType}'`);
    }
});

test('mock resolver classifies MEDIUM_RISK action_type as riskLevel medium', async () => {
    const resolver = createMockResolver();

    const mediumRiskActions = ['code_edit', 'code_edit_patch', 'git_commit', 'run_build', 'run_tests', 'send_message'];

    for (const actionType of mediumRiskActions) {
        const result = await resolver({
            task: makeTask({ action_type: actionType }),
            heuristicDecision: makeHeuristic(),
        });
        assert.equal(result.decision.riskLevel, 'medium', `Expected medium risk for '${actionType}'`);
        assert.equal(result.decision.route, 'approval', `Expected approval route for '${actionType}'`);
    }
});

test('mock resolver classifies LOW_RISK action_type as riskLevel low', async () => {
    const resolver = createMockResolver();
    const result = await resolver({
        task: makeTask({ action_type: 'workspace_read_file' }),
        heuristicDecision: makeHeuristic(),
    });
    assert.equal(result.decision.riskLevel, 'low');
    assert.equal(result.decision.route, 'execute');
});

// ---------------------------------------------------------------------------
// Token and cost metadata
// ---------------------------------------------------------------------------

test('mock resolver returns 0 tokens and 0 cost', async () => {
    const resolver = createMockResolver();
    const result = await resolver({
        task: makeTask({ action_type: 'workspace_read_file' }),
        heuristicDecision: makeHeuristic(),
    });
    assert.equal(result.metadata.promptTokens, 0);
    assert.equal(result.metadata.completionTokens, 0);
    assert.equal(result.metadata.totalTokens, 0);
});

// ---------------------------------------------------------------------------
// Delay support
// ---------------------------------------------------------------------------

test('MOCK_LLM_DELAY_MS adds artificial delay', async () => {
    const original = process.env['MOCK_LLM_DELAY_MS'];
    process.env['MOCK_LLM_DELAY_MS'] = '60';
    try {
        const resolver = createMockResolver();
        const start = Date.now();
        await resolver({
            task: makeTask({ action_type: 'workspace_read_file' }),
            heuristicDecision: makeHeuristic(),
        });
        const elapsed = Date.now() - start;
        assert.ok(elapsed >= 40, `Expected at least 40ms delay, got ${elapsed}ms`);
    } finally {
        if (original === undefined) {
            delete process.env['MOCK_LLM_DELAY_MS'];
        } else {
            process.env['MOCK_LLM_DELAY_MS'] = original;
        }
    }
});

test('MOCK_LLM_DELAY_MS=0 returns without significant delay', async () => {
    const original = process.env['MOCK_LLM_DELAY_MS'];
    process.env['MOCK_LLM_DELAY_MS'] = '0';
    try {
        const resolver = createMockResolver();
        const start = Date.now();
        await resolver({
            task: makeTask({ action_type: 'workspace_read_file' }),
            heuristicDecision: makeHeuristic(),
        });
        const elapsed = Date.now() - start;
        // Without delay, should complete in under 200ms even on slow CI
        assert.ok(elapsed < 200, `Expected fast return, got ${elapsed}ms`);
    } finally {
        if (original === undefined) {
            delete process.env['MOCK_LLM_DELAY_MS'];
        } else {
            process.env['MOCK_LLM_DELAY_MS'] = original;
        }
    }
});

// ---------------------------------------------------------------------------
// No HTTP calls
// ---------------------------------------------------------------------------

test('mock resolver never calls fetch', async () => {
    const originalFetch = globalThis.fetch;
    let fetchCalls = 0;
    // Replace global fetch with a spy that counts calls
    globalThis.fetch = async (...args: Parameters<typeof fetch>): ReturnType<typeof fetch> => {
        fetchCalls += 1;
        return originalFetch(...args);
    };
    try {
        const resolver = createMockResolver();
        await resolver({
            task: makeTask({ action_type: 'workspace_read_file' }),
            heuristicDecision: makeHeuristic(),
        });
        assert.equal(fetchCalls, 0, 'fetch must never be called by the mock resolver');
    } finally {
        globalThis.fetch = originalFetch;
    }
});

// ---------------------------------------------------------------------------
// Target field propagation
// ---------------------------------------------------------------------------

test('mock resolver propagates target from task payload', async () => {
    const resolver = createMockResolver();
    const result = await resolver({
        task: makeTask({ action_type: 'workspace_read_file', target: 'apps/api-gateway/src/main.ts' }),
        heuristicDecision: makeHeuristic(),
    });
    assert.equal(result.payloadOverrides?.['target'], 'apps/api-gateway/src/main.ts');
});

test('mock resolver defaults target to README.md when absent', async () => {
    const resolver = createMockResolver();
    const result = await resolver({
        task: makeTask({ action_type: 'workspace_read_file' }),
        heuristicDecision: makeHeuristic(),
    });
    assert.equal(result.payloadOverrides?.['target'], 'README.md');
});

// ---------------------------------------------------------------------------
// Mock indicator in payloadOverrides
// ---------------------------------------------------------------------------

test('mock resolver sets _mock_provider flag in payloadOverrides', async () => {
    const resolver = createMockResolver();
    const result = await resolver({
        task: makeTask({ action_type: 'workspace_read_file' }),
        heuristicDecision: makeHeuristic(),
    });
    assert.equal(result.payloadOverrides?.['_mock_provider'], true);
});
