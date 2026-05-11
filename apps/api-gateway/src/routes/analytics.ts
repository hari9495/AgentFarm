import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { ROLE_RANK } from '../lib/require-role.js';

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

export type RegisterAnalyticsRoutesOptions = {
    getSession: (req: FastifyRequest) => SessionContext | null;
    prisma?: PrismaClient;
};

type AgentPerfQuery = {
    tenantId?: string;
    from?: string;
    to?: string;
    workspaceId?: string;
};

type CostSummaryQuery = {
    tenantId?: string;
    from?: string;
    to?: string;
};

const MAX_RANGE_MS = 90 * 24 * 60 * 60 * 1000;

const parseDateParam = (value: string | undefined): Date | null => {
    if (!value) {
        return null;
    }
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) {
        return null;
    }
    return parsed;
};

const computeWeeklyTrend = (
    records: Array<{ outcome: string; estimatedCostUsd: number | null; executedAt: Date }>,
): Array<{ weekStart: string; taskCount: number; successCount: number; totalCostUsd: number }> => {
    const weeklyMap: Record<string, { taskCount: number; successCount: number; totalCostUsd: number }> = {};
    for (const r of records) {
        const d = new Date(r.executedAt);
        const day = d.getDay(); // 0=Sun
        const diff = (day === 0 ? -6 : 1) - day;
        const weekStart = new Date(d);
        weekStart.setDate(d.getDate() + diff);
        weekStart.setHours(0, 0, 0, 0);
        const key = weekStart.toISOString().slice(0, 10);
        if (!weeklyMap[key]) weeklyMap[key] = { taskCount: 0, successCount: 0, totalCostUsd: 0 };
        weeklyMap[key].taskCount++;
        if (r.outcome === 'success') weeklyMap[key].successCount++;
        weeklyMap[key].totalCostUsd += r.estimatedCostUsd ?? 0;
    }
    return Object.entries(weeklyMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([weekStart, v]) => ({ weekStart, ...v }));
};

const computeByProvider = (
    records: Array<{ modelProvider: string; estimatedCostUsd: number | null; latencyMs: number }>,
): Record<string, { taskCount: number; totalCostUsd: number; avgLatencyMs: number }> => {
    const byProvider: Record<string, { taskCount: number; totalCostUsd: number; avgLatencyMs: number }> = {};
    for (const r of records) {
        const p = r.modelProvider;
        if (!byProvider[p]) byProvider[p] = { taskCount: 0, totalCostUsd: 0, avgLatencyMs: 0 };
        byProvider[p].taskCount++;
        byProvider[p].totalCostUsd += r.estimatedCostUsd ?? 0;
        byProvider[p].avgLatencyMs += r.latencyMs;
    }
    for (const p of Object.keys(byProvider)) {
        byProvider[p].avgLatencyMs = Math.round(byProvider[p].avgLatencyMs / byProvider[p].taskCount);
    }
    return byProvider;
};

export const registerAnalyticsRoutes = async (
    app: FastifyInstance,
    options: RegisterAnalyticsRoutesOptions,
): Promise<void> => {
    const resolvePrisma = options.prisma
        ? () => Promise.resolve(options.prisma!)
        : getPrisma;

    // -----------------------------------------------------------------------
    // GET /v1/analytics/agent-performance
    // -----------------------------------------------------------------------
    app.get<{ Querystring: AgentPerfQuery }>('/v1/analytics/agent-performance', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({
                error: 'unauthorized',
                message: 'A valid authenticated session is required.',
            });
        }
        if ((ROLE_RANK[session.role ?? ''] ?? 0) < (ROLE_RANK['viewer'] ?? 99)) {
            return reply.code(403).send({ error: 'insufficient_role', required: 'viewer', actual: session.role });
        }

        const tenantId = request.query.tenantId;
        if (!tenantId) {
            return reply.code(400).send({
                error: 'invalid_request',
                message: 'tenantId is required.',
            });
        }

        if (tenantId !== session.tenantId) {
            return reply.code(403).send({
                error: 'forbidden',
                message: 'tenantId does not match session.',
            });
        }

        const toDate = parseDateParam(request.query.to) ?? new Date();
        const fromDate = parseDateParam(request.query.from) ?? new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);

        if (toDate.getTime() - fromDate.getTime() > MAX_RANGE_MS) {
            return reply.code(400).send({
                error: 'date_range_exceeded',
                message: 'Date range must not exceed 90 days.',
            });
        }

        const workspaceId = request.query.workspaceId;
        const db = await resolvePrisma();

        const where = {
            tenantId,
            executedAt: { gte: fromDate, lte: toDate },
            ...(workspaceId ? { workspaceId } : {}),
        };

        const records = await db.taskExecutionRecord.findMany({
            where,
            select: {
                outcome: true,
                latencyMs: true,
                estimatedCostUsd: true,
                promptTokens: true,
                completionTokens: true,
                totalTokens: true,
                modelProvider: true,
                modelTier: true,
                executedAt: true,
            },
        }) as Array<{
            outcome: string;
            latencyMs: number;
            estimatedCostUsd: number | null;
            promptTokens: number | null;
            completionTokens: number | null;
            totalTokens: number | null;
            modelProvider: string;
            modelTier: string | null;
            executedAt: Date;
        }>;

        const qualitySignals = await db.qualitySignalLog.findMany({
            where: {
                tenantId,
                recordedAt: { gte: fromDate, lte: toDate },
                ...(workspaceId ? { workspaceId } : {}),
            },
            select: { score: true, signalType: true },
        }) as Array<{ score: number | null; signalType: string | null }>;

        const taskCount = records.length;
        const successCount = records.filter((r) => r.outcome === 'success').length;
        const successRate = taskCount > 0 ? successCount / taskCount : null;
        const avgLatencyMs = taskCount > 0
            ? Math.round(records.reduce((s, r) => s + r.latencyMs, 0) / taskCount)
            : null;
        const totalCostUsd = records.reduce((s, r) => s + (r.estimatedCostUsd ?? 0), 0);
        const avgCostUsd = taskCount > 0 ? totalCostUsd / taskCount : null;
        const totalTokens = records.reduce((s, r) => s + (r.totalTokens ?? 0), 0);

        const byProvider = computeByProvider(records);
        const weeklyTrend = computeWeeklyTrend(records);

        const scoredSignals = qualitySignals.filter((s) => s.score !== null);
        const avgQualityScore = scoredSignals.length > 0
            ? scoredSignals.reduce((s, q) => s + (q.score ?? 0), 0) / scoredSignals.length
            : null;

        return reply.send({
            tenantId,
            from: fromDate.toISOString(),
            to: toDate.toISOString(),
            taskCount,
            successRate,
            avgLatencyMs,
            totalCostUsd,
            avgCostUsd,
            totalTokens,
            avgQualityScore,
            byProvider,
            weeklyTrend,
        });
    });

    // -----------------------------------------------------------------------
    // GET /v1/analytics/cost-summary
    // -----------------------------------------------------------------------
    app.get<{ Querystring: CostSummaryQuery }>('/v1/analytics/cost-summary', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({
                error: 'unauthorized',
                message: 'A valid authenticated session is required.',
            });
        }
        if ((ROLE_RANK[session.role ?? ''] ?? 0) < (ROLE_RANK['viewer'] ?? 99)) {
            return reply.code(403).send({ error: 'insufficient_role', required: 'viewer', actual: session.role });
        }

        const tenantId = request.query.tenantId;
        if (!tenantId) {
            return reply.code(400).send({
                error: 'invalid_request',
                message: 'tenantId is required.',
            });
        }

        if (tenantId !== session.tenantId) {
            return reply.code(403).send({
                error: 'forbidden',
                message: 'tenantId does not match session.',
            });
        }

        const toDate = parseDateParam(request.query.to) ?? new Date();
        const fromDate = parseDateParam(request.query.from) ?? new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);

        if (toDate.getTime() - fromDate.getTime() > MAX_RANGE_MS) {
            return reply.code(400).send({
                error: 'date_range_exceeded',
                message: 'Date range must not exceed 90 days.',
            });
        }

        const db = await resolvePrisma();

        const records = await db.taskExecutionRecord.findMany({
            where: {
                tenantId,
                executedAt: { gte: fromDate, lte: toDate },
            },
            select: {
                outcome: true,
                latencyMs: true,
                estimatedCostUsd: true,
                promptTokens: true,
                completionTokens: true,
                totalTokens: true,
                modelProvider: true,
                modelTier: true,
                executedAt: true,
            },
        }) as Array<{
            outcome: string;
            latencyMs: number;
            estimatedCostUsd: number | null;
            promptTokens: number | null;
            completionTokens: number | null;
            totalTokens: number | null;
            modelProvider: string;
            modelTier: string | null;
            executedAt: Date;
        }>;

        const taskCount = records.length;
        const successCount = records.filter((r) => r.outcome === 'success').length;
        const successRate = taskCount > 0 ? successCount / taskCount : null;
        const totalCostUsd = records.reduce((s, r) => s + (r.estimatedCostUsd ?? 0), 0);

        const byProvider = computeByProvider(records);
        const weeklyTrend = computeWeeklyTrend(records);

        return reply.send({
            tenantId,
            from: fromDate.toISOString(),
            to: toDate.toISOString(),
            taskCount,
            totalCostUsd,
            totalPromptTokens: records.reduce((s, r) => s + (r.promptTokens ?? 0), 0),
            totalCompletionTokens: records.reduce((s, r) => s + (r.completionTokens ?? 0), 0),
            successRate,
            byProvider: Object.entries(byProvider).map(([provider, v]) => ({ provider, ...v })),
            weeklyTrend,
        });
    });
};
