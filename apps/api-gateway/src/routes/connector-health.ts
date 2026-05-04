import type { FastifyInstance, FastifyRequest } from 'fastify';

type ConnectorIdParams = {
    id: string;
};

export function registerConnectorHealthRoutes(app: FastifyInstance): void {
    // Health check single connector
    app.get(
        '/connectors/:id/health',
        async (req: FastifyRequest<{ Params: ConnectorIdParams }>, reply) => {
            const { globalHealthMonitor } = await import(
                '@agentfarm/agent-runtime/connector-health-monitor.js'
            ).catch(() => import('../../agent-runtime-stubs.js'));
            const status = await globalHealthMonitor.pingConnector(req.params.id).catch(() => null);
            if (!status) return reply.status(404).send({ error: 'connector not registered' });
            return reply.send(status);
        },
    );

    // All connector statuses (no re-ping)
    app.get('/connectors/health/all', async (_req, reply) => {
        const { globalHealthMonitor } = await import(
            '@agentfarm/agent-runtime/connector-health-monitor.js'
        ).catch(() => import('../../agent-runtime-stubs.js'));
        return reply.send({ statuses: globalHealthMonitor.getAllStatuses() });
    });

    // Ping all connectors now
    app.post('/connectors/health/ping-all', async (_req, reply) => {
        const { globalHealthMonitor } = await import(
            '@agentfarm/agent-runtime/connector-health-monitor.js'
        ).catch(() => import('../../agent-runtime-stubs.js'));
        const statuses = await globalHealthMonitor.pingAll();
        return reply.send({ statuses });
    });
}
