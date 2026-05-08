import Fastify from 'fastify';
import { loadConfig } from './config-loader.js';
import { TriggerEngine } from './trigger-engine.js';
import { WebhookTriggerSource } from './sources/webhook-trigger.js';

const PORT = parseInt(process.env['TRIGGER_SERVICE_PORT'] ?? '3002', 10);

async function main(): Promise<void> {
    const config = loadConfig();
    const fastify = Fastify({ logger: true });

    // -----------------------------------------------------------------------
    // Sources
    // -----------------------------------------------------------------------

    const webhookSource = new WebhookTriggerSource({
        hmacSecret: process.env['WEBHOOK_HMAC_SECRET'],
    });

    const sources = [webhookSource];

    // -----------------------------------------------------------------------
    // Engine
    // -----------------------------------------------------------------------

    const engine = new TriggerEngine(config, sources);
    await engine.start();

    // -----------------------------------------------------------------------
    // Routes
    // -----------------------------------------------------------------------

    fastify.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

    fastify.get('/status', async () => ({
        status: 'ok',
        port: PORT,
        tenants: config.tenants.map((t) => ({ tenantId: t.tenantId, agents: t.agents.length })),
        agentRuntimeUrl: config.agentRuntimeUrl,
        sources: sources.map((s) => s.kind),
        timestamp: new Date().toISOString(),
    }));

    fastify.post<{ Body: string }>(
        '/webhook',
        { config: { rawBody: true } },
        async (request, reply) => {
            const signature = request.headers['x-hub-signature-256'] as string | undefined
                ?? request.headers['x-signature'] as string | undefined;

            const rawBody =
                typeof request.body === 'string'
                    ? request.body
                    : JSON.stringify(request.body ?? {});

            const accepted = await webhookSource.handleRequest(rawBody, signature);

            if (!accepted) {
                return reply.status(401).send({ error: 'invalid signature' });
            }

            return reply.status(202).send({ accepted: true });
        },
    );

    // -----------------------------------------------------------------------
    // Shutdown
    // -----------------------------------------------------------------------

    const shutdown = async (signal: string): Promise<void> => {
        console.log(`Received ${signal}, shutting down…`);
        await engine.stop();
        await fastify.close();
        process.exit(0);
    };

    process.on('SIGTERM', () => void shutdown('SIGTERM'));
    process.on('SIGINT', () => void shutdown('SIGINT'));

    // -----------------------------------------------------------------------
    // Listen
    // -----------------------------------------------------------------------

    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`trigger-service listening on port ${PORT}`);
}

main().catch((err) => {
    console.error('trigger-service fatal:', err);
    process.exit(1);
});
