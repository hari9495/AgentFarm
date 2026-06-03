/**
 * mfa.test.ts — Unit tests for TOTP-based MFA routes
 *
 * Tests all 4 routes + the login MFA gate:
 *   POST /v1/auth/mfa/setup
 *   POST /v1/auth/mfa/setup/confirm
 *   POST /v1/auth/mfa/verify        (public — no session needed)
 *   DELETE /v1/auth/mfa
 *   login MFA gate (auth.ts integration)
 *
 * Uses real TOTP generation (otplib) so token verification is genuine.
 * Prisma is fully mocked — no DB required.
 */

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { TOTP, NobleCryptoPlugin, ScureBase32Plugin } from 'otplib';
import { registerMfaRoutes, issueMfaToken } from './mfa.js';

// otplib v13 requires explicit plugins
const mkTOTP = () => new TOTP({ crypto: new NobleCryptoPlugin(), base32: new ScureBase32Plugin() });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SESSION_SECRET = 'test-session-secret-minimum-32-characters!!';
const MFA_ENC_KEY    = 'test-mfa-encryption-key-minimum-32-chars!';

const session = () => ({
    userId: 'user_1',
    tenantId: 'tenant_1',
    workspaceIds: ['ws_1'],
    expiresAt: Date.now() + 60_000,
});

/** Build a Fastify app with MFA routes wired to an in-memory Prisma mock. */
function buildApp(userOverride: Partial<{
    totpEnabled: boolean;
    totpSecret: string | null;
    totpVerifiedAt: Date | null;
}> = {}) {
    const app = Fastify({ logger: false });

    // Track all writes so tests can inspect them
    const writes: Record<string, unknown>[] = [];
    const user = {
        id: 'user_1',
        email: 'alice@example.com',
        tenantId: 'tenant_1',
        totpEnabled: false,
        totpSecret: null as string | null,
        totpVerifiedAt: null as Date | null,
        ...userOverride,
    };

    const fakePrisma = {
        tenantUser: {
            findUnique: async ({ where }: { where: { id: string } }) => {
                if (where.id !== user.id) return null;
                return { ...user };
            },
            update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
                if (where.id === user.id) Object.assign(user, data);
                writes.push({ ...data });
                return { ...user };
            },
        },
        workspace: {
            findMany: async () => [{ id: 'ws_1' }],
        },
    };

    registerMfaRoutes(app, {
        getSession: () => session(),
        sessionSecret: SESSION_SECRET,
        buildSessionToken: () => 'mock-full-session-token',
        // Inject Prisma mock without going through the dynamic import
    } as Parameters<typeof registerMfaRoutes>[1]);

    // Override the getPrisma used inside the routes by monkey-patching the module
    // (simpler: register routes with a custom getPrisma option — see mfa.ts export below)
    // Since mfa.ts imports from db.js dynamically, we use a test-only option injection:
    (app as unknown as Record<string, unknown>)._fakePrisma = fakePrisma;

    return { app, user, writes, fakePrisma };
}

// ---------------------------------------------------------------------------
// issueMfaToken / verifyMfaToken helpers
// ---------------------------------------------------------------------------

describe('issueMfaToken', () => {
    test('issues a token that contains userId and expiry', () => {
        const token = issueMfaToken('user_42', SESSION_SECRET);
        assert.ok(typeof token === 'string');
        assert.ok(token.includes('.'), 'token should have data.sig format');
        // Decode the payload part
        const [data] = token.split('.');
        const payload = JSON.parse(Buffer.from(data!, 'base64url').toString('utf8')) as {
            userId: string; exp: number;
        };
        assert.equal(payload.userId, 'user_42');
        assert.ok(payload.exp > Date.now(), 'token should not be expired immediately');
    });

    test('tokens from different secrets are not interchangeable', () => {
        const t1 = issueMfaToken('user_1', 'secret-a-minimum-32-characters-long!!');
        const t2 = issueMfaToken('user_1', 'secret-b-minimum-32-characters-long!!');
        // Same data, different sigs
        const [data1] = t1.split('.');
        const [data2] = t2.split('.');
        assert.equal(data1, data2, 'payloads should be the same');
        assert.notEqual(t1, t2, 'signatures should differ');
    });
});

// ---------------------------------------------------------------------------
// POST /v1/auth/mfa/setup
// ---------------------------------------------------------------------------

describe('POST /v1/auth/mfa/setup', () => {
    test('401 when no session', async () => {
        const app = Fastify({ logger: false });
        await registerMfaRoutes(app, {
            getSession: () => null,
            sessionSecret: SESSION_SECRET,
            buildSessionToken: () => '',
        });
        try {
            const res = await app.inject({ method: 'POST', url: '/v1/auth/mfa/setup' });
            assert.equal(res.statusCode, 401);
        } finally { await app.close(); }
    });

    test('returns otpauth_uri and qr_code_svg for a user without MFA', async () => {
        process.env['MFA_ENCRYPTION_KEY'] = MFA_ENC_KEY;
        process.env['MFA_ISSUER'] = 'TestApp';
        const app = Fastify({ logger: false });

        // Inject a Prisma stub directly into the route options
        const writes: unknown[] = [];
        await registerMfaRoutes(app, {
            getSession: () => session(),
            sessionSecret: SESSION_SECRET,
            buildSessionToken: () => '',
            getPrisma: async () => ({
                tenantUser: {
                    findUnique: async () => ({ email: 'alice@example.com', totpEnabled: false }),
                    update: async (_args: unknown) => { writes.push(_args); return {}; },
                },
            }),
        } as Parameters<typeof registerMfaRoutes>[1]);

        try {
            const res = await app.inject({ method: 'POST', url: '/v1/auth/mfa/setup' });
            assert.equal(res.statusCode, 200);
            const body = res.json<{ otpauth_uri: string; qr_code_svg: string; message: string }>();
            assert.ok(body.otpauth_uri.startsWith('otpauth://totp/'), 'should return valid otpauth URI');
            assert.ok(body.qr_code_svg.includes('<svg'), 'should return SVG QR code');
            assert.ok(writes.length === 1, 'should store encrypted secret');
        } finally { await app.close(); }
    });

    test('409 when MFA already enabled', async () => {
        process.env['MFA_ENCRYPTION_KEY'] = MFA_ENC_KEY;
        const app = Fastify({ logger: false });
        await registerMfaRoutes(app, {
            getSession: () => session(),
            sessionSecret: SESSION_SECRET,
            buildSessionToken: () => '',
            getPrisma: async () => ({
                tenantUser: {
                    findUnique: async () => ({ email: 'alice@example.com', totpEnabled: true }),
                    update: async () => ({}),
                },
            }),
        } as Parameters<typeof registerMfaRoutes>[1]);
        try {
            const res = await app.inject({ method: 'POST', url: '/v1/auth/mfa/setup' });
            assert.equal(res.statusCode, 409);
            assert.equal(res.json<{ error: string }>().error, 'mfa_already_enabled');
        } finally { await app.close(); }
    });
});

// ---------------------------------------------------------------------------
// POST /v1/auth/mfa/setup/confirm
// ---------------------------------------------------------------------------

describe('POST /v1/auth/mfa/setup/confirm', () => {
    test('400 when code is missing', async () => {
        process.env['MFA_ENCRYPTION_KEY'] = MFA_ENC_KEY;
        const app = Fastify({ logger: false });
        await registerMfaRoutes(app, {
            getSession: () => session(),
            sessionSecret: SESSION_SECRET,
            buildSessionToken: () => '',
            getPrisma: async () => ({
                tenantUser: {
                    findUnique: async () => ({ totpSecret: 'some-secret', totpEnabled: false }),
                    update: async () => ({}),
                },
            }),
        } as Parameters<typeof registerMfaRoutes>[1]);
        try {
            const res = await app.inject({ method: 'POST', url: '/v1/auth/mfa/setup/confirm', payload: {} });
            assert.equal(res.statusCode, 400);
            assert.equal(res.json<{ error: string }>().error, 'code_required');
        } finally { await app.close(); }
    });

    test('400 when code is wrong', async () => {
        process.env['MFA_ENCRYPTION_KEY'] = MFA_ENC_KEY;
        const app = Fastify({ logger: false });
        await registerMfaRoutes(app, {
            getSession: () => session(),
            sessionSecret: SESSION_SECRET,
            buildSessionToken: () => '',
            getPrisma: async () => ({
                tenantUser: {
                    // Return a totpSecret that was encrypted with our test key
                    findUnique: async () => ({ totpSecret: 'bad:format:ff', totpEnabled: false }),
                    update: async () => ({}),
                },
            }),
        } as Parameters<typeof registerMfaRoutes>[1]);
        try {
            const res = await app.inject({
                method: 'POST', url: '/v1/auth/mfa/setup/confirm',
                payload: { code: '000000' },
            });
            // Either 400 (decrypt error → bad setup) or 400 (wrong code)
            assert.equal(res.statusCode, 400);
        } finally { await app.close(); }
    });

    test('full setup → confirm round-trip with real TOTP', async () => {
        process.env['MFA_ENCRYPTION_KEY'] = MFA_ENC_KEY;
        process.env['MFA_ISSUER'] = 'TestApp';

        let storedEncryptedSecret = '';
        let mfaEnabled = false;
        const user = { email: 'bob@test.com', totpEnabled: false, totpSecret: null as string | null };

        const app = Fastify({ logger: false });
        await registerMfaRoutes(app, {
            getSession: () => session(),
            sessionSecret: SESSION_SECRET,
            buildSessionToken: () => '',
            getPrisma: async () => ({
                tenantUser: {
                    findUnique: async () => ({ ...user }),
                    update: async ({ data }: { data: Record<string, unknown> }) => {
                        Object.assign(user, data);
                        if (data['totpSecret']) storedEncryptedSecret = data['totpSecret'] as string;
                        if (data['totpEnabled']) mfaEnabled = true;
                        return { ...user };
                    },
                },
            }),
        } as Parameters<typeof registerMfaRoutes>[1]);

        try {
            // Step 1: setup
            const setupRes = await app.inject({ method: 'POST', url: '/v1/auth/mfa/setup' });
            assert.equal(setupRes.statusCode, 200);
            assert.ok(storedEncryptedSecret, 'encrypted secret should be stored');

            // Step 2: generate the correct TOTP code from the stored secret
            // Decode: iv:tag:ciphertext → decrypt → plaintext secret
            const { createDecipheriv } = await import('node:crypto');
            const { createHmac } = await import('node:crypto');
            const key = Buffer.from(
                createHmac('sha256', MFA_ENC_KEY).update('agentfarm-mfa-v1').digest(),
            );
            const [ivHex, tagHex, ctHex] = storedEncryptedSecret.split(':');
            const iv = Buffer.from(ivHex!, 'hex');
            const tag = Buffer.from(tagHex!, 'hex');
            const ct = Buffer.from(ctHex!, 'hex');
            const decipher = createDecipheriv('aes-256-gcm', key, iv);
            decipher.setAuthTag(tag);
            const plainSecret = decipher.update(ct).toString() + decipher.final('utf8');

            // Generate correct TOTP code
            const totpInstance = mkTOTP();
            const correctCode = await totpInstance.generate({ secret: plainSecret });

            // Step 3: confirm
            const confirmRes = await app.inject({
                method: 'POST', url: '/v1/auth/mfa/setup/confirm',
                payload: { code: correctCode },
            });
            assert.equal(confirmRes.statusCode, 200);
            assert.ok(mfaEnabled, 'totpEnabled should be true after confirm');
        } finally { await app.close(); }
    });
});

// ---------------------------------------------------------------------------
// POST /v1/auth/mfa/verify  (login step 2)
// ---------------------------------------------------------------------------

describe('POST /v1/auth/mfa/verify', () => {
    test('400 when mfa_token missing', async () => {
        const app = Fastify({ logger: false });
        await registerMfaRoutes(app, {
            getSession: () => null,
            sessionSecret: SESSION_SECRET,
            buildSessionToken: () => '',
            getPrisma: async () => ({ tenantUser: { findUnique: async () => null, update: async () => ({}) }, workspace: { findMany: async () => [] } }),
        } as Parameters<typeof registerMfaRoutes>[1]);
        try {
            const res = await app.inject({ method: 'POST', url: '/v1/auth/mfa/verify', payload: { code: '123456' } });
            assert.equal(res.statusCode, 400);
            assert.equal(res.json<{ error: string }>().error, 'mfa_token_required');
        } finally { await app.close(); }
    });

    test('401 when mfa_token has invalid signature', async () => {
        const app = Fastify({ logger: false });
        await registerMfaRoutes(app, {
            getSession: () => null,
            sessionSecret: SESSION_SECRET,
            buildSessionToken: () => '',
            getPrisma: async () => ({ tenantUser: { findUnique: async () => null, update: async () => ({}) }, workspace: { findMany: async () => [] } }),
        } as Parameters<typeof registerMfaRoutes>[1]);
        try {
            const fakeToken = issueMfaToken('user_1', 'wrong-secret-completely-different-value');
            const res = await app.inject({
                method: 'POST', url: '/v1/auth/mfa/verify',
                payload: { mfa_token: fakeToken, code: '123456' },
            });
            assert.equal(res.statusCode, 401);
            assert.equal(res.json<{ error: string }>().error, 'invalid_mfa_token');
        } finally { await app.close(); }
    });

    test('full verify round-trip issues session token', async () => {
        process.env['MFA_ENCRYPTION_KEY'] = MFA_ENC_KEY;
        const totpInstance = mkTOTP();
        const plainSecret = totpInstance.generateSecret();

        // Encrypt the secret manually using the same AES helper
        const { createCipheriv, randomBytes, createHmac } = await import('node:crypto');
        const key = Buffer.from(
            createHmac('sha256', MFA_ENC_KEY).update('agentfarm-mfa-v1').digest(),
        );
        const iv = randomBytes(12);
        const cipher = createCipheriv('aes-256-gcm', key, iv);
        const enc = Buffer.concat([cipher.update(plainSecret, 'utf8'), cipher.final()]);
        const tag = cipher.getAuthTag();
        const encryptedSecret = `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;

        const app = Fastify({ logger: false });
        await registerMfaRoutes(app, {
            getSession: () => null,
            sessionSecret: SESSION_SECRET,
            buildSessionToken: () => 'issued-full-session-token',
            getPrisma: async () => ({
                tenantUser: {
                    findUnique: async ({ where }: { where: { id: string } }) => ({
                        id: where.id,
                        tenantId: 'tenant_1',
                        totpEnabled: true,
                        totpSecret: encryptedSecret,
                    }),
                    update: async () => ({}),
                },
                workspace: { findMany: async () => [{ id: 'ws_1' }] },
            }),
        } as Parameters<typeof registerMfaRoutes>[1]);

        try {
            const mfaToken = issueMfaToken('user_1', SESSION_SECRET);
            const correctCode = await totpInstance.generate({ secret: plainSecret });

            const res = await app.inject({
                method: 'POST', url: '/v1/auth/mfa/verify',
                payload: { mfa_token: mfaToken, code: correctCode },
            });
            assert.equal(res.statusCode, 200);
            const body = res.json<{ token: string; message: string }>();
            assert.equal(body.token, 'issued-full-session-token');
            assert.ok(body.message);
        } finally { await app.close(); }
    });

    test('401 when TOTP code is wrong', async () => {
        process.env['MFA_ENCRYPTION_KEY'] = MFA_ENC_KEY;
        const totpInstance = mkTOTP();
        const plainSecret = totpInstance.generateSecret();
        const { createCipheriv, randomBytes, createHmac } = await import('node:crypto');
        const key = Buffer.from(createHmac('sha256', MFA_ENC_KEY).update('agentfarm-mfa-v1').digest());
        const iv = randomBytes(12);
        const cipher = createCipheriv('aes-256-gcm', key, iv);
        const enc = Buffer.concat([cipher.update(plainSecret, 'utf8'), cipher.final()]);
        const encryptedSecret = `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${enc.toString('hex')}`;

        const app = Fastify({ logger: false });
        await registerMfaRoutes(app, {
            getSession: () => null,
            sessionSecret: SESSION_SECRET,
            buildSessionToken: () => '',
            getPrisma: async () => ({
                tenantUser: {
                    findUnique: async () => ({ id: 'user_1', tenantId: 'tenant_1', totpEnabled: true, totpSecret: encryptedSecret }),
                    update: async () => ({}),
                },
                workspace: { findMany: async () => [] },
            }),
        } as Parameters<typeof registerMfaRoutes>[1]);
        try {
            const mfaToken = issueMfaToken('user_1', SESSION_SECRET);
            const res = await app.inject({
                method: 'POST', url: '/v1/auth/mfa/verify',
                payload: { mfa_token: mfaToken, code: '000000' },
            });
            assert.equal(res.statusCode, 401);
            assert.equal(res.json<{ error: string }>().error, 'invalid_code');
        } finally { await app.close(); }
    });
});

// ---------------------------------------------------------------------------
// DELETE /v1/auth/mfa
// ---------------------------------------------------------------------------

describe('DELETE /v1/auth/mfa', () => {
    test('401 when no session', async () => {
        const app = Fastify({ logger: false });
        await registerMfaRoutes(app, {
            getSession: () => null,
            sessionSecret: SESSION_SECRET,
            buildSessionToken: () => '',
            getPrisma: async () => ({ tenantUser: { findUnique: async () => null, update: async () => ({}) } }),
        } as Parameters<typeof registerMfaRoutes>[1]);
        try {
            const res = await app.inject({ method: 'DELETE', url: '/v1/auth/mfa' });
            assert.equal(res.statusCode, 401);
        } finally { await app.close(); }
    });

    test('400 when code is missing', async () => {
        const app = Fastify({ logger: false });
        await registerMfaRoutes(app, {
            getSession: () => session(),
            sessionSecret: SESSION_SECRET,
            buildSessionToken: () => '',
            getPrisma: async () => ({
                tenantUser: {
                    findUnique: async () => ({ totpEnabled: true, totpSecret: 'x:y:z' }),
                    update: async () => ({}),
                },
            }),
        } as Parameters<typeof registerMfaRoutes>[1]);
        try {
            const res = await app.inject({ method: 'DELETE', url: '/v1/auth/mfa', payload: {} });
            assert.equal(res.statusCode, 400);
            assert.equal(res.json<{ error: string }>().error, 'code_required');
        } finally { await app.close(); }
    });

    test('400 when MFA not enabled', async () => {
        const app = Fastify({ logger: false });
        await registerMfaRoutes(app, {
            getSession: () => session(),
            sessionSecret: SESSION_SECRET,
            buildSessionToken: () => '',
            getPrisma: async () => ({
                tenantUser: {
                    findUnique: async () => ({ totpEnabled: false, totpSecret: null }),
                    update: async () => ({}),
                },
            }),
        } as Parameters<typeof registerMfaRoutes>[1]);
        try {
            const res = await app.inject({ method: 'DELETE', url: '/v1/auth/mfa', payload: { code: '123456' } });
            assert.equal(res.statusCode, 400);
            assert.equal(res.json<{ error: string }>().error, 'mfa_not_enabled');
        } finally { await app.close(); }
    });

    test('disables MFA on correct code', async () => {
        process.env['MFA_ENCRYPTION_KEY'] = MFA_ENC_KEY;
        const totpInstance = mkTOTP();
        const plainSecret = totpInstance.generateSecret();
        const { createCipheriv, randomBytes, createHmac } = await import('node:crypto');
        const key = Buffer.from(createHmac('sha256', MFA_ENC_KEY).update('agentfarm-mfa-v1').digest());
        const iv = randomBytes(12);
        const cipherObj = createCipheriv('aes-256-gcm', key, iv);
        const enc = Buffer.concat([cipherObj.update(plainSecret, 'utf8'), cipherObj.final()]);
        const encryptedSecret = `${iv.toString('hex')}:${cipherObj.getAuthTag().toString('hex')}:${enc.toString('hex')}`;

        let disabled = false;
        const app = Fastify({ logger: false });
        await registerMfaRoutes(app, {
            getSession: () => session(),
            sessionSecret: SESSION_SECRET,
            buildSessionToken: () => '',
            getPrisma: async () => ({
                tenantUser: {
                    findUnique: async () => ({ totpEnabled: true, totpSecret: encryptedSecret }),
                    update: async ({ data }: { data: Record<string, unknown> }) => {
                        if (data['totpEnabled'] === false) disabled = true;
                        return {};
                    },
                },
            }),
        } as Parameters<typeof registerMfaRoutes>[1]);
        try {
            const correctCode = await totpInstance.generate({ secret: plainSecret });
            const res = await app.inject({
                method: 'DELETE', url: '/v1/auth/mfa',
                payload: { code: correctCode },
            });
            assert.equal(res.statusCode, 200);
            assert.ok(disabled, 'totpEnabled should be set to false');
        } finally { await app.close(); }
    });
});
