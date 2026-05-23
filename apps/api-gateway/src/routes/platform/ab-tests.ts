import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { ROLE_RANK } from '../lib/require-role.js';
import { assignVariant, getAbTestResults, concludeAbTest } from '../lib/ab-test-service.js';
import { writeAuditEvent } from '../lib/audit-writer.js';

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    role?: string;
    expiresAt: number;
};

export type RegisterAbTestRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
    prisma?: PrismaClient;
};

const getPrisma = async () => {
    const db = await import('../lib/db.js');
    return db.prisma;
};

type AbTestIdParams = { abTestId: string };

type CreateAbTestBody = {
    botId?: unknown;
    name?: unknown;
    versionAId?: unknown;
    versionBId?: unknown;
    trafficSplit?: unknown;
};

type AssignVariantBody = {
    taskId?: unknown;
};

type ConcludeBody = {
    conclusionNote?: unknown;
};

export const registerAbTestRoutes = async (
    app: FastifyInstance,
    options: RegisterAbTestRoutesOptions,
): Promise<void> => {
    const resolvePrisma = options.prisma
        ? () => Promise.resolve(options.prisma!)
        : getPrisma;

    // -------------------------------------------------------------------------
    // POST /v1/ab-tests — create a new A/B test (operator+)
    // -------------------------------------------------------------------------
    app.post<{ Body: CreateAbTestBody }>('/v1/ab-tests', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) return reply.code(401).send({ error: 'unauthorized' });
        if ((ROLE_RANK[session.role ?? ''] ?? 0) < (ROLE_RANK['operator'] ?? 99)) {
            return reply.code(403).send({ error: 'insufficient_role', required: 'operator', actual: session.role });
        }

        const { botId, name, versionAId, versionBId, trafficSplit } = request.body ?? {};

        if (typeof botId !== 'string' || !botId) {
            return reply.code(400).send({ error: 'botId is required' });
        }
        if (typeof name !== 'string' || !name) {
            return reply.code(400).send({ error: 'name is required' });
        }
        if (typeof versionAId !== 'string' || !versionAId) {
            return reply.code(400).send({ error: 'versionAId is required' });
        }
        if (typeof versionBId !== 'string' || !versionBId) {
            return reply.code(400).send({ error: 'versionBId is required' });
        }
        const split = trafficSplit !== undefined ? Number(trafficSplit) : 0.5;
        if (isNaN(split) || split < 0 || split > 1) {
            return reply.code(400).send({ error: 'trafficSplit must be between 0 and 1' });
        }

        const db = await resolvePrisma();
        const abTest = await db.abTest.create({
            data: {
                tenantId: session.tenantId,
                botId,
                name,
                versionAId,
                versionBId,
                trafficSplit: split,
                status: 'active',
            },
        });

        void writeAuditEvent({
            prisma: db,
            tenantId: session.tenantId,
            workspaceId: session.workspaceIds[0] ?? '',
            botId,
            eventType: 'ab_test.created',
            severity: 'info',
            summary: `A/B test "${name}" created (id=${abTest.id}) by ${session.userId}`,
        });

        return reply.code(201).send({ abTest });
    });

    // -------------------------------------------------------------------------
    // GET /v1/ab-tests — list active A/B tests for tenant (viewer+)
    // -------------------------------------------------------------------------
    app.get('/v1/ab-tests', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) return reply.code(401).send({ error: 'unauthorized' });
        if ((ROLE_RANK[session.role ?? ''] ?? 0) < (ROLE_RANK['viewer'] ?? 99)) {
            return reply.code(403).send({ error: 'insufficient_role', required: 'viewer', actual: session.role });
        }

        const db = await resolvePrisma();
        const abTests = await db.abTest.findMany({
            where: { tenantId: session.tenantId },
            orderBy: { createdAt: 'desc' },
        });

        return reply.code(200).send({ abTests });
    });

    // -------------------------------------------------------------------------
    // GET /v1/ab-tests/:abTestId — get single A/B test (viewer+)
    // -------------------------------------------------------------------------
    app.get<{ Params: AbTestIdParams }>('/v1/ab-tests/:abTestId', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) return reply.code(401).send({ error: 'unauthorized' });
        if ((ROLE_RANK[session.role ?? ''] ?? 0) < (ROLE_RANK['viewer'] ?? 99)) {
            return reply.code(403).send({ error: 'insufficient_role', required: 'viewer', actual: session.role });
        }

        const { abTestId } = request.params;
        const db = await resolvePrisma();
        const abTest = await db.abTest.findUnique({ where: { id: abTestId } });
        if (!abTest || abTest.tenantId !== session.tenantId) {
            return reply.code(404).send({ error: 'not_found' });
        }

        return reply.code(200).send({ abTest });
    });

    // -------------------------------------------------------------------------
    // GET /v1/ab-tests/:abTestId/results — aggregated variant stats (viewer+)
    // -------------------------------------------------------------------------
    app.get<{ Params: AbTestIdParams }>('/v1/ab-tests/:abTestId/results', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) return reply.code(401).send({ error: 'unauthorized' });
        if ((ROLE_RANK[session.role ?? ''] ?? 0) < (ROLE_RANK['viewer'] ?? 99)) {
            return reply.code(403).send({ error: 'insufficient_role', required: 'viewer', actual: session.role });
        }

        const { abTestId } = request.params;
        const db = await resolvePrisma();
        const results = await getAbTestResults(db, abTestId, session.tenantId);
        if (!results) return reply.code(404).send({ error: 'not_found' });

        return reply.code(200).send({ results });
    });

    // -------------------------------------------------------------------------
    // POST /v1/ab-tests/:abTestId/assign — assign a task to a variant (operator+)
    // -------------------------------------------------------------------------
    app.post<{ Params: AbTestIdParams; Body: AssignVariantBody }>(
        '/v1/ab-tests/:abTestId/assign',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) return reply.code(401).send({ error: 'unauthorized' });
            if ((ROLE_RANK[session.role ?? ''] ?? 0) < (ROLE_RANK['operator'] ?? 99)) {
                return reply.code(403).send({ error: 'insufficient_role', required: 'operator', actual: session.role });
            }

            const { abTestId } = request.params;
            const { taskId } = request.body ?? {};

            if (typeof taskId !== 'string' || !taskId) {
                return reply.code(400).send({ error: 'taskId is required' });
            }

            const db = await resolvePrisma();
            const assignment = await assignVariant(db, abTestId, session.tenantId, taskId);
            if (!assignment) {
                return reply.code(404).send({ error: 'not_found_or_inactive' });
            }

            return reply.code(200).send({ assignment });
        },
    );

    // -------------------------------------------------------------------------
    // POST /v1/ab-tests/:abTestId/conclude — conclude a test (admin+)
    // -------------------------------------------------------------------------
    app.post<{ Params: AbTestIdParams; Body: ConcludeBody }>(
        '/v1/ab-tests/:abTestId/conclude',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) return reply.code(401).send({ error: 'unauthorized' });
            if ((ROLE_RANK[session.role ?? ''] ?? 0) < (ROLE_RANK['admin'] ?? 99)) {
                return reply.code(403).send({ error: 'insufficient_role', required: 'admin', actual: session.role });
            }

            const { abTestId } = request.params;
            const conclusionNote =
                typeof request.body?.conclusionNote === 'string'
                    ? request.body.conclusionNote
                    : undefined;

            const db = await resolvePrisma();
            const updated = await concludeAbTest(db, abTestId, session.tenantId, conclusionNote);
            if (!updated) {
                return reply.code(404).send({ error: 'not_found' });
            }

            void writeAuditEvent({
                prisma: db,
                tenantId: session.tenantId,
                workspaceId: session.workspaceIds[0] ?? '',
                botId: updated.botId,
                eventType: 'ab_test.concluded',
                severity: 'info',
                summary: `A/B test ${abTestId} concluded by ${session.userId}`,
            });

            return reply.code(200).send({ abTest: updated });
        },
    );
};
