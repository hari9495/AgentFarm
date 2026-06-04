/**
 * Skill Composition DAG Routes
 *
 * POST   /v1/compositions — Register a composition DAG
 * POST   /v1/compositions/:id/execute — Execute a composition
 * GET    /v1/compositions — List all compositions
 * GET    /v1/compositions/:id/runs/:runId — Get composition run result
 *
 * All routes require an authenticated session.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { SkillCompositionDAG } from '@agentfarm/shared-types';

let globalCompositionEngine: any = null;

const getCompositionEngine = async () => {
    if (!globalCompositionEngine) {
        const mod = await import('@agentfarm/agent-runtime/skill-composition-engine.js').catch(
            () => import('../../agent-runtime-stubs.js'),
        );
        globalCompositionEngine = mod.globalCompositionEngine;
    }
    return globalCompositionEngine;
};

type RegisterCompositionBody = SkillCompositionDAG;
type ExecuteCompositionBody = { initial_inputs?: Record<string, unknown> };
type CompositionParams = { id: string };
type CompositionRunParams = { id: string; runId: string };

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    scope?: 'customer' | 'internal';
    expiresAt: number;
};

export type RegisterSkillCompositionRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
};

export function registerSkillCompositionRoutes(
    app: FastifyInstance,
    options: RegisterSkillCompositionRoutesOptions,
): void {
    const { getSession } = options;

    // Register a composition DAG
    app.post(
        '/v1/compositions',
        async (req: FastifyRequest<{ Body: RegisterCompositionBody }>, reply) => {
            if (!getSession(req)) return reply.status(401).send({ error: 'Unauthorized' });

            const engine = await getCompositionEngine();
            const dag = (req.body ?? {}) as SkillCompositionDAG;

            if (!dag.composition_id || !dag.nodes || dag.nodes.length === 0) {
                return reply.status(400).send({ error: 'composition_id and nodes required' });
            }

            try {
                engine.registerComposition(dag);
                return reply.status(201).send({ composition_id: dag.composition_id, version: dag.version });
            } catch (error) {
                return reply.status(500).send({ error: (error as Error).message });
            }
        },
    );

    // Execute a composition
    app.post(
        '/v1/compositions/:id/execute',
        async (req: FastifyRequest<{ Params: CompositionParams; Body: ExecuteCompositionBody }>, reply) => {
            if (!getSession(req)) return reply.status(401).send({ error: 'Unauthorized' });

            const engine = await getCompositionEngine();
            const { id } = req.params as CompositionParams;
            const body = (req.body ?? {}) as ExecuteCompositionBody;

            try {
                const result = await engine.execute(id, body.initial_inputs || {});
                return reply.send(result);
            } catch (error) {
                return reply.status(500).send({ error: (error as Error).message });
            }
        },
    );

    // List all compositions
    app.get('/v1/compositions', async (req, reply) => {
        if (!getSession(req)) return reply.status(401).send({ error: 'Unauthorized' });

        const engine = await getCompositionEngine();
        const compositions = engine.listCompositions();
        return reply.send({ compositions, total: compositions.length });
    });

    // Get composition run result
    app.get(
        '/v1/compositions/:id/runs/:runId',
        async (req: FastifyRequest<{ Params: CompositionRunParams }>, reply) => {
            if (!getSession(req)) return reply.status(401).send({ error: 'Unauthorized' });

            const engine = await getCompositionEngine();
            const { runId } = req.params as CompositionRunParams;

            const run = engine.getRunById(runId);
            if (!run) {
                return reply.status(404).send({ error: 'Run not found' });
            }

            return reply.send(run);
        },
    );
}
