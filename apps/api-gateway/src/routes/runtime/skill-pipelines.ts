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

type PipelineRunBody = {
    pipeline_id: string;
    initial_inputs?: Record<string, unknown>;
    dry_run?: boolean;
};

type RunIdParams = {
    runId: string;
};

export function registerSkillPipelineRoutes(app: FastifyInstance, options: Options): void {
    // List built-in pipelines
    app.get('/pipelines', async (_req, reply) => {
        const { globalPipelineEngine } = await import('@agentfarm/agent-runtime/skill-pipeline.js').catch(
            () => import('../agent-runtime-stubs.js'),
        );
        return reply.send({ pipelines: globalPipelineEngine.listPipelines() });
    });

    // Run a pipeline
    app.post(
        '/pipelines/run',
        async (req: FastifyRequest<{ Body: PipelineRunBody }>, reply) => {
            const session = options.getSession(req);
            if (!session) return reply.code(401).send({ error: 'unauthorized' });
            const { pipeline_id, initial_inputs, dry_run } = req.body ?? {};
            if (!pipeline_id) {
                return reply.status(400).send({ error: 'pipeline_id required' });
            }
            const { globalPipelineEngine } = await import(
                '@agentfarm/agent-runtime/skill-pipeline.js'
            ).catch(() => import('../agent-runtime-stubs.js'));
            const result = await globalPipelineEngine.run({ pipeline_id, initial_inputs, dry_run });
            return reply.send(result);
        },
    );

    // List recent runs
    app.get('/pipelines/runs', async (req: FastifyRequest<{ Querystring: { limit?: string } }>, reply) => {
        const limit = Number(req.query.limit ?? 20);
        const { globalPipelineEngine } = await import('@agentfarm/agent-runtime/skill-pipeline.js').catch(
            () => import('../agent-runtime-stubs.js'),
        );
        return reply.send({ runs: globalPipelineEngine.getRecentRuns(limit) });
    });

    // Get single run
    app.get(
        '/pipelines/runs/:runId',
        async (req: FastifyRequest<{ Params: RunIdParams }>, reply) => {
            const { globalPipelineEngine } = await import(
                '@agentfarm/agent-runtime/skill-pipeline.js'
            ).catch(() => import('../agent-runtime-stubs.js'));
            const run = globalPipelineEngine.getRunById(req.params.runId);
            if (!run) return reply.status(404).send({ error: 'run not found' });
            return reply.send(run);
        },
    );
}
