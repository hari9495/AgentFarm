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
    const db = await import('../../lib/db.js');
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

    // GET /v1/notifications/in-app — aggregated in-app notification feed
    app.get('/v1/notifications/in-app', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized', message: 'A valid authenticated session is required.' });
        }

        const query = request.query as { workspace_id?: string };
        const workspaceId = query.workspace_id ?? session.workspaceIds[0];

        type InAppItem = {
            id: string;
            type: string;
            title: string;
            body: string;
            severity: 'high' | 'warn' | 'info';
            link: string;
            created_at: string;
        };

        const items: InAppItem[] = [];

        try {
            const prisma = await getPrisma() as unknown as {
                approval: {
                    count: (args: Record<string, unknown>) => Promise<number>;
                    findMany: (args: Record<string, unknown>) => Promise<Array<{ id: string; riskLevel: string; requestedBy: string; createdAt: Date; escalatedAt: Date | null }>>;
                };
                auditEvent: {
                    findMany: (args: Record<string, unknown>) => Promise<Array<{ id: string; eventType: string; summary: string; createdAt: Date }>>;
                };
                taskExecutionRecord: {
                    count: (args: Record<string, unknown>) => Promise<number>;
                };
            };

            const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const workspaceFilter = workspaceId ? { workspaceId } : {};

            // 1. Pending approvals
            const [pendingCount, escalatedApprovals] = await Promise.all([
                prisma.approval.count({
                    where: { tenantId: session.tenantId, ...workspaceFilter, decision: 'pending' },
                }),
                prisma.approval.findMany({
                    where: {
                        tenantId: session.tenantId,
                        ...workspaceFilter,
                        decision: 'pending',
                        escalatedAt: { not: null },
                    },
                    orderBy: { escalatedAt: 'desc' },
                    take: 3,
                }),
            ]);

            if (pendingCount > 0) {
                items.push({
                    id: `pending_approvals_${workspaceId ?? session.tenantId}`,
                    type: 'pending_approval',
                    title: `${pendingCount} approval${pendingCount > 1 ? 's' : ''} waiting`,
                    body: 'Agent actions are queued and need your decision.',
                    severity: 'high',
                    link: `/?tab=approvals${workspaceId ? `&workspaceId=${workspaceId}` : ''}`,
                    created_at: new Date().toISOString(),
                });
            }

            if (escalatedApprovals.length > 0) {
                items.push({
                    id: `escalated_${escalatedApprovals[0]?.id ?? 'none'}`,
                    type: 'escalated_approval',
                    title: `${escalatedApprovals.length} escalated approval${escalatedApprovals.length > 1 ? 's' : ''}`,
                    body: 'These approvals have exceeded their SLA window and need urgent review.',
                    severity: 'high',
                    link: `/?tab=approvals${workspaceId ? `&workspaceId=${workspaceId}` : ''}`,
                    created_at: escalatedApprovals[0]?.createdAt.toISOString() ?? new Date().toISOString(),
                });
            }

            // 2. Budget audit events (last 24h)
            const budgetEvents = await prisma.auditEvent.findMany({
                where: {
                    tenantId: session.tenantId,
                    ...workspaceFilter,
                    eventType: { in: ['budget_alert_warn', 'budget_alert_critical', 'budget_alert_exceeded'] },
                    createdAt: { gte: since24h },
                },
                orderBy: { createdAt: 'desc' },
                take: 3,
            });

            for (const evt of budgetEvents) {
                const isCritical = evt.eventType === 'budget_alert_exceeded' || evt.eventType === 'budget_alert_critical';
                items.push({
                    id: `audit_${evt.id}`,
                    type: 'budget_alert',
                    title: isCritical ? 'Budget limit reached' : 'Budget warning',
                    body: evt.summary,
                    severity: isCritical ? 'high' : 'warn',
                    link: '/budget',
                    created_at: evt.createdAt.toISOString(),
                });
            }

            // 3. Task failures (last 24h)
            const failedCount = await prisma.taskExecutionRecord.count({
                where: {
                    tenantId: session.tenantId,
                    ...(workspaceId ? { workspaceId } : {}),
                    outcome: 'failed',
                    executedAt: { gte: since24h },
                },
            });

            if (failedCount > 0) {
                items.push({
                    id: `task_failures_${workspaceId ?? session.tenantId}_24h`,
                    type: 'task_failure',
                    title: `${failedCount} task${failedCount > 1 ? 's' : ''} failed in the last 24h`,
                    body: 'Check the task history and agent logs for details.',
                    severity: failedCount > 5 ? 'high' : 'warn',
                    link: '/tasks?tab=history',
                    created_at: new Date().toISOString(),
                });
            }
        } catch {
            // return empty rather than error
        }

        // Sort: high severity first, then by created_at desc
        items.sort((a, b) => {
            if (a.severity === b.severity) return b.created_at.localeCompare(a.created_at);
            const rank = { high: 2, warn: 1, info: 0 };
            return (rank[b.severity] ?? 0) - (rank[a.severity] ?? 0);
        });

        return reply.code(200).send({ items, total: items.length });
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
