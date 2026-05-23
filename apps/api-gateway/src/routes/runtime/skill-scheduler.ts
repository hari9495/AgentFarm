import type { FastifyInstance, FastifyRequest } from 'fastify';

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    expiresAt: number;
};

type Options = {
    getSession: (request: FastifyRequest) => SessionContext | null;
};

type CreateJobBody = {
    name: string;
    target: Record<string, unknown>;
    frequency: Record<string, unknown>;
    enabled?: boolean;
};

type JobIdParams = {
    id: string;
};

export function registerSkillSchedulerRoutes(app: FastifyInstance, options: Options): void {
    // List jobs
    app.get('/scheduler/jobs', async (_req, reply) => {
        const { globalScheduler } = await import('@agentfarm/agent-runtime/skill-scheduler.js').catch(
            () => import('../agent-runtime-stubs.js'),
        );
        return reply.send({ jobs: globalScheduler.listJobs() });
    });

    // Create job
    app.post(
        '/scheduler/jobs',
        async (req: FastifyRequest<{ Body: CreateJobBody }>, reply) => {
            const session = options.getSession(req);
            if (!session) return reply.code(401).send({ error: 'unauthorized' });
            const body = (req.body ?? {}) as CreateJobBody;
            if (!body.name || !body.target || !body.frequency) {
                return reply.status(400).send({ error: 'name, target, and frequency required' });
            }
            const { globalScheduler } = await import('@agentfarm/agent-runtime/skill-scheduler.js').catch(
                () => import('../agent-runtime-stubs.js'),
            );
            const job = await globalScheduler.createJob({
                name: body.name,
                target: body.target,
                frequency: body.frequency,
                active: body.enabled ?? true,
            });
            return reply.status(201).send(job);
        },
    );

    // Delete job
    app.delete(
        '/scheduler/jobs/:id',
        async (req: FastifyRequest<{ Params: JobIdParams }>, reply) => {
            const session = options.getSession(req);
            if (!session) return reply.code(401).send({ error: 'unauthorized' });
            const { globalScheduler } = await import('@agentfarm/agent-runtime/skill-scheduler.js').catch(
                () => import('../agent-runtime-stubs.js'),
            );
            const ok = globalScheduler.deleteJob(req.params.id);
            if (!ok) return reply.status(404).send({ error: 'job not found' });
            return reply.send({ deleted: true });
        },
    );

    // Pause job
    app.post(
        '/scheduler/jobs/:id/pause',
        async (req: FastifyRequest<{ Params: JobIdParams }>, reply) => {
            const session = options.getSession(req);
            if (!session) return reply.code(401).send({ error: 'unauthorized' });
            const { globalScheduler } = await import('@agentfarm/agent-runtime/skill-scheduler.js').catch(
                () => import('../agent-runtime-stubs.js'),
            );
            const ok = globalScheduler.pauseJob(req.params.id);
            if (!ok) return reply.status(404).send({ error: 'job not found' });
            return reply.send({ paused: true });
        },
    );

    // Resume job
    app.post(
        '/scheduler/jobs/:id/resume',
        async (req: FastifyRequest<{ Params: JobIdParams }>, reply) => {
            const session = options.getSession(req);
            if (!session) return reply.code(401).send({ error: 'unauthorized' });
            const { globalScheduler } = await import('@agentfarm/agent-runtime/skill-scheduler.js').catch(
                () => import('../agent-runtime-stubs.js'),
            );
            const ok = globalScheduler.resumeJob(req.params.id);
            if (!ok) return reply.status(404).send({ error: 'job not found' });
            return reply.send({ resumed: true });
        },
    );

    // Execution history
    app.get(
        '/scheduler/history',
        async (req: FastifyRequest<{ Querystring: { limit?: string } }>, reply) => {
            const limit = Number(req.query.limit ?? 50);
            const { globalScheduler } = await import('@agentfarm/agent-runtime/skill-scheduler.js').catch(
                () => import('../agent-runtime-stubs.js'),
            );
            return reply.send({ history: globalScheduler.getHistory(limit) });
        },
    );
}
