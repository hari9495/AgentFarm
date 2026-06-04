import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { verifySessionToken } from '../../lib/session-auth.js';
import { registerAuthRoutes, type AuthRepo } from './auth.js';

// Ensure API_SESSION_SECRET is present — required by the hardened getSecret()
// that throws instead of falling back to a default (security fix).
process.env['API_SESSION_SECRET'] ??= 'test-secret-32-chars-minimum-ok!!';

// ---------------------------------------------------------------------------
// In-memory repo
// ---------------------------------------------------------------------------

type StoredUser = {
    id: string;
    tenantId: string;
    passwordHash: string;
    role: string;
    totpEnabled?: boolean;
};

const createRepo = (): { repo: AuthRepo; users: Map<string, StoredUser>; signupCalls: number } => {
    const users = new Map<string, StoredUser>();
    let signupCalls = 0;

    const repo: AuthRepo = {
        async findUserByEmail(email) {
            return users.get(email) ?? null;
        },
        async runSignupTransaction({ companyName: _c, email, name: _n, passwordHash }) {
            signupCalls += 1;
            const tenantId = `tenant_${signupCalls}`;
            const userId = `user_${signupCalls}`;
            const workspaceId = `ws_${signupCalls}`;
            const botId = `bot_${signupCalls}`;
            const jobId = `job_${signupCalls}`;
            users.set(email, { id: userId, tenantId, passwordHash, role: 'owner' });
            return {
                tenant: { id: tenantId },
                user: { id: userId },
                workspace: { id: workspaceId },
                bot: { id: botId },
                job: { id: jobId },
            };
        },
        async getWorkspacesForTenant(tenantId) {
            const wsIndex = [...users.values()].findIndex((u) => u.tenantId === tenantId);
            if (wsIndex < 0) return [];
            return [{ id: `ws_${wsIndex + 1}` }];
        },
    };

    return { repo, users, signupCalls: 0 };
};

const buildApp = (repo: AuthRepo) => {
    const app = Fastify();
    // Register synchronously via a setup helper; in tests we call it before inject
    return { app, register: () => registerAuthRoutes(app, { repo }) };
};

const restoreEnv = (key: string, previousValue: string | undefined) => {
    if (previousValue === undefined) {
        delete process.env[key];
        return;
    }
    process.env[key] = previousValue;
};

// ---------------------------------------------------------------------------
// POST /auth/signup
// ---------------------------------------------------------------------------

test('POST /auth/signup — 201 creates records and returns token + ids', async () => {
    const { repo } = createRepo();
    const { app, register } = buildApp(repo);
    await register();

    const res = await app.inject({
        method: 'POST',
        url: '/auth/signup',
        body: { name: 'Alex Chen', email: 'alex@acme.com', password: 'hunter2hunter', companyName: 'Acme' },
    });

    assert.equal(res.statusCode, 201);
    const body = res.json<{
        token: string;
        user_id: string;
        tenant_id: string;
        workspace_id: string;
        bot_id: string;
        provisioning_job_id: string;
        message: string;
    }>();
    assert.ok(body.token, 'token is present');
    assert.ok(body.user_id, 'user_id is present');
    assert.ok(body.tenant_id, 'tenant_id is present');
    assert.ok(body.workspace_id, 'workspace_id is present');
    assert.ok(body.bot_id, 'bot_id is present');
    assert.ok(body.provisioning_job_id, 'provisioning_job_id is present');
    assert.match(body.message, /provisioning/i);
});

test('POST /auth/signup — 201 sets agentfarm_session HttpOnly cookie', async () => {
    const { repo } = createRepo();
    const { app, register } = buildApp(repo);
    await register();

    const res = await app.inject({
        method: 'POST',
        url: '/auth/signup',
        body: { name: 'Bea Smith', email: 'bea@corp.io', password: 'securepw123', companyName: 'Corp' },
    });

    assert.equal(res.statusCode, 201);
    const cookie = res.headers['set-cookie'] as string | undefined;
    assert.ok(cookie, 'Set-Cookie header present');
    assert.match(cookie, /agentfarm_session=/);
    assert.match(cookie, /HttpOnly/);
});

test('POST /auth/signup — 400 missing name', async () => {
    const { repo } = createRepo();
    const { app, register } = buildApp(repo);
    await register();

    const res = await app.inject({
        method: 'POST',
        url: '/auth/signup',
        body: { name: '', email: 'x@x.com', password: 'longpassword1', companyName: 'Acme' },
    });

    assert.equal(res.statusCode, 400);
    const body = res.json<{ field: string }>();
    assert.equal(body.field, 'name');
});

test('POST /auth/signup — 400 invalid email', async () => {
    const { repo } = createRepo();
    const { app, register } = buildApp(repo);
    await register();

    const res = await app.inject({
        method: 'POST',
        url: '/auth/signup',
        body: { name: 'Alex', email: 'not-an-email', password: 'longpassword1', companyName: 'Acme' },
    });

    assert.equal(res.statusCode, 400);
    const body = res.json<{ field: string }>();
    assert.equal(body.field, 'email');
});

test('POST /auth/signup — 400 password too short', async () => {
    const { repo } = createRepo();
    const { app, register } = buildApp(repo);
    await register();

    const res = await app.inject({
        method: 'POST',
        url: '/auth/signup',
        body: { name: 'Alex', email: 'alex@x.com', password: 'short', companyName: 'Acme' },
    });

    assert.equal(res.statusCode, 400);
    const body = res.json<{ field: string }>();
    assert.equal(body.field, 'password');
});

test('POST /auth/signup — 400 missing companyName', async () => {
    const { repo } = createRepo();
    const { app, register } = buildApp(repo);
    await register();

    const res = await app.inject({
        method: 'POST',
        url: '/auth/signup',
        body: { name: 'Alex', email: 'alex@x.com', password: 'longpassword1', companyName: '' },
    });

    assert.equal(res.statusCode, 400);
    const body = res.json<{ field: string }>();
    assert.equal(body.field, 'companyName');
});

test('POST /auth/signup — 409 duplicate email', async () => {
    const { repo } = createRepo();
    const { app, register } = buildApp(repo);
    await register();

    // First signup succeeds
    await app.inject({
        method: 'POST',
        url: '/auth/signup',
        body: { name: 'Alex', email: 'dup@acme.com', password: 'longpassword1', companyName: 'Acme' },
    });

    // Second with same email fails
    const res = await app.inject({
        method: 'POST',
        url: '/auth/signup',
        body: { name: 'Alex Again', email: 'dup@acme.com', password: 'longpassword2', companyName: 'Acme2' },
    });

    assert.equal(res.statusCode, 409);
    const body = res.json<{ error: string }>();
    assert.equal(body.error, 'email_taken');
});

test('POST /auth/signup — email is normalised to lowercase', async () => {
    const { repo } = createRepo();
    const { app, register } = buildApp(repo);
    await register();

    const res = await app.inject({
        method: 'POST',
        url: '/auth/signup',
        body: { name: 'Alex', email: 'ALEX@ACME.COM', password: 'longpassword1', companyName: 'Acme' },
    });

    assert.equal(res.statusCode, 201);

    // Second signup with lowercase duplicate must be rejected
    const dup = await app.inject({
        method: 'POST',
        url: '/auth/signup',
        body: { name: 'Alex 2', email: 'alex@acme.com', password: 'longpassword2', companyName: 'Acme2' },
    });
    assert.equal(dup.statusCode, 409);
});

// ---------------------------------------------------------------------------
// POST /auth/login
// ---------------------------------------------------------------------------

test('POST /auth/login — 200 returns token for correct credentials', async () => {
    const { repo } = createRepo();
    const { app, register } = buildApp(repo);
    await register();

    // Pre-seed a user with a known password
    const pw = 'correctPassword1';
    (repo as unknown as { findUserByEmail: unknown }).findUserByEmail;
    // Insert directly into the in-memory store by calling signup route
    await app.inject({
        method: 'POST',
        url: '/auth/signup',
        body: { name: 'Login User', email: 'login@acme.com', password: pw, companyName: 'Acme' },
    });

    const res = await app.inject({
        method: 'POST',
        url: '/auth/login',
        body: { email: 'login@acme.com', password: pw },
    });

    assert.equal(res.statusCode, 200);
    const body = res.json<{ token: string; user_id: string; tenant_id: string }>();
    assert.ok(body.token, 'token present');
    assert.ok(body.user_id, 'user_id present');
    assert.ok(body.tenant_id, 'tenant_id present');
});

test('POST /auth/login — 200 sets session cookie', async () => {
    const { repo } = createRepo();
    const { app, register } = buildApp(repo);
    await register();

    const pw = 'correctPassword1';
    await app.inject({
        method: 'POST',
        url: '/auth/signup',
        body: { name: 'Cookie User', email: 'cookie@acme.com', password: pw, companyName: 'Acme' },
    });

    const res = await app.inject({
        method: 'POST',
        url: '/auth/login',
        body: { email: 'cookie@acme.com', password: pw },
    });

    assert.equal(res.statusCode, 200);
    const cookie = res.headers['set-cookie'] as string | undefined;
    assert.ok(cookie);
    assert.match(cookie, /agentfarm_session=/);
});

test('POST /auth/login — 401 wrong password', async () => {
    const { repo } = createRepo();
    const { app, register } = buildApp(repo);
    await register();

    await app.inject({
        method: 'POST',
        url: '/auth/signup',
        body: { name: 'Auth User', email: 'auth@acme.com', password: 'correctPassword1', companyName: 'Acme' },
    });

    const res = await app.inject({
        method: 'POST',
        url: '/auth/login',
        body: { email: 'auth@acme.com', password: 'wrongpassword!' },
    });

    assert.equal(res.statusCode, 401);
    const body = res.json<{ error: string }>();
    assert.equal(body.error, 'invalid_credentials');
});

test('POST /auth/login — 401 unknown email', async () => {
    const { repo } = createRepo();
    const { app, register } = buildApp(repo);
    await register();

    const res = await app.inject({
        method: 'POST',
        url: '/auth/login',
        body: { email: 'ghost@nowhere.com', password: 'somepassword1' },
    });

    assert.equal(res.statusCode, 401);
    const body = res.json<{ error: string }>();
    assert.equal(body.error, 'invalid_credentials');
});

test('POST /auth/login — 400 missing email', async () => {
    const { repo } = createRepo();
    const { app, register } = buildApp(repo);
    await register();

    const res = await app.inject({
        method: 'POST',
        url: '/auth/login',
        body: { password: 'somepassword1' },
    });

    assert.equal(res.statusCode, 400);
    const body = res.json<{ field: string }>();
    assert.equal(body.field, 'email');
});

test('POST /auth/login — 400 missing password', async () => {
    const { repo } = createRepo();
    const { app, register } = buildApp(repo);
    await register();

    const res = await app.inject({
        method: 'POST',
        url: '/auth/login',
        body: { email: 'x@x.com' },
    });

    assert.equal(res.statusCode, 400);
    const body = res.json<{ field: string }>();
    assert.equal(body.field, 'password');
});

test('POST /auth/internal-login — 200 returns internal scoped token', async () => {
    const previousAllowedDomains = process.env.API_INTERNAL_LOGIN_ALLOWED_DOMAINS;
    process.env.API_INTERNAL_LOGIN_ALLOWED_DOMAINS = 'acme.com';

    const { repo } = createRepo();
    const { app, register } = buildApp(repo);
    await register();

    const pw = 'internalPassword1';
    await app.inject({
        method: 'POST',
        url: '/auth/signup',
        body: { name: 'Internal User', email: 'internal@acme.com', password: pw, companyName: 'Acme' },
    });

    const res = await app.inject({
        method: 'POST',
        url: '/auth/internal-login',
        body: { email: 'internal@acme.com', password: pw },
    });

    assert.equal(res.statusCode, 200);
    const body = res.json<{ token: string; scope: string }>();
    assert.equal(body.scope, 'internal');
    const payload = verifySessionToken(body.token);
    assert.equal(payload?.scope, 'internal');

    restoreEnv('API_INTERNAL_LOGIN_ALLOWED_DOMAINS', previousAllowedDomains);
});

test('POST /auth/internal-login — 401 wrong password', async () => {
    const previousAllowedDomains = process.env.API_INTERNAL_LOGIN_ALLOWED_DOMAINS;
    process.env.API_INTERNAL_LOGIN_ALLOWED_DOMAINS = 'acme.com';

    const { repo } = createRepo();
    const { app, register } = buildApp(repo);
    await register();

    await app.inject({
        method: 'POST',
        url: '/auth/signup',
        body: { name: 'Internal User', email: 'internal2@acme.com', password: 'correctPassword1', companyName: 'Acme' },
    });

    const res = await app.inject({
        method: 'POST',
        url: '/auth/internal-login',
        body: { email: 'internal2@acme.com', password: 'wrong-password' },
    });

    assert.equal(res.statusCode, 401);

    restoreEnv('API_INTERNAL_LOGIN_ALLOWED_DOMAINS', previousAllowedDomains);
});

// ---------------------------------------------------------------------------
// Cookie security flags
// ---------------------------------------------------------------------------

test('POST /auth/signup — cookie has HttpOnly and SameSite=Strict flags', async () => {
    const { repo } = createRepo();
    const { app, register } = buildApp(repo);
    await register();

    const res = await app.inject({
        method: 'POST',
        url: '/auth/signup',
        body: { name: 'Flag User', email: 'flags@acme.com', password: 'longpassword1', companyName: 'Acme' },
    });

    assert.equal(res.statusCode, 201);
    const cookie = res.headers['set-cookie'] as string | undefined;
    assert.ok(cookie, 'Set-Cookie header present');
    assert.match(cookie, /HttpOnly/i, 'must have HttpOnly flag');
    assert.match(cookie, /SameSite=Strict/i, 'must have SameSite=Strict flag');
});

test('POST /auth/signup — Secure flag present when COOKIE_SECURE=true', async () => {
    const previousCookieSecure = process.env['COOKIE_SECURE'];
    const previousNodeEnv = process.env['NODE_ENV'];
    process.env['COOKIE_SECURE'] = 'true';
    process.env['NODE_ENV'] = 'development'; // ensure it is not NODE_ENV doing the work

    const { repo } = createRepo();
    const { app, register } = buildApp(repo);
    await register();

    const res = await app.inject({
        method: 'POST',
        url: '/auth/signup',
        body: { name: 'Secure User', email: 'secure@acme.com', password: 'longpassword1', companyName: 'Acme' },
    });

    assert.equal(res.statusCode, 201);
    const cookie = res.headers['set-cookie'] as string | undefined;
    assert.ok(cookie, 'Set-Cookie header present');
    assert.match(cookie, /;\s*Secure\b/i, 'must have Secure flag when COOKIE_SECURE=true');

    restoreEnv('COOKIE_SECURE', previousCookieSecure);
    restoreEnv('NODE_ENV', previousNodeEnv);
});

test('POST /auth/login — cookie has HttpOnly and SameSite=Strict flags', async () => {
    const { repo } = createRepo();
    const { app, register } = buildApp(repo);
    await register();

    const pw = 'correctPassword1';
    await app.inject({
        method: 'POST',
        url: '/auth/signup',
        body: { name: 'Login Flags', email: 'logflags@acme.com', password: pw, companyName: 'Acme' },
    });

    const res = await app.inject({
        method: 'POST',
        url: '/auth/login',
        body: { email: 'logflags@acme.com', password: pw },
    });

    assert.equal(res.statusCode, 200);
    const cookie = res.headers['set-cookie'] as string | undefined;
    assert.ok(cookie, 'Set-Cookie header present');
    assert.match(cookie, /HttpOnly/i, 'must have HttpOnly flag');
    assert.match(cookie, /SameSite=Strict/i, 'must have SameSite=Strict flag');
});

test('POST /auth/internal-login — 403 when account is not in internal policy', async () => {
    const previousAllowedDomains = process.env.API_INTERNAL_LOGIN_ALLOWED_DOMAINS;
    const previousAdminRoles = process.env.API_INTERNAL_LOGIN_ADMIN_ROLES;
    process.env.API_INTERNAL_LOGIN_ALLOWED_DOMAINS = 'internal.company';
    process.env.API_INTERNAL_LOGIN_ADMIN_ROLES = 'internal_admin';

    const { repo } = createRepo();
    const { app, register } = buildApp(repo);
    await register();

    await app.inject({
        method: 'POST',
        url: '/auth/signup',
        body: { name: 'Customer User', email: 'customer@acme.com', password: 'correctPassword1', companyName: 'Acme' },
    });

    const res = await app.inject({
        method: 'POST',
        url: '/auth/internal-login',
        body: { email: 'customer@acme.com', password: 'correctPassword1' },
    });

    assert.equal(res.statusCode, 403);
    const body = res.json<{ error: string }>();
    assert.equal(body.error, 'internal_access_denied');

    restoreEnv('API_INTERNAL_LOGIN_ALLOWED_DOMAINS', previousAllowedDomains);
    restoreEnv('API_INTERNAL_LOGIN_ADMIN_ROLES', previousAdminRoles);
});

test('POST /auth/internal-login — 200 when account role matches admin policy', async () => {
    const previousAllowedDomains = process.env.API_INTERNAL_LOGIN_ALLOWED_DOMAINS;
    const previousAdminRoles = process.env.API_INTERNAL_LOGIN_ADMIN_ROLES;
    process.env.API_INTERNAL_LOGIN_ALLOWED_DOMAINS = '';
    process.env.API_INTERNAL_LOGIN_ADMIN_ROLES = 'owner,internal_admin';

    const { repo, users } = createRepo();
    const { app, register } = buildApp(repo);
    await register();

    await app.inject({
        method: 'POST',
        url: '/auth/signup',
        body: { name: 'Ops Owner', email: 'ops@customer.com', password: 'correctPassword1', companyName: 'Acme' },
    });

    const stored = users.get('ops@customer.com');
    assert.ok(stored);
    stored.role = 'owner';

    const res = await app.inject({
        method: 'POST',
        url: '/auth/internal-login',
        body: { email: 'ops@customer.com', password: 'correctPassword1' },
    });

    assert.equal(res.statusCode, 200);
    const body = res.json<{ token: string; scope: string }>();
    assert.equal(body.scope, 'internal');
    const payload = verifySessionToken(body.token);
    assert.equal(payload?.scope, 'internal');

    restoreEnv('API_INTERNAL_LOGIN_ALLOWED_DOMAINS', previousAllowedDomains);
    restoreEnv('API_INTERNAL_LOGIN_ADMIN_ROLES', previousAdminRoles);
});

// ---------------------------------------------------------------------------
// POST /auth/logout
// ---------------------------------------------------------------------------

test('POST /auth/logout — 200 clears session cookie', async () => {
    const { repo } = createRepo();
    const { app, register } = buildApp(repo);
    await register();

    const res = await app.inject({ method: 'POST', url: '/auth/logout' });

    assert.equal(res.statusCode, 200);
    const cookie = res.headers['set-cookie'] as string | undefined;
    assert.ok(cookie);
    assert.match(cookie, /agentfarm_session=;/);
    assert.match(cookie, /Max-Age=0/);
});

// ---------------------------------------------------------------------------
// POST /auth/login — MFA gate
// These tests cover the branch where user.totpEnabled is true, which must
// return { mfa_required: true, mfa_token } instead of a full session.
// ---------------------------------------------------------------------------

const MFA_SESSION_SECRET = 'test-session-secret-minimum-32-characters!!';

test('POST /auth/login — MFA gate: returns mfa_required + mfa_token, no session cookie', async () => {
    const prevSecret = process.env['API_SESSION_SECRET'];
    process.env['API_SESSION_SECRET'] = MFA_SESSION_SECRET;

    const { repo, users } = createRepo();
    const { app, register } = buildApp(repo);
    await register();

    const pw = 'correctPassword1';
    await app.inject({
        method: 'POST', url: '/auth/signup',
        body: { name: 'MFA User', email: 'mfagate@acme.com', password: pw, companyName: 'Acme' },
    });

    // Enable MFA on the stored user
    const stored = users.get('mfagate@acme.com');
    assert.ok(stored, 'user must exist after signup');
    stored.totpEnabled = true;

    const res = await app.inject({
        method: 'POST', url: '/auth/login',
        body: { email: 'mfagate@acme.com', password: pw },
    });

    assert.equal(res.statusCode, 200);
    const body = res.json<{ mfa_required?: boolean; mfa_token?: string; token?: string; message?: string }>();
    assert.equal(body.mfa_required, true, 'mfa_required must be true');
    assert.ok(body.mfa_token, 'mfa_token must be present');
    assert.ok(!body.token, 'full session token must NOT be present when MFA is required');
    assert.match(body.message ?? '', /mfa|verify/i, 'message should mention MFA verification');

    // Must NOT set a full session cookie
    const cookie = res.headers['set-cookie'] as string | undefined;
    assert.ok(!cookie || !cookie.includes('agentfarm_session=v1'), 'must not issue session cookie before MFA is verified');

    restoreEnv('API_SESSION_SECRET', prevSecret);
});

test('POST /auth/login — MFA gate: mfa_token payload contains userId and future expiry', async () => {
    const prevSecret = process.env['API_SESSION_SECRET'];
    process.env['API_SESSION_SECRET'] = MFA_SESSION_SECRET;

    const { repo, users } = createRepo();
    const { app, register } = buildApp(repo);
    await register();

    const pw = 'correctPassword1';
    await app.inject({
        method: 'POST', url: '/auth/signup',
        body: { name: 'MFA User 2', email: 'mfapayload@acme.com', password: pw, companyName: 'Acme' },
    });

    const stored = users.get('mfapayload@acme.com');
    assert.ok(stored);
    stored.totpEnabled = true;

    const res = await app.inject({
        method: 'POST', url: '/auth/login',
        body: { email: 'mfapayload@acme.com', password: pw },
    });

    const body = res.json<{ mfa_token: string }>();
    assert.ok(body.mfa_token, 'mfa_token must be present');

    // mfa_token format is: base64url(payload).hmac-sig
    const parts = body.mfa_token.split('.');
    assert.equal(parts.length, 2, 'mfa_token must have exactly two dot-separated parts');
    const payload = JSON.parse(Buffer.from(parts[0]!, 'base64url').toString('utf8')) as {
        userId: string;
        exp: number;
    };

    assert.equal(payload.userId, stored.id, 'mfa_token must encode the correct userId');
    assert.ok(typeof payload.exp === 'number', 'exp must be a number');
    assert.ok(payload.exp > Date.now(), 'mfa_token must not be expired immediately after issuance');
    assert.ok(payload.exp < Date.now() + 10 * 60 * 1000, 'mfa_token TTL must be ≤ 10 minutes');

    restoreEnv('API_SESSION_SECRET', prevSecret);
});

test('POST /auth/login — MFA gate: wrong password returns 401 even when MFA is enabled', async () => {
    const prevSecret = process.env['API_SESSION_SECRET'];
    process.env['API_SESSION_SECRET'] = MFA_SESSION_SECRET;

    const { repo, users } = createRepo();
    const { app, register } = buildApp(repo);
    await register();

    const pw = 'correctPassword1';
    await app.inject({
        method: 'POST', url: '/auth/signup',
        body: { name: 'MFA User 3', email: 'mfawrongpw@acme.com', password: pw, companyName: 'Acme' },
    });

    const stored = users.get('mfawrongpw@acme.com');
    assert.ok(stored);
    stored.totpEnabled = true;

    const res = await app.inject({
        method: 'POST', url: '/auth/login',
        body: { email: 'mfawrongpw@acme.com', password: 'wrongpassword!' },
    });

    // Password check happens before MFA gate — wrong password must still 401
    assert.equal(res.statusCode, 401);
    const body = res.json<{ error: string }>();
    assert.equal(body.error, 'invalid_credentials');

    restoreEnv('API_SESSION_SECRET', prevSecret);
});

test('POST /auth/login — MFA gate: non-MFA user still receives full session token', async () => {
    const { repo } = createRepo();
    const { app, register } = buildApp(repo);
    await register();

    const pw = 'correctPassword1';
    await app.inject({
        method: 'POST', url: '/auth/signup',
        body: { name: 'Normal User', email: 'nomfa@acme.com', password: pw, companyName: 'Acme' },
    });

    const res = await app.inject({
        method: 'POST', url: '/auth/login',
        body: { email: 'nomfa@acme.com', password: pw },
    });

    assert.equal(res.statusCode, 200);
    const body = res.json<{ token?: string; mfa_required?: boolean }>();
    assert.ok(body.token, 'full session token must be present for non-MFA user');
    assert.ok(!body.mfa_required, 'mfa_required must be absent for non-MFA user');
    const cookie = res.headers['set-cookie'] as string | undefined;
    assert.ok(cookie?.includes('agentfarm_session='), 'session cookie must be set for non-MFA user');
});
