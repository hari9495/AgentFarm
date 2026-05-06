import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveEvaluatorWebhookUrl, fireEvaluatorWebhook } from './evaluator-webhook.js';

test('resolveEvaluatorWebhookUrl returns null when env var is absent', () => {
    assert.equal(resolveEvaluatorWebhookUrl({}), null);
});

test('resolveEvaluatorWebhookUrl returns null for empty string', () => {
    assert.equal(resolveEvaluatorWebhookUrl({ RUNTIME_EVALUATOR_WEBHOOK_URL: '' }), null);
});

test('resolveEvaluatorWebhookUrl returns null for whitespace-only value', () => {
    assert.equal(resolveEvaluatorWebhookUrl({ RUNTIME_EVALUATOR_WEBHOOK_URL: '   ' }), null);
});

test('resolveEvaluatorWebhookUrl returns null for non-http scheme', () => {
    assert.equal(
        resolveEvaluatorWebhookUrl({ RUNTIME_EVALUATOR_WEBHOOK_URL: 'ftp://example.com/eval' }),
        null,
    );
});

test('resolveEvaluatorWebhookUrl returns null for invalid URL', () => {
    assert.equal(
        resolveEvaluatorWebhookUrl({ RUNTIME_EVALUATOR_WEBHOOK_URL: 'not-a-url' }),
        null,
    );
});

test('resolveEvaluatorWebhookUrl returns URL for valid https URL', () => {
    const url = 'https://eval.example.com/webhook';
    assert.equal(
        resolveEvaluatorWebhookUrl({ RUNTIME_EVALUATOR_WEBHOOK_URL: url }),
        url,
    );
});

test('resolveEvaluatorWebhookUrl returns URL for valid http URL', () => {
    const url = 'http://localhost:9000/eval';
    assert.equal(
        resolveEvaluatorWebhookUrl({ RUNTIME_EVALUATOR_WEBHOOK_URL: url }),
        url,
    );
});

test('resolveEvaluatorWebhookUrl trims whitespace around valid URL', () => {
    const url = 'https://eval.example.com/webhook';
    assert.equal(
        resolveEvaluatorWebhookUrl({ RUNTIME_EVALUATOR_WEBHOOK_URL: `  ${url}  ` }),
        url,
    );
});

test('fireEvaluatorWebhook calls fetch with POST and correct content-type', async (t) => {
    const calls: Array<{ url: string; body: unknown }> = [];

    t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
        calls.push({ url, body: JSON.parse(options.body as string) });
        return new Response('{}', { status: 200 });
    });

    fireEvaluatorWebhook({
        taskId: 'task-1',
        correlationId: 'corr-1',
        tenantId: 'tenant-1',
        workspaceId: 'ws-1',
        botId: 'bot-1',
        provider: 'azure-openai',
        actionType: 'send_message',
        executionStatus: 'success',
        riskLevel: 'low',
        latencyMs: 120,
        promptTokens: 50,
        completionTokens: 30,
        heuristicScore: 0.9,
        callbackUrl: 'http://localhost:4000/runtime/quality/signals',
        webhookUrl: 'https://eval.example.com/webhook',
    });

    // Give the micro-task queue a chance to flush
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, 'https://eval.example.com/webhook');
    const body = calls[0]?.body as Record<string, unknown>;
    assert.equal(body['schema_version'], '1.0.0');
    assert.equal(body['event_type'], 'task_outcome');
    assert.equal(body['task_id'], 'task-1');
    assert.equal(body['provider'], 'azure-openai');
    assert.equal(body['execution_status'], 'success');
    assert.equal(body['callback_url'], 'http://localhost:4000/runtime/quality/signals');
});

test('fireEvaluatorWebhook does not throw when fetch rejects', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => {
        throw new Error('network failure');
    });

    // Must not throw
    assert.doesNotThrow(() => {
        fireEvaluatorWebhook({
            taskId: 'task-fail',
            correlationId: 'corr-fail',
            tenantId: 'tenant-1',
            workspaceId: 'ws-1',
            botId: 'bot-1',
            provider: 'azure-openai',
            actionType: 'send_message',
            executionStatus: 'failed',
            riskLevel: 'low',
            latencyMs: 50,
            promptTokens: null,
            completionTokens: null,
            heuristicScore: 0.1,
            callbackUrl: 'http://localhost:4000/runtime/quality/signals',
            webhookUrl: 'https://eval.example.com/webhook',
        });
    });

    // Give the micro-task queue a chance to flush (error swallowed)
    await new Promise<void>((resolve) => setImmediate(resolve));
});
