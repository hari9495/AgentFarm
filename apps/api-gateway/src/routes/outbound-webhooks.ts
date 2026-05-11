import { randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { ROLE_RANK } from '../lib/require-role.js';
import { replayDelivery, dispatchOutboundWebhooks } from '../lib/webhook-dispatcher.js';
import {
    isValidEventType,
    getAllEventTypes,
    getEventDefinition,
    CATALOG,
} from '../lib/event-catalog.js';

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    role?: string;
    expiresAt: number;
};

export type RegisterOutboundWebhookRoutesOptions = {
    getSession: (req: FastifyRequest) => SessionContext | null;
    prisma?: PrismaClient;
};

const getPrisma = async () => {
    const db = await import('../lib/db.js');
    return db.prisma;
};

export const registerOutboundWebhookRoutes = async (
    app: FastifyInstance,
    options: RegisterOutboundWebhookRoutesOptions,
): Promise<void> => {
    const resolvePrisma = options.prisma
        ? () => Promise.resolve(options.prisma!)
        : getPrisma;

    // POST /v1/webhooks/outbound — create webhook
    app.post<{
        Body: { url?: unknown; events?: unknown; workspaceId?: unknown };
    }>('/v1/webhooks/outbound', async (req, reply) => {
        const session = options.getSession(req);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized' });
        }
        if ((ROLE_RANK[session.role ?? ''] ?? 0) < (ROLE_RANK['admin'] ?? 99)) {
            return reply.code(403).send({ error: 'insufficient_role', required: 'admin', actual: session.role });
        }

        const { url, events, workspaceId } = req.body ?? {};

        if (typeof url !== 'string' || !url.startsWith('https://')) {
            return reply.code(400).send({ error: 'url must be an https URL' });
        }

        if (!Array.isArray(events) || events.length === 0) {
            return reply.code(400).send({ error: 'events must be a non-empty array' });
        }

        const invalidEvents = (events as string[]).filter((e: string) => !isValidEventType(e));
        if (invalidEvents.length > 0) {
            return reply.code(400).send({
                error: 'invalid_event_types',
                invalid: invalidEvents,
                validTypes: getAllEventTypes(),
            });
        }

        const secret = randomBytes(32).toString('hex');
        const db = await resolvePrisma();
        const webhook = await db.outboundWebhook.create({
            data: {
                tenantId: session.tenantId,
                workspaceId: typeof workspaceId === 'string' ? workspaceId : null,
                url,
                secret,
                events: events as string[],
            },
        });

        return reply.code(201).send({
            id: webhook.id,
            url: webhook.url,
            events: webhook.events,
            secret: webhook.secret,
            createdAt: webhook.createdAt,
        });
    });

    // GET /v1/webhooks/outbound — list webhooks (omit secret)
    app.get('/v1/webhooks/outbound', async (req, reply) => {
        const session = options.getSession(req);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized' });
        }

        const db = await resolvePrisma();
        const webhooks = await db.outboundWebhook.findMany({
            where: { tenantId: session.tenantId },
            select: {
                id: true,
                tenantId: true,
                workspaceId: true,
                url: true,
                events: true,
                enabled: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        return reply.code(200).send({ webhooks });
    });

    // DELETE /v1/webhooks/outbound/:webhookId — hard delete
    app.delete<{ Params: { webhookId: string } }>(
        '/v1/webhooks/outbound/:webhookId',
        async (req, reply) => {
            const session = options.getSession(req);
            if (!session) {
                return reply.code(401).send({ error: 'unauthorized' });
            }
            if ((ROLE_RANK[session.role ?? ''] ?? 0) < (ROLE_RANK['admin'] ?? 99)) {
                return reply.code(403).send({ error: 'insufficient_role', required: 'admin', actual: session.role });
            }

            const db = await resolvePrisma();
            const webhook = await db.outboundWebhook.findUnique({
                where: { id: req.params.webhookId },
                select: { tenantId: true },
            });

            if (!webhook) {
                return reply.code(404).send({ error: 'not_found' });
            }

            if (webhook.tenantId !== session.tenantId) {
                return reply.code(403).send({ error: 'forbidden' });
            }

            await db.outboundWebhook.delete({ where: { id: req.params.webhookId } });
            return reply.code(204).send();
        },
    );

    // GET /v1/webhooks/outbound/:webhookId/deliveries — last 50 delivery logs
    app.get<{ Params: { webhookId: string } }>(
        '/v1/webhooks/outbound/:webhookId/deliveries',
        async (req, reply) => {
            const session = options.getSession(req);
            if (!session) {
                return reply.code(401).send({ error: 'unauthorized' });
            }

            const db = await resolvePrisma();
            const webhook = await db.outboundWebhook.findUnique({
                where: { id: req.params.webhookId },
                select: { tenantId: true },
            });

            if (!webhook) {
                return reply.code(404).send({ error: 'not_found' });
            }

            if (webhook.tenantId !== session.tenantId) {
                return reply.code(403).send({ error: 'forbidden' });
            }

            const deliveries = await db.outboundWebhookDelivery.findMany({
                where: { webhookId: req.params.webhookId },
                orderBy: { firedAt: 'desc' },
                take: 50,
            });

            return reply.code(200).send({ deliveries });
        },
    );

    // POST /v1/webhooks/deliveries/:deliveryId/replay — re-fire a past delivery
    app.post<{ Params: { deliveryId: string } }>(
        '/v1/webhooks/deliveries/:deliveryId/replay',
        async (req, reply) => {
            const session = options.getSession(req);
            if (!session) {
                return reply.code(401).send({ error: 'unauthorized' });
            }

            const db = await resolvePrisma();
            const delivery = await db.outboundWebhookDelivery.findUnique({
                where: { id: req.params.deliveryId },
                select: { tenantId: true },
            });

            if (!delivery) {
                return reply.code(404).send({ error: 'not_found' });
            }

            if (delivery.tenantId !== session.tenantId) {
                return reply.code(403).send({ error: 'forbidden' });
            }

            const result = await replayDelivery(req.params.deliveryId, session.tenantId, db);
            return reply.code(200).send({ replayed: true, success: result.success, status: result.status });
        },
    );

    // GET /v1/webhooks/dlq — list DLQ entries for tenant
    app.get<{ Querystring: { resolved?: string } }>('/v1/webhooks/dlq', async (req, reply) => {
        const session = options.getSession(req);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized' });
        }

        const resolvedParam = req.query.resolved;
        const showResolved = resolvedParam === 'true';

        const db = await resolvePrisma();
        const dlq = await db.webhookDlqEntry.findMany({
            where: {
                tenantId: session.tenantId,
                resolvedAt: showResolved ? { not: null } : null,
            },
            orderBy: { createdAt: 'desc' },
        });

        return reply.code(200).send({ dlq });
    });

    // POST /v1/webhooks/dlq/:dlqId/retry — re-enable webhook and replay last delivery
    app.post<{ Params: { dlqId: string } }>('/v1/webhooks/dlq/:dlqId/retry', async (req, reply) => {
        const session = options.getSession(req);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized' });
        }
        if ((ROLE_RANK[session.role ?? ''] ?? 0) < (ROLE_RANK['admin'] ?? 99)) {
            return reply.code(403).send({ error: 'insufficient_role', required: 'admin', actual: session.role });
        }

        const db = await resolvePrisma();
        const dlqEntry = await db.webhookDlqEntry.findUnique({
            where: { id: req.params.dlqId },
        });

        if (!dlqEntry) {
            return reply.code(404).send({ error: 'not_found' });
        }

        if (dlqEntry.tenantId !== session.tenantId) {
            return reply.code(403).send({ error: 'forbidden' });
        }

        // Re-enable the webhook and reset failure tracking
        await db.outboundWebhook.update({
            where: { id: dlqEntry.webhookId },
            data: { enabled: true, failureCount: 0, dlqAt: null },
        });

        // Find most recent delivery to replay
        const lastDelivery = await db.outboundWebhookDelivery.findFirst({
            where: { webhookId: dlqEntry.webhookId },
            orderBy: { firedAt: 'desc' },
            select: { id: true },
        });

        if (lastDelivery) {
            await replayDelivery(lastDelivery.id, session.tenantId, db);
        }

        // Mark DLQ entry as resolved
        await db.webhookDlqEntry.update({
            where: { id: req.params.dlqId },
            data: { resolvedAt: new Date(), resolvedBy: session.userId },
        });

        return reply.code(200).send({ retried: true, webhookId: dlqEntry.webhookId });
    });

    // -----------------------------------------------------------------------
    // GET /v1/webhooks/events — public catalog of all event definitions
    // No auth required — consumers need to read the catalog without credentials.
    // -----------------------------------------------------------------------
    app.get('/v1/webhooks/events', async (_req, reply) => {
        const events = Object.values(CATALOG);
        return reply.code(200).send({ events, count: events.length });
    });

    // -----------------------------------------------------------------------
    // GET /v1/webhooks/events/:eventType — single event definition (public)
    // -----------------------------------------------------------------------
    app.get<{ Params: { eventType: string } }>(
        '/v1/webhooks/events/:eventType',
        async (req, reply) => {
            const definition = getEventDefinition(req.params.eventType);
            if (!definition) {
                return reply.code(404).send({ error: 'event_type_not_found' });
            }
            return reply.code(200).send({ event: definition });
        },
    );

    // -----------------------------------------------------------------------
    // POST /v1/webhooks/test/:webhookId — send a test webhook delivery (operator+)
    // -----------------------------------------------------------------------
    app.post<{ Params: { webhookId: string } }>(
        '/v1/webhooks/test/:webhookId',
        async (req, reply) => {
            const session = options.getSession(req);
            if (!session) {
                return reply.code(401).send({ error: 'unauthorized' });
            }
            if ((ROLE_RANK[session.role ?? ''] ?? 0) < (ROLE_RANK['operator'] ?? 99)) {
                return reply.code(403).send({ error: 'insufficient_role', required: 'operator', actual: session.role });
            }

            const db = await resolvePrisma();
            const webhook = await db.outboundWebhook.findUnique({
                where: { id: req.params.webhookId },
                select: { tenantId: true, workspaceId: true },
            });

            if (!webhook) {
                return reply.code(404).send({ error: 'not_found' });
            }

            if (webhook.tenantId !== session.tenantId) {
                return reply.code(403).send({ error: 'forbidden' });
            }

            await dispatchOutboundWebhooks(
                {
                    tenantId: session.tenantId,
                    workspaceId: webhook.workspaceId ?? '',
                    eventType: 'webhook_test',
                    payload: { message: 'This is a test webhook from AgentFarm' },
                    timestamp: new Date().toISOString(),
                },
                db,
            );

            return reply.code(200).send({ dispatched: true });
        },
    );
};
