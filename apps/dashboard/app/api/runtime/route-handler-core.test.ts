import assert from 'node:assert/strict';
import test from 'node:test';
import { runRuntimeProxy } from './route-handler-core';

const okResponse = (body: unknown) => ({
    ok: true,
    status: 200,
    json: async () => body,
}) as unknown as Response;

const errorResponse = (status: number) => ({
    ok: false,
    status,
    json: async () => ({ message: 'ignored for error branch' }),
}) as unknown as Response;

test('runRuntimeProxy returns 401 when session auth header is missing', async () => {
    let called = false;

    const result = await runRuntimeProxy({
        sessionAuthHeader: null,
        upstreamUrl: 'http://localhost:8080/health/live',
        requestInit: { method: 'GET' },
        fetchImpl: (async () => {
            called = true;
            return okResponse({});
        }) as typeof fetch,
    });

    assert.equal(called, false);
    assert.equal(result.status, 401);
    assert.deepEqual(result.body, {
        error: 'unauthorized',
        message: 'Missing session cookie.',
    });
});

test('runRuntimeProxy returns upstream JSON body on successful GET', async () => {
    let capturedUrl = '';
    let capturedInit: RequestInit | undefined;

    const result = await runRuntimeProxy({
        sessionAuthHeader: 'Bearer session-token',
        upstreamUrl: 'http://localhost:8080/health/live',
        requestInit: { method: 'GET', headers: { Authorization: 'Bearer runtime-token' } },
        fetchImpl: (async (url, init) => {
            capturedUrl = String(url);
            capturedInit = init;
            return okResponse({ status: 'ok', heartbeat_sent: 5 });
        }) as typeof fetch,
    });

    assert.equal(capturedUrl, 'http://localhost:8080/health/live');
    assert.equal(capturedInit?.method, 'GET');
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { status: 'ok', heartbeat_sent: 5 });
});

test('runRuntimeProxy returns runtime_error for non-2xx upstream status', async () => {
    const result = await runRuntimeProxy({
        sessionAuthHeader: 'Bearer session-token',
        upstreamUrl: 'http://localhost:8080/logs?limit=50',
        requestInit: { method: 'GET' },
        fetchImpl: (async () => errorResponse(502)) as typeof fetch,
    });

    assert.equal(result.status, 502);
    assert.deepEqual(result.body, {
        error: 'runtime_error',
        message: 'Runtime returned 502',
    });
});

test('runRuntimeProxy returns runtime_unreachable when fetch throws', async () => {
    const result = await runRuntimeProxy({
        sessionAuthHeader: 'Bearer session-token',
        upstreamUrl: 'http://localhost:8080/state/history?limit=20',
        requestInit: { method: 'GET' },
        fetchImpl: (async () => {
            throw new Error('network down');
        }) as typeof fetch,
    });

    assert.equal(result.status, 503);
    assert.deepEqual(result.body, {
        error: 'runtime_unreachable',
        message: 'Agent runtime is not reachable.',
    });
});

test('runRuntimeProxy forwards POST options for kill-switch routes', async () => {
    let capturedInit: RequestInit | undefined;

    const result = await runRuntimeProxy({
        sessionAuthHeader: 'Bearer session-token',
        upstreamUrl: 'http://localhost:8080/kill',
        requestInit: {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
            },
        },
        fetchImpl: (async (_url, init) => {
            capturedInit = init;
            return okResponse({ status: 'killswitch_engaged' });
        }) as typeof fetch,
    });

    assert.equal(capturedInit?.method, 'POST');
    assert.deepEqual(capturedInit?.headers, { 'content-type': 'application/json' });
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { status: 'killswitch_engaged' });
});
