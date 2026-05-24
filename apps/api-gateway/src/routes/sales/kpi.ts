/**
 * kpi.ts
 *
 * Sprint 21 — KPI Reporting
 *
 * GET /v1/sales/kpi — full KPI report (conversion, retention, funnel, revenue)
 * GET /v1/sales/kpi/funnel — stage-by-stage funnel counts & values
 * GET /v1/sales/kpi/conversion — lead → opportunity → closed_won rates
 * GET /v1/sales/kpi/retention — closed_won customers retained vs. churned
 *
 * All queries are tenant-scoped. Optional ?botId=<id> filters to a single agent.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { SalesFunnelStage, SalesKpiReport } from '@agentfarm/shared-types';

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    role?: string;
    expiresAt: number;
};

export type RegisterKpiRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
    prisma?: PrismaClient;
};

type PrismaWithKpi = {
    salesDeal: {
        findMany: (args: { where: Record<string, unknown> }) => Promise<Record<string, unknown>[]>;
    };
    prospect: {
        count: (args: { where: Record<string, unknown> }) => Promise<number>;
        findMany: (args: { where: Record<string, unknown>; select?: Record<string, unknown> }) => Promise<Record<string, unknown>[]>;
    };
    winLossEvent: {
        findMany: (args: { where: Record<string, unknown> }) => Promise<Record<string, unknown>[]>;
    };
    npsResponse: {
        findMany: (args: { where: Record<string, unknown> }) => Promise<Record<string, unknown>[]>;
    };
};

const STAGES = ['discovery', 'proposal', 'negotiation', 'closed_won', 'closed_lost'] as const;

const getPrisma = async (): Promise<PrismaClient> => {
    const { prisma } = await import('../lib/db.js');
    return prisma;
};

function buildWhere(tenantId: string, botId?: string): Record<string, unknown> {
    const where: Record<string, unknown> = { tenantId };
    if (botId) where['botId'] = botId;
    return where;
}

export async function registerKpiRoutes(
    app: FastifyInstance,
    options: RegisterKpiRoutesOptions,
): Promise<void> {
    const resolvePrisma = options.prisma
        ? () => Promise.resolve(options.prisma!)
        : getPrisma;

    // ── GET /v1/sales/kpi — full report ─────────────────────────────────────
    app.get('/v1/sales/kpi', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) return reply.status(401).send({ code: 'UNAUTHORIZED' });

        const query = request.query as Record<string, string | undefined>;
        const botId = query['botId'];

        const prisma = await resolvePrisma();
        const db = prisma as unknown as PrismaWithKpi;

        const where = buildWhere(session.tenantId, botId);

        // All deals
        const [deals, winLossEvents, prospectCount] = await Promise.all([
            db.salesDeal.findMany({ where }),
            db.winLossEvent.findMany({ where }),
            db.prospect.count({ where }),
        ]);

        // Stage buckets
        const byStage: Record<string, Record<string, unknown>[]> = {};
        for (const stage of STAGES) byStage[stage] = [];
        for (const deal of deals) {
            const s = String(deal['stage'] ?? 'discovery');
            if (!byStage[s]) byStage[s] = [];
            byStage[s].push(deal);
        }

        const wonDeals = byStage['closed_won'] ?? [];
        const lostDeals = byStage['closed_lost'] ?? [];
        const openDeals = deals.filter(d => d['stage'] !== 'closed_won' && d['stage'] !== 'closed_lost');

        const totalLeads = prospectCount;
        const totalOpportunities = deals.length;
        const totalClosedWon = wonDeals.length;
        const totalClosedLost = lostDeals.length;

        const leadToOpportunityRate = totalLeads > 0 ? (totalOpportunities / totalLeads) * 100 : 0;
        const opportunityToWinRate = totalOpportunities > 0 ? (totalClosedWon / totalOpportunities) * 100 : 0;
        const overallConversionRate = totalLeads > 0 ? (totalClosedWon / totalLeads) * 100 : 0;

        const totalWonValue = wonDeals.reduce((s, d) => s + Number(d['value'] ?? 0), 0);
        const avgDealValue = totalClosedWon > 0 ? totalWonValue / totalClosedWon : 0;

        const wonEvents = winLossEvents.filter(e => String(e['outcome']) === 'won' && e['daysToClose'] != null);
        const avgDaysToClose = wonEvents.length > 0
            ? wonEvents.reduce((s, e) => s + Number(e['daysToClose']), 0) / wonEvents.length
            : 0;

        const openPipelineValue = openDeals.reduce((s, d) => s + Number(d['value'] ?? 0), 0);

        // Retention: closed_won customers who have NOT re-appeared as closed_lost
        // (proxy: count prospects with status=closed_won vs those that also have a later closed_lost deal)
        const closedWonProspects = await db.prospect.findMany({
            where: { ...where, status: 'closed_won' },
            select: { id: true } as unknown as Record<string, unknown>,
        });
        const closedWonCount = closedWonProspects.length;

        // Churned = closed_won prospects who have a more recent closed_lost deal
        const churnedCount = lostDeals.filter(deal => {
            const pid = String(deal['prospectId'] ?? '');
            return closedWonProspects.some(p => String(p['id']) === pid);
        }).length;

        const retentionRate = closedWonCount > 0
            ? ((closedWonCount - churnedCount) / closedWonCount) * 100
            : 100;

        // Funnel stages
        const funnel: SalesFunnelStage[] = STAGES.map(stage => ({
            stage,
            count: (byStage[stage] ?? []).length,
            value: (byStage[stage] ?? []).reduce((s: number, d: Record<string, unknown>) => s + Number(d['value'] ?? 0), 0),
        }));

        const report: SalesKpiReport = {
            tenantId: session.tenantId,
            generatedAt: new Date().toISOString(),
            totalLeads,
            totalOpportunities,
            totalClosedWon,
            totalClosedLost,
            leadToOpportunityRate: Math.round(leadToOpportunityRate * 10) / 10,
            opportunityToWinRate: Math.round(opportunityToWinRate * 10) / 10,
            overallConversionRate: Math.round(overallConversionRate * 10) / 10,
            totalWonValue: Math.round(totalWonValue * 100) / 100,
            avgDealValue: Math.round(avgDealValue * 100) / 100,
            avgDaysToClose: Math.round(avgDaysToClose),
            closedWonCount,
            churnedCount,
            retentionRate: Math.round(retentionRate * 10) / 10,
            openPipelineValue: Math.round(openPipelineValue * 100) / 100,
            openDealCount: openDeals.length,
            funnel,
        };

        return reply.status(200).send(report);
    });

    // ── GET /v1/sales/kpi/funnel — stage-by-stage breakdown ─────────────────
    app.get('/v1/sales/kpi/funnel', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) return reply.status(401).send({ code: 'UNAUTHORIZED' });

        const query = request.query as Record<string, string | undefined>;
        const botId = query['botId'];

        const prisma = await resolvePrisma();
        const db = prisma as unknown as PrismaWithKpi;

        const deals = await db.salesDeal.findMany({ where: buildWhere(session.tenantId, botId) });

        const funnel: SalesFunnelStage[] = STAGES.map(stage => {
            const stageDeals = deals.filter(d => String(d['stage'] ?? '') === stage);
            return {
                stage,
                count: stageDeals.length,
                value: stageDeals.reduce((s, d) => s + Number(d['value'] ?? 0), 0),
            };
        });

        return reply.status(200).send({ funnel, generatedAt: new Date().toISOString() });
    });

    // ── GET /v1/sales/kpi/conversion — lead → win conversion rates ──────────
    app.get('/v1/sales/kpi/conversion', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) return reply.status(401).send({ code: 'UNAUTHORIZED' });

        const query = request.query as Record<string, string | undefined>;
        const botId = query['botId'];

        const prisma = await resolvePrisma();
        const db = prisma as unknown as PrismaWithKpi;

        const where = buildWhere(session.tenantId, botId);

        const [totalLeads, deals] = await Promise.all([
            db.prospect.count({ where }),
            db.salesDeal.findMany({ where }),
        ]);

        const wonDeals = deals.filter(d => String(d['stage']) === 'closed_won');
        const lostDeals = deals.filter(d => String(d['stage']) === 'closed_lost');

        return reply.status(200).send({
            totalLeads,
            totalOpportunities: deals.length,
            totalClosedWon: wonDeals.length,
            totalClosedLost: lostDeals.length,
            leadToOpportunityRate: totalLeads > 0 ? Math.round((deals.length / totalLeads) * 1000) / 10 : 0,
            opportunityToWinRate: deals.length > 0 ? Math.round((wonDeals.length / deals.length) * 1000) / 10 : 0,
            overallConversionRate: totalLeads > 0 ? Math.round((wonDeals.length / totalLeads) * 1000) / 10 : 0,
            generatedAt: new Date().toISOString(),
        });
    });

    // ── GET /v1/sales/kpi/retention — closed_won customer retention rate ─────
    app.get('/v1/sales/kpi/retention', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) return reply.status(401).send({ code: 'UNAUTHORIZED' });

        const query = request.query as Record<string, string | undefined>;
        const botId = query['botId'];

        const prisma = await resolvePrisma();
        const db = prisma as unknown as PrismaWithKpi;

        const where = buildWhere(session.tenantId, botId);

        const [closedWonProspects, lostDeals, npsData] = await Promise.all([
            db.prospect.findMany({ where: { ...where, status: 'closed_won' }, select: { id: true } as unknown as Record<string, unknown> }),
            db.salesDeal.findMany({ where: { ...where, stage: 'closed_lost' } }),
            db.npsResponse.findMany({ where: { ...where, respondedAt: { not: null } as unknown as Date } }),
        ]);

        const closedWonCount = closedWonProspects.length;
        const churnedCount = lostDeals.filter(deal =>
            closedWonProspects.some(p => String(p['id']) === String(deal['prospectId'] ?? ''))
        ).length;

        const retentionRate = closedWonCount > 0
            ? Math.round(((closedWonCount - churnedCount) / closedWonCount) * 1000) / 10
            : 100;

        // NPS stats
        const npsScores = npsData
            .filter(n => String(n['surveyType']) === 'nps' && n['score'] != null)
            .map(n => Number(n['score']));
        const promoters = npsScores.filter(s => s >= 9).length;
        const detractors = npsScores.filter(s => s <= 6).length;
        const npsScore = npsScores.length > 0
            ? Math.round(((promoters - detractors) / npsScores.length) * 100)
            : null;

        return reply.status(200).send({
            closedWonCount,
            churnedCount,
            retainedCount: closedWonCount - churnedCount,
            retentionRate,
            npsScore,
            npsResponseCount: npsScores.length,
            generatedAt: new Date().toISOString(),
        });
    });
}
