import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import {
    findAndSaveProspects,
    type FindProspectsOptions,
    type FindProspectsResult,
} from '@agentfarm/agent-runtime/sales/prospect-finder.js';
import type { LeadSearchParams } from '@agentfarm/agent-runtime/sales/prospect-finder.js';

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    role?: string;
    expiresAt: number;
};

export type RegisterProspectsRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
    prisma?: PrismaClient;
    /** Overrides the default findAndSaveProspects — used in tests. */
    findProspects?: (opts: FindProspectsOptions) => Promise<FindProspectsResult>;
};

type ProspectIdParams = { prospectId: string };
type ListProspectsQuery = {
    botId?: string;
    status?: string;
    page?: string;
    limit?: string;
};
type FindProspectsBody = {
    botId: string;
    domain?: string;
    title?: string;
    industry?: string;
    limit?: number;
    qualifyThreshold?: number;
};
type UpdateProspectBody = {
    status?: string;
    notes?: string;
    nextFollowUpAt?: string;
    lastContactedAt?: string;
};

const getPrisma = async (): Promise<PrismaClient> => {
    const { prisma } = await import('../lib/db.js');
    return prisma;
};

export async function registerProspectsRoutes(
    app: FastifyInstance,
    options: RegisterProspectsRoutesOptions,
): Promise<void> {
    const resolvePrisma = options.prisma
        ? () => Promise.resolve(options.prisma!)
        : getPrisma;

    const finder = options.findProspects ?? findAndSaveProspects;

    // ── GET /v1/sales/prospects ────────────────────────────────────────────────
    app.get<{ Querystring: ListProspectsQuery }>(
        '/v1/sales/prospects',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) return reply.code(401).send({ error: 'Unauthorised' });

            const { botId, status, page, limit } = request.query;
            const pageNum = Math.max(1, parseInt(page ?? '1', 10) || 1);
            const limitNum = Math.min(100, Math.max(1, parseInt(limit ?? '20', 10) || 20));
            const skip = (pageNum - 1) * limitNum;

            const where: Record<string, unknown> = { tenantId: session.tenantId };
            if (botId) where['botId'] = botId;
            if (status) where['status'] = status;

            const prisma = await resolvePrisma();
            const [prospects, total] = await Promise.all([
                (prisma as never as {
                    prospect: {
                        findMany: (args: unknown) => Promise<unknown[]>;
                        count: (args: unknown) => Promise<number>;
                    };
                }).prospect.findMany({
                    where,
                    orderBy: { createdAt: 'desc' },
                    skip,
                    take: limitNum,
                }),
                (prisma as never as {
                    prospect: { count: (args: unknown) => Promise<number> };
                }).prospect.count({ where }),
            ]);

            return reply.code(200).send({ prospects, total, page: pageNum, limit: limitNum });
        },
    );

    // ── POST /v1/sales/prospects/find ─────────────────────────────────────────
    app.post<{ Body: FindProspectsBody }>(
        '/v1/sales/prospects/find',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) return reply.code(401).send({ error: 'Unauthorised' });

            const body = request.body ?? ({} as FindProspectsBody);
            if (!body.botId) {
                return reply.code(400).send({ error: 'botId is required' });
            }

            const prisma = await resolvePrisma();

            const config = await (prisma as never as {
                salesAgentConfig: {
                    findFirst: (args: unknown) => Promise<Record<string, unknown> | null>;
                };
            }).salesAgentConfig.findFirst({
                where: { botId: body.botId, tenantId: session.tenantId, active: true },
            });

            if (!config) {
                return reply.code(404).send({ error: 'No active SalesAgentConfig found for this bot' });
            }

            const searchParams: LeadSearchParams = {
                domain: body.domain,
                title: body.title,
                industry: body.industry,
                limit: body.limit,
            };

            const result = await finder({
                prisma,
                config: config as never,
                searchParams,
                qualifyThreshold: body.qualifyThreshold,
            });

            return reply.code(200).send({ ok: true, ...result });
        },
    );

    // ── GET /v1/sales/prospects/:prospectId ───────────────────────────────────
    app.get<{ Params: ProspectIdParams }>(
        '/v1/sales/prospects/:prospectId',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) return reply.code(401).send({ error: 'Unauthorised' });

            const { prospectId } = request.params;
            const prisma = await resolvePrisma();

            const prospect = await (prisma as never as {
                prospect: { findUnique: (args: unknown) => Promise<Record<string, unknown> | null> };
            }).prospect.findUnique({ where: { id: prospectId } });

            if (!prospect) return reply.code(404).send({ error: 'Prospect not found' });
            if (prospect['tenantId'] !== session.tenantId) {
                return reply.code(403).send({ error: 'Forbidden' });
            }

            return reply.code(200).send({ prospect });
        },
    );

    // ── PATCH /v1/sales/prospects/:prospectId ─────────────────────────────────
    app.patch<{ Params: ProspectIdParams; Body: UpdateProspectBody }>(
        '/v1/sales/prospects/:prospectId',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) return reply.code(401).send({ error: 'Unauthorised' });

            const { prospectId } = request.params;
            const prisma = await resolvePrisma();

            const existing = await (prisma as never as {
                prospect: { findUnique: (args: unknown) => Promise<Record<string, unknown> | null> };
            }).prospect.findUnique({ where: { id: prospectId } });

            if (!existing) return reply.code(404).send({ error: 'Prospect not found' });
            if (existing['tenantId'] !== session.tenantId) {
                return reply.code(403).send({ error: 'Forbidden' });
            }

            const body = request.body ?? ({} as UpdateProspectBody);
            const updateData: Record<string, unknown> = { updatedAt: new Date() };
            if (body.status !== undefined) updateData['status'] = body.status;
            if (body.notes !== undefined) updateData['notes'] = body.notes;
            if (body.nextFollowUpAt !== undefined) {
                updateData['nextFollowUpAt'] = body.nextFollowUpAt ? new Date(body.nextFollowUpAt) : null;
            }
            if (body.lastContactedAt !== undefined) {
                updateData['lastContactedAt'] = body.lastContactedAt
                    ? new Date(body.lastContactedAt)
                    : null;
            }

            const updated = await (prisma as never as {
                prospect: { update: (args: unknown) => Promise<Record<string, unknown>> };
            }).prospect.update({ where: { id: prospectId }, data: updateData as never });

            return reply.code(200).send({ ok: true, prospect: updated });
        },
    );
}
