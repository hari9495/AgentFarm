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