import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { requirePortalSession, type PortalSessionData } from '../../lib/portal-session.js';

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
    taskId: string;
    outcome: string;
    latencyMs: number;
    estimatedCostUsd: number | null;
    createdAt: Date;
    modelProfile: string;
    modelProvider: string;
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
    modelTier: string | null;
};

type ActionDetailRecord = {
    id: string;
    actionType: string;
    riskLevel: string;
    inputSummary: string;
    outputSummary: string | null;
    status: string;
    createdAt: Date;
    completedAt: Date | null;
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
    listActionsForTask(taskId: string, tenantId: string): Promise<ActionDetailRecord[]>;

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
                taskId: true,
                outcome: true,
                latencyMs: true,
                estimatedCostUsd: true,
                createdAt: true,
                modelProfile: true,
                modelProvider: true,
                promptTokens: true,
                completionTokens: true,
                totalTokens: true,
                modelTier: true,
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
        }) as unknown as TaskRecord[];
    },

    async listActionsForTask(taskId, tenantId) {
        return prisma.actionRecord.findMany({
            where: { correlationId: taskId, tenantId },
            select: {
                id: true,
                actionType: true,
                riskLevel: true,
                inputSummary: true,
                outputSummary: true,
                status: true,
                createdAt: true,
                completedAt: true,
            },
            orderBy: { createdAt: 'asc' },
        }) as unknown as ActionDetailRecord[];
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
            const { prisma } = await import('../../lib/db.js');
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

    // ── GET /portal/data/agents/:botId/tasks/:taskId/actions ─────────────
    app.get<{ Params: { botId: string; taskId: string } }>(
        '/portal/data/agents/:botId/tasks/:taskId/actions',
        async (request, reply) => {
            const session = await checkSession(request, reply);
            if (!session) return;

            const { botId, taskId } = request.params;
            const repo = await resolveRepo();
            const bot = await repo.findBot(botId, session.tenantId);
            if (!bot) {
                return reply.code(404).send({ error: 'not_found' });
            }

            const actions = await repo.listActionsForTask(taskId, session.tenantId);
            return reply.send({ actions });
        },
    );

    // ── POST /portal/data/agents/:botId/tasks ────────────────────────────
    app.post<{
        Params: { botId: string };
        Body: {
            prompt?: string;
            connector_type?: string;
            action_type?: string;
            connector_params?: Record<string, unknown>;
        };
    }>('/portal/data/agents/:botId/tasks', async (request, reply) => {
        const session = await checkSession(request, reply);
        if (!session) return;

        const { botId } = request.params;
        const { prompt, connector_type, action_type, connector_params } = request.body ?? {};

        if (!prompt && !action_type) {
            return reply.code(400).send({ error: 'prompt or action_type is required' });
        }

        const repo = await resolveRepo();
        const bot = await repo.findBot(botId, session.tenantId);
        if (!bot) {
            return reply.code(404).send({ error: 'not_found' });
        }

        const goalPayload: Record<string, unknown> = {
            tenantId: session.tenantId,
            workspaceId: bot.workspaceId,
            botId,
            prompt: prompt ?? '',
        };
        if (connector_type) goalPayload['connector_type'] = connector_type;
        if (action_type) goalPayload['action_type'] = action_type;
        if (connector_params && typeof connector_params === 'object') {
            Object.assign(goalPayload, connector_params);
        }

        const runtimeUrl = (process.env['AGENT_RUNTIME_URL'] ?? 'http://localhost:4000').replace(/\/+$/, '');
        let runtimeRes: Response;
        try {
            runtimeRes = await fetch(`${runtimeUrl}/run-task`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    tenantId: session.tenantId,
                    agentId: botId,
                    triggeredBy: 'portal',
                    goal: JSON.stringify(goalPayload),
                }),
            });
        } catch (err) {
            return reply.code(502).send({ error: 'runtime_unreachable', detail: String(err) });
        }

        if (!runtimeRes.ok) {
            const body = await runtimeRes.text().catch(() => '');
            return reply.code(runtimeRes.status === 409 ? 409 : 502).send({
                error: 'runtime_error',
                detail: body,
            });
        }

        const result = (await runtimeRes.json()) as { task_id: string; status: string };
        return reply.code(202).send({ task_id: result.task_id, status: result.status ?? 'queued' });
    });

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

    // ── GET /portal/data/connectors ──────────────────────────────────────────
    // Read-only view: which connectors are connected for the tenant's workspace.
    app.get('/portal/data/connectors', async (request, reply) => {
        const session = await checkSession(request, reply);
        if (!session) return;

        const prisma = await resolvePrisma();

        // Get the first workspace for this tenant
        const bot = await prisma.bot.findFirst({
            where: { workspace: { tenantId: session.tenantId } },
            select: { workspaceId: true },
        });
        if (!bot) {
            return reply.send({ connectors: [], workspace_id: null });
        }

        const workspaceId = bot.workspaceId;

        // Fetch connector auth metadata for this workspace
        const records = await prisma.connectorAuthMetadata.findMany({
            where: { tenantId: session.tenantId, workspaceId },
            select: {
                connectorId: true,
                connectorType: true,
                status: true,
                scopeStatus: true,
                lastErrorClass: true,
                lastRefreshAt: true,
                tokenExpiresAt: true,
            },
        }) as Array<{
            connectorId: string;
            connectorType: string;
            status: string;
            scopeStatus: string | null;
            lastErrorClass: string | null;
            lastRefreshAt: Date | null;
            tokenExpiresAt: Date | null;
        }>;

        return reply.send({
            workspace_id: workspaceId,
            connectors: records.map((r) => ({
                connector_id: r.connectorId,
                connector_type: r.connectorType,
                status: r.status,
                scope_status: r.scopeStatus,
                last_error_class: r.lastErrorClass,
                last_refresh_at: r.lastRefreshAt?.toISOString() ?? null,
                token_expires_at: r.tokenExpiresAt?.toISOString() ?? null,
            })),
        });
    });

    // ── POST /portal/data/connectors/request ─────────────────────────────────
    // Portal users request the operator to connect a specific integration.
    // Creates an audit event the operator can see in the dashboard.
    app.post<{ Body: { connector_type?: string; note?: string } }>(
        '/portal/data/connectors/request',
        async (request, reply) => {
            const session = await checkSession(request, reply);
            if (!session) return;

            const connectorType = request.body?.connector_type?.trim();
            if (!connectorType) {
                return reply.code(400).send({ error: 'connector_type is required.' });
            }

            const prisma = await resolvePrisma();

            // Get workspace for audit event
            const bot = await prisma.bot.findFirst({
                where: { workspace: { tenantId: session.tenantId } },
                select: { id: true, workspaceId: true },
            });

            const note = request.body?.note?.trim();
            const summary = `Portal user ${session.accountId} requested ${connectorType} connector integration${note ? `: ${note}` : ''}.`;

            await prisma.auditEvent.create({
                data: {
                    tenantId: session.tenantId,
                    workspaceId: bot?.workspaceId ?? 'portal',
                    botId: bot?.id ?? 'portal-request',
                    eventType: 'audit_event',
                    severity: 'info',
                    summary,
                    sourceSystem: 'portal-connector-request',
                    correlationId: `portal_connector_request_${Date.now()}`,
                },
            });

            return reply.code(201).send({
                ok: true,
                connector_type: connectorType,
                message: 'Your request has been sent to the workspace administrator.',
            });
        },
    );

    // ── Portal team management ────────────────────────────────────────────────
    // Tenant roster backed by TenantPortalAccount — the same store portal login
    // authenticates against, so invited members can actually sign in.

    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const canManageTeam = (role: string): boolean =>
        role === 'owner' || role === 'admin' || role === 'superadmin';

    const toMemberView = (a: { id: string; email: string; displayName: string | null; role: string; createdAt: Date }) => ({
        id: a.id,
        email: a.email,
        name: a.displayName?.trim() || a.email.split('@')[0] || 'Account',
        role: a.role,
        createdAt: a.createdAt.getTime(),
    });

    // ── GET /portal/data/team/members ─────────────────────────────────────────
    app.get('/portal/data/team/members', async (request, reply) => {
        const session = await checkSession(request, reply);
        if (!session) return;

        const prisma = await resolvePrisma();
        const accounts = await prisma.tenantPortalAccount.findMany({
            where: { tenantId: session.tenantId, isActive: true },
            select: { id: true, email: true, displayName: true, role: true, createdAt: true },
            orderBy: { createdAt: 'asc' },
        });
        return reply.send({ members: accounts.map(toMemberView) });
    });

    // ── POST /portal/data/team/members ────────────────────────────────────────
    // Owner/admin invites a teammate with a temporary password. The account is
    // created pre-verified so the temporary password works immediately.
    app.post<{
        Body: { name?: string; email?: string; password?: string; role?: string };
    }>('/portal/data/team/members', async (request, reply) => {
        const session = await checkSession(request, reply);
        if (!session) return;
        if (!canManageTeam(session.role)) {
            return reply.code(403).send({ error: 'Only org admins can add team members.' });
        }

        const body = request.body ?? {};
        const name = body.name?.trim() ?? '';
        const email = body.email?.trim().toLowerCase() ?? '';
        const password = body.password ?? '';
        const role = body.role === 'admin' ? 'admin' : 'member';

        if (!name) return reply.code(400).send({ error: 'Name is required.' });
        if (!EMAIL_REGEX.test(email)) return reply.code(400).send({ error: 'Valid email is required.' });
        if (password.length < 8) return reply.code(400).send({ error: 'Password must be at least 8 characters.' });

        const prisma = await resolvePrisma();
        const existing = await prisma.tenantPortalAccount.findFirst({
            where: { tenantId: session.tenantId, email },
            select: { id: true },
        });
        if (existing) {
            return reply.code(409).send({ error: 'This email is already on your team.' });
        }

        const { hashPassword } = await import('../../lib/password.js');
        const account = await prisma.tenantPortalAccount.create({
            data: {
                tenantId: session.tenantId,
                email,
                passwordHash: await hashPassword(password),
                displayName: name,
                role,
                isActive: true,
                isEmailVerified: true,
                emailVerifiedAt: new Date(),
            },
            select: { id: true, email: true, displayName: true, role: true, createdAt: true },
        });

        return reply.code(201).send({ ok: true, member: toMemberView(account) });
    });

    // ── PATCH /portal/data/team/members/:id ───────────────────────────────────
    // Promote / demote between member and admin. Owner accounts are protected
    // and you cannot change your own role.
    app.patch<{
        Params: { id: string };
        Body: { role?: string };
    }>('/portal/data/team/members/:id', async (request, reply) => {
        const session = await checkSession(request, reply);
        if (!session) return;
        if (!canManageTeam(session.role)) {
            return reply.code(403).send({ error: 'Only org admins can change roles.' });
        }

        const newRole = request.body?.role;
        if (newRole !== 'admin' && newRole !== 'member') {
            return reply.code(400).send({ error: "role must be 'admin' or 'member'." });
        }
        if (request.params.id === session.accountId) {
            return reply.code(400).send({ error: 'You cannot change your own role.' });
        }

        const prisma = await resolvePrisma();
        const target = await prisma.tenantPortalAccount.findFirst({
            where: { id: request.params.id, tenantId: session.tenantId },
            select: { id: true, role: true },
        });
        if (!target) return reply.code(404).send({ error: 'Member not found.' });
        if (target.role === 'owner' || target.role === 'superadmin') {
            return reply.code(403).send({ error: 'Owner accounts are protected.' });
        }

        const updated = await prisma.tenantPortalAccount.update({
            where: { id: target.id },
            data: { role: newRole },
            select: { id: true, email: true, displayName: true, role: true, createdAt: true },
        });
        return reply.send({ ok: true, member: toMemberView(updated) });
    });

    // ── GET /portal/data/audit/events ─────────────────────────────────────────
    // Tenant-scoped view over the platform's append-only AuditEvent log
    // (approval decisions, provisioning, connector requests, agent actions).
    app.get<{ Querystring: { limit?: string } }>('/portal/data/audit/events', async (request, reply) => {
        const session = await checkSession(request, reply);
        if (!session) return;

        const rawLimit = parseInt(request.query.limit ?? '200', 10);
        const limit = Math.min(Number.isNaN(rawLimit) ? 200 : rawLimit, 500);

        const prisma = await resolvePrisma();
        const events = await prisma.auditEvent.findMany({
            where: { tenantId: session.tenantId },
            orderBy: { createdAt: 'desc' },
            take: limit,
            select: {
                id: true,
                botId: true,
                eventType: true,
                severity: true,
                summary: true,
                sourceSystem: true,
                createdAt: true,
            },
        });

        return reply.send({
            events: events.map((e) => ({
                id: e.id,
                actorId: e.sourceSystem,
                actorEmail: e.sourceSystem,
                action: String(e.eventType),
                targetType: 'agent',
                targetId: e.botId,
                tenantId: session.tenantId,
                beforeState: '',
                afterState: '',
                reason: e.summary,
                severity: String(e.severity),
                createdAt: e.createdAt.getTime(),
            })),
        });
    });

    // ── GET /portal/data/provisioning/status ─────────────────────────────────
    // Live provisioning state for the tenant: latest job + entity statuses.
    app.get('/portal/data/provisioning/status', async (request, reply) => {
        const session = await checkSession(request, reply);
        if (!session) return;

        const prisma = await resolvePrisma();
        const tenant = await prisma.tenant.findUnique({
            where: { id: session.tenantId },
            select: { id: true, status: true },
        });

        const job = await prisma.provisioningJob.findFirst({
            where: { tenantId: session.tenantId },
            orderBy: { createdAt: 'desc' },
        });

        let workspace: { id: string; status: string } | null = null;
        let bot: { id: string; status: string } | null = null;
        if (job) {
            workspace = await prisma.workspace.findUnique({
                where: { id: job.workspaceId },
                select: { id: true, status: true },
            });
            bot = (await prisma.bot.findUnique({
                where: { id: job.botId },
                select: { id: true, status: true },
            })) as { id: string; status: string } | null;
        }

        const TARGET_SECONDS = 600;
        const TIMEOUT_SECONDS = 1800;
        const ACTIVE_STATUSES = new Set([
            'queued', 'validating', 'creating_resources', 'bootstrapping_vm',
            'starting_container', 'registering_runtime', 'healthchecking',
        ]);
        const isActive = job ? ACTIVE_STATUSES.has(job.status) : false;
        const elapsedSeconds = job
            ? Math.max(0, Math.floor((Date.now() - job.createdAt.getTime()) / 1000))
            : 0;

        const timeline: Array<{ status: string; at: number; reason: string | null }> = [];
        if (job) {
            timeline.push({ status: 'queued', at: job.createdAt.getTime(), reason: null });
            if (job.startedAt) timeline.push({ status: 'validating', at: job.startedAt.getTime(), reason: null });
            if (job.failedAt) timeline.push({ status: 'failed', at: job.failedAt.getTime(), reason: job.failureReason ?? null });
            if (job.completedAt) timeline.push({ status: 'completed', at: job.completedAt.getTime(), reason: null });
        }

        return reply.send({
            status: 'ok',
            tenant: tenant ? { id: tenant.id, tenantStatus: tenant.status } : null,
            workspace: workspace ? { id: workspace.id, workspaceStatus: workspace.status } : null,
            bot: bot ? { id: bot.id, botStatus: bot.status } : null,
            provisioningJob: job
                ? {
                    id: job.id,
                    status: job.status,
                    failureReason: job.failureReason,
                    remediationHint: job.remediationHint,
                    updatedAt: job.updatedAt.getTime(),
                }
                : null,
            provisioningTimeline: timeline,
            estimatedSecondsRemaining: isActive ? Math.max(0, TARGET_SECONDS - elapsedSeconds) : null,
            slaMetrics: job && isActive
                ? {
                    elapsedSeconds,
                    targetSeconds: TARGET_SECONDS,
                    timeoutSeconds: TIMEOUT_SECONDS,
                    stuckThresholdSeconds: TARGET_SECONDS,
                    withinTarget: elapsedSeconds <= TARGET_SECONDS,
                    breachedTarget: elapsedSeconds > TARGET_SECONDS,
                    isStuck: elapsedSeconds > TARGET_SECONDS,
                    isTimedOut: elapsedSeconds > TIMEOUT_SECONDS,
                }
                : null,
            provisioningAlerts: job && isActive && elapsedSeconds > TARGET_SECONDS
                ? [{
                    level: elapsedSeconds > TIMEOUT_SECONDS ? 'critical' : 'warning',
                    code: 'provisioning_slow',
                    message: `Provisioning has been running for ${Math.floor(elapsedSeconds / 60)} minutes.`,
                }]
                : [],
            autoProcessed: { processed: 0, completed: 0, failed: 0 },
        });
    });

    // ── Portal approvals ──────────────────────────────────────────────────────
    // Customer-facing view over the same Approval table the runtime intake
    // writes to. actionSummary uses the approval-packet line convention
    // ("Change summary: …" / "Risk reason: …" — see lib/approval-packet.ts) so
    // records render consistently in the operator dashboard and the portal.

    const summaryLine = (summary: string, prefix: string): string | null => {
        for (const raw of summary.split(/\r?\n/)) {
            const line = raw.trim();
            if (line.toLowerCase().startsWith(prefix.toLowerCase())) {
                const value = line.slice(prefix.length).trim();
                if (value) return value;
            }
        }
        return null;
    };

    const roleDisplayName = (role: string): string =>
        role
            .split(/[_\-\s]+/)
            .filter(Boolean)
            .map((w) => w[0]!.toUpperCase() + w.slice(1))
            .join(' ');

    type PortalApprovalRow = {
        id: string;
        botId: string;
        taskId: string;
        riskLevel: string;
        actionSummary: string;
        requestedBy: string;
        decision: string;
        decisionReason: string | null;
        decisionLatencySeconds: number | null;
        escalationTimeoutSeconds: number;
        escalatedAt: Date | null;
        createdAt: Date;
        decidedAt: Date | null;
    };

    const mapApprovalForPortal = (a: PortalApprovalRow, roleByBotId: Map<string, string>) => {
        const role = roleByBotId.get(a.botId) ?? 'agent';
        return {
            id: a.id,
            title: summaryLine(a.actionSummary, 'Change summary:') ?? a.actionSummary,
            agentSlug: a.botId,
            agent: roleDisplayName(role),
            requestedBy: a.requestedBy,
            channel: summaryLine(a.actionSummary, 'Channel:') ?? 'Agent Runtime',
            reason: summaryLine(a.actionSummary, 'Risk reason:') ?? '',
            risk: a.riskLevel,
            status: a.decision === 'timeout_rejected' ? 'rejected' : a.decision,
            createdAt: a.createdAt.getTime(),
            decidedAt: a.decidedAt?.getTime() ?? null,
            decisionReason: a.decisionReason,
            decisionLatencySeconds: a.decisionLatencySeconds,
            escalationTimeoutSeconds: a.escalationTimeoutSeconds,
            escalatedAt: a.escalatedAt?.getTime() ?? null,
        };
    };

    const tenantBotRoles = async (tenantId: string): Promise<Map<string, string>> => {
        const prisma = await resolvePrisma();
        const bots = await prisma.bot.findMany({
            where: { workspace: { tenantId } },
            select: { id: true, role: true },
        });
        return new Map(bots.map((b) => [b.id, b.role]));
    };

    // ── GET /portal/data/approvals ────────────────────────────────────────────
    app.get<{ Querystring: { status?: string; limit?: string; agentSlug?: string } }>(
        '/portal/data/approvals',
        async (request, reply) => {
            const session = await checkSession(request, reply);
            if (!session) return;

            const status = request.query.status ?? 'pending';
            const rawLimit = parseInt(request.query.limit ?? '100', 10);
            const limit = Math.min(Number.isNaN(rawLimit) ? 100 : rawLimit, 200);
            const agentSlug = request.query.agentSlug?.trim();

            const decisionFilter =
                status === 'pending' ? { decision: 'pending' as const }
                : status === 'approved' ? { decision: 'approved' as const }
                : status === 'rejected' ? { decision: { in: ['rejected' as const, 'timeout_rejected' as const] } }
                : {};

            const prisma = await resolvePrisma();
            const roleByBotId = await tenantBotRoles(session.tenantId);

            // agentSlug is the bot id (agent detail pages link by bot.id) but
            // accept a role key too so both filter styles work.
            let botFilter: { botId?: string | { in: string[] } } = {};
            if (agentSlug) {
                if (roleByBotId.has(agentSlug)) {
                    botFilter = { botId: agentSlug };
                } else {
                    const ids = [...roleByBotId.entries()].filter(([, role]) => role === agentSlug).map(([id]) => id);
                    botFilter = { botId: { in: ids } };
                }
            }

            const rows = await prisma.approval.findMany({
                where: { tenantId: session.tenantId, ...decisionFilter, ...botFilter },
                orderBy: { createdAt: 'desc' },
                take: limit,
            }) as unknown as PortalApprovalRow[];

            return reply.send({ approvals: rows.map((a) => mapApprovalForPortal(a, roleByBotId)) });
        },
    );

    // ── POST /portal/data/approvals ───────────────────────────────────────────
    // Manual / simulated approval request raised from the portal UI.
    app.post<{
        Body: {
            title?: string;
            agentSlug?: string;
            agent?: string;
            requestedBy?: string;
            channel?: string;
            reason?: string;
            risk?: string;
            escalationTimeoutSeconds?: number;
        };
    }>('/portal/data/approvals', async (request, reply) => {
        const session = await checkSession(request, reply);
        if (!session) return;

        const body = request.body ?? {};
        const title = body.title?.trim() ?? '';
        const agentSlug = body.agentSlug?.trim() ?? '';
        const reason = body.reason?.trim() ?? '';
        const risk = body.risk;

        if (title.length < 6 || title.length > 100) {
            return reply.code(400).send({ error: 'Title must be 6–100 characters.' });
        }
        if (reason.length < 8) {
            return reply.code(400).send({ error: 'Reason must be at least 8 characters.' });
        }
        if (!risk || !['low', 'medium', 'high'].includes(risk)) {
            return reply.code(400).send({ error: 'Risk must be low, medium, or high.' });
        }

        const prisma = await resolvePrisma();
        const bot =
            (agentSlug
                ? await prisma.bot.findFirst({
                    where: { workspace: { tenantId: session.tenantId }, OR: [{ id: agentSlug }, { role: agentSlug }] },
                    select: { id: true, role: true, workspaceId: true },
                })
                : null)
            ?? await prisma.bot.findFirst({
                where: { workspace: { tenantId: session.tenantId } },
                select: { id: true, role: true, workspaceId: true },
            });
        if (!bot) {
            return reply.code(404).send({ error: 'No agent found for this workspace.' });
        }

        const channel = body.channel?.trim() || 'Dashboard';
        const requestedBy = body.requestedBy?.trim() || session.email;
        const escalationTimeoutSeconds = Number.isFinite(body.escalationTimeoutSeconds)
            ? Math.max(60, Math.floor(body.escalationTimeoutSeconds!))
            : 3600;

        const marker = `portal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        const created = await prisma.approval.create({
            data: {
                tenantId: session.tenantId,
                workspaceId: bot.workspaceId,
                botId: bot.id,
                taskId: marker,
                actionId: marker,
                riskLevel: risk as never,
                actionSummary: `Change summary: ${title}\nRisk reason: ${reason}\nChannel: ${channel}`,
                requestedBy,
                policyPackVersion: 'portal',
                escalationTimeoutSeconds,
            },
        }) as unknown as PortalApprovalRow;

        const roleByBotId = new Map([[bot.id, bot.role]]);
        return reply.code(201).send({ approval: mapApprovalForPortal(created, roleByBotId) });
    });

    // ── POST /portal/data/approvals/:id/decide ────────────────────────────────
    app.post<{
        Params: { id: string };
        Body: { decision?: string; decidedBy?: string; reason?: string };
    }>('/portal/data/approvals/:id/decide', async (request, reply) => {
        const session = await checkSession(request, reply);
        if (!session) return;

        const decision = request.body?.decision;
        if (decision !== 'approved' && decision !== 'rejected') {
            return reply.code(400).send({ error: "decision must be 'approved' or 'rejected'." });
        }
        const reason = request.body?.reason?.trim() || null;
        if (decision === 'rejected' && (!reason || reason.length < 8)) {
            return reply.code(400).send({ error: 'Rejection reason must be at least 8 characters.' });
        }

        const prisma = await resolvePrisma();
        const approval = await prisma.approval.findFirst({
            where: { id: request.params.id, tenantId: session.tenantId },
        }) as unknown as (PortalApprovalRow & { workspaceId: string }) | null;
        if (!approval) {
            return reply.code(404).send({ error: 'approval_not_found' });
        }
        if (approval.decision !== 'pending') {
            return reply.code(409).send({ error: 'approval_already_decided', decision: approval.decision });
        }

        const decidedAt = new Date();
        const decisionLatencySeconds = Math.max(
            0,
            Math.floor((decidedAt.getTime() - approval.createdAt.getTime()) / 1000),
        );
        const decidedBy = request.body?.decidedBy?.trim() || session.email;

        const updated = await prisma.approval.update({
            where: { id: approval.id },
            data: {
                decision: decision as never,
                decisionReason: reason,
                approverId: decidedBy,
                decidedAt,
                decisionLatencySeconds,
            },
        }) as unknown as PortalApprovalRow;

        await prisma.auditEvent.create({
            data: {
                tenantId: session.tenantId,
                workspaceId: approval.workspaceId,
                botId: approval.botId,
                eventType: 'approval_event',
                severity: decision === 'approved' ? 'info' : 'warn',
                summary: `Approval ${approval.id} decided as ${decision} by ${decidedBy} (portal).`,
                sourceSystem: 'portal-approvals',
                correlationId: `portal_approval_decision_${approval.id}_${Date.now()}`,
            },
        });

        // Notify the agent runtime so a task paused on this approval resumes.
        // Best-effort: portal-raised simulations have no waiting task.
        const runtime = await prisma.runtimeInstance.findFirst({
            where: {
                tenantId: session.tenantId,
                workspaceId: approval.workspaceId,
                botId: approval.botId,
                endpoint: { not: null },
            },
            orderBy: { updatedAt: 'desc' },
            select: { endpoint: true },
        });
        if (runtime?.endpoint) {
            const runtimeToken =
                process.env['AGENTFARM_RUNTIME_DECISION_SHARED_TOKEN']
                ?? process.env['RUNTIME_DECISION_SHARED_TOKEN']
                ?? null;
            try {
                await fetch(new URL('/decision', runtime.endpoint).toString(), {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                        ...(runtimeToken ? { 'x-runtime-decision-token': runtimeToken } : {}),
                    },
                    body: JSON.stringify({
                        task_id: approval.taskId,
                        decision,
                        reason,
                        actor: decidedBy,
                    }),
                    signal: AbortSignal.timeout(4_000),
                });
            } catch {
                // best-effort — decision is already persisted
            }
        }

        const roleByBotId = await tenantBotRoles(session.tenantId);
        return reply.send({ approval: mapApprovalForPortal(updated, roleByBotId) });
    });
};
