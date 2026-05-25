import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { SalesAgentConfigRecord, DealStage } from '@agentfarm/shared-types';
import {
    closeDealLost,
} from '@agentfarm/agent-runtime/sales/deal-closer.js';
import {
    sendContractInvite,
} from '@agentfarm/agent-runtime/sales/contract-sender.js';

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    role?: string;
    expiresAt: number;
};

export type RegisterDealsRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
    prisma?: PrismaClient;
    closeDealLostFn?: typeof closeDealLost;
    sendContractInviteFn?: typeof sendContractInvite;
};

type PrismaWithDeals = {
    salesDeal: {
        findUnique: (args: { where: { id: string }; include?: Record<string, unknown> }) => Promise<Record<string, unknown> | null>;
        findMany: (args: { where: Record<string, unknown>; include?: Record<string, unknown>; skip?: number; take?: number; orderBy?: Record<string, unknown> }) => Promise<Record<string, unknown>[]>;
        update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
        count: (args: { where: Record<string, unknown> }) => Promise<number>;
    };
    salesActivity: {
        create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }>;
        findMany: (args: { where: Record<string, unknown>; skip?: number; take?: number; orderBy?: Record<string, unknown> }) => Promise<Record<string, unknown>[]>;
        count: (args: { where: Record<string, unknown> }) => Promise<number>;
    };
    winLossEvent: {
        findMany: (args: { where: Record<string, unknown> }) => Promise<Record<string, unknown>[]>;
    };
    prospect: {
        update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
    };
    salesAgentConfig: {
        findFirst: (args: { where: Record<string, unknown> }) => Promise<Record<string, unknown> | null>;
    };
};

type DealIdParams = { id: string };
type PatchStageBody = { stage: DealStage; botId: string };
type CloseLostBody = { reason?: string; botId: string };
type ReopenParams = { id: string };

// Valid manual stage transitions
const VALID_TRANSITIONS: Partial<Record<DealStage, DealStage[]>> = {
    discovery: ['proposal'],
    proposal: ['negotiation'],
    negotiation: ['closed_lost'],
    // closed_won and closed_lost cannot be manually advanced here
};

const getPrisma = async (): Promise<PrismaClient> => {
    const { prisma } = await import('../../lib/db.js');
    return prisma;
};

export async function registerDealsRoutes(
    app: FastifyInstance,
    options: RegisterDealsRoutesOptions,
): Promise<void> {
    const resolvePrisma = options.prisma
        ? () => Promise.resolve(options.prisma!)
        : getPrisma;

    const doCloseDealLost = options.closeDealLostFn ?? closeDealLost;
    const doSendContractInvite = options.sendContractInviteFn ?? sendContractInvite;

    // -------------------------------------------------------------------------
    // POST /sales/deals/:id/close-lost
    // -------------------------------------------------------------------------
    app.post<{ Params: DealIdParams; Body: CloseLostBody }>(
        '/v1/sales/deals/:id/close-lost',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) return reply.status(401).send({ code: 'UNAUTHORIZED' });

            const prisma = await resolvePrisma();
            const db = prisma as unknown as PrismaWithDeals;

            const deal = await db.salesDeal.findUnique({ where: { id: request.params.id } });
            if (!deal) return reply.status(404).send({ code: 'DEAL_NOT_FOUND' });
            if (String(deal['tenantId']) !== session.tenantId) return reply.status(403).send({ code: 'FORBIDDEN' });

            const config = await db.salesAgentConfig.findFirst({
                where: { tenantId: session.tenantId, botId: request.body.botId },
            });

            await doCloseDealLost(
                request.params.id,
                session.tenantId,
                String(deal['botId'] ?? request.body.botId),
                request.body.reason ?? 'Manual close-lost',
                (config ?? {}) as unknown as SalesAgentConfigRecord,
                prisma,
            );

            return reply.status(200).send({ closed: true, outcome: 'lost' });
        },
    );

    // -------------------------------------------------------------------------
    // PATCH /sales/deals/:id/stage
    // -------------------------------------------------------------------------
    app.patch<{ Params: DealIdParams; Body: PatchStageBody }>(
        '/v1/sales/deals/:id/stage',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) return reply.status(401).send({ code: 'UNAUTHORIZED' });

            const prisma = await resolvePrisma();
            const db = prisma as unknown as PrismaWithDeals;

            const deal = await db.salesDeal.findUnique({ where: { id: request.params.id } });
            if (!deal) return reply.status(404).send({ code: 'DEAL_NOT_FOUND' });
            if (String(deal['tenantId']) !== session.tenantId) return reply.status(403).send({ code: 'FORBIDDEN' });

            const currentStage = String(deal['stage']) as DealStage;
            const newStage = request.body.stage;

            const allowedNext = VALID_TRANSITIONS[currentStage] ?? [];
            if (!allowedNext.includes(newStage)) {
                return reply.status(422).send({
                    code: 'INVALID_TRANSITION',
                    message: `Cannot transition from ${currentStage} to ${newStage}`,
                });
            }

            const updatedDeal = await db.salesDeal.update({
                where: { id: request.params.id },
                data: { stage: newStage, updatedAt: new Date() },
            });

            // Log SalesActivity
            await db.salesActivity.create({
                data: {
                    tenantId: session.tenantId,
                    botId: String(deal['botId'] ?? request.body.botId),
                    prospectId: String(deal['prospectId']),
                    dealId: request.params.id,
                    activityType: 'note',
                    subject: `Stage updated: ${currentStage} → ${newStage}`,
                    completedAt: new Date(),
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
            });

            // If advancing to negotiation and contractUrl is set, trigger contract invite
            if (newStage === 'negotiation') {
                const config = await db.salesAgentConfig.findFirst({
                    where: { tenantId: session.tenantId, botId: String(deal['botId'] ?? request.body.botId) },
                });
                if (config?.['contractUrl']) {
                    doSendContractInvite(
                        String(deal['prospectId']),
                        request.params.id,
                        session.tenantId,
                        String(deal['botId'] ?? request.body.botId),
                        config as unknown as SalesAgentConfigRecord,
                        prisma,
                    ).catch((err: unknown) =>
                        request.log.warn({ err }, 'sendContractInvite failed — non-critical'),
                    );
                }
            }

            return reply.status(200).send(updatedDeal);
        },
    );

    // -------------------------------------------------------------------------
    // GET /sales/deals — paginated list with prospect name/company
    // -------------------------------------------------------------------------
    app.get('/v1/sales/deals', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) return reply.status(401).send({ code: 'UNAUTHORIZED' });

        const prisma = await resolvePrisma();
        const db = prisma as unknown as PrismaWithDeals;

        const query = request.query as Record<string, string | undefined>;
        const page = Math.max(1, Number(query['page'] ?? 1));
        const limit = Math.min(100, Math.max(1, Number(query['limit'] ?? 20)));
        const skip = (page - 1) * limit;

        const where: Record<string, unknown> = { tenantId: session.tenantId };
        if (query['stage']) where['stage'] = query['stage'];

        const [deals, total] = await Promise.all([
            db.salesDeal.findMany({
                where,
                include: { prospect: true } as unknown as Record<string, unknown>,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
            }),
            db.salesDeal.count({ where }),
        ]);

        return reply.status(200).send({ deals, total, page, limit });
    });

    // -------------------------------------------------------------------------
    // GET /sales/deals/:id — full deal + Prospect + WinLossEvent + ContractEvent
    // -------------------------------------------------------------------------
    app.get<{ Params: DealIdParams }>('/v1/sales/deals/:id', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) return reply.status(401).send({ code: 'UNAUTHORIZED' });

        const prisma = await resolvePrisma();
        const db = prisma as unknown as PrismaWithDeals;

        const deal = await db.salesDeal.findUnique({
            where: { id: request.params.id },
            include: {
                prospect: true,
                winLossEvents: true,
                contractEvents: true,
            } as unknown as Record<string, unknown>,
        });
        if (!deal) return reply.status(404).send({ code: 'DEAL_NOT_FOUND' });
        if (String(deal['tenantId']) !== session.tenantId) return reply.status(403).send({ code: 'FORBIDDEN' });

        return reply.status(200).send(deal);
    });

    // -------------------------------------------------------------------------
    // GET /sales/activities — paginated activity feed
    // -------------------------------------------------------------------------
    app.get('/v1/sales/activities', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) return reply.status(401).send({ code: 'UNAUTHORIZED' });

        const prisma = await resolvePrisma();
        const db = prisma as unknown as PrismaWithDeals;

        const query = request.query as Record<string, string | undefined>;
        const page = Math.max(1, Number(query['page'] ?? 1));
        const limit = Math.min(100, Math.max(1, Number(query['limit'] ?? 50)));
        const skip = (page - 1) * limit;

        const where: Record<string, unknown> = { tenantId: session.tenantId };
        if (query['prospectId']) where['prospectId'] = query['prospectId'];

        const [activities, total] = await Promise.all([
            db.salesActivity.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
            }),
            db.salesActivity.count({ where }),
        ]);

        return reply.status(200).send({ activities, total, page });
    });

    // -------------------------------------------------------------------------
    // GET /sales/stats — win/loss summary stats
    // -------------------------------------------------------------------------
    app.get('/v1/sales/stats', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) return reply.status(401).send({ code: 'UNAUTHORIZED' });

        const prisma = await resolvePrisma();
        const db = prisma as unknown as PrismaWithDeals;

        const [deals, winLossEvents] = await Promise.all([
            db.salesDeal.findMany({ where: { tenantId: session.tenantId }, orderBy: { createdAt: 'desc' } }),
            db.winLossEvent.findMany({ where: { tenantId: session.tenantId } }),
        ]);

        const closedStages = new Set(['closed_won', 'closed_lost']);
        const wonDeals = deals.filter(d => String(d['stage']) === 'closed_won');
        const lostDeals = deals.filter(d => String(d['stage']) === 'closed_lost');
        const openDeals = deals.filter(d => !closedStages.has(String(d['stage'])));

        const totalWon = wonDeals.length;
        const totalLost = lostDeals.length;
        const wonValue = wonDeals.reduce((s, d) => s + Number(d['value'] ?? 0), 0);
        const totalPipelineValue = openDeals.reduce((s, d) => s + Number(d['value'] ?? 0), 0);

        const wonEvents = winLossEvents.filter(
            e => String(e['outcome']) === 'won' && e['daysToClose'] != null,
        );
        const avgDaysToClose =
            wonEvents.length > 0
                ? Math.round(wonEvents.reduce((s, e) => s + Number(e['daysToClose']), 0) / wonEvents.length)
                : 0;

        return reply.status(200).send({ totalWon, totalLost, totalPipelineValue, wonValue, avgDaysToClose });
    });

    // -------------------------------------------------------------------------
    // PATCH /sales/deals/:id/reopen — reopen a closed_lost deal
    // -------------------------------------------------------------------------
    app.patch<{ Params: ReopenParams }>(
        '/v1/sales/deals/:id/reopen',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) return reply.status(401).send({ code: 'UNAUTHORIZED' });

            const prisma = await resolvePrisma();
            const db = prisma as unknown as PrismaWithDeals;

            const deal = await db.salesDeal.findUnique({ where: { id: request.params.id } });
            if (!deal) return reply.status(404).send({ code: 'DEAL_NOT_FOUND' });
            if (String(deal['tenantId']) !== session.tenantId) return reply.status(403).send({ code: 'FORBIDDEN' });

            if (String(deal['stage']) !== 'closed_lost') {
                return reply.status(400).send({
                    code: 'INVALID_STAGE',
                    message: 'Only closed_lost deals can be reopened',
                });
            }

            await db.salesDeal.update({
                where: { id: request.params.id },
                data: { stage: 'discovery', closedAt: null, updatedAt: new Date() },
            });

            await db.prospect.update({
                where: { id: String(deal['prospectId']) },
                data: { status: 'new', updatedAt: new Date() },
            });

            await db.salesActivity.create({
                data: {
                    tenantId: session.tenantId,
                    botId: String(deal['botId']),
                    prospectId: String(deal['prospectId']),
                    dealId: request.params.id,
                    activityType: 'note',
                    subject: 'Deal reopened',
                    completedAt: new Date(),
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
            });

            return reply.status(200).send({ reopened: true });
        },
    );
}
