/**
 * Sprint 11 — Episodic Memory REST API
 *
 * Exposes paginated browse and GDPR-redact endpoints for the agent's episodic
 * memory table (AgentLongTermMemory). Used by the dashboard memory browser panel.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { EpisodicMemoryRecord } from '@agentfarm/shared-types';

const getPrisma = async () => {
    const db = await import('../lib/db.js');
    return db.prisma;
};

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    expiresAt: number;
};

// ---------------------------------------------------------------------------
// Repository abstraction (injectable for tests)
// ---------------------------------------------------------------------------

type EpisodicMemoryRepo = {
    findMany(input: {
        tenantId: string;
        botId: string;
        workspaceId: string;
        skip: number;
        take: number;
    }): Promise<EpisodicMemoryRecord[]>;

    count(input: {
        tenantId: string;
        botId: string;
        workspaceId: string;
    }): Promise<number>;

    deleteById(id: string, tenantId: string): Promise<boolean>;
};

const defaultRepo: EpisodicMemoryRepo = {
    async findMany({ tenantId, botId, workspaceId, skip, take }) {
        const prisma = await getPrisma();
        const rows = await prisma.agentLongTermMemory.findMany({
            where: { tenantId, botId, workspaceId },
            orderBy: { lastSeen: 'desc' },
            skip,
            take,
            select: {
                id: true,
                tenantId: true,
                botId: true,
                workspaceId: true,
                pattern: true,
                summary: true,
                embeddingModel: true,
                confidence: true,
                observedCount: true,
                lastSeen: true,
                createdAt: true,
            },
        });

        return rows.map((r) => ({
            id: r.id,
            tenantId: r.tenantId,
            botId: r.botId ?? '',
            workspaceId: r.workspaceId,
            pattern: r.pattern,
            summary: r.summary ?? '',
            embeddingModel: r.embeddingModel ?? '',
            confidence: r.confidence,
            observedCount: r.observedCount,
            lastSeen: r.lastSeen.toISOString(),
            createdAt: r.createdAt.toISOString(),
        }));
    },

    async count({ tenantId, botId, workspaceId }) {
        const prisma = await getPrisma();
        return prisma.agentLongTermMemory.count({ where: { tenantId, botId, workspaceId } });
    },

    async deleteById(id, tenantId) {
        const prisma = await getPrisma();
        const existing = await prisma.agentLongTermMemory.findFirst({
            where: { id, tenantId },
            select: { id: true },
        });
        if (!existing) {
            return false;
        }
        await prisma.agentLongTermMemory.delete({ where: { id } });
        return true;
    },
};

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

type EpisodicMemoryRouteOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
    repo?: EpisodicMemoryRepo;
};

type ListQuery = {
    bot_id?: string;
    workspace_id?: string;
    page?: string;
    page_size?: string;
};

type DeleteParams = {
    id: string;
};

export async function registerEpisodicMemoryRoutes(
    app: FastifyInstance,
    options: EpisodicMemoryRouteOptions,
): Promise<void> {
    const repo = options.repo ?? defaultRepo;

    // GET /v1/episodic-memory?bot_id=&workspace_id=&page=1&page_size=20
    app.get<{ Querystring: ListQuery }>('/v1/episodic-memory', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({
                error: 'unauthorized',
                message: 'A valid authenticated session is required.',
            });
        }

        const botId = request.query?.bot_id?.trim();
        if (!botId) {
            return reply.code(400).send({
                error: 'missing_bot_id',
                message: 'bot_id query parameter is required.',
            });
        }

        const workspaceId = request.query?.workspace_id ?? session.workspaceIds[0];
        if (!workspaceId || !session.workspaceIds.includes(workspaceId)) {
            return reply.code(403).send({
                error: 'workspace_scope_violation',
                message: 'workspace_id is not in your authenticated session scope.',
            });
        }

        const page = Math.max(1, parseInt(request.query?.page ?? '1', 10) || 1);
        const pageSize = Math.min(100, Math.max(1, parseInt(request.query?.page_size ?? '20', 10) || 20));
        const skip = (page - 1) * pageSize;

        const [records, total] = await Promise.all([
            repo.findMany({ tenantId: session.tenantId, botId, workspaceId, skip, take: pageSize }),
            repo.count({ tenantId: session.tenantId, botId, workspaceId }),
        ]);

        return {
            records,
            total,
            page,
            page_size: pageSize,
            has_more: skip + records.length < total,
        };
    });

    // DELETE /v1/episodic-memory/:id
    app.delete<{ Params: DeleteParams }>('/v1/episodic-memory/:id', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({
                error: 'unauthorized',
                message: 'A valid authenticated session is required.',
            });
        }

        const { id } = request.params;
        if (!id?.trim()) {
            return reply.code(400).send({
                error: 'missing_id',
                message: 'Memory record id is required.',
            });
        }

        const deleted = await repo.deleteById(id.trim(), session.tenantId);
        if (!deleted) {
            return reply.code(404).send({
                error: 'not_found',
                message: 'Episodic memory record not found or does not belong to your tenant.',
            });
        }

        return reply.code(200).send({ deleted: true, id });
    });
}

export type { EpisodicMemoryRepo, EpisodicMemoryRouteOptions };
