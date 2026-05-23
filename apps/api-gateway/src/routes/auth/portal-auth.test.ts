import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { hashPassword } from '../lib/password.js';
import { registerPortalAuthRoutes, type PortalAuthRepo } from './portal-auth.js';

// ---------------------------------------------------------------------------
// Shared record types (mirror the route-internal types)
// ---------------------------------------------------------------------------

type PortalAccountRecord = {
    id: string;
    tenantId: string;
    email: string;
    passwordHash: string;
    displayName: string | null;
    role: string;
    isActive: boolean;
};

type PortalSessionRecord = {
    id: string;
    accountId: string;
    tenantId: string;
    token: string;
    expiresAt: Date;
    account: PortalAccountRecord;
};

// ---------------------------------------------------------------------------
// In-memory repo factory
// ---------------------------------------------------------------------------

const createMockRepo = () => {
    const tenants = new Map<string, { id: string; status: string }>();
    const accounts = new Map<string, PortalAccountRecord>(); // key: `${tenantId}:${email}`
    const sessions = new Map<string, PortalSessionRecord>(); // key: token
    const lastLogins = new Map<string, Date>();
    const lastSeens = new Map<string, Date>();
    let sessionCounter = 0;

    const repo: PortalAuthRepo = {
        async findTenant(id) {
            return tenants.get(id) ?? null;
        },
        async findAccountByEmail(tenantId, email) {
            return accounts.get(`${tenantId}:${email}`) ?? null;
        },
        async createAccount({ tenantId, email, passwordHash, displayName }) {
            const account: PortalAccountRecord = {
                id: `acc-${Date.now()}`,
                tenantId,
                email,
                passwordHash,
                displayName: displayName ?? null,
                role: 'VIEWER',
                isActive: true,
            };
            accounts.set(`${tenantId}:${email}`, account);
            return account;
        },
        async createSession({ accountId, tenantId, token, expiresAt }) {
            sessionCounter += 1;
            const account = [...accounts.values()].find((a) => a.id === accountId);
            if (!account) throw new Error(`No account with id=${accountId}`);
            const session: PortalSessionRecord = {
                id: `sess-${sessionCounter}`,
                accountId,
                tenantId,
                token,
                expiresAt,
                account,
            };
            sessions.set(token, session);
            return session;
        },
        async updateLastLogin(accountId) {
            lastLogins.set(accountId, new Date());
        },
        async findSessionByToken(token) {
            return sessions.get(token) ?? null;
        },
        async deleteSession(id) {
            const entry = [...sessions.entries()].find(([, s]) => s.id === id);
            if (entry) sessions.delete(entry[0]);
        },
        async updateSessionLastSeen(id) {
            lastSeens.set(id, new Date());
        },
        async updateAccountPassword(accountId, passwordHash) {
            const entry = [...accounts.entries()].find(([, a]) => a.id === accountId);
            if (entry) {
                const [key, account] = entry;
                accounts.set(key, { ...account, passwordHash });
            }
        },
    };

    return { repo, tenants, accounts, sessions, lastLogins, lastSeens };
};

// ---------------------------------------------------------------------------
// App builder
// ---------------------------------------------------------------------------

const buildApp = (repo: PortalAuthRepo) => {
    const app = Fastify();
    return { app, register: () => registerPortalAuthRoutes(app, { repo }) };
};

// ---------------------------------------------------------------------------
// POST /portal/auth/signup
// ---------------------------------------------------------------------------

test('POST /portal/auth/signup — creates account with valid data → 201', async () => {
    const { repo, tenants } = createMockRepo();
    tenants.set('t-1', { id: 't-1', status: 'ready' });
    const { app, register } = buildApp(repo);
    await register();

    const res = await app.inject({
        method: 'POST',
        url: '/portal/auth/signup',
        body: { tenantId: 't-1', email: 'alice@corp.io', password: 'securePass1', displayName: 'Alice' },
    });

    assert.equal(res.statusCode, 201);
    const body = res.json<{ accountId: string; tenantId: string; email: string; role: string }>();
    assert.ok(body.accountId, 'accountId present');
    assert.equal(body.tenantId, 't-1');
    assert.equal(body.email, 'alice@corp.io');
    assert.equal(body.role, 'VIEWER');
});

test('POST /portal/auth/signup — duplicate email → 409', async () => {
    const { repo, tenants, accounts } = createMockRepo();
    tenants.set('t-1', { id: 't-1', status: 'ready' });
    accounts.set('t-1:bob@corp.io', {
        id: 'acc-existing',
        tenantId: 't-1',
        email: 'bob@corp.io',
        passwordHash: 'hash',
        displayName: null,
        role: 'VIEWER',
        isActive: true,
    });
    const { app, register } = buildApp(repo);
    await register();

    const res = await app.inject({
        method: 'POST',
        url: '/portal/auth/signup',
        body: { tenantId: 't-1', email: 'bob@corp.io', password: 'securePass1' },
    });

    assert.equal(res.statusCode, 409);
    assert.equal(res.json<{ error: string }>().error, 'email_already_registered');
});

test('POST /portal/auth/signup — inactive tenant → 404', async () => {
    const { repo, tenants } = createMockRepo();
    tenants.set('t-bad', { id: 't-bad', status: 'inactive' });
    const { app, register } = buildApp(repo);
    await register();

    const res = await app.inject({
        method: 'POST',
        url: '/portal/auth/signup',
        body: { tenantId: 't-bad', email: 'x@y.com', password: 'securePass1' },
    });

    assert.equal(res.statusCode, 404);
    assert.equal(res.json<{ error: string }>().error, 'tenant_not_found');
});

test('POST /portal/auth/signup — tenant not found → 404', async () => {
    const { repo } = createMockRepo();
    const { app, register } = buildApp(repo);
    await register();

    const res = await app.inject({
        method: 'POST',
        url: '/portal/auth/signup',
        body: { tenantId: 'no-such-tenant', email: 'x@y.com', password: 'securePass1' },
    });

    assert.equal(res.statusCode, 404);
});

test('POST /portal/auth/signup — invalid email format → 400', async () => {
    const { repo, tenants } = createMockRepo();
    tenants.set('t-1', { id: 't-1', status: 'ready' });
    const { app, register } = buildApp(repo);
    await register();

    const res = await app.inject({
        method: 'POST',
        url: '/portal/auth/signup',
        body: { tenantId: 't-1', email: 'not-an-email', password: 'securePass1' },
    });

    assert.equal(res.statusCode, 400);
    assert.equal(res.json<{ field: string }>().field, 'email');
});

test('POST /portal/auth/signup — password too short → 400', async () => {
    const { repo, tenants } = createMockRepo();
    tenants.set('t-1', { id: 't-1', status: 'ready' });
    const { app, register } = buildApp(repo);
    await register();

    const res = await app.inject({
        method: 'POST',
        url: '/portal/auth/signup',
        body: { tenantId: 't-1', email: 'ok@ok.com', password: 'short' },
    });

    assert.equal(res.statusCode, 400);
    assert.equal(res.json<{ field: string }>().field, 'password');
});

test('POST /portal/auth/signup — missing tenantId → 400', async () => {
    const { repo } = createMockRepo();
    const { app, register } = buildApp(repo);
    await register();

    const res = await app.inject({
        method: 'POST',
        url: '/portal/auth/signup',
        body: { email: 'ok@ok.com', password: 'securePass1' },
    });

    assert.equal(res.statusCode, 400);
    assert.equal(res.json<{ field: string }>().field, 'tenantId');
});

// ---------------------------------------------------------------------------
// POST /portal/auth/login
// ---------------------------------------------------------------------------

test('POST /portal/auth/login — valid credentials → 200 + portal_session cookie', async () => {
    const pw = 'correctPassword1';
    const hash = await hashPassword(pw);
    const { repo, tenants, accounts } = createMockRepo();
    tenants.set('t-1', { id: 't-1', status: 'ready' });
    accounts.set('t-1:login@corp.io', {
        id: 'acc-1',
        tenantId: 't-1',
        email: 'login@corp.io',
        passwordHash: hash,
        displayName: 'Login User',
        role: 'MANAGER',
        isActive: true,
    });
    const { app, register } = buildApp(repo);
    await register();

    const res = await app.inject({
        method: 'POST',
        url: '/portal/auth/login',
        body: { tenantId: 't-1', email: 'login@corp.io', password: pw },
    });

    assert.equal(res.statusCode, 200);
    const body = res.json<{ accountId: string; tenantId: string; email: string; role: string }>();
    assert.equal(body.accountId, 'acc-1');
    assert.equal(body.tenantId, 't-1');
    assert.equal(body.role, 'MANAGER');

    const cookie = res.headers['set-cookie'] as string | undefined;
    assert.ok(cookie, 'Set-Cookie header present');
    assert.match(cookie, /portal_session=/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
});

test('POST /portal/auth/login — wrong password → 401', async () => {
    const hash = await hashPassword('correctPassword1');
    const { repo, tenants, accounts } = createMockRepo();
    tenants.set('t-1', { id: 't-1', status: 'ready' });
    accounts.set('t-1:user@corp.io', {
        id: 'acc-2',
        tenantId: 't-1',
        email: 'user@corp.io',
        passwordHash: hash,
        displayName: null,
        role: 'VIEWER',
        isActive: true,
    });
    const { app, register } = buildApp(repo);
    await register();

    const res = await app.inject({
        method: 'POST',
        url: '/portal/auth/login',
        body: { tenantId: 't-1', email: 'user@corp.io', password: 'wrongPassword!' },
    });

    assert.equal(res.statusCode, 401);
    assert.equal(res.json<{ error: string }>().error, 'invalid_credentials');
});

test('POST /portal/auth/login — account not found → 401', async () => {
    const { repo, tenants } = createMockRepo();
    tenants.set('t-1', { id: 't-1', status: 'ready' });
    const { app, register } = buildApp(repo);
    await register();

    const res = await app.inject({
        method: 'POST',
        url: '/portal/auth/login',
        body: { tenantId: 't-1', email: 'nobody@corp.io', password: 'securePass1' },
    });

    assert.equal(res.statusCode, 401);
    assert.equal(res.json<{ error: string }>().error, 'invalid_credentials');
});

test('POST /portal/auth/login — inactive account → 403', async () => {
    const pw = 'correctPassword1';
    const hash = await hashPassword(pw);
    const { repo, tenants, accounts } = createMockRepo();
    tenants.set('t-1', { id: 't-1', status: 'ready' });
    accounts.set('t-1:inactive@corp.io', {
        id: 'acc-3',
        tenantId: 't-1',
        email: 'inactive@corp.io',
        passwordHash: hash,
        displayName: null,
        role: 'VIEWER',
        isActive: false,
    });
    const { app, register } = buildApp(repo);
    await register();

    const res = await app.inject({
        method: 'POST',
        url: '/portal/auth/login',
        body: { tenantId: 't-1', email: 'inactive@corp.io', password: pw },
    });

    assert.equal(res.statusCode, 403);
    assert.equal(res.json<{ error: string }>().error, 'account_inactive');
});

// ---------------------------------------------------------------------------
// POST /portal/auth/logout
// ---------------------------------------------------------------------------

test('POST /portal/auth/logout — clears session and cookie → 200', async () => {
    const { repo, accounts, sessions } = createMockRepo();
    const account: PortalAccountRecord = {
        id: 'acc-1',
        tenantId: 't-1',
        email: 'out@corp.io',
        passwordHash: 'dummy',
        displayName: null,
        role: 'VIEWER',
        isActive: true,
    };
    accounts.set('t-1:out@corp.io', account);
    sessions.set('logout-token', {
        id: 'sess-1',
        accountId: 'acc-1',
        tenantId: 't-1',
        token: 'logout-token',
        expiresAt: new Date(Date.now() + 3_600_000),
        account,
    });
    const { app, register } = buildApp(repo);
    await register();

    const res = await app.inject({
        method: 'POST',
        url: '/portal/auth/logout',
        headers: { cookie: 'portal_session=logout-token' },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.json<{ ok: boolean }>().ok, true);
    // Session must have been deleted
    assert.equal(sessions.size, 0);

    const cookie = res.headers['set-cookie'] as string | undefined;
    assert.ok(cookie);
    assert.match(cookie, /portal_session=;/);
    assert.match(cookie, /Max-Age=0/);
});

test('POST /portal/auth/logout — no cookie → 200 (idempotent)', async () => {
    const { repo } = createMockRepo();
    const { app, register } = buildApp(repo);
    await register();

    const res = await app.inject({ method: 'POST', url: '/portal/auth/logout' });

    assert.equal(res.statusCode, 200);
    assert.equal(res.json<{ ok: boolean }>().ok, true);
});

// ---------------------------------------------------------------------------
// GET /portal/auth/me
// ---------------------------------------------------------------------------

test('GET /portal/auth/me — valid session → 200 with account info', async () => {
    const { repo, accounts, sessions } = createMockRepo();
    const account: PortalAccountRecord = {
        id: 'acc-1',
        tenantId: 't-1',
        email: 'me@corp.io',
        passwordHash: 'dummy',
        displayName: 'Portal User',
        role: 'ADMIN',
        isActive: true,
    };
    accounts.set('t-1:me@corp.io', account);
    sessions.set('valid-me-token', {
        id: 'sess-1',
        accountId: 'acc-1',
        tenantId: 't-1',
        token: 'valid-me-token',
        expiresAt: new Date(Date.now() + 3_600_000),
        account,
    });
    const { app, register } = buildApp(repo);
    await register();

    const res = await app.inject({
        method: 'GET',
        url: '/portal/auth/me',
        headers: { cookie: 'portal_session=valid-me-token' },
    });

    assert.equal(res.statusCode, 200);
    const body = res.json<{ accountId: string; tenantId: string; email: string; role: string }>();
    assert.equal(body.accountId, 'acc-1');
    assert.equal(body.tenantId, 't-1');
    assert.equal(body.email, 'me@corp.io');
    assert.equal(body.role, 'ADMIN');
});

test('GET /portal/auth/me — expired session → 401', async () => {
    const { repo, accounts, sessions } = createMockRepo();
    const account: PortalAccountRecord = {
        id: 'acc-1',
        tenantId: 't-1',
        email: 'me@corp.io',
        passwordHash: 'dummy',
        displayName: null,
        role: 'VIEWER',
        isActive: true,
    };
    accounts.set('t-1:me@corp.io', account);
    sessions.set('expired-me-token', {
        id: 'sess-1',
        accountId: 'acc-1',
        tenantId: 't-1',
        token: 'expired-me-token',
        expiresAt: new Date(Date.now() - 1000), // in the past
        account,
    });
    const { app, register } = buildApp(repo);
    await register();

    const res = await app.inject({
        method: 'GET',
        url: '/portal/auth/me',
        headers: { cookie: 'portal_session=expired-me-token' },
    });

    assert.equal(res.statusCode, 401);
    // Expired session must be removed
    assert.equal(sessions.size, 0);
});

test('GET /portal/auth/me — no cookie → 401', async () => {
    const { repo } = createMockRepo();
    const { app, register } = buildApp(repo);
    await register();

    const res = await app.inject({ method: 'GET', url: '/portal/auth/me' });
    assert.equal(res.statusCode, 401);
});

// ---------------------------------------------------------------------------
// POST /portal/auth/change-password
// ---------------------------------------------------------------------------

test('POST /portal/auth/change-password — correct current password → 200', async () => {
    const oldPw = 'oldPassword1';
    const oldHash = await hashPassword(oldPw);
    const { repo, accounts, sessions } = createMockRepo();
    const account: PortalAccountRecord = {
        id: 'acc-1',
        tenantId: 't-1',
        email: 'pw@corp.io',
        passwordHash: oldHash,
        displayName: null,
        role: 'VIEWER',
        isActive: true,
    };
    accounts.set('t-1:pw@corp.io', account);
    sessions.set('cp-token', {
        id: 'sess-1',
        accountId: 'acc-1',
        tenantId: 't-1',
        token: 'cp-token',
        expiresAt: new Date(Date.now() + 3_600_000),
        account,
    });
    const { app, register } = buildApp(repo);
    await register();

    const res = await app.inject({
        method: 'POST',
        url: '/portal/auth/change-password',
        headers: { cookie: 'portal_session=cp-token' },
        body: { currentPassword: oldPw, newPassword: 'newPassword99' },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.json<{ ok: boolean }>().ok, true);

    // Verify the stored hash was updated
    const updated = accounts.get('t-1:pw@corp.io');
    assert.notEqual(updated?.passwordHash, oldHash);
});

test('POST /portal/auth/change-password — wrong current password → 401', async () => {
    const correctHash = await hashPassword('correctPwd1');
    const { repo, accounts, sessions } = createMockRepo();
    const account: PortalAccountRecord = {
        id: 'acc-1',
        tenantId: 't-1',
        email: 'pw@corp.io',
        passwordHash: correctHash,
        displayName: null,
        role: 'VIEWER',
        isActive: true,
    };
    accounts.set('t-1:pw@corp.io', account);
    sessions.set('cp-token2', {
        id: 'sess-2',
        accountId: 'acc-1',
        tenantId: 't-1',
        token: 'cp-token2',
        expiresAt: new Date(Date.now() + 3_600_000),
        account,
    });
    const { app, register } = buildApp(repo);
    await register();

    const res = await app.inject({
        method: 'POST',
        url: '/portal/auth/change-password',
        headers: { cookie: 'portal_session=cp-token2' },
        body: { currentPassword: 'wrongPwd999', newPassword: 'newPassword99' },
    });

    assert.equal(res.statusCode, 401);
    assert.equal(res.json<{ error: string }>().error, 'invalid_credentials');
});

test('POST /portal/auth/change-password — no session cookie → 401', async () => {
    const { repo } = createMockRepo();
    const { app, register } = buildApp(repo);
    await register();

    const res = await app.inject({
        method: 'POST',
        url: '/portal/auth/change-password',
        body: { currentPassword: 'old', newPassword: 'newPassword99' },
    });

    assert.equal(res.statusCode, 401);
});
