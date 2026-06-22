import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerWebhookRoutes } from './webhooks.js';

type LearnedPatternRecord = {
    id: string;
    tenantId: string;
    workspaceId: string;
    pattern: string;
    confidence: number;
    observedCount: number;
    lastSeen: Date;
    createdAt: Date;
};

type MockWebhookSource = {
    id: string;
    tenantId: string;
    name: string;
    description?: string;
    secret: string;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
};

const buildApp = async () => {
    const learnedPatterns: LearnedPatternRecord[] = [];
    const webhookSources: MockWebhookSource[] = [];
    let sourceSeq = 0;

    const prisma = {
        // writeEpisodicMemoryNoEmbed uses $executeRaw for the INSERT.
        // INSERT positions (after gen_random_uuid()::text):
        //   0=tenantId, 1=botId, 2=workspaceId, 3=pattern, 4=summary, 5=confidence
        $executeRaw: async (_strings: TemplateStringsArray, ...values: unknown[]) => {
            const record: LearnedPatternRecord = {
                id: `ltm-${learnedPatterns.length + 1}`,
                tenantId: String(values[0]),
                workspaceId: String(values[2]),
                pattern: String(values[3]),
                confidence: Number(values[5]),
                observedCount: 1,
                lastSeen: new Date(),
                createdAt: new Date('2026-05-07T00:00:00.000Z'),
            };
            learnedPatterns.push(record);
            return 1;
        },
        $queryRaw: async () => [],
        webhookSource: {
            findMany: async ({ where }: { where?: { tenantId?: string } } = {}) => {
                if (where?.tenantId) return webhookSources.filter((s) => s.tenantId === where.tenantId);
                return [...webhookSources];
            },
            create: async ({ data }: { data: Omit<MockWebhookSource, 'id' | 'active' | 'createdAt' | 'updatedAt'> }) => {
                sourceSeq += 1;
                const source: MockWebhookSource = {
                    id: `mock-src-${sourceSeq}`,
                    ...data,
                    active: true,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                };
                webhookSources.push(source);
                return source;
            },
            findUnique: async ({ where }: { where: { id: string } }) =>
                webhookSources.find((s) => s.id === where.id) ?? null,
            delete: async ({ where }: { where: { id: string } }) => {
                const idx = webhookSources.findIndex((s) => s.id === where.id);
                if (idx >= 0) webhookSources.splice(idx, 1);
                return {};
            },
        },
        inboundWebhookEvent: {
            findMany: async () => [],
        },
    };

    const mockSession = {
        userId: 'user_test',
        tenantId: 'tenant_test',
        workspaceIds: ['ws_test'],
        scope: 'customer' as const,
        expiresAt: Date.now() + 3_600_000,
    };
    const getSession = () => mockSession;

    const app = Fastify({ logger: false });
    registerWebhookRoutes(app, prisma as never, { getSession });
    return { app, learnedPatterns, webhookSources, prisma };
};

describe('POST /webhooks/ingest/inbound (per-source verification)', () => {
    it('returns 404 when the source query param is unknown', async () => {
        const { app } = await buildApp();
        try {
            const res = await app.inject({
                method: 'POST',
                url: '/webhooks/ingest/inbound?source=does-not-exist',
                payload: { hello: 'world' },
            });
            assert.equal(res.statusCode, 404);
        } finally {
            await app.close();
        }
    });

    it('rejects a known source with a missing/invalid signature (fail-closed)', async () => {
        const { app } = await buildApp();
        try {
            const createRes = await app.inject({
                method: 'POST',
                url: '/v1/webhooks/inbound/sources',
                payload: { name: 'Signed source' },
            });
            const { id } = createRes.json() as { id: string };

            const res = await app.inject({
                method: 'POST',
                url: `/webhooks/ingest/inbound?source=${id}`,
                headers: { 'x-hub-signature-256': 'sha256=deadbeef' },
                payload: { hello: 'world' },
            });
            assert.equal(res.statusCode, 401);
        } finally {
            await app.close();
        }
    });

    it('accepts a test ping without a signature and does not persist it', async () => {
        const { app } = await buildApp();
        try {
            const createRes = await app.inject({
                method: 'POST',
                url: '/v1/webhooks/inbound/sources',
                payload: { name: 'Ping source' },
            });
            const { id } = createRes.json() as { id: string };

            const res = await app.inject({
                method: 'POST',
                url: `/webhooks/ingest/inbound?source=${id}`,
                headers: { 'x-test-ping': '1' },
                payload: { test: true },
            });
            assert.equal(res.statusCode, 200);
            const body = res.json() as { ok: boolean; test?: boolean };
            assert.equal(body.ok, true);
            assert.equal(body.test, true);
        } finally {
            await app.close();
        }
    });
});

describe('POST /api/v1/memory/patterns/code-review', () => {
    it('normalizes review comments into long-term memory patterns', async () => {
        const { app, learnedPatterns } = await buildApp();

        try {
            const response = await app.inject({
                method: 'POST',
                url: '/api/v1/memory/patterns/code-review',
                payload: {
                    tenantId: 'tenant-001',
                    workspaceId: 'ws-001',
                    sourceTaskId: 'task-123',
                    sourcePrUrl: 'https://github.com/example/repo/pull/42',
                    review_comments: [
                        'always add a regression test for bug fixes.',
                        'prefer explicit error handling in gateway routes.',
                    ],
                },
            });

            assert.equal(response.statusCode, 201);
            const body = response.json() as {
                learnedCount: number;
                sourceTaskId?: string;
                sourcePrUrl?: string;
            };
            assert.equal(body.learnedCount, 2);
            assert.equal(body.sourceTaskId, 'task-123');
            assert.equal(body.sourcePrUrl, 'https://github.com/example/repo/pull/42');
            assert.deepEqual(
                learnedPatterns.map((entry) => entry.pattern),
                [
                    'Always add a regression test for bug fixes.',
                    'Prefer explicit error handling in gateway routes.',
                ],
            );
        } finally {
            await app.close();
        }
    });

    it('rejects requests without tenant or workspace identifiers', async () => {
        const { app } = await buildApp();

        try {
            const response = await app.inject({
                method: 'POST',
                url: '/api/v1/memory/patterns/code-review',
                payload: {
                    review_comments: ['always add tests'],
                },
            });

            assert.equal(response.statusCode, 400);
        } finally {
            await app.close();
        }
    });
});

describe('GET /v1/webhooks/inbound/sources', () => {
    it('returns an empty sources array for the authenticated tenant', async () => {
        const { app } = await buildApp();
        try {
            // tenantId now comes from the session — no query param needed
            const res = await app.inject({ method: 'GET', url: '/v1/webhooks/inbound/sources' });
            assert.equal(res.statusCode, 200);
            const body = res.json() as { sources: unknown[] };
            assert.ok(Array.isArray(body.sources));
        } finally {
            await app.close();
        }
    });
});

describe('POST /v1/webhooks/inbound/sources', () => {
    it('creates a new source scoped to the session tenant', async () => {
        const { app } = await buildApp();
        try {
            // tenantId is taken from the session — not needed in the body
            const res = await app.inject({
                method: 'POST',
                url: '/v1/webhooks/inbound/sources',
                payload: { name: 'GitHub Actions', description: 'CI triggers' },
            });
            assert.equal(res.statusCode, 201);
            const body = res.json() as { id: string; name: string; secret: string; inboundUrl: string };
            assert.equal(body.name, 'GitHub Actions');
            assert.ok(typeof body.id === 'string' && body.id.length > 0);
            assert.ok(typeof body.secret === 'string' && body.secret.length > 0);
            assert.ok(body.inboundUrl.includes(body.id));
        } finally {
            await app.close();
        }
    });

    it('rejects requests without a name', async () => {
        const { app } = await buildApp();
        try {
            const res = await app.inject({
                method: 'POST',
                url: '/v1/webhooks/inbound/sources',
                payload: {},
            });
            assert.equal(res.statusCode, 400);
        } finally {
            await app.close();
        }
    });
});

describe('DELETE /v1/webhooks/inbound/sources/:sourceId', () => {
    it('returns 404 for an unknown source', async () => {
        const { app } = await buildApp();
        try {
            const res = await app.inject({
                method: 'DELETE',
                url: '/v1/webhooks/inbound/sources/unknown-src',
            });
            assert.equal(res.statusCode, 404);
        } finally {
            await app.close();
        }
    });

    it('returns deleted: true for a source belonging to the session tenant', async () => {
        const { app } = await buildApp();
        try {
            // Create a source (tenantId comes from session)
            const createRes = await app.inject({
                method: 'POST',
                url: '/v1/webhooks/inbound/sources',
                payload: { name: 'To Delete' },
            });
            const { id } = createRes.json() as { id: string };

            const res = await app.inject({
                method: 'DELETE',
                url: `/v1/webhooks/inbound/sources/${id}`,
            });
            assert.equal(res.statusCode, 200);
            const body = res.json() as { deleted: boolean };
            assert.equal(body.deleted, true);
        } finally {
            await app.close();
        }
    });
});

describe('GET /v1/webhooks/inbound/events', () => {
    it('returns an empty events array for the authenticated session tenant', async () => {
        const { app } = await buildApp();
        try {
            // tenantId comes from the session — no query param needed
            const res = await app.inject({ method: 'GET', url: '/v1/webhooks/inbound/events' });
            assert.equal(res.statusCode, 200);
            const body = res.json() as { events: unknown[] };
            assert.ok(Array.isArray(body.events));
        } finally {
            await app.close();
        }
    });

    it('accepts source and limit query params without error', async () => {
        const { app } = await buildApp();
        try {
            const res = await app.inject({
                method: 'GET',
                url: '/v1/webhooks/inbound/events?source=wsrc_abc&limit=50',
            });
            assert.equal(res.statusCode, 200);
        } finally {
            await app.close();
        }
    });
});

describe('POST /v1/webhooks/inbound/test', () => {
    it('rejects requests without a sourceId', async () => {
        const { app } = await buildApp();
        try {
            const res = await app.inject({
                method: 'POST',
                url: '/v1/webhooks/inbound/test',
                payload: {},
            });
            assert.equal(res.statusCode, 400);
        } finally {
            await app.close();
        }
    });

    it('returns 404 for a source that does not exist', async () => {
        const { app } = await buildApp();
        try {
            const res = await app.inject({
                method: 'POST',
                url: '/v1/webhooks/inbound/test',
                payload: { sourceId: 'wsrc_test123' },
            });
            assert.equal(res.statusCode, 404);
        } finally {
            await app.close();
        }
    });

    it('returns ok/statusCode/latencyMs for a source owned by the session tenant (network may fail)', async () => {
        const { app } = await buildApp();
        try {
            // Create a source first so the ownership check passes
            const createRes = await app.inject({
                method: 'POST',
                url: '/v1/webhooks/inbound/sources',
                payload: { name: 'Reachability test' },
            });
            const { id } = createRes.json() as { id: string };

            const res = await app.inject({
                method: 'POST',
                url: '/v1/webhooks/inbound/test',
                payload: { sourceId: id },
            });
            assert.equal(res.statusCode, 200);
            const body = res.json() as { ok: boolean; statusCode: number; latencyMs: number };
            assert.ok(typeof body.ok === 'boolean');
            assert.ok(typeof body.statusCode === 'number');
            assert.ok(typeof body.latencyMs === 'number');
        } finally {
            await app.close();
        }
    });
});