import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { requirePortalSession, type PortalSessionData } from '../lib/portal-session.js';

// ── Repo record types ──────────────────────────────────────────────────────

type BotRecord = {
    id: string;
    role: string;
    status: string;
    workspaceId: string;
    createdAt: Date;
    updatedAt: Date;
    workspace: { name: string };
};

type TaskRecord = {
    id: string;
    outcome: string;
    latencyMs: number;
    estimatedCostUsd: number | null;
    createdAt: Date;
    modelProfile: string;
};

type TaskRawRecord = {
    botId: string;
    outcome: string;
    estimatedCostUsd: number | null;
};

type SubscriptionRecord = {
    id: string;
    tenantId: string;
    planId: string;
    status: string;
    paymentProvider: string;
    startedAt: Date;
    expiresAt: Date;
    createdAt: Date;
    updatedAt: Date;
};

type InvoiceRecord = {
    id: string;
    orderId: string;
    tenantId: string;
    number: string;
    amountCents: number;
    currency: string;
    pdfUrl: string | null;
    sentAt: Date | null;
    paidAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
};

type OrderRecord = {
    id: string;
    tenantId: string;
    planId: string;
    amountCents: number;
    currency: string;
    status: string;
    paymentProvider: string;
    customerEmail: string;
    createdAt: Date;
    updatedAt: Date;
};

type MessageRecord = {
    id: string;
    fromBotId: string;
    toBotId: string;
    messageType: string;
    subject: string | null;
    body: string;
    status: string;
    createdAt: Date;
    fromBot: { id: string; role: string };
    toBot: { id: string; role: string };
};

type AccountRecord = {
    id: string;
    email: string;
    displayName: string | null;
    role: string;
    createdAt: Date;
    lastLoginAt: Date | null;
};

type TenantRecord = {
    id: string;
    name: string;
    status: string;
};

// ── Repo interface ─────────────────────────────────────────────────────────

export type PortalDataRepo = {
    listBots(tenantId: string, limit: number): Promise<BotRecord[]>;
    findBot(botId: string, tenantId: string): Promise<BotRecord | null>;
    listTasksForBot(botId: string, tenantId: string, limit: number): Promise<TaskRecord[]>;

    countTasks(tenantId: string): Promise<number>;
    sumTaskCost(tenantId: string): Promise<number>;
    listRecentTasks(tenantId: string, since: Date): Promise<Array<{ createdAt: Date; outcome: string }>>;
    listBotsForTenant(tenantId: string): Promise<Array<{ id: string; role: string }>>;
    listTasksByBotIds(tenantId: string): Promise<TaskRawRecord[]>;

    findSubscription(tenantId: string): Promise<SubscriptionRecord | null>;
    listInvoices(tenantId: string, take: number): Promise<InvoiceRecord[]>;
    listOrders(tenantId: string, take: number): Promise<OrderRecord[]>;

    listMessages(tenantId: string, limit: number): Promise<MessageRecord[]>;

    findAccount(accountId: string): Promise<AccountRecord | null>;
    findTenant(tenantId: string): Promise<TenantRecord | null>;
    updateDisplayName(accountId: string, displayName: string): Promise<AccountRecord>;
};

export type RegisterPortalDataRoutesOptions = {
    repo?: PortalDataRepo;
    prisma?: PrismaClient;
    requireSession?: (request: FastifyRequest, reply: FastifyReply) => Promise<PortalSessionData | null>;
};

// ── Default Prisma-backed repo ─────────────────────────────────────────────

const buildPrismaRepo = (prisma: PrismaClient): PortalDataRepo => ({
    async listBots(tenantId, limit) {
        return prisma.bot.findMany({
            where: { workspace: { tenantId } },
            select: {
                id: true,
                role: true,
                status: true,
                workspaceId: true,
                createdAt: true,
                updatedAt: true,
                workspace: { select: { name: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
        }) as unknown as BotRecord[];
    },

    async findBot(botId, tenantId) {
        return prisma.bot.findFirst({
            where: { id: botId, workspace: { tenantId } },
            select: {
                id: true,
                role: true,
                status: true,
                workspaceId: true,
                createdAt: true,
                updatedAt: true,
                workspace: { select: { name: true } },
            },
        }) as unknown as BotRecord | null;
    },

    async listTasksForBot(botId, tenantId, limit) {
        return prisma.taskExecutionRecord.findMany({
            where: { botId, tenantId },
            select: {
                id: true,
                outcome: true,
                latencyMs: true,
                estimatedCostUsd: true,
                createdAt: true,
                modelProfile: true,
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
        }) as unknown as TaskRecord[];
    },

    async countTasks(tenantId) {
        return prisma.taskExecutionRecord.count({ where: { tenantId } });
    },

    async sumTaskCost(tenantId) {
        const result = await prisma.taskExecutionRecord.aggregate({
            where: { tenantId },
            _sum: { estimatedCostUsd: true },
        });
        return result._sum.estimatedCostUsd ?? 0;
    },

    async listRecentTasks(tenantId, since) {
        return prisma.taskExecutionRecord.findMany({
            where: { tenantId, createdAt: { gte: since } },
            select: { createdAt: true, outcome: true },
        }) as unknown as Array<{ createdAt: Date; outcome: string }>;
    },

    async listBotsForTenant(tenantId) {
        return prisma.bot.findMany({
            where: { workspace: { tenantId } },
            select: { id: true, role: true },
        });
    },

    async listTasksByBotIds(tenantId) {
        return prisma.taskExecutionRecord.findMany({
            where: { tenantId },
            select: { botId: true, outcome: true, estimatedCostUsd: true },
        }) as unknown as TaskRawRecord[];
    },

    async findSubscription(tenantId) {
        return prisma.tenantSubscription.findFirst({
            where: { tenantId },
            orderBy: { createdAt: 'desc' },
        }) as unknown as SubscriptionRecord | null;
    },

    async listInvoices(tenantId, take) {
        return prisma.invoice.findMany({
            where: { tenantId },
            orderBy: { createdAt: 'desc' },
            take,
        }) as unknown as InvoiceRecord[];
    },

    async listOrders(tenantId, take) {
        return prisma.order.findMany({
            where: { tenantId },
            orderBy: { createdAt: 'desc' },
            take,
        }) as unknown as OrderRecord[];
    },

    async listMessages(tenantId, limit) {
        return prisma.agentMessage.findMany({
            where: {
                OR: [
                    { fromBot: { workspace: { tenantId } } },
                    { toBot: { workspace: { tenantId } } },
                ],
            },
            select: {
                id: true,
                fromBotId: true,
                toBotId: true,
                messageType: true,
                subject: true,
                body: true,
                status: true,
                createdAt: true,
                fromBot: { select: { id: true, role: true } },
                toBot: { select: { id: true, role: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
        }) as unknown as MessageRecord[];
    },

    async findAccount(accountId) {
        return prisma.tenantPortalAccount.findUnique({
            where: { id: accountId },
            select: {
                id: true,
                email: true,
                displayName: true,
                role: true,
                createdAt: true,
                lastLoginAt: true,
            },
        }) as unknown as AccountRecord | null;
    },

    async findTenant(tenantId) {
        return prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { id: true, name: true, status: true },
        }) as unknown as TenantRecord | null;
    },

    async updateDisplayName(accountId, displayName) {
        return prisma.tenantPortalAccount.update({
            where: { id: accountId },
            data: { displayName },
            select: {
                id: true,
                email: true,
                displayName: true,
                role: true,
                createdAt: true,
                lastLoginAt: true,
            },
        }) as unknown as AccountRecord;
    },
});

// ── Route registration ─────────────────────────────────────────────────────

export const registerPortalDataRoutes = async (
    app: FastifyInstance,
    options: RegisterPortalDataRoutesOptions = {},
): Promise<void> => {
    const resolvePrisma = options.prisma
        ? () => Promise.resolve(options.prisma!)
        : async () => {
            const { prisma } = await import('../lib/db.js');
            return prisma;
        };

    const resolveRepo = options.repo
        ? () => Promise.resolve(options.repo!)
        : async () => buildPrismaRepo(await resolvePrisma());

    // Session checker: injectable for tests, defaults to real portal session verification
    const checkSession: (request: FastifyRequest, reply: FastifyReply) => Promise<PortalSessionData | null> =
        options.requireSession ??
        (async (req, rep) => requirePortalSession(req, rep, await resolvePrisma()));

    // ── GET /portal/data/agents ───────────────────────────────────────────
    app.get<{ Querystring: { limit?: string } }>('/portal/data/agents', async (request, reply) => {
        const session = await checkSession(request, reply);
        if (!session) return;

        const rawLimit = parseInt(request.query.limit ?? '50', 10);
        const limit = Math.min(Number.isNaN(rawLimit) ? 50 : rawLimit, 100);

        const repo = await resolveRepo();
        const agents = await repo.listBots(session.tenantId, limit);
        return reply.send({ agents, total: agents.length });
    });

    // ── GET /portal/data/agents/:botId ────────────────────────────────────
    app.get<{ Params: { botId: string } }>('/portal/data/agents/:botId', async (request, reply) => {
        const session = await checkSession(request, reply);
        if (!session) return;

        const { botId } = request.params;
        const repo = await resolveRepo();
        const agent = await repo.findBot(botId, session.tenantId);
        if (!agent) {
            return reply.code(404).send({ error: 'not_found' });
        }
        return reply.send({ agent });
    });

    // ── GET /portal/data/agents/:botId/tasks ──────────────────────────────
    app.get<{ Params: { botId: string }; Querystring: { limit?: string } }>(
        '/portal/data/agents/:botId/tasks',
        async (request, reply) => {
            const session = await checkSession(request, reply);
            if (!session) return;

            const { botId } = request.params;
            const rawLimit = parseInt(request.query.limit ?? '20', 10);
            const limit = Math.min(Number.isNaN(rawLimit) ? 20 : rawLimit, 100);

            const repo = await resolveRepo();
            // Verify bot belongs to this tenant before returning its tasks
            const bot = await repo.findBot(botId, session.tenantId);
            if (!bot) {
                return reply.code(404).send({ error: 'not_found' });
            }

            const tasks = await repo.listTasksForBot(botId, session.tenantId, limit);
            return reply.send({ tasks, total: tasks.length });
        },
    );

    // ── GET /portal/data/usage ────────────────────────────────────────────
    app.get('/portal/data/usage', async (request, reply) => {
        const session = await checkSession(request, reply);
        if (!session) return;

        const { tenantId } = session;
        const repo = await resolveRepo();
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        const [totalTasks, totalCostUsd, recentTasks] = await Promise.all([
            repo.countTasks(tenantId),
            repo.sumTaskCost(tenantId),
            repo.listRecentTasks(tenantId, thirtyDaysAgo),
        ]);

        const successCount = recentTasks.filter((t) => t.outcome === 'success').length;
        const successRate = totalTasks > 0 ? successCount / totalTasks : 0;

        // JS aggregation for daily breakdown (avoids $queryRaw type complexity)
        const dayMap: Record<string, number> = {};
        for (const t of recentTasks) {
            const date = t.createdAt.toISOString().slice(0, 10);
            dayMap[date] = (dayMap[date] ?? 0) + 1;
        }
        const tasksByDay = Object.entries(dayMap)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, count]) => ({ date, count }));

        return reply.send({ totalTasks, successRate, totalCostUsd, tasksByDay });
    });

    // ── GET /portal/data/usage/agents ─────────────────────────────────────
    app.get('/portal/data/usage/agents', async (request, reply) => {
        const session = await checkSession(request, reply);
        if (!session) return;

        const { tenantId } = session;
        const repo = await resolveRepo();

        const [bots, allTasks] = await Promise.all([
            repo.listBotsForTenant(tenantId),
            repo.listTasksByBotIds(tenantId),
        ]);

        const botStats: Record<string, { taskCount: number; successCount: number; totalCostUsd: number }> = {};
        for (const bot of bots) {
            botStats[bot.id] = { taskCount: 0, successCount: 0, totalCostUsd: 0 };
        }
        for (const task of allTasks) {
            const stats = botStats[task.botId];
            if (!stats) continue;
            stats.taskCount++;
            if (task.outcome === 'success') stats.successCount++;
            stats.totalCostUsd += task.estimatedCostUsd ?? 0;
        }

        const agents = bots.map((bot) => {
            const stats = botStats[bot.id] ?? { taskCount: 0, successCount: 0, totalCostUsd: 0 };
            return {
                botId: bot.id,
                botRole: bot.role,
                taskCount: stats.taskCount,
                successRate: stats.taskCount > 0 ? stats.successCount / stats.taskCount : 0,
                totalCostUsd: stats.totalCostUsd,
            };
        });

        return reply.send({ agents });
    });

    // ── GET /portal/data/billing/subscription ─────────────────────────────
    app.get('/portal/data/billing/subscription', async (request, reply) => {
        const session = await checkSession(request, reply);
        if (!session) return;

        const repo = await resolveRepo();
        const subscription = await repo.findSubscription(session.tenantId);
        return reply.send({ subscription });
    });

    // ── GET /portal/data/billing/invoices ─────────────────────────────────
    app.get('/portal/data/billing/invoices', async (request, reply) => {
        const session = await checkSession(request, reply);
        if (!session) return;

        const repo = await resolveRepo();
        const invoices = await repo.listInvoices(session.tenantId, 12);
        return reply.send({ invoices });
    });

    // ── GET /portal/data/billing/orders ───────────────────────────────────
    app.get('/portal/data/billing/orders', async (request, reply) => {
        const session = await checkSession(request, reply);
        if (!session) return;

        const repo = await resolveRepo();
        const orders = await repo.listOrders(session.tenantId, 20);
        return reply.send({ orders });
    });

    // ── GET /portal/data/messages ─────────────────────────────────────────
    app.get<{ Querystring: { limit?: string } }>('/portal/data/messages', async (request, reply) => {
        const session = await checkSession(request, reply);
        if (!session) return;

        const rawLimit = parseInt(request.query.limit ?? '20', 10);
        const limit = Math.min(Number.isNaN(rawLimit) ? 20 : rawLimit, 100);

        const repo = await resolveRepo();
        const messages = await repo.listMessages(session.tenantId, limit);
        return reply.send({ messages, total: messages.length });
    });

    // ── GET /portal/data/profile ──────────────────────────────────────────
    app.get('/portal/data/profile', async (request, reply) => {
        const session = await checkSession(request, reply);
        if (!session) return;

        const repo = await resolveRepo();
        const [account, tenant] = await Promise.all([
            repo.findAccount(session.accountId),
            repo.findTenant(session.tenantId),
        ]);

        if (!account) {
            return reply.code(404).send({ error: 'account_not_found' });
        }
        return reply.send({ account, tenant });
    });

    // ── PATCH /portal/data/profile ────────────────────────────────────────
    app.patch<{ Body: { displayName?: string } }>('/portal/data/profile', async (request, reply) => {
        const session = await checkSession(request, reply);
        if (!session) return;

        const { displayName } = request.body ?? {};
        if (typeof displayName !== 'string' || displayName.trim().length === 0) {
            return reply.code(400).send({
                error: 'invalid_display_name',
                message: 'displayName must be a non-empty string',
            });
        }
        if (displayName.length > 100) {
            return reply.code(400).send({
                error: 'invalid_display_name',
                message: 'displayName must be 100 characters or fewer',
            });
        }

        const repo = await resolveRepo();
        const updated = await repo.updateDisplayName(session.accountId, displayName.trim());
        return reply.send({ ok: true, displayName: updated.displayName });
    });
};
