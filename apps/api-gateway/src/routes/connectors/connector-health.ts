import type { FastifyInstance, FastifyRequest } from 'fastify';

type ConnectorIdParams = {
    id: string;
};

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    scope?: 'customer' | 'internal';
    expiresAt: number;
};

export type RegisterConnectorHealthRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
};

export function registerConnectorHealthRoutes(
    app: FastifyInstance,
    options: RegisterConnectorHealthRoutesOptions,
): void {
    const { getSession } = options;

    // Health check single connector
    app.get(
        '/connectors/:id/health',
        async (req: FastifyRequest<{ Params: ConnectorIdParams }>, reply) => {
            if (!getSession(req)) return reply.status(401).send({ error: 'Unauthorized' });
            const { globalHealthMonitor } = await import(
                '@agentfarm/agent-runtime/connector-health-monitor.js'
            ).catch(() => import('../../agent-runtime-stubs.js'));
            const status = await globalHealthMonitor.pingConnector(req.params.id).catch(() => null);
            if (!status) return reply.status(404).send({ error: 'connector not registered' });
            return reply.send(status);
        },
    );

    // All connector statuses (no re-ping)
    app.get('/connectors/health/all', async (req, reply) => {
        if (!getSession(req)) return reply.status(401).send({ error: 'Unauthorized' });
        const { globalHealthMonitor } = await import(
            '@agentfarm/agent-runtime/connector-health-monitor.js'
        ).catch(() => import('../../agent-runtime-stubs.js'));
        return reply.send({ statuses: globalHealthMonitor.getAllStatuses() });
    });

    // Ping all connectors now
    app.post('/connectors/health/ping-all', async (req, reply) => {
        if (!getSession(req)) return reply.status(401).send({ error: 'Unauthorized' });
        const { globalHealthMonitor } = await import(
            '@agentfarm/agent-runtime/connector-health-monitor.js'
        ).catch(() => import('../../agent-runtime-stubs.js'));
        const statuses = await globalHealthMonitor.pingAll();
        return reply.send({ statuses });
    });
}
