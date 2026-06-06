/**
 * portal-support-proxy.test.ts
 *
 * Unit tests for the /api/portal/support/[...path] Next.js route handler.
 *
 * Strategy: mock `next/headers` (cookies) using node:test mock.module(),
 * then call the exported GET/POST handlers directly with a mock NextRequest.
 * A lightweight Node.js http server acts as the fake api-gateway upstream.
 */

import assert from 'node:assert/strict';
import { describe, it, before, after, mock } from 'node:test';
import http from 'node:http';

// ---------------------------------------------------------------------------
// Helpers: mock NextRequest
// ---------------------------------------------------------------------------

class MockNextRequest {
    readonly method: string;
    readonly url: string;
    readonly headers: Headers;
    private _body: string;
    readonly cookies = { get: (_name: string) => undefined as { value: string } | undefined };

    constructor(opts: { method?: string; url?: string; body?: string; cookie?: string }) {
        this.method = opts.method ?? 'GET';
        this.url = opts.url ?? 'http://localhost/api/portal/support/issues';
        this.headers = new Headers();
        if (opts.cookie) {
            this.headers.set('cookie', opts.cookie);
            // Expose via cookies.get for the route handler
            (this.cookies as { get: (n: string) => { value: string } | undefined }).get = (name: string) => {
                const match = opts.cookie!.split(';').map((v) => v.trim()).find((v) => v.startsWith(`${name}=`));
                return match ? { value: decodeURIComponent(match.slice(name.length + 1)) } : undefined;
            };
        }
        this._body = opts.body ?? '';
    }

    async text(): Promise<string> { return this._body; }
}

// ---------------------------------------------------------------------------
// Fake upstream api-gateway (plain http.createServer — no Fastify dep)
// ---------------------------------------------------------------------------

let upstream: http.Server;
let upstreamPort: number;
let lastUpstreamRequest: { method: string; path: string; cookie: string | null } | null = null;

before(async () => {
    process.env['DASHBOARD_API_BASE_URL'] = '';

    upstream = http.createServer((req, res) => {
        lastUpstreamRequest = { method: req.method ?? 'GET', path: req.url ?? '/', cookie: req.headers['cookie'] ?? null };
        res.setHeader('content-type', 'application/json');
        if (req.method === 'GET') {
            res.end(JSON.stringify({ issues: [{ id: 'test-1', title: 'Test issue' }] }));
        } else {
            res.end(JSON.stringify({ id: 'new-1', title: 'New' }));
        }
    });

    await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
    upstreamPort = (upstream.address() as { port: number }).port;

    process.env['DASHBOARD_API_BASE_URL'] = `http://127.0.0.1:${upstreamPort}`;

    // Mock next/headers BEFORE importing the route handler
    await mock.module('next/headers', {
        namedExports: {
            cookies: () => Promise.resolve({
                get: (name: string) => {
                    // Default: no cookie — individual tests override via MockNextRequest
                    if (name === 'portal_session') return undefined;
                    return undefined;
                },
            }),
        },
    });
});

after(async () => {
    await new Promise<void>((resolve, reject) => upstream.close((err) => err ? reject(err) : resolve()));
    mock.restoreAll();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('portal support proxy — GET', () => {
    it('returns 401 when no portal_session cookie', async () => {
        // Dynamically import AFTER mock.module() is set up
        const { GET } = await import('./[...path]/route.js');

        const req = new MockNextRequest({ url: 'http://localhost/api/portal/support/issues' });
        const res = await GET(req as never, { params: Promise.resolve({ path: ['issues'] }) });

        assert.equal(res.status, 401);
        const body = await res.json() as { error: string };
        assert.equal(body.error, 'unauthorized');
    });

    it('forwards portal_session cookie to upstream and returns response', async () => {
        const { GET } = await import('./[...path]/route.js');

        const req = new MockNextRequest({
            url: 'http://localhost/api/portal/support/issues',
            cookie: 'portal_session=test-valid-token',
        });
        const res = await GET(req as never, { params: Promise.resolve({ path: ['issues'] }) });

        assert.equal(res.status, 200);
        assert.ok(lastUpstreamRequest, 'upstream should have been called');
        assert.equal(lastUpstreamRequest.method, 'GET');
        assert.equal(lastUpstreamRequest.path, '/v1/support/issues');
        assert.ok(lastUpstreamRequest.cookie?.includes('portal_session=test-valid-token'), 'portal_session must be forwarded');
    });

    it('passes query string through to upstream', async () => {
        const { GET } = await import('./[...path]/route.js');

        const req = new MockNextRequest({
            url: 'http://localhost/api/portal/support/issues?status=resolved',
            cookie: 'portal_session=test-token',
        });
        const res = await GET(req as never, { params: Promise.resolve({ path: ['issues'] }) });
        // 200 or 404 from upstream — main thing is it gets proxied, not 401/502
        assert.notEqual(res.status, 401);
        assert.notEqual(res.status, 502);
    });

    it('returns 502 when upstream is unreachable', async () => {
        const { GET } = await import('./[...path]/route.js');

        // Temporarily point to a non-listening port
        const saved = process.env['DASHBOARD_API_BASE_URL'];
        process.env['DASHBOARD_API_BASE_URL'] = 'http://127.0.0.1:1'; // port 1 = refused

        const req = new MockNextRequest({
            url: 'http://localhost/api/portal/support/issues',
            cookie: 'portal_session=any-token',
        });
        const res = await GET(req as never, { params: Promise.resolve({ path: ['issues'] }) });
        assert.equal(res.status, 502);

        process.env['DASHBOARD_API_BASE_URL'] = saved;
    });
});

describe('portal support proxy — POST', () => {
    it('returns 401 when no portal_session cookie', async () => {
        const { POST } = await import('./[...path]/route.js');

        const req = new MockNextRequest({ method: 'POST', url: 'http://localhost/api/portal/support/issues', body: '{}' });
        const res = await POST(req as never, { params: Promise.resolve({ path: ['issues'] }) });
        assert.equal(res.status, 401);
    });

    it('forwards POST body and cookie to upstream', async () => {
        const { POST } = await import('./[...path]/route.js');

        const req = new MockNextRequest({
            method: 'POST',
            url: 'http://localhost/api/portal/support/issues',
            cookie: 'portal_session=post-token',
            body: JSON.stringify({ description: 'test issue' }),
        });
        const res = await POST(req as never, { params: Promise.resolve({ path: ['issues'] }) });

        assert.ok(res.status < 500);
        assert.ok(lastUpstreamRequest?.cookie?.includes('portal_session=post-token'));
    });
});
