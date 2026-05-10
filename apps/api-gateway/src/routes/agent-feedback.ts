import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';

const getPrisma = async () => {
    const db = await import('../lib/db.js');
    return db.prisma;
};

type SubmitFeedbackBody = {
    task_id: string;
    skill_id: string;
    rating: number;
    comment?: string;
    workspace_id?: string;
};

type TaskIdParams = {
    taskId: string;
};

type SkillIdParams = {
    skillId: string;
};

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    expiresAt: number;
};

type QualitySignalBody = {
    tenantId?: string;
    workspaceId?: string;
    taskId?: string;
    signalType?: string;
    source?: string;
    score?: number;
    metadata?: Record<string, unknown>;
};

type QualitySignalsQuery = {
    workspaceId?: string;
    taskId?: string;
    limit?: string;
};

export type RegisterAgentFeedbackRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
    prisma?: PrismaClient;
};

export function registerAgentFeedbackRoutes(app: FastifyInstance, options: RegisterAgentFeedbackRoutesOptions): void {
    const getSession = options.getSession;
    const resolvePrisma = options.prisma
        ? () => Promise.resolve(options.prisma!)
        : getPrisma;

    // Submit feedback
    app.post('/feedback', async (req: FastifyRequest<{ Body: SubmitFeedbackBody }>, reply) => {
        const session = getSession(req);
        if (!session) return reply.status(401).send({ error: 'unauthorized' });
        const body = req.body ?? {};
        if (!body.task_id || !body.skill_id || body.rating == null) {
            return reply.status(400).send({ error: 'task_id, skill_id, and rating required' });
        }
        const { globalFeedback } = await import('@agentfarm/agent-runtime/agent-feedback.js').catch(
            () => import('../agent-runtime-stubs.js'),
        );
        const record = globalFeedback.submitFeedback(body);
        return reply.status(201).send(record);
    });

    // Get feedback by task
    app.get(
        '/feedback/:taskId',
        async (req: FastifyRequest<{ Params: TaskIdParams }>, reply) => {
            const session = getSession(req);
            if (!session) return reply.status(401).send({ error: 'unauthorized' });
            const { globalFeedback } = await import('@agentfarm/agent-runtime/agent-feedback.js').catch(
                () => import('../agent-runtime-stubs.js'),
            );
            return reply.send({ feedback: globalFeedback.getFeedback(req.params.taskId) });
        },
    );

    // Get skill rating summary
    app.get(
        '/feedback/skills/:skillId',
        async (req: FastifyRequest<{ Params: SkillIdParams }>, reply) => {
            const session = getSession(req);
            if (!session) return reply.status(401).send({ error: 'unauthorized' });
            const { globalFeedback } = await import('@agentfarm/agent-runtime/agent-feedback.js').catch(
                () => import('../agent-runtime-stubs.js'),
            );
            return reply.send(globalFeedback.getSkillRating(req.params.skillId));
        },
    );

    // All skill ratings
    app.get('/feedback/skills', async (req, reply) => {
        const session = getSession(req);
        if (!session) return reply.status(401).send({ error: 'unauthorized' });
        const { globalFeedback } = await import('@agentfarm/agent-runtime/agent-feedback.js').catch(
            () => import('../agent-runtime-stubs.js'),
        );
        return reply.send({ skills: globalFeedback.getAllSkillRatings() });
    });

    // Recent feedback list
    app.get(
        '/feedback',
        async (req: FastifyRequest<{ Querystring: { limit?: string } }>, reply) => {
            const session = getSession(req);
            if (!session) return reply.status(401).send({ error: 'unauthorized' });
            const { globalFeedback } = await import('@agentfarm/agent-runtime/agent-feedback.js').catch(
                () => import('../agent-runtime-stubs.js'),
            );
            return reply.send({ feedback: globalFeedback.listAll(Number(req.query.limit ?? 100)) });
        },
    );

    // POST /v1/feedback/quality-signal — internal ingest, no session auth required
    app.post<{ Body: QualitySignalBody }>(
        '/v1/feedback/quality-signal',
        async (req, reply) => {
            const { tenantId, workspaceId, signalType } = req.body ?? {};
            if (!tenantId || !workspaceId || !signalType) {
                return reply.status(400).send({ error: 'tenantId, workspaceId, and signalType are required' });
            }
            try {
                const prisma = await resolvePrisma();
                const record = await (prisma as any).qualitySignalLog.create({
                    data: {
                        tenantId,
                        workspaceId,
                        taskId: req.body.taskId ?? null,
                        signalType,
                        source: req.body.source ?? null,
                        score: typeof req.body.score === 'number' ? req.body.score : null,
                        metadata: req.body.metadata ?? null,
                    },
                });
                return reply.status(201).send({ id: record.id });
            } catch (err) {
                req.log?.error(err, '[quality-signal] persist failed');
                return reply.status(500).send({ error: 'internal_error' });
            }
        },
    );

    // GET /v1/feedback/quality-signals — session auth required
    app.get<{ Querystring: QualitySignalsQuery }>(
        '/v1/feedback/quality-signals',
        async (req, reply) => {
            const session = getSession(req);
            if (!session) return reply.status(401).send({ error: 'unauthorized' });
            const prisma = await resolvePrisma();
            const limit = Math.min(Number(req.query.limit ?? 50), 200);
            const where: Record<string, unknown> = {};
            if (req.query.workspaceId) where['workspaceId'] = req.query.workspaceId;
            if (req.query.taskId) where['taskId'] = req.query.taskId;
            const signals = await (prisma as any).qualitySignalLog.findMany({
                where,
                orderBy: { recordedAt: 'desc' },
                take: limit,
            });
            return reply.send({ signals });
        },
    );
}
