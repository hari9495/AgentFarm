import type { FastifyInstance, FastifyRequest } from 'fastify';
import { BotStatus, type PrismaClient } from '@prisma/client';
import { writeAuditEvent } from '../lib/audit-writer.js';
import { ROLE_RANK } from '../lib/require-role.js';
import { snapshotBotConfig } from '../lib/bot-versioning.js';

const getPrisma = async () => {
    const db = await import('../lib/db.js');
    return db.prisma;
};

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    role?: string;
    expiresAt: number;
};

export type RegisterAgentControlRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
    prisma?: PrismaClient;
};

type BotIdParams = { botId: string };

export const registerAgentControlRoutes = async (
    app: FastifyInstance,
    options: RegisterAgentControlRoutesOptions,
): Promise<void> => {
    const resolvePrisma = options.prisma
        ? () => Promise.resolve(options.prisma!)
        : getPrisma;

    // -----------------------------------------------------------------------
    // POST /v1/agents/:botId/pause
    // -----------------------------------------------------------------------
    app.post<{ Params: BotIdParams }>('/v1/agents/:botId/pause', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({
                error: 'unauthorized',
                message: 'A valid authenticated session is required.',
            });
        }
        if ((ROLE_RANK[session.role ?? ''] ?? 0) < (ROLE_RANK['operator'] ?? 99)) {
            return reply.code(403).send({ error: 'insufficient_role', required: 'operator', actual: session.role });
        }

        const { botId } = request.params;
        const db = await resolvePrisma();

        const bot = await db.bot.findUnique({
            where: { id: botId },
            select: {
                id: true,
                status: true,
                workspaceId: true,
                workspace: { select: { tenantId: true } },
            },
        });

        if (!bot) {
            return reply.code(404).send({ code: 'BOT_NOT_FOUND', message: 'Bot not found.' });
        }

        if (bot.workspace.tenantId !== session.tenantId) {
            return reply.code(403).send({ code: 'FORBIDDEN', message: 'Bot does not belong to your tenant.' });
        }

        if (bot.status === BotStatus.paused) {
            return reply.code(200).send({ status: 'paused', message: 'Already paused' });
        }

        const updated = await db.bot.update({
            where: { id: botId },
            data: { status: BotStatus.paused },
            select: { id: true, status: true, updatedAt: true },
        });

        void writeAuditEvent({
            prisma: db,
            tenantId: session.tenantId,
            workspaceId: bot.workspaceId,
            botId,
            eventType: 'agent.paused',
            severity: 'info',
            summary: `Agent ${botId} paused by ${session.userId}`,
        });

        void snapshotBotConfig(db, botId, session.tenantId, session.userId, 'auto: paused');

        return reply.send({ botId, status: 'paused', updatedAt: updated.updatedAt ?? null });
    });

    // -----------------------------------------------------------------------
    // POST /v1/agents/:botId/resume
    // -----------------------------------------------------------------------
    app.post<{ Params: BotIdParams }>('/v1/agents/:botId/resume', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({
                error: 'unauthorized',
                message: 'A valid authenticated session is required.',
            });
        }
        if ((ROLE_RANK[session.role ?? ''] ?? 0) < (ROLE_RANK['operator'] ?? 99)) {
            return reply.code(403).send({ error: 'insufficient_role', required: 'operator', actual: session.role });
        }

        const { botId } = request.params;
        const db = await resolvePrisma();

        const bot = await db.bot.findUnique({
            where: { id: botId },
            select: {
                id: true,
                status: true,
                workspaceId: true,
                workspace: { select: { tenantId: true } },
            },
        });

        if (!bot) {
            return reply.code(404).send({ code: 'BOT_NOT_FOUND', message: 'Bot not found.' });
        }

        if (bot.workspace.tenantId !== session.tenantId) {
            return reply.code(403).send({ code: 'FORBIDDEN', message: 'Bot does not belong to your tenant.' });
        }

        if (bot.status === BotStatus.active) {
            return reply.code(200).send({ status: 'active', message: 'Already active' });
        }

        const updated = await db.bot.update({
            where: { id: botId },
            data: { status: BotStatus.active },
            select: { id: true, status: true, updatedAt: true },
        });

        void writeAuditEvent({
            prisma: db,
            tenantId: session.tenantId,
            workspaceId: bot.workspaceId,
            botId,
            eventType: 'agent.resumed',
            severity: 'info',
            summary: `Agent ${botId} resumed by ${session.userId}`,
        });

        void snapshotBotConfig(db, botId, session.tenantId, session.userId, 'auto: resumed');

        return reply.send({ botId, status: 'active', updatedAt: updated.updatedAt ?? null });
    });

    // -----------------------------------------------------------------------
    // GET /v1/agents/:botId/status
    // -----------------------------------------------------------------------
    app.get<{ Params: BotIdParams }>('/v1/agents/:botId/status', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({
                error: 'unauthorized',
                message: 'A valid authenticated session is required.',
            });
        }

        const { botId } = request.params;
        const db = await resolvePrisma();

        const bot = await db.bot.findUnique({
            where: { id: botId },
            select: {
                id: true,
                status: true,
                workspaceId: true,
                workspace: { select: { tenantId: true } },
            },
        });

        if (!bot) {
            return reply.code(404).send({ code: 'BOT_NOT_FOUND', message: 'Bot not found.' });
        }

        if (bot.workspace.tenantId !== session.tenantId) {
            return reply.code(403).send({ code: 'FORBIDDEN', message: 'Bot does not belong to your tenant.' });
        }

        return reply.send({
            botId: bot.id,
            status: bot.status,
            tenantId: bot.workspace.tenantId,
        });
    });
};
