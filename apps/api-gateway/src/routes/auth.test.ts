import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { hashPassword } from '../lib/password.js';
import { verifySessionToken } from '../lib/session-auth.js';
import { registerAuthRoutes, type AuthRepo } from './auth.js';

// ---------------------------------------------------------------------------
// In-memory repo
// ---------------------------------------------------------------------------

type StoredUser = {
    id: string;
    tenantId: string;
    passwordHash: string;
    role: string;
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
    const hash = await hashPassword(pw);
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
