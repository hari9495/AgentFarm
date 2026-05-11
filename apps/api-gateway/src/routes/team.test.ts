import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerTeamRoutes } from './team.js';
import { buildSessionToken, verifySessionToken } from '../lib/session-auth.js';
import { requireRole } from '../lib/require-role.js';

// ── Session helpers ───────────────────────────────────────────────────────────

const makeSession = (overrides: Record<string, unknown> = {}) => ({
    userId: 'user_admin',
    tenantId: 'tenant_1',
    workspaceIds: ['ws_1'],
    role: 'admin',
    expiresAt: Date.now() + 60_000,
    ...overrides,
});

const noSession = () => null;

// ── Prisma mock helpers ───────────────────────────────────────────────────────

const makeUser = (overrides: Record<string, unknown> = {}) => ({
    id: 'user_2',
    tenantId: 'tenant_1',
    email: 'member@example.com',
    name: 'Member User',
    passwordHash: 'scrypt:abc:def',
    role: 'viewer',
    createdAt: new Date('2026-05-01T00:00:00Z'),
    ...overrides,
});

const makePrisma = (overrides: Record<string, unknown> = {}) =>
({
    tenantUser: {
        findMany: async () => [
            { id: 'user_2', email: 'member@example.com', name: 'Member User', role: 'viewer', createdAt: new Date() },
        ],
        findUnique: async ({ where }: { where: { id?: string; email?: string } }) => {
            if (where.id === 'user_2') return makeUser();
            if (where.email === 'member@example.com') return makeUser();
            return null;
        },
        create: async ({ data }: { data: Record<string, unknown> }) => ({
            id: 'user_new',
            email: data.email,
            name: data.name,
            role: data.role,
        }),
        update: async ({ data }: { data: Record<string, unknown> }) => ({
            id: 'user_2',
            email: 'member@example.com',
            role: data.role,
        }),
        delete: async () => makeUser(),
    },
    ...overrides,
} as any);

// ── Tests ─────────────────────────────────────────────────────────────────────

// 1. GET /v1/team/members — returns members, strips passwordHash
test('GET /v1/team/members — returns members without passwordHash', async () => {
    const app = Fastify();
    await registerTeamRoutes(app, { getSession: () => makeSession(), prisma: makePrisma() });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/team/members' });
        assert.equal(res.statusCode, 200);
        const body = res.json<{ members: unknown[] }>();
        assert.ok(Array.isArray(body.members));
        for (const m of body.members as Record<string, unknown>[]) {
            assert.equal('passwordHash' in m, false, 'passwordHash must not be returned');
            assert.ok(m.id);
            assert.ok(m.email);
            assert.ok(m.role);
        }
    } finally {
        await app.close();
    }
});

// 2. POST /v1/team/invite — success 201
test('POST /v1/team/invite — success 201', async () => {
    const app = Fastify();
    // No existing email, so findUnique returns null for new invite
    const prisma = makePrisma({
        tenantUser: {
            ...makePrisma().tenantUser,
            findUnique: async () => null,
            create: async ({ data }: { data: Record<string, unknown> }) => ({
                id: 'user_new',
                email: data.email,
                name: data.name,
                role: data.role,
            }),
        },
    });
    await registerTeamRoutes(app, { getSession: () => makeSession(), prisma });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/team/invite',
            payload: { email: 'new@example.com', name: 'New Member', password: 'securepass12', role: 'viewer' },
        });
        assert.equal(res.statusCode, 201);
        const body = res.json<Record<string, unknown>>();
        assert.ok(body.id);
        assert.equal(body.email, 'new@example.com');
        assert.equal(body.role, 'viewer');
        assert.equal('passwordHash' in body, false);
    } finally {
        await app.close();
    }
});

// 3. POST /v1/team/invite — 409 on duplicate email
test('POST /v1/team/invite — 409 on duplicate email', async () => {
    const app = Fastify();
    // findUnique returns an existing user (email taken)
    const prisma = makePrisma();
    await registerTeamRoutes(app, { getSession: () => makeSession(), prisma });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/team/invite',
            payload: { email: 'member@example.com', name: 'Dup', password: 'securepass12', role: 'viewer' },
        });
        assert.equal(res.statusCode, 409);
        assert.equal(res.json<{ error: string }>().error, 'email_taken');
    } finally {
        await app.close();
    }
});

// 4. POST /v1/team/invite — 403 if session role is viewer
test('POST /v1/team/invite — 403 if role is viewer', async () => {
    const app = Fastify();
    await registerTeamRoutes(app, {
        getSession: () => makeSession({ role: 'viewer' }),
        prisma: makePrisma(),
    });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/team/invite',
            payload: { email: 'x@example.com', name: 'X', password: 'securepass12', role: 'viewer' },
        });
        assert.equal(res.statusCode, 403);
        assert.equal(res.json<{ error: string }>().error, 'insufficient_role');
    } finally {
        await app.close();
    }
});

// 5. POST /v1/team/invite — 400 if trying to invite as owner
test('POST /v1/team/invite — 400 if invite role is owner', async () => {
    const app = Fastify();
    await registerTeamRoutes(app, { getSession: () => makeSession(), prisma: makePrisma() });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/team/invite',
            payload: { email: 'owner@example.com', name: 'Owner', password: 'securepass12', role: 'owner' },
        });
        assert.equal(res.statusCode, 400);
        assert.equal(res.json<{ error: string }>().error, 'invalid_role');
    } finally {
        await app.close();
    }
});

// 6. PATCH /v1/team/members/:userId/role — success
test('PATCH /v1/team/members/:userId/role — success', async () => {
    const app = Fastify();
    await registerTeamRoutes(app, { getSession: () => makeSession(), prisma: makePrisma() });
    try {
        const res = await app.inject({
            method: 'PATCH',
            url: '/v1/team/members/user_2/role',
            payload: { role: 'operator' },
        });
        assert.equal(res.statusCode, 200);
        const body = res.json<{ role: string }>();
        assert.equal(body.role, 'operator');
    } finally {
        await app.close();
    }
});

// 7. PATCH /v1/team/members/:userId/role — 403 if not admin
test('PATCH /v1/team/members/:userId/role — 403 if not admin', async () => {
    const app = Fastify();
    await registerTeamRoutes(app, {
        getSession: () => makeSession({ role: 'operator' }),
        prisma: makePrisma(),
    });
    try {
        const res = await app.inject({
            method: 'PATCH',
            url: '/v1/team/members/user_2/role',
            payload: { role: 'viewer' },
        });
        assert.equal(res.statusCode, 403);
        assert.equal(res.json<{ error: string }>().error, 'insufficient_role');
    } finally {
        await app.close();
    }
});

// 8. PATCH /v1/team/members/:userId/role — 400 if target is owner
test('PATCH /v1/team/members/:userId/role — 400 if target is owner', async () => {
    const app = Fastify();
    const prisma = makePrisma({
        tenantUser: {
            ...makePrisma().tenantUser,
            findUnique: async () => makeUser({ role: 'owner' }),
        },
    });
    await registerTeamRoutes(app, { getSession: () => makeSession(), prisma });
    try {
        const res = await app.inject({
            method: 'PATCH',
            url: '/v1/team/members/user_2/role',
            payload: { role: 'viewer' },
        });
        assert.equal(res.statusCode, 400);
        assert.equal(res.json<{ error: string }>().error, 'cannot_modify_owner');
    } finally {
        await app.close();
    }
});

// 9. PATCH /v1/team/members/:userId/role — 400 if demoting self
test('PATCH /v1/team/members/:userId/role — 400 if demoting self', async () => {
    const app = Fastify();
    await registerTeamRoutes(app, {
        // userId matches the userId of the target
        getSession: () => makeSession({ userId: 'user_2' }),
        prisma: makePrisma(),
    });
    try {
        const res = await app.inject({
            method: 'PATCH',
            url: '/v1/team/members/user_2/role',
            payload: { role: 'viewer' },
        });
        assert.equal(res.statusCode, 400);
        assert.equal(res.json<{ error: string }>().error, 'cannot_modify_self');
    } finally {
        await app.close();
    }
});

// 10. DELETE /v1/team/members/:userId — success 204
test('DELETE /v1/team/members/:userId — success 204', async () => {
    const app = Fastify();
    await registerTeamRoutes(app, { getSession: () => makeSession(), prisma: makePrisma() });
    try {
        const res = await app.inject({ method: 'DELETE', url: '/v1/team/members/user_2' });
        assert.equal(res.statusCode, 204);
    } finally {
        await app.close();
    }
});

// 11. DELETE /v1/team/members/:userId — 400 if removing self
test('DELETE /v1/team/members/:userId — 400 if removing self', async () => {
    const app = Fastify();
    await registerTeamRoutes(app, {
        getSession: () => makeSession({ userId: 'user_2' }),
        prisma: makePrisma(),
    });
    try {
        const res = await app.inject({ method: 'DELETE', url: '/v1/team/members/user_2' });
        assert.equal(res.statusCode, 400);
        assert.equal(res.json<{ error: string }>().error, 'cannot_remove_self');
    } finally {
        await app.close();
    }
});

// 12. DELETE /v1/team/members/:userId — 400 if target is owner
test('DELETE /v1/team/members/:userId — 400 if target is owner', async () => {
    const app = Fastify();
    const prisma = makePrisma({
        tenantUser: {
            ...makePrisma().tenantUser,
            findUnique: async () => makeUser({ role: 'owner' }),
        },
    });
    await registerTeamRoutes(app, { getSession: () => makeSession(), prisma });
    try {
        const res = await app.inject({ method: 'DELETE', url: '/v1/team/members/user_2' });
        assert.equal(res.statusCode, 400);
        assert.equal(res.json<{ error: string }>().error, 'cannot_remove_owner');
    } finally {
        await app.close();
    }
});

// 13. requireRole middleware — passes when rank sufficient
test('requireRole middleware — passes when rank sufficient', async () => {
    const app = Fastify();
    app.get('/test-role', { preHandler: [requireRole('admin')] }, async () => ({ ok: true }));
    // Set req.session directly via a hook to simulate main.ts global hook
    app.addHook('preHandler', async (request) => {
        if (!(request as any).session) {
            (request as any).session = { role: 'admin', userId: 'u1', tenantId: 't1' };
        }
    });
    try {
        const res = await app.inject({ method: 'GET', url: '/test-role' });
        assert.equal(res.statusCode, 200);
        assert.equal(res.json<{ ok: boolean }>().ok, true);
    } finally {
        await app.close();
    }
});

// 14. requireRole middleware — 403 when rank insufficient
test('requireRole middleware — 403 when rank insufficient', async () => {
    const app = Fastify();
    app.addHook('preHandler', async (request) => {
        (request as any).session = { role: 'viewer', userId: 'u1', tenantId: 't1' };
    });
    app.get('/test-role-guard', { preHandler: [requireRole('admin')] }, async () => ({ ok: true }));
    try {
        const res = await app.inject({ method: 'GET', url: '/test-role-guard' });
        assert.equal(res.statusCode, 403);
        const body = res.json<{ error: string; required: string }>();
        assert.equal(body.error, 'insufficient_role');
        assert.equal(body.required, 'admin');
    } finally {
        await app.close();
    }
});

// 15. SessionPayload role round-trips through buildSessionToken/verifySessionToken
test('SessionPayload role round-trips through buildSessionToken/verifySessionToken', () => {
    const token = buildSessionToken({
        userId: 'u_test',
        tenantId: 't_test',
        workspaceIds: ['ws_test'],
        role: 'operator',
    });
    const payload = verifySessionToken(token);
    assert.ok(payload, 'payload should not be null');
    assert.equal(payload!.role, 'operator');
    assert.equal(payload!.userId, 'u_test');
    assert.equal(payload!.tenantId, 't_test');
});
