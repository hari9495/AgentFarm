import test from 'node:test';
import assert from 'node:assert/strict';

import { GET } from './route.js';

const SECRET = 'test-session-secret-32-chars-minimum-xx';

const makeReq = (opts: { secret?: string; email?: string } = {}) => {
    const url = new URL('http://localhost/api/auth/dev-otp-peek');
    if (opts.email) url.searchParams.set('email', opts.email);
    const headers = new Headers();
    if (opts.secret !== undefined) headers.set('x-dev-secret', opts.secret);
    return new Request(url, { headers });
};

const withEnv = async (env: Record<string, string | undefined>, fn: () => Promise<void>) => {
    const saved: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(env)) {
        saved[k] = process.env[k];
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
    }
    try {
        await fn();
    } finally {
        for (const [k, v] of Object.entries(saved)) {
            if (v === undefined) delete process.env[k];
            else process.env[k] = v;
        }
    }
};

const seedOtp = (email: string, code: string) => {
    const g = globalThis as typeof globalThis & {
        __otpStore?: Map<string, { code: string; expiresAt: number; sentAt: number; attempts: number }>;
    };
    if (!g.__otpStore) g.__otpStore = new Map();
    g.__otpStore.set(email, { code, expiresAt: Date.now() + 300_000, sentAt: Date.now(), attempts: 0 });
};

// The security fix: the endpoint's own docstring promises "404 in production",
// but it had no such check — it shipped live behind API_SESSION_SECRET, i.e. a
// 2FA-peek reachable in prod. With a real code in the store, production must NOT
// leak it (404), while development still may (200) — distinguishing the prod-gate
// from a coincidental "no otp found" 404.
test('dev-otp-peek does NOT leak the code in production even with a valid secret', async () => {
    seedOtp('info@agentfarms.in', '424242');
    await withEnv({ NODE_ENV: 'production', API_SESSION_SECRET: SECRET, REDIS_URL: undefined }, async () => {
        const res = await GET(makeReq({ secret: SECRET, email: 'info@agentfarms.in' }));
        assert.equal(res.status, 404);
        const body = (await res.json()) as { code?: string };
        assert.equal(body.code, undefined, 'production must never return the OTP code');
    });
});

test('dev-otp-peek DOES return the code in development with a valid secret', async () => {
    seedOtp('dev.user@agentfarms.in', '135790');
    await withEnv({ NODE_ENV: 'development', API_SESSION_SECRET: SECRET, REDIS_URL: undefined }, async () => {
        const res = await GET(makeReq({ secret: SECRET, email: 'dev.user@agentfarms.in' }));
        assert.equal(res.status, 200);
        const body = (await res.json()) as { code?: string };
        assert.equal(body.code, '135790');
    });
});

test('dev-otp-peek returns 401 without the shared secret (non-production)', async () => {
    await withEnv({ NODE_ENV: 'development', API_SESSION_SECRET: SECRET, REDIS_URL: undefined }, async () => {
        const res = await GET(makeReq({ email: 'info@agentfarms.in' }));
        assert.equal(res.status, 401);
    });
});

test('dev-otp-peek works in development with a valid secret (404 when no code stored)', async () => {
    await withEnv({ NODE_ENV: 'development', API_SESSION_SECRET: SECRET, REDIS_URL: undefined }, async () => {
        const res = await GET(makeReq({ secret: SECRET, email: 'nobody@agentfarms.in' }));
        // Reaches the store lookup (not blocked by env/secret gates) and finds nothing.
        assert.equal(res.status, 404);
        const body = (await res.json()) as { error?: string };
        assert.equal(body.error, 'no otp found');
    });
});
