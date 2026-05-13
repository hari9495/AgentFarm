import type { FastifyInstance, FastifyRequest } from 'fastify';
import { BotStatus, type PrismaClient } from '@prisma/client';
import { writeAuditEvent } from '../lib/audit-writer.js';
import { ROLE_RANK } from '../lib/require-role.js';
import { snapshotBotConfig } from '../lib/bot-versioning.js';
import { invalidateAgentRateLimitCache } from '../lib/agent-rate-limit.js';
import { dispatchOutboundWebhooks } from '../lib/webhook-dispatcher.js';

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
            eventType: 'agent_paused',
            severity: 'info',
            summary: `Agent ${botId} paused by ${session.userId}`,
        });

        void dispatchOutboundWebhooks({
            tenantId: session.tenantId,
            workspaceId: bot.workspaceId,
            eventType: 'agent_paused',
            taskId: botId,
            payload: { botId, status: 'paused', pausedBy: session.userId },
            timestamp: new Date().toISOString(),
        }, db);

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
            eventType: 'agent_resumed',
            severity: 'info',
            summary: `Agent ${botId} resumed by ${session.userId}`,
        });

        void dispatchOutboundWebhooks({
            tenantId: session.tenantId,
            workspaceId: bot.workspaceId,
            eventType: 'agent_resumed',
            taskId: botId,
            payload: { botId, status: 'active', resumedBy: session.userId },
            timestamp: new Date().toISOString(),
        }, db);

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

    // -------------------------------------------------------------------------
    // Phase 22 — per-agent rate-limit management routes
    // -------------------------------------------------------------------------

    // GET /v1/agents/:botId/rate-limit — read current config (viewer+)
    app.get<{ Params: BotIdParams }>('/v1/agents/:botId/rate-limit', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized', message: 'A valid authenticated session is required.' });
        }

        const { botId } = request.params;
        const db = await resolvePrisma();

        const bot = await db.bot.findUnique({
            where: { id: botId },
            select: { id: true, workspace: { select: { tenantId: true } } },
        });
        if (!bot) {
            return reply.code(404).send({ code: 'BOT_NOT_FOUND', message: 'Bot not found.' });
        }
        if (bot.workspace.tenantId !== session.tenantId) {
            return reply.code(403).send({ code: 'FORBIDDEN', message: 'Bot does not belong to your tenant.' });
        }

        const config = await db.agentRateLimit.findUnique({ where: { botId } });
        if (!config) {
            return reply.code(404).send({ code: 'RATE_LIMIT_NOT_CONFIGURED', message: 'No rate-limit config for this bot.' });
        }

        return reply.send({
            botId: config.botId,
            requestsPerMinute: config.requestsPerMinute,
            burstLimit: config.burstLimit,
            enabled: config.enabled,
            createdAt: config.createdAt,
            updatedAt: config.updatedAt,
        });
    });

    // POST /v1/agents/:botId/rate-limit — create or replace config (operator+)
    app.post<{ Params: BotIdParams; Body: { requestsPerMinute?: number; burstLimit?: number; enabled?: boolean } }>(
        '/v1/agents/:botId/rate-limit',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) {
                return reply.code(401).send({ error: 'unauthorized', message: 'A valid authenticated session is required.' });
            }
            if ((ROLE_RANK[session.role ?? ''] ?? 0) < (ROLE_RANK['operator'] ?? 99)) {
                return reply.code(403).send({ error: 'insufficient_role', required: 'operator', actual: session.role });
            }

            const { botId } = request.params;
            const db = await resolvePrisma();

            const bot = await db.bot.findUnique({
                where: { id: botId },
                select: { id: true, workspace: { select: { tenantId: true } } },
            });
            if (!bot) {
                return reply.code(404).send({ code: 'BOT_NOT_FOUND', message: 'Bot not found.' });
            }
            if (bot.workspace.tenantId !== session.tenantId) {
                return reply.code(403).send({ code: 'FORBIDDEN', message: 'Bot does not belong to your tenant.' });
            }

            const requestsPerMinute = request.body?.requestsPerMinute;
            const burstLimit = request.body?.burstLimit;
            const enabled = request.body?.enabled ?? true;

            if (requestsPerMinute !== undefined && (typeof requestsPerMinute !== 'number' || requestsPerMinute < 1 || requestsPerMinute > 10_000)) {
                return reply.code(400).send({ error: 'validation_error', message: 'requestsPerMinute must be between 1 and 10000.' });
            }
            if (burstLimit !== undefined && (typeof burstLimit !== 'number' || burstLimit < 1 || burstLimit > 1_000)) {
                return reply.code(400).send({ error: 'validation_error', message: 'burstLimit must be between 1 and 1000.' });
            }

            const config = await db.agentRateLimit.upsert({
                where: { botId },
                create: {
                    botId,
                    tenantId: session.tenantId,
                    requestsPerMinute: requestsPerMinute ?? 60,
                    burstLimit: burstLimit ?? 10,
                    enabled,
                },
                update: {
                    requestsPerMinute: requestsPerMinute ?? 60,
                    burstLimit: burstLimit ?? 10,
                    enabled,
                },
            });

            invalidateAgentRateLimitCache(botId, session.tenantId);

            return reply.send({
                botId: config.botId,
                requestsPerMinute: config.requestsPerMinute,
                burstLimit: config.burstLimit,
                enabled: config.enabled,
                createdAt: config.createdAt,
                updatedAt: config.updatedAt,
            });
        },
    );

    // PATCH /v1/agents/:botId/rate-limit — partial update (operator+)
    app.patch<{ Params: BotIdParams; Body: { requestsPerMinute?: number; burstLimit?: number; enabled?: boolean } }>(
        '/v1/agents/:botId/rate-limit',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) {
                return reply.code(401).send({ error: 'unauthorized', message: 'A valid authenticated session is required.' });
            }
            if ((ROLE_RANK[session.role ?? ''] ?? 0) < (ROLE_RANK['operator'] ?? 99)) {
                return reply.code(403).send({ error: 'insufficient_role', required: 'operator', actual: session.role });
            }

            const { botId } = request.params;
            const db = await resolvePrisma();

            const bot = await db.bot.findUnique({
                where: { id: botId },
                select: { id: true, workspace: { select: { tenantId: true } } },
            });
            if (!bot) {
                return reply.code(404).send({ code: 'BOT_NOT_FOUND', message: 'Bot not found.' });
            }
            if (bot.workspace.tenantId !== session.tenantId) {
                return reply.code(403).send({ code: 'FORBIDDEN', message: 'Bot does not belong to your tenant.' });
            }

            const existing = await db.agentRateLimit.findUnique({ where: { botId } });
            if (!existing) {
                return reply.code(404).send({ code: 'RATE_LIMIT_NOT_CONFIGURED', message: 'No rate-limit config for this bot.' });
            }

            const updates: { requestsPerMinute?: number; burstLimit?: number; enabled?: boolean } = {};
            if (request.body?.requestsPerMinute !== undefined) updates.requestsPerMinute = request.body.requestsPerMinute;
            if (request.body?.burstLimit !== undefined) updates.burstLimit = request.body.burstLimit;
            if (request.body?.enabled !== undefined) updates.enabled = request.body.enabled;

            const config = await db.agentRateLimit.update({ where: { botId }, data: updates });
            invalidateAgentRateLimitCache(botId, session.tenantId);

            return reply.send({
                botId: config.botId,
                requestsPerMinute: config.requestsPerMinute,
                burstLimit: config.burstLimit,
                enabled: config.enabled,
                createdAt: config.createdAt,
                updatedAt: config.updatedAt,
            });
        },
    );

    // DELETE /v1/agents/:botId/rate-limit — remove config (admin+)
    app.delete<{ Params: BotIdParams }>('/v1/agents/:botId/rate-limit', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized', message: 'A valid authenticated session is required.' });
        }
        if ((ROLE_RANK[session.role ?? ''] ?? 0) < (ROLE_RANK['admin'] ?? 99)) {
            return reply.code(403).send({ error: 'insufficient_role', required: 'admin', actual: session.role });
        }

        const { botId } = request.params;
        const db = await resolvePrisma();

        const bot = await db.bot.findUnique({
            where: { id: botId },
            select: { id: true, workspace: { select: { tenantId: true } } },
        });
        if (!bot) {
            return reply.code(404).send({ code: 'BOT_NOT_FOUND', message: 'Bot not found.' });
        }
        if (bot.workspace.tenantId !== session.tenantId) {
            return reply.code(403).send({ code: 'FORBIDDEN', message: 'Bot does not belong to your tenant.' });
        }

        const existing = await db.agentRateLimit.findUnique({ where: { botId } });
        if (!existing) {
            return reply.code(404).send({ code: 'RATE_LIMIT_NOT_CONFIGURED', message: 'No rate-limit config for this bot.' });
        }

        await db.agentRateLimit.delete({ where: { botId } });
        invalidateAgentRateLimitCache(botId, session.tenantId);

        return reply.code(204).send();
    });
};
