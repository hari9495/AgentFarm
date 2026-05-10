import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { buildSessionToken } from './lib/session-auth.js';

// ---------------------------------------------------------------------------
// Build a minimal app that mirrors the 3 main.ts behaviours under test
// ---------------------------------------------------------------------------

type SessionPayload = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    scope?: string;
};

function buildTestApp(opts: { allowedOrigins?: string } = {}) {
    const app = Fastify({ logger: false });

    // Replicate SESSION_SECRET env so verifySessionToken works
    const originalSecret = process.env['SESSION_SECRET'];
    process.env['SESSION_SECRET'] = process.env['SESSION_SECRET'] ?? 'test-secret-32-chars-minimum-ok!';

    // FIX 2 — security headers on every response
    app.addHook('onSend', async (_req, reply) => {
        reply.header('X-Content-Type-Options', 'nosniff');
        reply.header('X-Frame-Options', 'DENY');
        reply.header('X-XSS-Protection', '1; mode=block');
        reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
        reply.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
        reply.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    });

    // FIX 3 — CORS origin validation inside preHandler
    app.addHook('preHandler', async (request, reply) => {
        const allowedOriginsEnv = opts.allowedOrigins ?? process.env['ALLOWED_ORIGINS'];
        const origin = request.headers['origin'];
        if (allowedOriginsEnv && typeof origin === 'string') {
            const allowedList = allowedOriginsEnv.split(',').map((s) => s.trim());
            if (!allowedList.includes(origin)) {
                reply.header('Vary', 'Origin');
                void reply.code(403).send({ error: 'origin not allowed' });
                return;
            }
            reply.header('Access-Control-Allow-Origin', origin);
            reply.header('Vary', 'Origin');
        }
    });

    // FIX 1 — minimal /health
    app.get('/health', async () => ({
        status: 'ok',
        service: 'api-gateway',
        ts: new Date().toISOString(),
    }));

    // FIX 1 — /health/detail requires internal session
    app.get('/health/detail', async (request, reply) => {
        const authHeader = request.headers['authorization'];
        const token = typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')
            ? authHeader.slice(7).trim()
            : null;

        let session: SessionPayload | null = null;
        if (token) {
            try {
                const { verifySessionToken } = await import('./lib/session-auth.js');
                session = verifySessionToken(token) as SessionPayload | null;
            } catch { /* invalid token */ }
        }

        if (!session || session.scope !== 'internal') {
            return reply.code(401).send({ error: 'unauthorized' });
        }

        return {
            status: 'ok',
            service: 'api-gateway',
            db: 'connected',
            uptime: process.uptime(),
            memoryMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
            ts: new Date().toISOString(),
        };
    });

    void app.ready();
    return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('GET /health returns 200 with status, service, and ts fields', async () => {
    const app = buildTestApp();
    const res = await app.inject({ method: 'GET', url: '/health' });
    assert.equal(res.statusCode, 200);
    const body = res.json<Record<string, unknown>>();
    assert.equal(body.status, 'ok');
    assert.equal(body.service, 'api-gateway');
    assert.ok(typeof body.ts === 'string', 'ts should be a string');
});

test('GET /health does NOT return db, uptime, or memoryMb fields', async () => {
    const app = buildTestApp();
    const res = await app.inject({ method: 'GET', url: '/health' });
    const body = res.json<Record<string, unknown>>();
    assert.equal(body.db, undefined);
    assert.equal(body.uptime, undefined);
    assert.equal(body.memoryMb, undefined);
});

test('GET /health/detail without session returns 401', async () => {
    const app = buildTestApp();
    const res = await app.inject({ method: 'GET', url: '/health/detail' });
    assert.equal(res.statusCode, 401);
    assert.equal(res.json<{ error: string }>().error, 'unauthorized');
});

test('GET /health/detail with non-internal session returns 401', async () => {
    const app = buildTestApp();
    const token = buildSessionToken({
        userId: 'u1',
        tenantId: 'tenant-1',
        workspaceIds: ['ws-1'],
    });
    const res = await app.inject({
        method: 'GET',
        url: '/health/detail',
        headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(res.statusCode, 401);
});

test('Response includes X-Content-Type-Options: nosniff header', async () => {
    const app = buildTestApp();
    const res = await app.inject({ method: 'GET', url: '/health' });
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
});

test('Response includes X-Frame-Options: DENY header', async () => {
    const app = buildTestApp();
    const res = await app.inject({ method: 'GET', url: '/health' });
    assert.equal(res.headers['x-frame-options'], 'DENY');
});

test('Response includes X-XSS-Protection header', async () => {
    const app = buildTestApp();
    const res = await app.inject({ method: 'GET', url: '/health' });
    assert.equal(res.headers['x-xss-protection'], '1; mode=block');
});

test('Response includes Referrer-Policy header', async () => {
    const app = buildTestApp();
    const res = await app.inject({ method: 'GET', url: '/health' });
    assert.equal(res.headers['referrer-policy'], 'strict-origin-when-cross-origin');
});

test('Response includes Content-Security-Policy header', async () => {
    const app = buildTestApp();
    const res = await app.inject({ method: 'GET', url: '/health' });
    assert.ok(res.headers['content-security-policy']?.includes("frame-ancestors 'none'"));
});

test('With ALLOWED_ORIGINS set, request from unlisted origin returns 403', async () => {
    const app = buildTestApp({ allowedOrigins: 'https://allowed.example.com' });
    const res = await app.inject({
        method: 'GET',
        url: '/health',
        headers: { origin: 'https://evil.example.com' },
    });
    assert.equal(res.statusCode, 403);
    assert.equal(res.json<{ error: string }>().error, 'origin not allowed');
});

test('With ALLOWED_ORIGINS set, request from listed origin is allowed', async () => {
    const app = buildTestApp({ allowedOrigins: 'https://allowed.example.com,https://other.example.com' });
    const res = await app.inject({
        method: 'GET',
        url: '/health',
        headers: { origin: 'https://allowed.example.com' },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['access-control-allow-origin'], 'https://allowed.example.com');
    assert.equal(res.headers['vary'], 'Origin');
});

test('With ALLOWED_ORIGINS unset, any origin is allowed', async () => {
    const app = buildTestApp({ allowedOrigins: undefined });
    const res = await app.inject({
        method: 'GET',
        url: '/health',
        headers: { origin: 'https://any.example.com' },
    });
    assert.equal(res.statusCode, 200);
});

test('Without Origin header, ALLOWED_ORIGINS check is skipped', async () => {
    const app = buildTestApp({ allowedOrigins: 'https://allowed.example.com' });
    const res = await app.inject({ method: 'GET', url: '/health' });
    // No origin header — should pass through
    assert.equal(res.statusCode, 200);
});
