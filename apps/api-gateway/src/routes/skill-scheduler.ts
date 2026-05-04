import type { FastifyInstance, FastifyRequest } from 'fastify';

type CreateJobBody = {
    name: string;
    target: Record<string, unknown>;
    frequency: Record<string, unknown>;
    enabled?: boolean;
};

type JobIdParams = {
    id: string;
};

export function registerSkillSchedulerRoutes(app: FastifyInstance): void {
    // List jobs
    app.get('/scheduler/jobs', async (_req, reply) => {
        const { globalScheduler } = await import('@agentfarm/agent-runtime/skill-scheduler.js').catch(
            () => import('../../agent-runtime-stubs.js'),
        );
        return reply.send({ jobs: globalScheduler.listJobs() });
    });

    // Create job
    app.post(
        '/scheduler/jobs',
        async (req: FastifyRequest<{ Body: CreateJobBody }>, reply) => {
            const body = req.body ?? {};
            if (!body.name || !body.target || !body.frequency) {
                return reply.status(400).send({ error: 'name, target, and frequency required' });
            }
            const { globalScheduler } = await import('@agentfarm/agent-runtime/skill-scheduler.js').catch(
                () => import('../../agent-runtime-stubs.js'),
            );
            const job = globalScheduler.createJob({
                name: body.name,
                target: body.target as Parameters<typeof globalScheduler.createJob>[0]['target'],
                frequency: body.frequency as Parameters<typeof globalScheduler.createJob>[0]['frequency'],
                enabled: body.enabled,
            });
            return reply.status(201).send(job);
        },
    );

    // Delete job
    app.delete(
        '/scheduler/jobs/:id',
        async (req: FastifyRequest<{ Params: JobIdParams }>, reply) => {
            const { globalScheduler } = await import('@agentfarm/agent-runtime/skill-scheduler.js').catch(
                () => import('../../agent-runtime-stubs.js'),
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
            const { globalScheduler } = await import('@agentfarm/agent-runtime/skill-scheduler.js').catch(
                () => import('../../agent-runtime-stubs.js'),
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
            const { globalScheduler } = await import('@agentfarm/agent-runtime/skill-scheduler.js').catch(
                () => import('../../agent-runtime-stubs.js'),
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
                () => import('../../agent-runtime-stubs.js'),
            );
            return reply.send({ history: globalScheduler.getHistory(limit) });
        },
    );
}
