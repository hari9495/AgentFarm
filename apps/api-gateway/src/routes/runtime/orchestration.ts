import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { ROLE_RANK } from '../lib/require-role.js';
import {
    startOrchestrationRun,
    completeSubTask,
    cancelOrchestrationRun,
} from '../lib/orchestration-service.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    role?: string;
    expiresAt: number;
};

export type RegisterOrchestrationRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
    prisma?: PrismaClient;
};

const getPrisma = async () => {
    const db = await import('../lib/db.js');
    return db.prisma;
};

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export const registerOrchestrationRoutes = async (
    app: FastifyInstance,
    options: RegisterOrchestrationRoutesOptions,
): Promise<void> => {
    const resolvePrisma = options.prisma
        ? () => Promise.resolve(options.prisma!)
        : getPrisma;

    // ── POST /v1/orchestration/runs — operator+ ──────────────────────────────
    app.post<{
        Body: {
            coordinatorBotId?: unknown;
            workspaceId?: unknown;
            goal?: unknown;
            subTasks?: unknown;
        };
    }>('/v1/orchestration/runs', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) return reply.code(401).send({ error: 'unauthorized' });
        if ((ROLE_RANK[session.role ?? ''] ?? 0) < (ROLE_RANK['operator'] ?? 99)) {
            return reply.code(403).send({
                error: 'insufficient_role',
                required: 'operator',
                actual: session.role,
            });
        }

        const { coordinatorBotId, workspaceId, goal, subTasks } = request.body ?? {};

        if (typeof coordinatorBotId !== 'string' || !coordinatorBotId.trim()) {
            return reply.code(400).send({ error: 'coordinatorBotId is required' });
        }
        if (typeof workspaceId !== 'string' || !workspaceId.trim()) {
            return reply.code(400).send({ error: 'workspaceId is required' });
        }
        if (typeof goal !== 'string' || !goal.trim()) {
            return reply.code(400).send({ error: 'goal is required' });
        }
        if (!Array.isArray(subTasks) || subTasks.length === 0) {
            return reply.code(400).send({ error: 'subTasks must not be empty' });
        }

        const db = await resolvePrisma();
        let run: any;
        try {
            run = await startOrchestrationRun(db, {
                tenantId: session.tenantId,
                workspaceId,
                coordinatorBotId,
                goal,
                subTasks: subTasks as Array<{ toAgentId: string; taskDescription: string }>,
            });
        } catch (err: any) {
            if (err?.statusCode === 400) {
                return reply.code(400).send({ error: err.message });
            }
            throw err;
        }

        return reply.code(201).send(run);
    });

    // ── GET /v1/orchestration/runs — viewer+ ─────────────────────────────────
    app.get('/v1/orchestration/runs', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) return reply.code(401).send({ error: 'unauthorized' });
        if ((ROLE_RANK[session.role ?? ''] ?? 0) < (ROLE_RANK['viewer'] ?? 99)) {
            return reply.code(403).send({
                error: 'insufficient_role',
                required: 'viewer',
                actual: session.role,
            });
        }

        const db = await resolvePrisma();
        const runs = await (db as any).orchestrationRun.findMany({
            where: { tenantId: session.tenantId },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                tenantId: true,
                workspaceId: true,
                coordinatorBotId: true,
                goal: true,
                status: true,
                subTaskCount: true,
                completedCount: true,
                failedCount: true,
                startedAt: true,
                completedAt: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        return reply.code(200).send({ runs });
    });

    // ── GET /v1/orchestration/runs/:runId — viewer+ ──────────────────────────
    app.get<{ Params: { runId: string } }>(
        '/v1/orchestration/runs/:runId',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) return reply.code(401).send({ error: 'unauthorized' });
            if ((ROLE_RANK[session.role ?? ''] ?? 0) < (ROLE_RANK['viewer'] ?? 99)) {
                return reply.code(403).send({
                    error: 'insufficient_role',
                    required: 'viewer',
                    actual: session.role,
                });
            }

            const db = await resolvePrisma();
            const run = await (db as any).orchestrationRun.findUnique({
                where: { id: request.params.runId },
                include: { dispatches: true },
            });

            if (!run || run.tenantId !== session.tenantId) {
                return reply.code(404).send({ error: 'not_found' });
            }

            return reply.code(200).send(run);
        },
    );

    // ── POST /v1/orchestration/runs/:runId/cancel — operator+ ───────────────
    app.post<{ Params: { runId: string } }>(
        '/v1/orchestration/runs/:runId/cancel',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) return reply.code(401).send({ error: 'unauthorized' });
            if ((ROLE_RANK[session.role ?? ''] ?? 0) < (ROLE_RANK['operator'] ?? 99)) {
                return reply.code(403).send({
                    error: 'insufficient_role',
                    required: 'operator',
                    actual: session.role,
                });
            }

            const db = await resolvePrisma();
            let run: any;
            try {
                run = await cancelOrchestrationRun(db, request.params.runId, session.tenantId);
            } catch (err: any) {
                if (err?.statusCode === 404) return reply.code(404).send({ error: 'not_found' });
                if (err?.statusCode === 409) return reply.code(409).send({ error: err.message });
                throw err;
            }

            return reply.code(200).send(run);
        },
    );

    // ── POST /v1/orchestration/runs/:runId/subtasks/:dispatchId/complete ─────
    app.post<{
        Params: { runId: string; dispatchId: string };
        Body: { success?: unknown; result?: unknown; errorMessage?: unknown };
    }>(
        '/v1/orchestration/runs/:runId/subtasks/:dispatchId/complete',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) return reply.code(401).send({ error: 'unauthorized' });
            if ((ROLE_RANK[session.role ?? ''] ?? 0) < (ROLE_RANK['operator'] ?? 99)) {
                return reply.code(403).send({
                    error: 'insufficient_role',
                    required: 'operator',
                    actual: session.role,
                });
            }

            const { runId, dispatchId } = request.params;
            const db = await resolvePrisma();

            // Verify dispatch belongs to this run and matches tenant
            const dispatch = await (db as any).agentDispatchRecord.findUnique({
                where: { id: dispatchId },
            });
            if (
                !dispatch ||
                dispatch.orchestrationRunId !== runId ||
                dispatch.tenantId !== session.tenantId
            ) {
                return reply.code(404).send({ error: 'not_found' });
            }

            const { success, result, errorMessage } = request.body ?? {};
            if (typeof success !== 'boolean') {
                return reply.code(400).send({ error: 'success is required (boolean)' });
            }

            const updatedRun = await completeSubTask(db, dispatchId, {
                success,
                result,
                errorMessage: typeof errorMessage === 'string' ? errorMessage : undefined,
            });

            return reply.code(200).send({ run: updatedRun });
        },
    );
};
