import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';

const getPrisma = async () => {
    const db = await import('../../lib/db.js');
    return db.prisma;
};

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    expiresAt: number;
};

export type RegisterDeliverableRoutesOptions = {
    getSession: (req: FastifyRequest) => SessionContext | null;
    now?: () => number;
    prisma?: PrismaClient;
};

type DeliverablesQuery = {
    bot_id?: string;
    action_type?: string;
    status?: string;
    from?: string;
    to?: string;
    cursor?: string;
    limit?: string;
};

type DeliverableParams = {
    workspaceId: string;
};

const ALLOWED_STATUSES = new Set(['completed', 'failed', 'rejected']);
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const parseLimit = (raw: string | undefined): number => {
    const n = parseInt(raw ?? String(DEFAULT_LIMIT), 10);
    if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT;
    return Math.min(n, MAX_LIMIT);
};

const parseDate = (raw: string | undefined): Date | null => {
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isFinite(d.getTime()) ? d : null;
};

export const registerDeliverableRoutes = async (
    app: FastifyInstance,
    options: RegisterDeliverableRoutesOptions,
): Promise<void> => {
    const resolvePrisma = options.prisma
        ? () => Promise.resolve(options.prisma!)
        : getPrisma;

    // GET /v1/workspaces/:workspaceId/deliverables
    app.get<{ Params: DeliverableParams; Querystring: DeliverablesQuery }>(
        '/v1/workspaces/:workspaceId/deliverables',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) {
                return reply.code(401).send({ error: 'unauthorized' });
            }

            const { workspaceId } = request.params;
            if (!session.workspaceIds.includes(workspaceId)) {
                return reply.code(403).send({
                    error: 'workspace_scope_violation',
                    message: 'workspace_id is not in your authenticated session scope.',
                });
            }

            const limit = parseLimit(request.query.limit);
            const cursor = request.query.cursor?.trim() || undefined;
            const botIdFilter = request.query.bot_id?.trim() || undefined;
            const actionTypeFilter = request.query.action_type?.trim() || undefined;
            const fromDate = parseDate(request.query.from);
            const toDate = parseDate(request.query.to);

            const rawStatus = request.query.status?.trim().toLowerCase();
            const statusFilter = rawStatus && ALLOWED_STATUSES.has(rawStatus) ? rawStatus : 'completed';

            const prisma = await resolvePrisma();

            const where = {
                workspaceId,
                tenantId: session.tenantId,
                status: statusFilter as 'completed' | 'failed' | 'rejected',
                ...(botIdFilter ? { botId: botIdFilter } : {}),
                ...(actionTypeFilter ? { actionType: actionTypeFilter } : {}),
                ...(fromDate || toDate ? {
                    completedAt: {
                        ...(fromDate ? { gte: fromDate } : {}),
                        ...(toDate ? { lte: toDate } : {}),
                    },
                } : {}),
                ...(cursor ? { id: { lt: cursor } } : {}),
            };

            const [records, total] = await Promise.all([
                prisma.actionRecord.findMany({
                    where,
                    orderBy: { completedAt: 'desc' },
                    take: limit + 1,
                    select: {
                        id: true,
                        botId: true,
                        workspaceId: true,
                        actionType: true,
                        riskLevel: true,
                        inputSummary: true,
                        outputSummary: true,
                        status: true,
                        connectorType: true,
                        correlationId: true,
                        createdAt: true,
                        completedAt: true,
                    },
                }),
                prisma.actionRecord.count({ where }),
            ]);

            const hasMore = records.length > limit;
            const page = records.slice(0, limit);
            const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null;

            // Batch-fetch bot roles for display
            const botIds = [...new Set(page.map((r) => r.botId))];
            const bots = await prisma.bot.findMany({
                where: { id: { in: botIds } },
                select: { id: true, role: true },
            });
            const botMap = new Map(bots.map((b) => [b.id, b]));

            const deliverables = page.map((r) => {
                const bot = botMap.get(r.botId);
                return {
                    id: r.id,
                    bot_id: r.botId,
                    bot_role: bot?.role ?? null,
                    bot_name: null,
                    workspace_id: r.workspaceId,
                    action_type: r.actionType,
                    risk_level: r.riskLevel,
                    input_summary: r.inputSummary,
                    output_summary: r.outputSummary ?? null,
                    status: r.status,
                    connector_type: r.connectorType ?? null,
                    correlation_id: r.correlationId,
                    created_at: r.createdAt.toISOString(),
                    completed_at: r.completedAt?.toISOString() ?? null,
                };
            });

            return reply.send({
                deliverables,
                total,
                has_more: hasMore,
                next_cursor: nextCursor,
            });
        },
    );

    // GET /v1/workspaces/:workspaceId/deliverables/action-types
    // Returns distinct action types for filter dropdown
    app.get<{ Params: DeliverableParams }>(
        '/v1/workspaces/:workspaceId/deliverables/action-types',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) {
                return reply.code(401).send({ error: 'unauthorized' });
            }

            const { workspaceId } = request.params;
            if (!session.workspaceIds.includes(workspaceId)) {
                return reply.code(403).send({ error: 'workspace_scope_violation' });
            }

            const prisma = await resolvePrisma();
            const rows = await prisma.$queryRaw<Array<{ actionType: string }>>`
                SELECT DISTINCT "actionType"
                FROM "ActionRecord"
                WHERE "workspaceId" = ${workspaceId}
                  AND "tenantId" = ${session.tenantId}
                  AND "status" = 'completed'
                ORDER BY "actionType" ASC
                LIMIT 50
            `;

            return reply.send({ action_types: rows.map((r) => r.actionType) });
        },
    );
};
