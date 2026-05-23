import type { FastifyInstance, FastifyRequest } from 'fastify';

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    expiresAt: number;
};

type NotificationLogRow = {
    id: string;
    tenantId: string;
    workspaceId: string | null;
    channel: string;
    eventTrigger: string;
    status: string;
    error: string | null;
    sentAt: Date;
};

type GroupByRow = {
    channel: string;
    status: string;
    _count: { id: number };
};

type NotificationPrismaClient = {
    notificationLog: {
        create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }>;
        findMany: (args: Record<string, unknown>) => Promise<NotificationLogRow[]>;
        groupBy: (args: Record<string, unknown>) => Promise<GroupByRow[]>;
    };
};

export type RegisterNotificationRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
    getPrisma?: () => Promise<NotificationPrismaClient>;
};

const defaultGetPrisma = async (): Promise<NotificationPrismaClient> => {
    const db = await import('../lib/db.js');
    return db.prisma as unknown as NotificationPrismaClient;
};

export const registerNotificationRoutes = (
    app: FastifyInstance,
    options: RegisterNotificationRoutesOptions,
): void => {
    const getPrisma = options.getPrisma ?? defaultGetPrisma;

    // POST /v1/notifications/log — internal ingest, no session auth required
    app.post('/v1/notifications/log', async (request, reply) => {
        const body = request.body as Record<string, unknown> | null | undefined;
        const tenantId = body?.['tenantId'];
        const workspaceId = body?.['workspaceId'] ?? null;
        const channel = body?.['channel'];
        const eventTrigger = body?.['eventTrigger'];
        const status = body?.['status'];
        const error = body?.['error'] ?? null;

        if (!tenantId || !channel || !eventTrigger || !status) {
            return reply.code(400).send({
                error: 'bad_request',
                message: 'tenantId, channel, eventTrigger, and status are required.',
            });
        }

        try {
            const prisma = await getPrisma();
            const record = await prisma.notificationLog.create({
                data: {
                    tenantId: String(tenantId),
                    workspaceId: workspaceId ? String(workspaceId) : null,
                    channel: String(channel),
                    eventTrigger: String(eventTrigger),
                    status: String(status),
                    error: error ? String(error) : null,
                },
            });
            return reply.code(201).send({ id: record.id });
        } catch (err) {
            console.error('[notifications] log write error:', err);
            return reply.code(500).send({ error: 'internal_error' });
        }
    });

    // GET /v1/notifications/summary — grouped counts by channel + status
    app.get('/v1/notifications/summary', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized', message: 'A valid authenticated session is required.' });
        }

        const query = request.query as { tenantId?: string };
        const tenantId = query.tenantId ?? session.tenantId;

        try {
            const prisma = await getPrisma();
            const groups = await prisma.notificationLog.groupBy({
                by: ['channel', 'status'],
                where: { tenantId },
                _count: { id: true },
            });
            const summary = groups.map((g) => ({ channel: g.channel, status: g.status, count: g._count.id }));
            return reply.code(200).send({ summary });
        } catch {
            return reply.code(200).send({ summary: [] });
        }
    });

    // GET /v1/notifications — list recent notifications for tenant
    app.get('/v1/notifications', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized', message: 'A valid authenticated session is required.' });
        }

        const query = request.query as { tenantId?: string; limit?: string };
        const tenantId = query.tenantId ?? session.tenantId;
        const take = Math.min(parseInt(query.limit ?? '50', 10), 200);

        try {
            const prisma = await getPrisma();
            const notifications = await prisma.notificationLog.findMany({
                where: { tenantId },
                orderBy: { sentAt: 'desc' },
                take,
            });
            return reply.code(200).send({ notifications });
        } catch {
            return reply.code(200).send({ notifications: [] });
        }
    });
};
