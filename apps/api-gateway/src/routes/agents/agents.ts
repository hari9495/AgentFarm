import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { ROLE_RANK } from '../../lib/require-role.js';
import type { RoleKey } from '@agentfarm/shared-types';
import { getRoleProfile } from '@agentfarm/agent-runtime/role-profiles.js';

const VALID_ROLE_KEYS: RoleKey[] = [
    'recruiter',
    'developer',
    'fullstack_developer',
    'tester',
    'business_analyst',
    'technical_writer',
    'content_writer',
    'sales_rep',
    'marketing_specialist',
    'corporate_assistant',
    'customer_support_executive',
    'project_manager_product_owner_scrum_master',
];

const getPrisma = async () => {
    const db = await import('../../lib/db.js');
    return db.prisma;
};

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    role?: string;
    expiresAt: number;
};

export type RegisterAgentsRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
    prisma?: PrismaClient;
};

type BotIdParams = { botId: string };
type ListAgentsQuery = { workspaceId?: string };
type CreateAgentBody = { workspaceId: string; role: string };

export const registerAgentsRoutes = async (
    app: FastifyInstance,
    options: RegisterAgentsRoutesOptions,
): Promise<void> => {
    const resolvePrisma = options.prisma
        ? () => Promise.resolve(options.prisma!)
        : getPrisma;

    // -----------------------------------------------------------------------
    // GET /v1/agents — list bots for tenant (optionally filtered by workspaceId)
    // -----------------------------------------------------------------------
    app.get<{ Querystring: ListAgentsQuery }>('/v1/agents', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized', message: 'A valid authenticated session is required.' });
        }
        if ((ROLE_RANK[session.role ?? ''] ?? 0) < (ROLE_RANK['viewer'] ?? 99)) {
            return reply.code(403).send({ error: 'insufficient_role', required: 'viewer', actual: session.role });
        }

        const { workspaceId } = request.query;
        const db = await resolvePrisma();

        const bots = await db.bot.findMany({
            where: {
                workspace: {
                    tenantId: session.tenantId,
                    ...(workspaceId ? { id: workspaceId } : {}),
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        return reply.send({ bots });
    });

    // -----------------------------------------------------------------------
    // POST /v1/agents — create a bot for a workspace
    // -----------------------------------------------------------------------
    app.post<{ Body: CreateAgentBody }>('/v1/agents', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized', message: 'A valid authenticated session is required.' });
        }
        if ((ROLE_RANK[session.role ?? ''] ?? 0) < (ROLE_RANK['operator'] ?? 99)) {
            return reply.code(403).send({ error: 'insufficient_role', required: 'operator', actual: session.role });
        }

        const { workspaceId, role } = request.body ?? {};
        if (!workspaceId || !role) {
            return reply.code(400).send({ error: 'missing_fields', message: 'workspaceId and role are required.' });
        }

        if (!VALID_ROLE_KEYS.includes(role as RoleKey)) {
            return reply.code(400).send({
                error: 'invalid_role',
                message: `role must be one of: ${VALID_ROLE_KEYS.join(', ')}`,
                provided: role,
            });
        }

        const db = await resolvePrisma();

        // Verify workspace belongs to this tenant
        const workspace = await db.workspace.findFirst({
            where: { id: workspaceId, tenantId: session.tenantId },
        });
        if (!workspace) {
            return reply.code(404).send({ error: 'workspace_not_found' });
        }

        const bot = await db.bot.create({
            data: { workspaceId, role },
        });

        const profile = getRoleProfile(role as RoleKey);
        await db.botCapabilitySnapshot.create({
            data: {
                botId: bot.id,
                tenantId: session.tenantId,
                workspaceId,
                roleKey: role,
                roleVersion: '1.0.0',
                policyPackVersion: '1.0.0',
                allowedConnectorTools: profile.allowedConnectorTools,
                allowedActions: profile.allowedActions,
                brainConfig: {},
                frozenAt: new Date(),
            },
        });

        return reply.code(201).send({ bot });
    });

    // -----------------------------------------------------------------------
    // GET /v1/agents/health — aggregated health summary for all bots in tenant
    // Returns each bot with last task timestamp, 24h task count, and last outcome
    // in a single round-trip (no N+1).
    // -----------------------------------------------------------------------
    app.get('/v1/agents/health', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) return reply.code(401).send({ error: 'unauthorized' });

        const db = await resolvePrisma();
        const since24h = new Date(Date.now() - 86_400_000);

        // 1. All bots for this tenant
        const bots = await db.bot.findMany({
            where: { workspace: { tenantId: session.tenantId } },
            include: { workspace: { select: { id: true, name: true } } },
            orderBy: { createdAt: 'asc' },
        });

        if (bots.length === 0) {
            return reply.send({ agents: [], summary: { active: 0, paused: 0, failed: 0, other: 0 } });
        }

        const botIds = bots.map(b => b.id);

        // 2. Latest task per bot + 24h counts in one query each
        const [latestTasks, recentCounts] = await Promise.all([
            db.taskExecutionRecord.findMany({
                where: { botId: { in: botIds } },
                orderBy: { executedAt: 'desc' },
                distinct: ['botId'],
                select: { botId: true, executedAt: true, outcome: true },
            }),
            db.taskExecutionRecord.groupBy({
                by: ['botId'],
                where: { botId: { in: botIds }, executedAt: { gte: since24h } },
                _count: { id: true },
            }),
        ]);

        const latestByBot = Object.fromEntries(latestTasks.map(t => [t.botId, t]));
        const countByBot  = Object.fromEntries(recentCounts.map(c => [c.botId, c._count.id]));

        const agents = bots.map(b => ({
            id:            b.id,
            role:          b.role,
            status:        b.status,
            workspaceId:   b.workspaceId,
            workspaceName: (b.workspace as { name?: string }).name ?? b.workspaceId,
            createdAt:     b.createdAt.toISOString(),
            updatedAt:     b.updatedAt.toISOString(),
            lastTaskAt:    latestByBot[b.id]?.executedAt.toISOString() ?? null,
            lastOutcome:   latestByBot[b.id]?.outcome ?? null,
            tasks24h:      countByBot[b.id] ?? 0,
        }));

        const summary = agents.reduce(
            (acc, a) => {
                if (a.status === 'active')          acc.active++;
                else if (a.status === 'paused')     acc.paused++;
                else if (a.status === 'failed')     acc.failed++;
                else                                acc.other++;
                return acc;
            },
            { active: 0, paused: 0, failed: 0, other: 0 },
        );

        return reply.send({ agents, summary });
    });

    // -----------------------------------------------------------------------
    // GET /v1/agents/:botId — get a single bot
    // -----------------------------------------------------------------------
    app.get<{ Params: BotIdParams }>('/v1/agents/:botId', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized', message: 'A valid authenticated session is required.' });
        }
        if ((ROLE_RANK[session.role ?? ''] ?? 0) < (ROLE_RANK['viewer'] ?? 99)) {
            return reply.code(403).send({ error: 'insufficient_role', required: 'viewer', actual: session.role });
        }

        const { botId } = request.params;
        const db = await resolvePrisma();

        const bot = await db.bot.findFirst({
            where: {
                id: botId,
                workspace: { tenantId: session.tenantId },
            },
        });
        if (!bot) {
            return reply.code(404).send({ error: 'bot_not_found' });
        }

        return reply.send({ bot });
    });
};
