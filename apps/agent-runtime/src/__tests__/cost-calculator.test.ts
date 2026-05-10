import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateCostUsd } from '../cost-calculator.js';

// 1000 prompt + 500 completion tokens used as a base for most tests
const BASE = { promptTokens: 1_000, completionTokens: 500 };

test('haiku model returns non-zero cost and tier "haiku"', () => {
    const result = estimateCostUsd({ modelProvider: 'anthropic', modelProfile: 'claude-haiku', ...BASE });
    assert.equal(result.modelTier, 'haiku');
    assert.ok(result.costUsd > 0, `expected positive cost, got ${result.costUsd}`);
});

test('sonnet model returns non-zero cost and tier "sonnet"', () => {
    const result = estimateCostUsd({ modelProvider: 'anthropic', modelProfile: 'claude-sonnet', ...BASE });
    assert.equal(result.modelTier, 'sonnet');
    assert.ok(result.costUsd > 0, `expected positive cost, got ${result.costUsd}`);
});

test('opus model returns non-zero cost and tier "opus"', () => {
    const result = estimateCostUsd({ modelProvider: 'anthropic', modelProfile: 'claude-opus', ...BASE });
    assert.equal(result.modelTier, 'opus');
    assert.ok(result.costUsd > 0, `expected positive cost, got ${result.costUsd}`);
});

test('mock model returns costUsd === 0 and tier "mock"', () => {
    const result = estimateCostUsd({ modelProvider: 'mock', modelProfile: 'mock-profile', ...BASE });
    assert.equal(result.modelTier, 'mock');
    assert.equal(result.costUsd, 0);
});

test('unknown model string returns costUsd === 0 and tier "unknown"', () => {
    const result = estimateCostUsd({ modelProvider: 'agentfarm', modelProfile: 'default', ...BASE });
    assert.equal(result.modelTier, 'unknown');
    assert.equal(result.costUsd, 0);
});

test('zero tokens returns costUsd === 0', () => {
    const result = estimateCostUsd({
        modelProvider: 'anthropic',
        modelProfile: 'claude-sonnet',
        promptTokens: 0,
        completionTokens: 0,
    });
    assert.equal(result.costUsd, 0);
});

test('gpt-4o model returns tier "gpt-4o" (not gpt-4o-mini)', () => {
    const result = estimateCostUsd({ modelProvider: 'openai', modelProfile: 'gpt-4o', ...BASE });
    assert.equal(result.modelTier, 'gpt-4o');
    assert.ok(result.costUsd > 0);
});

test('gpt-4o-mini model returns tier "gpt-4o-mini" (not gpt-4o)', () => {
    const result = estimateCostUsd({ modelProvider: 'openai', modelProfile: 'gpt-4o-mini', ...BASE });
    assert.equal(result.modelTier, 'gpt-4o-mini');
    assert.ok(result.costUsd > 0);
});

test('cost scales linearly: double tokens = double cost', () => {
    const base = estimateCostUsd({ modelProvider: 'anthropic', modelProfile: 'claude-sonnet', promptTokens: 1_000, completionTokens: 500 });
    const doubled = estimateCostUsd({ modelProvider: 'anthropic', modelProfile: 'claude-sonnet', promptTokens: 2_000, completionTokens: 1_000 });
    assert.ok(
        Math.abs(doubled.costUsd - base.costUsd * 2) < 1e-10,
        `expected ${base.costUsd * 2} but got ${doubled.costUsd}`,
    );
});
