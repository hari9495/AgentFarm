/**
 * Autonomous Skill Loop Routes
 *
 * POST /v1/autonomous-loops/execute — Run an autonomous loop
 * GET  /v1/autonomous-loops/:loopId — Get loop status/result
 * GET  /v1/autonomous-loops — List recent loops
 * DELETE /v1/autonomous-loops/:loopId — Cancel a loop
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { LoopConfig } from '@agentfarm/shared-types';

// Import from agent-runtime with stub fallback
let globalLoopOrchestrator: any = null;

const getLoopOrchestrator = async () => {
    if (!globalLoopOrchestrator) {
        const mod = await import('@agentfarm/agent-runtime/autonomous-loop-orchestrator.js').catch(
            () => import('../agent-runtime-stubs.js'),
        );
        globalLoopOrchestrator = mod.globalLoopOrchestrator;
    }
    return globalLoopOrchestrator;
};

type ExecuteLoopBody = LoopConfig;

type LoopIdParams = {
    loopId: string;
};

export function registerAutonomousLoopRoutes(app: FastifyInstance): void {
    // Execute an autonomous loop
    app.post(
        '/v1/autonomous-loops/execute',
        async (req: FastifyRequest<{ Body: ExecuteLoopBody }>, reply) => {
            const orchestrator = await getLoopOrchestrator();
            const config = (req.body ?? {}) as LoopConfig;

            if (!config.initial_skill || !config.success_criteria) {
                return reply.status(400).send({ error: 'initial_skill and success_criteria required' });
            }

            try {
                const result = await orchestrator.execute(config);
                return reply.status(result.state === 'success' ? 200 : 202).send(result);
            } catch (error) {
                return reply.status(500).send({ error: (error as Error).message });
            }
        },
    );

    // Get a specific loop run
    app.get(
        '/v1/autonomous-loops/:loopId',
        async (req: FastifyRequest<{ Params: LoopIdParams }>, reply) => {
            const orchestrator = await getLoopOrchestrator();
            const { loopId } = req.params as LoopIdParams;

            const run = orchestrator.getRunById(loopId);
            if (!run) {
                return reply.status(404).send({ error: 'Loop not found' });
            }

            return reply.send(run);
        },
    );

    // List recent loop runs
    app.get('/v1/autonomous-loops', async (_req, reply) => {
        const orchestrator = await getLoopOrchestrator();

        const runs = orchestrator.getRecentRuns(20);
        return reply.send({ loops: runs, total: runs.length });
    });

    // Cancel a loop
    app.delete(
        '/v1/autonomous-loops/:loopId',
        async (req: FastifyRequest<{ Params: LoopIdParams }>, reply) => {
            const orchestrator = await getLoopOrchestrator();
            const { loopId } = req.params as LoopIdParams;

            const success = orchestrator.cancelLoop(loopId);
            if (!success) {
                return reply.status(404).send({ error: 'Loop not found or already completed' });
            }

            return reply.status(204).send();
        },
    );
}
