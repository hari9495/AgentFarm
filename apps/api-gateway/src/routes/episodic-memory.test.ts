import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerEpisodicMemoryRoutes, type EpisodicMemoryRepo } from './episodic-memory.js';
import type { EpisodicMemoryRecord } from '@agentfarm/shared-types';

// ---------------------------------------------------------------------------
// Fake repository
// ---------------------------------------------------------------------------

const makeFakeRecord = (overrides: Partial<EpisodicMemoryRecord> = {}): EpisodicMemoryRecord => ({
    id: `mem_${Math.random().toString(36).slice(2)}`,
    tenantId: 'tenant_1',
    botId: 'bot_1',
    workspaceId: 'ws_1',
    pattern: 'writes tests before implementation',
    summary: 'TDD red-green cycle used consistently',
    embeddingModel: 'text-embedding-3-small',
    confidence: 0.87,
    observedCount: 5,
    lastSeen: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    ...overrides,
});

const createFakeRepo = (): EpisodicMemoryRepo & { store: Map<string, EpisodicMemoryRecord> } => {
    const store = new Map<string, EpisodicMemoryRecord>();

    return {
        store,

        async findMany({ tenantId, botId, workspaceId, skip, take }) {
            const all = Array.from(store.values()).filter(
                (r) => r.tenantId === tenantId && r.botId === botId && r.workspaceId === workspaceId,
            );
            return all.slice(skip, skip + take);
        },

        async count({ tenantId, botId, workspaceId }) {
            return Array.from(store.values()).filter(
                (r) => r.tenantId === tenantId && r.botId === botId && r.workspaceId === workspaceId,
            ).length;
        },

        async deleteById(id, tenantId) {
            const existing = store.get(id);
            if (!existing || existing.tenantId !== tenantId) {
                return false;
            }
            store.delete(id);
            return true;
        },
    };
};

const sessionContext = () => ({
    userId: 'user_1',
    tenantId: 'tenant_1',
    workspaceIds: ['ws_1'],
    expiresAt: Date.now() + 3600_000,
});

// ---------------------------------------------------------------------------
// GET /v1/episodic-memory
// ---------------------------------------------------------------------------

test('episodic memory list returns 401 when no session', async () => {
    const app = Fastify();
    await registerEpisodicMemoryRoutes(app, { getSession: () => null });
    try {
        const response = await app.inject({ method: 'GET', url: '/v1/episodic-memory?bot_id=bot_1&workspace_id=ws_1' });
        assert.equal(response.statusCode, 401);
    } finally {
        await app.close();
    }
});

test('episodic memory list returns 400 when bot_id is missing', async () => {
    const app = Fastify();
    await registerEpisodicMemoryRoutes(app, { getSession: () => sessionContext() });
    try {
        const response = await app.inject({ method: 'GET', url: '/v1/episodic-memory?workspace_id=ws_1' });
        assert.equal(response.statusCode, 400);
        const body = response.json() as { error: string };
        assert.equal(body.error, 'missing_bot_id');
    } finally {
        await app.close();
    }
});

test('episodic memory list returns 403 when workspace not in session scope', async () => {
    const app = Fastify();
    await registerEpisodicMemoryRoutes(app, { getSession: () => sessionContext() });
    try {
        const response = await app.inject({ method: 'GET', url: '/v1/episodic-memory?bot_id=bot_1&workspace_id=ws_other' });
        assert.equal(response.statusCode, 403);
    } finally {
        await app.close();
    }
});

test('episodic memory list returns paginated records', async () => {
    const app = Fastify();
    const repo = createFakeRepo();

    // Seed 3 records
    for (let i = 0; i < 3; i++) {
        const r = makeFakeRecord({ id: `mem_${i}`, pattern: `pattern_${i}` });
        repo.store.set(r.id, r);
    }

    await registerEpisodicMemoryRoutes(app, { getSession: () => sessionContext(), repo });
    try {
        const response = await app.inject({ method: 'GET', url: '/v1/episodic-memory?bot_id=bot_1&workspace_id=ws_1&page=1&page_size=2' });
        assert.equal(response.statusCode, 200);
        const body = response.json() as {
            records: EpisodicMemoryRecord[];
            total: number;
            page: number;
            page_size: number;
            has_more: boolean;
        };
        assert.equal(body.total, 3);
        assert.equal(body.records.length, 2);
        assert.equal(body.page, 1);
        assert.equal(body.page_size, 2);
        assert.equal(body.has_more, true);
    } finally {
        await app.close();
    }
});

test('episodic memory list page 2 returns remaining record', async () => {
    const app = Fastify();
    const repo = createFakeRepo();

    for (let i = 0; i < 3; i++) {
        const r = makeFakeRecord({ id: `mem_${i}`, pattern: `pattern_${i}` });
        repo.store.set(r.id, r);
    }

    await registerEpisodicMemoryRoutes(app, { getSession: () => sessionContext(), repo });
    try {
        const response = await app.inject({ method: 'GET', url: '/v1/episodic-memory?bot_id=bot_1&workspace_id=ws_1&page=2&page_size=2' });
        assert.equal(response.statusCode, 200);
        const body = response.json() as { records: EpisodicMemoryRecord[]; has_more: boolean };
        assert.equal(body.records.length, 1);
        assert.equal(body.has_more, false);
    } finally {
        await app.close();
    }
});

// ---------------------------------------------------------------------------
// DELETE /v1/episodic-memory/:id
// ---------------------------------------------------------------------------

test('episodic memory delete returns 401 when no session', async () => {
    const app = Fastify();
    await registerEpisodicMemoryRoutes(app, { getSession: () => null });
    try {
        const response = await app.inject({ method: 'DELETE', url: '/v1/episodic-memory/mem_001' });
        assert.equal(response.statusCode, 401);
    } finally {
        await app.close();
    }
});

test('episodic memory delete returns 404 when record not found', async () => {
    const app = Fastify();
    const repo = createFakeRepo();
    await registerEpisodicMemoryRoutes(app, { getSession: () => sessionContext(), repo });
    try {
        const response = await app.inject({ method: 'DELETE', url: '/v1/episodic-memory/nonexistent_id' });
        assert.equal(response.statusCode, 404);
    } finally {
        await app.close();
    }
});

test('episodic memory delete removes record and returns 200', async () => {
    const app = Fastify();
    const repo = createFakeRepo();

    const record = makeFakeRecord({ id: 'mem_del_1' });
    repo.store.set(record.id, record);

    await registerEpisodicMemoryRoutes(app, { getSession: () => sessionContext(), repo });
    try {
        const response = await app.inject({ method: 'DELETE', url: '/v1/episodic-memory/mem_del_1' });
        assert.equal(response.statusCode, 200);
        const body = response.json() as { deleted: boolean; id: string };
        assert.equal(body.deleted, true);
        assert.equal(body.id, 'mem_del_1');
        assert.equal(repo.store.has('mem_del_1'), false);
    } finally {
        await app.close();
    }
});

test('episodic memory delete rejects cross-tenant deletion attempt', async () => {
    const app = Fastify();
    const repo = createFakeRepo();

    // Record belongs to a different tenant
    const record = makeFakeRecord({ id: 'mem_other_tenant', tenantId: 'tenant_evil' });
    repo.store.set(record.id, record);

    await registerEpisodicMemoryRoutes(app, { getSession: () => sessionContext(), repo });
    try {
        const response = await app.inject({ method: 'DELETE', url: '/v1/episodic-memory/mem_other_tenant' });
        assert.equal(response.statusCode, 404);
        // Record must still exist — not deleted
        assert.equal(repo.store.has('mem_other_tenant'), true);
    } finally {
        await app.close();
    }
});
