import assert from 'node:assert/strict';
import test from 'node:test';
import { proxyQuestionsGet } from './proxy-core';

test('proxyQuestionsGet returns forbidden when auth header is missing', async () => {
    const result = await proxyQuestionsGet({
        requestUrl: 'http://dashboard.test/api/questions?workspaceId=ws1&tenantId=t1',
        authHeader: null,
        apiBaseUrl: 'http://localhost:3000',
    });

    assert.equal(result.status, 403);
    assert.deepEqual(result.body, {
        error: 'forbidden',
        message: 'Internal session required.',
    });
});

test('proxyQuestionsGet validates required query params', async () => {
    const result = await proxyQuestionsGet({
        requestUrl: 'http://dashboard.test/api/questions?workspaceId=ws1',
        authHeader: 'Bearer internal-token',
        apiBaseUrl: 'http://localhost:3000',
    });

    assert.equal(result.status, 400);
    assert.deepEqual(result.body, {
        error: 'invalid_request',
        message: 'workspaceId and tenantId are required.',
    });
});

test('proxyQuestionsGet forwards request to upstream and returns upstream body', async () => {
    let capturedUrl = '';
    let capturedAuth = '';

    const result = await proxyQuestionsGet({
        requestUrl: 'http://dashboard.test/api/questions?workspaceId=ws one&tenantId=t/1&status=pending',
        authHeader: 'Bearer internal-token',
        apiBaseUrl: 'http://localhost:3000',
        fetchImpl: (async (url, init) => {
            capturedUrl = String(url);
            capturedAuth = String((init?.headers as Record<string, string>).Authorization);
            return {
                status: 200,
                json: async () => ({ items: [{ id: 'q1' }], total: 1 }),
            } as Response;
        }) as typeof fetch,
    });

    assert.equal(
        capturedUrl,
        'http://localhost:3000/questions?workspaceId=ws%20one&tenantId=t%2F1&status=pending',
    );
    assert.equal(capturedAuth, 'Bearer internal-token');
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { items: [{ id: 'q1' }], total: 1 });
});

test('proxyQuestionsGet returns upstream parse error body when JSON parsing fails', async () => {
    const result = await proxyQuestionsGet({
        requestUrl: 'http://dashboard.test/api/questions?workspaceId=ws1&tenantId=t1',
        authHeader: 'Bearer internal-token',
        apiBaseUrl: 'http://localhost:3000',
        fetchImpl: (async () => {
            return {
                status: 502,
                json: async () => {
                    throw new Error('bad json');
                },
            } as unknown as Response;
        }) as typeof fetch,
    });

    assert.equal(result.status, 502);
    assert.deepEqual(result.body, {
        error: 'upstream_error',
        message: 'Unable to parse questions response.',
    });
});
