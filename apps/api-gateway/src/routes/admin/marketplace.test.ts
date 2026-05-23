import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerMarketplaceRoutes } from './marketplace.js';

// ---------------------------------------------------------------------------
// Stub runtime sync — route tests don't exercise fetch behaviour
// ---------------------------------------------------------------------------

(globalThis as any).fetch = async () => ({ ok: true, status: 200, json: async () => ({}) });

// ---------------------------------------------------------------------------
// Session helpers
// ---------------------------------------------------------------------------

const makeSession = (role = 'admin', tenantId = 'tenant_1') => ({
    userId: 'user_1',
    tenantId,
    workspaceIds: ['ws_1'],
    role,
    expiresAt: Date.now() + 60_000,
});

// ---------------------------------------------------------------------------
// Mock data helpers
// ---------------------------------------------------------------------------

const listingRecord = (overrides: Record<string, unknown> = {}) => ({
    id: 'listing_1',
    skillId: 'skill_1',
    name: 'My Skill',
    description: 'Does things',
    version: '1.0.0',
    author: 'AgentFarm',
    permissions: ['read'],
    source: 'https://example.com',
    tags: ['automation'],
    status: 'active',
    createdAt: new Date('2026-05-01T00:00:00Z'),
    updatedAt: new Date('2026-05-01T00:00:00Z'),
    ...overrides,
});

const installRecord = (overrides: Record<string, unknown> = {}) => ({
    id: 'install_1',
    tenantId: 'tenant_1',
    skillId: 'skill_1',
    listingId: 'listing_1',
    approvedPermissions: ['read'],
    pinVersion: false,
    status: 'installed',
    installedAt: new Date('2026-05-01T00:00:00Z'),
    uninstalledAt: null,
    listing: { name: 'My Skill', version: '1.0.0', skillId: 'skill_1' },
    ...overrides,
});

// ---------------------------------------------------------------------------
// Prisma mock factory
// ---------------------------------------------------------------------------

const makePrisma = (overrides: Record<string, any> = {}) => ({
    marketplaceListing: {
        findMany: async () => [listingRecord()],
        findUnique: async ({ where }: any) => {
            if (where?.id && where.id !== 'listing_1') return null;
            if (where?.skillId && where.skillId !== 'skill_1') return null;
            return listingRecord();
        },
        upsert: async ({ create }: any) => ({ ...listingRecord(), ...create }),
        update: async ({ data }: any) => ({ ...listingRecord(), ...data }),
        ...(overrides.marketplaceListing ?? {}),
    },
    marketplaceInstall: {
        findMany: async () => [installRecord()],
        // default null = first install path (create rather than update)
        findUnique: async () => null,
        create: async ({ data }: any) => ({ ...installRecord(), ...data }),
        update: async ({ data }: any) => ({ ...installRecord(), ...data }),
        ...(overrides.marketplaceInstall ?? {}),
    },
    ...(overrides.$extra ?? {}),
} as any);

// ---------------------------------------------------------------------------
// 1. GET /v1/marketplace/listings — returns listings array
// ---------------------------------------------------------------------------

test('GET /v1/marketplace/listings — returns listings array', async () => {
    const app = Fastify({ logger: false });
    await registerMarketplaceRoutes(app, { getSession: () => makeSession('viewer'), prisma: makePrisma() });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/marketplace/listings' });
        assert.equal(res.statusCode, 200);
        const body = res.json<{ listings: unknown[] }>();
        assert.ok(Array.isArray(body.listings));
        assert.equal(body.listings.length, 1);
    } finally {
        await app.close();
    }
});

// ---------------------------------------------------------------------------
// 2. GET /v1/marketplace/listings — passes tag filter
// ---------------------------------------------------------------------------

test('GET /v1/marketplace/listings — passes tag filter', async () => {
    const records = [
        listingRecord({ id: 'l1', skillId: 'sk1', tags: ['automation'] }),
        listingRecord({ id: 'l2', skillId: 'sk2', tags: ['analytics'] }),
    ];
    const prisma = makePrisma({
        marketplaceListing: {
            findMany: async () => records,
        },
    });
    const app = Fastify({ logger: false });
    await registerMarketplaceRoutes(app, { getSession: () => makeSession('viewer'), prisma });
    try {
        const res = await app.inject({
            method: 'GET',
            url: '/v1/marketplace/listings?tag=automation',
        });
        assert.equal(res.statusCode, 200);
        const body = res.json<{ listings: any[] }>();
        assert.equal(body.listings.length, 1);
        assert.ok((body.listings[0] as any).tags.includes('automation'));
    } finally {
        await app.close();
    }
});

// ---------------------------------------------------------------------------
// 3. GET /v1/marketplace/listings/:listingId — 200 with listing
// ---------------------------------------------------------------------------

test('GET /v1/marketplace/listings/:listingId — 200 with listing', async () => {
    const app = Fastify({ logger: false });
    await registerMarketplaceRoutes(app, { getSession: () => makeSession('viewer'), prisma: makePrisma() });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/marketplace/listings/listing_1' });
        assert.equal(res.statusCode, 200);
        const body = res.json<{ id: string; skillId: string }>();
        assert.equal(body.id, 'listing_1');
        assert.equal(body.skillId, 'skill_1');
    } finally {
        await app.close();
    }
});

// ---------------------------------------------------------------------------
// 4. GET /v1/marketplace/listings/:listingId — 404 when not found
// ---------------------------------------------------------------------------

test('GET /v1/marketplace/listings/:listingId — 404 when not found', async () => {
    const prisma = makePrisma({
        marketplaceListing: {
            findUnique: async () => null,
        },
    });
    const app = Fastify({ logger: false });
    await registerMarketplaceRoutes(app, { getSession: () => makeSession('viewer'), prisma });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/marketplace/listings/bad_id' });
        assert.equal(res.statusCode, 404);
        assert.equal(res.json<{ error: string }>().error, 'not_found');
    } finally {
        await app.close();
    }
});

// ---------------------------------------------------------------------------
// 5. POST /v1/marketplace/listings — 201 on success
// ---------------------------------------------------------------------------

test('POST /v1/marketplace/listings — 201 on success', async () => {
    const app = Fastify({ logger: false });
    await registerMarketplaceRoutes(app, { getSession: () => makeSession('admin'), prisma: makePrisma() });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/marketplace/listings',
            payload: { skillId: 'skill_new', name: 'New Skill', version: '1.0.0' },
        });
        assert.equal(res.statusCode, 201);
        const body = res.json<{ skillId: string }>();
        assert.equal(body.skillId, 'skill_new');
    } finally {
        await app.close();
    }
});

// ---------------------------------------------------------------------------
// 6. POST /v1/marketplace/listings — 403 if operator role (needs admin)
// ---------------------------------------------------------------------------

test('POST /v1/marketplace/listings — 403 if operator role', async () => {
    const app = Fastify({ logger: false });
    await registerMarketplaceRoutes(app, { getSession: () => makeSession('operator'), prisma: makePrisma() });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/marketplace/listings',
            payload: { skillId: 'skill_1', name: 'Skill', version: '1.0.0' },
        });
        assert.equal(res.statusCode, 403);
        const body = res.json<{ error: string; required: string }>();
        assert.equal(body.error, 'insufficient_role');
        assert.equal(body.required, 'admin');
    } finally {
        await app.close();
    }
});

// ---------------------------------------------------------------------------
// 7. PATCH /v1/marketplace/listings/:listingId — updates listing
// ---------------------------------------------------------------------------

test('PATCH /v1/marketplace/listings/:listingId — updates listing', async () => {
    let capturedData: Record<string, unknown> | undefined;
    const prisma = makePrisma({
        marketplaceListing: {
            findUnique: async () => listingRecord(),
            update: async ({ data }: any) => {
                capturedData = data;
                return { ...listingRecord(), ...data };
            },
        },
    });
    const app = Fastify({ logger: false });
    await registerMarketplaceRoutes(app, { getSession: () => makeSession('admin'), prisma });
    try {
        const res = await app.inject({
            method: 'PATCH',
            url: '/v1/marketplace/listings/listing_1',
            payload: { name: 'Renamed Skill', status: 'deprecated' },
        });
        assert.equal(res.statusCode, 200);
        assert.equal(capturedData?.['name'], 'Renamed Skill');
        assert.equal(capturedData?.['status'], 'deprecated');
    } finally {
        await app.close();
    }
});

// ---------------------------------------------------------------------------
// 8. PATCH /v1/marketplace/listings/:listingId — 404 when not found
// ---------------------------------------------------------------------------

test('PATCH /v1/marketplace/listings/:listingId — 404 when not found', async () => {
    const prisma = makePrisma({
        marketplaceListing: {
            findUnique: async () => null,
        },
    });
    const app = Fastify({ logger: false });
    await registerMarketplaceRoutes(app, { getSession: () => makeSession('admin'), prisma });
    try {
        const res = await app.inject({
            method: 'PATCH',
            url: '/v1/marketplace/listings/bad_id',
            payload: { name: 'x' },
        });
        assert.equal(res.statusCode, 404);
        assert.equal(res.json<{ error: string }>().error, 'not_found');
    } finally {
        await app.close();
    }
});

// ---------------------------------------------------------------------------
// 9. GET /v1/marketplace/installs — returns installs for tenant
// ---------------------------------------------------------------------------

test('GET /v1/marketplace/installs — returns installs for tenant', async () => {
    const app = Fastify({ logger: false });
    await registerMarketplaceRoutes(app, { getSession: () => makeSession('viewer'), prisma: makePrisma() });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/marketplace/installs' });
        assert.equal(res.statusCode, 200);
        const body = res.json<{ installs: unknown[] }>();
        assert.ok(Array.isArray(body.installs));
        assert.equal(body.installs.length, 1);
    } finally {
        await app.close();
    }
});

// ---------------------------------------------------------------------------
// 10. POST /v1/marketplace/installs — 201 on success
// ---------------------------------------------------------------------------

test('POST /v1/marketplace/installs — 201 on success', async () => {
    const app = Fastify({ logger: false });
    await registerMarketplaceRoutes(app, {
        getSession: () => makeSession('operator'),
        prisma: makePrisma(),
    });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/marketplace/installs',
            payload: { skillId: 'skill_1', approvedPermissions: ['read'] },
        });
        assert.equal(res.statusCode, 201);
        const body = res.json<{ skillId: string; status: string }>();
        assert.equal(body.skillId, 'skill_1');
        assert.equal(body.status, 'installed');
    } finally {
        await app.close();
    }
});

// ---------------------------------------------------------------------------
// 11. POST /v1/marketplace/installs — 403 if viewer role
// ---------------------------------------------------------------------------

test('POST /v1/marketplace/installs — 403 if viewer role', async () => {
    const app = Fastify({ logger: false });
    await registerMarketplaceRoutes(app, { getSession: () => makeSession('viewer'), prisma: makePrisma() });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/marketplace/installs',
            payload: { skillId: 'skill_1' },
        });
        assert.equal(res.statusCode, 403);
        const body = res.json<{ error: string; required: string }>();
        assert.equal(body.error, 'insufficient_role');
        assert.equal(body.required, 'operator');
    } finally {
        await app.close();
    }
});

// ---------------------------------------------------------------------------
// 12. DELETE /v1/marketplace/installs/:skillId — 200 on success
// ---------------------------------------------------------------------------

test('DELETE /v1/marketplace/installs/:skillId — 200 on success', async () => {
    const prisma = makePrisma({
        marketplaceInstall: {
            findUnique: async () => installRecord({ status: 'installed' }),
            update: async ({ data }: any) => ({ ...installRecord(), ...data }),
        },
    });
    const app = Fastify({ logger: false });
    await registerMarketplaceRoutes(app, { getSession: () => makeSession('operator'), prisma });
    try {
        const res = await app.inject({
            method: 'DELETE',
            url: '/v1/marketplace/installs/skill_1',
        });
        assert.equal(res.statusCode, 200);
        const body = res.json<{ status: string }>();
        assert.equal(body.status, 'uninstalled');
    } finally {
        await app.close();
    }
});

// ---------------------------------------------------------------------------
// 13. DELETE /v1/marketplace/installs/:skillId — 403 if viewer role
// ---------------------------------------------------------------------------

test('DELETE /v1/marketplace/installs/:skillId — 403 if viewer role', async () => {
    const app = Fastify({ logger: false });
    await registerMarketplaceRoutes(app, { getSession: () => makeSession('viewer'), prisma: makePrisma() });
    try {
        const res = await app.inject({
            method: 'DELETE',
            url: '/v1/marketplace/installs/skill_1',
        });
        assert.equal(res.statusCode, 403);
        const body = res.json<{ error: string; required: string }>();
        assert.equal(body.error, 'insufficient_role');
        assert.equal(body.required, 'operator');
    } finally {
        await app.close();
    }
});

// ---------------------------------------------------------------------------
// 14. GET /v1/marketplace/installs/:skillId — 200 with install
// ---------------------------------------------------------------------------

test('GET /v1/marketplace/installs/:skillId — 200 with install', async () => {
    const prisma = makePrisma({
        marketplaceInstall: {
            findUnique: async () => installRecord({ skillId: 'skill_1', status: 'installed' }),
        },
    });
    const app = Fastify({ logger: false });
    await registerMarketplaceRoutes(app, { getSession: () => makeSession('viewer'), prisma });
    try {
        const res = await app.inject({
            method: 'GET',
            url: '/v1/marketplace/installs/skill_1',
        });
        assert.equal(res.statusCode, 200);
        const body = res.json<{ skillId: string; status: string }>();
        assert.equal(body.skillId, 'skill_1');
        assert.equal(body.status, 'installed');
    } finally {
        await app.close();
    }
});

// ---------------------------------------------------------------------------
// 15. GET /v1/marketplace/installs/:skillId — 404 when not found
// ---------------------------------------------------------------------------

test('GET /v1/marketplace/installs/:skillId — 404 when not found', async () => {
    const prisma = makePrisma({
        marketplaceInstall: {
            findUnique: async () => null,
        },
    });
    const app = Fastify({ logger: false });
    await registerMarketplaceRoutes(app, { getSession: () => makeSession('viewer'), prisma });
    try {
        const res = await app.inject({
            method: 'GET',
            url: '/v1/marketplace/installs/skill_missing',
        });
        assert.equal(res.statusCode, 404);
        const body = res.json<{ error: string }>();
        assert.equal(body.error, 'not_found');
    } finally {
        await app.close();
    }
});

// ---------------------------------------------------------------------------
// 16. PATCH /v1/marketplace/installs/:skillId — disables install
// ---------------------------------------------------------------------------

test('PATCH /v1/marketplace/installs/:skillId — disables install', async () => {
    const prisma = makePrisma({
        marketplaceInstall: {
            findUnique: async () => installRecord({ skillId: 'skill_1', status: 'installed' }),
            update: async ({ data }: any) => ({ ...installRecord(), ...data }),
        },
    });
    const app = Fastify({ logger: false });
    await registerMarketplaceRoutes(app, { getSession: () => makeSession('operator'), prisma });
    try {
        const res = await app.inject({
            method: 'PATCH',
            url: '/v1/marketplace/installs/skill_1',
            payload: { enabled: false },
        });
        assert.equal(res.statusCode, 200);
        const body = res.json<{ status: string }>();
        assert.equal(body.status, 'disabled');
    } finally {
        await app.close();
    }
});

// ---------------------------------------------------------------------------
// 17. PATCH /v1/marketplace/installs/:skillId — enables install
// ---------------------------------------------------------------------------

test('PATCH /v1/marketplace/installs/:skillId — enables install', async () => {
    const prisma = makePrisma({
        marketplaceInstall: {
            findUnique: async () => installRecord({ skillId: 'skill_1', status: 'disabled' }),
            update: async ({ data }: any) => ({ ...installRecord(), ...data }),
        },
    });
    const app = Fastify({ logger: false });
    await registerMarketplaceRoutes(app, { getSession: () => makeSession('operator'), prisma });
    try {
        const res = await app.inject({
            method: 'PATCH',
            url: '/v1/marketplace/installs/skill_1',
            payload: { enabled: true },
        });
        assert.equal(res.statusCode, 200);
        const body = res.json<{ status: string }>();
        assert.equal(body.status, 'installed');
    } finally {
        await app.close();
    }
});

// ---------------------------------------------------------------------------
// 18. PATCH /v1/marketplace/installs/:skillId — 403 if viewer role
// ---------------------------------------------------------------------------

test('PATCH /v1/marketplace/installs/:skillId — 403 if viewer role', async () => {
    const app = Fastify({ logger: false });
    await registerMarketplaceRoutes(app, { getSession: () => makeSession('viewer'), prisma: makePrisma() });
    try {
        const res = await app.inject({
            method: 'PATCH',
            url: '/v1/marketplace/installs/skill_1',
            payload: { enabled: false },
        });
        assert.equal(res.statusCode, 403);
        const body = res.json<{ error: string; required: string }>();
        assert.equal(body.error, 'insufficient_role');
        assert.equal(body.required, 'operator');
    } finally {
        await app.close();
    }
});
