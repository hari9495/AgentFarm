/**
 * Adapter Registry Routes
 *
 * POST   /v1/adapters — Register an adapter
 * GET    /v1/adapters — List all adapters
 * GET    /v1/adapters/:id — Get adapter details
 * POST   /v1/adapters/:id/health-check — Check adapter health
 * DELETE /v1/adapters/:id — Deregister adapter
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AdapterManifest } from '@agentfarm/shared-types';

type RegisterAdapterBody = AdapterManifest;
type AdapterParams = { id: string };

export function registerAdapterRegistryRoutes(app: FastifyInstance): void {
    // Register an adapter
    app.post(
        '/v1/adapters',
        async (req: FastifyRequest<{ Body: RegisterAdapterBody }>, reply) => {
            const manifest = (req.body ?? {}) as AdapterManifest;

            if (!manifest.adapter_id || !manifest.name || !manifest.type) {
                return reply.status(400).send({ error: 'adapter_id, name, and type required' });
            }

            // Simulate registration
            return reply.status(201).send({
                adapter_id: manifest.adapter_id,
                status: 'registered',
                registered_at: Date.now(),
            });
        },
    );

    // List all adapters
    app.get('/v1/adapters', async (_req, reply) => {
        // Simulate returning registered adapters
        const adapters = [
            {
                adapter_id: 'github-connector',
                name: 'GitHub Connector',
                type: 'connector',
                status: 'healthy',
                health_score: 95,
            },
            {
                adapter_id: 'jira-connector',
                name: 'Jira Connector',
                type: 'connector',
                status: 'healthy',
                health_score: 90,
            },
        ];

        return reply.send({ adapters, total: adapters.length });
    });

    // Get adapter details
    app.get(
        '/v1/adapters/:id',
        async (req: FastifyRequest<{ Params: AdapterParams }>, reply) => {
            const { id } = req.params as AdapterParams;

            // Simulate finding adapter
            const adapter = {
                adapter_id: id,
                name: id.replace('-', ' '),
                type: 'connector',
                status: 'healthy',
                health_score: 90,
                capabilities: {
                    read_tasks: { name: 'Read Tasks', parameters: {} },
                    create_comment: { name: 'Create Comment', parameters: {} },
                },
            };

            return reply.send(adapter);
        },
    );

    // Health check
    app.post(
        '/v1/adapters/:id/health-check',
        async (req: FastifyRequest<{ Params: AdapterParams }>, reply) => {
            const { id } = req.params as AdapterParams;

            const result = {
                adapter_id: id,
                status: 'healthy',
                latency_ms: 42,
                checked_at: Date.now(),
            };

            return reply.send(result);
        },
    );

    // Deregister
    app.delete(
        '/v1/adapters/:id',
        async (req: FastifyRequest<{ Params: AdapterParams }>, reply) => {
            const { id } = req.params as AdapterParams;

            return reply.status(204).send();
        },
    );
}
