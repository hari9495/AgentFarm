import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { ROLE_RANK } from '../lib/require-role.js';
import { snapshotBotConfig, applyBotConfigVersion } from '../lib/bot-versioning.js';
import { writeAuditEvent } from '../lib/audit-writer.js';

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    role?: string;
    expiresAt: number;
};

export type RegisterBotVersionRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
    prisma?: PrismaClient;
};

const getPrisma = async () => {
    const db = await import('../lib/db.js');
    return db.prisma;
};

type BotIdParams = { botId: string };
type BotVersionParams = { botId: string; versionId: string };

export const registerBotVersionRoutes = async (
    app: FastifyInstance,
    options: RegisterBotVersionRoutesOptions,
): Promise<void> => {
    const resolvePrisma = options.prisma
        ? () => Promise.resolve(options.prisma!)
        : getPrisma;

    // -------------------------------------------------------------------------
    // Helper: verify bot belongs to tenant, return workspaceId
    // -------------------------------------------------------------------------
    const resolveBotForTenant = async (
        db: PrismaClient,
        botId: string,
        tenantId: string,
    ): Promise<{ id: string; workspaceId: string } | null> => {
        const bot = await db.bot.findUnique({
            where: { id: botId },
            select: { id: true, workspaceId: true, workspace: { select: { tenantId: true } } },
        });
        if (!bot || bot.workspace.tenantId !== tenantId) return null;
        return { id: bot.id, workspaceId: bot.workspaceId };
    };

    // -------------------------------------------------------------------------
    // GET /v1/agents/:botId/versions — viewer+
    // -------------------------------------------------------------------------
    app.get<{ Params: BotIdParams }>('/v1/agents/:botId/versions', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) return reply.code(401).send({ error: 'unauthorized' });
        if ((ROLE_RANK[session.role ?? ''] ?? 0) < (ROLE_RANK['viewer'] ?? 99)) {
            return reply.code(403).send({ error: 'insufficient_role', required: 'viewer', actual: session.role });
        }

        const { botId } = request.params;
        const db = await resolvePrisma();
        const bot = await resolveBotForTenant(db, botId, session.tenantId);
        if (!bot) return reply.code(404).send({ error: 'not_found' });

        const versions = await db.botConfigVersion.findMany({
            where: { botId },
            orderBy: { versionNumber: 'desc' },
        });

        return reply.code(200).send({ versions });
    });

    // -------------------------------------------------------------------------
    // GET /v1/agents/:botId/versions/:versionId — viewer+
    // -------------------------------------------------------------------------
    app.get<{ Params: BotVersionParams }>(
        '/v1/agents/:botId/versions/:versionId',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) return reply.code(401).send({ error: 'unauthorized' });
            if ((ROLE_RANK[session.role ?? ''] ?? 0) < (ROLE_RANK['viewer'] ?? 99)) {
                return reply.code(403).send({ error: 'insufficient_role', required: 'viewer', actual: session.role });
            }

            const { botId, versionId } = request.params;
            const db = await resolvePrisma();
            const bot = await resolveBotForTenant(db, botId, session.tenantId);
            if (!bot) return reply.code(404).send({ error: 'not_found' });

            const version = await db.botConfigVersion.findUnique({ where: { id: versionId } });
            if (!version || version.botId !== botId || version.tenantId !== session.tenantId) {
                return reply.code(404).send({ error: 'not_found' });
            }

            return reply.code(200).send({ version });
        },
    );

    // -------------------------------------------------------------------------
    // POST /v1/agents/:botId/versions/snapshot — operator+
    // -------------------------------------------------------------------------
    app.post<{ Params: BotIdParams; Body: { changeNote?: unknown } }>(
        '/v1/agents/:botId/versions/snapshot',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) return reply.code(401).send({ error: 'unauthorized' });
            if ((ROLE_RANK[session.role ?? ''] ?? 0) < (ROLE_RANK['operator'] ?? 99)) {
                return reply.code(403).send({ error: 'insufficient_role', required: 'operator', actual: session.role });
            }

            const { botId } = request.params;
            const db = await resolvePrisma();
            const bot = await resolveBotForTenant(db, botId, session.tenantId);
            if (!bot) return reply.code(404).send({ error: 'not_found' });

            const changeNote =
                typeof request.body?.changeNote === 'string' ? request.body.changeNote : undefined;

            const version = await snapshotBotConfig(
                db,
                botId,
                session.tenantId,
                session.userId,
                changeNote,
            );

            return reply.code(201).send({ version });
        },
    );

    // -------------------------------------------------------------------------
    // POST /v1/agents/:botId/versions/:versionId/restore — admin+
    // -------------------------------------------------------------------------
    app.post<{ Params: BotVersionParams }>(
        '/v1/agents/:botId/versions/:versionId/restore',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) return reply.code(401).send({ error: 'unauthorized' });
            if ((ROLE_RANK[session.role ?? ''] ?? 0) < (ROLE_RANK['admin'] ?? 99)) {
                return reply.code(403).send({ error: 'insufficient_role', required: 'admin', actual: session.role });
            }

            const { botId, versionId } = request.params;
            const db = await resolvePrisma();
            const bot = await resolveBotForTenant(db, botId, session.tenantId);
            if (!bot) return reply.code(404).send({ error: 'not_found' });

            let updatedBot: Awaited<ReturnType<typeof applyBotConfigVersion>>;
            try {
                updatedBot = await applyBotConfigVersion(
                    db,
                    botId,
                    session.tenantId,
                    versionId,
                    session.userId,
                );
            } catch (err: any) {
                if (err?.statusCode === 404) {
                    return reply.code(404).send({ error: 'not_found' });
                }
                throw err;
            }

            void writeAuditEvent({
                prisma: db,
                tenantId: session.tenantId,
                workspaceId: bot.workspaceId,
                botId,
                eventType: 'bot.version.restore',
                severity: 'info',
                summary: `Bot ${botId} config restored to version ${versionId} by ${session.userId}`,
            });

            return reply.code(200).send({ bot: updatedBot });
        },
    );
};
