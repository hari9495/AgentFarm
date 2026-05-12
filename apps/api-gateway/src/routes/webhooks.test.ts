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

const buildApp = async () => {
    const learnedPatterns: LearnedPatternRecord[] = [];
    const prisma = {
        $queryRaw: async (_strings: TemplateStringsArray, ...values: unknown[]) => {
            const record: LearnedPatternRecord = {
                id: `ltm-${learnedPatterns.length + 1}`,
                tenantId: String(values[0]),
                workspaceId: String(values[1]),
                pattern: String(values[2]),
                confidence: Number(values[3]),
                observedCount: Number(values[4]),
                lastSeen: values[5] instanceof Date ? values[5] : new Date(String(values[5])),
                createdAt: new Date('2026-05-07T00:00:00.000Z'),
            };
            learnedPatterns.push(record);
            return [record];
        },
    };

    const app = Fastify({ logger: false });
    registerWebhookRoutes(app, prisma as never);
    return { app, learnedPatterns };
};

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
    it('returns an empty sources array', async () => {
        const { app } = await buildApp();
        try {
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
    it('creates a new source and returns id, name, secret, inboundUrl', async () => {
        const { app } = await buildApp();
        try {
            const res = await app.inject({
                method: 'POST',
                url: '/v1/webhooks/inbound/sources',
                payload: { name: 'GitHub Actions', description: 'CI triggers' },
            });
            assert.equal(res.statusCode, 201);
            const body = res.json() as { id: string; name: string; secret: string; inboundUrl: string };
            assert.equal(body.name, 'GitHub Actions');
            assert.ok(body.id.startsWith('wsrc_'));
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
    it('returns deleted: true', async () => {
        const { app } = await buildApp();
        try {
            const res = await app.inject({
                method: 'DELETE',
                url: '/v1/webhooks/inbound/sources/wsrc_test123',
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
    it('returns an empty events array', async () => {
        const { app } = await buildApp();
        try {
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

    it('returns ok/statusCode/latencyMs when sourceId is provided (network may fail)', async () => {
        const { app } = await buildApp();
        try {
            const res = await app.inject({
                method: 'POST',
                url: '/v1/webhooks/inbound/test',
                payload: { sourceId: 'wsrc_test123' },
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