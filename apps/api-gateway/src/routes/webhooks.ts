import type { FastifyInstance, FastifyRequest } from 'fastify';

type WebhookRegisterBody = {
    provider: string;
    events: string[];
    target_url: string;
    secret?: string;
};

type WebhookIdParams = {
    id: string;
};

type ProviderParams = {
    provider: string;
};

type IngestBody = {
    headers: Record<string, string>;
    raw_body: string;
    source_ip?: string;
    registration_id?: string;
};

export function registerWebhookRoutes(app: FastifyInstance): void {
    // List registrations
    app.get('/webhooks', async (_req, reply) => {
        const { globalWebhookEngine } = await import('@agentfarm/agent-runtime/webhook-ingestion.js').catch(
            () => import('../../agent-runtime-stubs.js'),
        );
        return reply.send({ registrations: globalWebhookEngine.listRegistrations() });
    });

    // Register webhook
    app.post('/webhooks', async (req: FastifyRequest<{ Body: WebhookRegisterBody }>, reply) => {
        const body = req.body ?? {};
        if (!body.provider || !body.events?.length || !body.target_url) {
            return reply.status(400).send({ error: 'provider, events, and target_url required' });
        }
        const { globalWebhookEngine } = await import('@agentfarm/agent-runtime/webhook-ingestion.js').catch(
            () => import('../../agent-runtime-stubs.js'),
        );
        const registration = globalWebhookEngine.registerWebhook({
            provider: body.provider as Parameters<typeof globalWebhookEngine.registerWebhook>[0]['provider'],
            events: body.events,
            target_url: body.target_url,
            secret: body.secret,
        });
        return reply.status(201).send({ registration });
    });

    // Deactivate / delete webhook
    app.patch(
        '/webhooks/:id',
        async (req: FastifyRequest<{ Params: WebhookIdParams; Body: { active?: boolean } }>, reply) => {
            const { globalWebhookEngine } = await import(
                '@agentfarm/agent-runtime/webhook-ingestion.js'
            ).catch(() => import('../../agent-runtime-stubs.js'));
            if (req.body?.active === false) {
                const ok = globalWebhookEngine.deactivateWebhook(req.params.id);
                if (!ok) return reply.status(404).send({ error: 'webhook not found' });
            }
            return reply.send({ ok: true });
        },
    );

    app.delete(
        '/webhooks/:id',
        async (req: FastifyRequest<{ Params: WebhookIdParams }>, reply) => {
            const { globalWebhookEngine } = await import(
                '@agentfarm/agent-runtime/webhook-ingestion.js'
            ).catch(() => import('../../agent-runtime-stubs.js'));
            const ok = globalWebhookEngine.deleteWebhook(req.params.id);
            if (!ok) return reply.status(404).send({ error: 'webhook not found' });
            return reply.send({ deleted: true });
        },
    );

    // Recent events
    app.get(
        '/webhooks/events',
        async (req: FastifyRequest<{ Querystring: { limit?: string; provider?: string } }>, reply) => {
            const limit = Number(req.query.limit ?? 20);
            const { globalWebhookEngine } = await import(
                '@agentfarm/agent-runtime/webhook-ingestion.js'
            ).catch(() => import('../../agent-runtime-stubs.js'));
            const events = req.query.provider
                ? globalWebhookEngine.getEventsByProvider(req.query.provider as never, limit)
                : globalWebhookEngine.getRecentEvents(limit);
            return reply.send({ events });
        },
    );

    // Ingest endpoint
    app.post(
        '/webhooks/ingest/:provider',
        async (req: FastifyRequest<{ Params: ProviderParams; Body: IngestBody }>, reply) => {
            const body = req.body ?? {};
            const { globalWebhookEngine } = await import(
                '@agentfarm/agent-runtime/webhook-ingestion.js'
            ).catch(() => import('../../agent-runtime-stubs.js'));
            const result = await globalWebhookEngine.ingest({
                provider: req.params.provider as never,
                headers: body.headers ?? (req.headers as Record<string, string>),
                rawBody: body.raw_body ?? JSON.stringify(req.body),
                sourceIp: body.source_ip ?? req.ip,
                registrationId: body.registration_id,
            });
            return reply.send(result);
        },
    );
}
