import { randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { ROLE_RANK } from '../lib/require-role.js';

const KNOWN_EVENT_TYPES = ['task_completed', 'task_failed', 'task_started', 'task_queued'] as const;

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

        const invalid = events.filter((e) => !KNOWN_EVENT_TYPES.includes(e as any));
        if (invalid.length > 0) {
            return reply.code(400).send({ error: `unknown event types: ${(invalid as string[]).join(', ')}` });
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
};
