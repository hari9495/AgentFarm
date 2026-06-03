import type { FastifyInstance, FastifyRequest } from 'fastify';
import { randomBytes } from 'node:crypto';

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

export type RegisterAgentBudgetRoutesOptions = {
    getSession: (req: FastifyRequest) => SessionContext | null;
};

type BudgetConfigRow = {
    id: string;
    tenantId: string;
    workspaceId: string;
    botId: string;
    dailyLimitUsd: number | null;
    monthlyLimitUsd: number | null;
    enabled: boolean;
    createdAt: Date;
    updatedAt: Date;
};

type SpendRow = {
    totalCost: number | null;
};

export const registerAgentBudgetRoutes = async (
    app: FastifyInstance,
    options: RegisterAgentBudgetRoutesOptions,
): Promise<void> => {

    // GET /v1/agents/:botId/budget — fetch config + current month/day spend
    app.get<{ Params: { botId: string } }>('/v1/agents/:botId/budget', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) return reply.code(401).send({ error: 'unauthorized' });

        const { botId } = request.params;
        const prisma = await getPrisma();

        // Verify bot belongs to this tenant
        const bot = await prisma.bot.findFirst({
            where: { id: botId, workspace: { tenantId: session.tenantId } },
            select: { id: true, workspaceId: true },
        });
        if (!bot) return reply.code(404).send({ error: 'bot_not_found' });

        const [configRows, monthSpendRows, daySpendRows] = await Promise.all([
            prisma.$queryRaw<BudgetConfigRow[]>`
                SELECT * FROM "AgentBudgetConfig"
                WHERE "botId" = ${botId} AND "tenantId" = ${session.tenantId}
                LIMIT 1
            `,
            prisma.$queryRaw<SpendRow[]>`
                SELECT COALESCE(SUM("estimatedCostUsd"), 0) AS "totalCost"
                FROM "TaskExecutionRecord"
                WHERE "botId" = ${botId}
                  AND "tenantId" = ${session.tenantId}
                  AND "executedAt" >= DATE_TRUNC('month', NOW())
            `,
            prisma.$queryRaw<SpendRow[]>`
                SELECT COALESCE(SUM("estimatedCostUsd"), 0) AS "totalCost"
                FROM "TaskExecutionRecord"
                WHERE "botId" = ${botId}
                  AND "tenantId" = ${session.tenantId}
                  AND "executedAt" >= DATE_TRUNC('day', NOW())
            `,
        ]);

        const config = configRows[0] ?? null;
        const monthSpend = Number(monthSpendRows[0]?.totalCost ?? 0);
        const daySpend = Number(daySpendRows[0]?.totalCost ?? 0);

        return reply.send({
            bot_id: botId,
            workspace_id: bot.workspaceId,
            config: config ? {
                id: config.id,
                daily_limit_usd: config.dailyLimitUsd,
                monthly_limit_usd: config.monthlyLimitUsd,
                enabled: config.enabled,
                created_at: config.createdAt,
                updated_at: config.updatedAt,
            } : null,
            spend: {
                month_to_date_usd: monthSpend,
                day_to_date_usd: daySpend,
            },
        });
    });

    // PUT /v1/agents/:botId/budget — upsert budget config
    app.put<{
        Params: { botId: string };
        Body: { daily_limit_usd?: unknown; monthly_limit_usd?: unknown; enabled?: unknown };
    }>('/v1/agents/:botId/budget', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) return reply.code(401).send({ error: 'unauthorized' });

        const { botId } = request.params;
        const { daily_limit_usd, monthly_limit_usd, enabled } = request.body ?? {};

        const dailyLimit =
            daily_limit_usd === null ? null
            : typeof daily_limit_usd === 'number' && daily_limit_usd >= 0 ? daily_limit_usd
            : undefined;

        const monthlyLimit =
            monthly_limit_usd === null ? null
            : typeof monthly_limit_usd === 'number' && monthly_limit_usd >= 0 ? monthly_limit_usd
            : undefined;

        if (dailyLimit === undefined && monthlyLimit === undefined && enabled === undefined) {
            return reply.code(400).send({
                error: 'invalid_request',
                message: 'Provide at least one of: daily_limit_usd, monthly_limit_usd, enabled.',
            });
        }

        const prisma = await getPrisma();
        const bot = await prisma.bot.findFirst({
            where: { id: botId, workspace: { tenantId: session.tenantId } },
            select: { id: true, workspaceId: true },
        });
        if (!bot) return reply.code(404).send({ error: 'bot_not_found' });

        const existing = await prisma.$queryRaw<BudgetConfigRow[]>`
            SELECT id FROM "AgentBudgetConfig"
            WHERE "botId" = ${botId} AND "tenantId" = ${session.tenantId}
            LIMIT 1
        `;

        const now = new Date();
        if (existing.length === 0) {
            const id = randomBytes(12).toString('hex');
            await prisma.$executeRaw`
                INSERT INTO "AgentBudgetConfig"
                    ("id", "tenantId", "workspaceId", "botId",
                     "dailyLimitUsd", "monthlyLimitUsd", "enabled",
                     "createdAt", "updatedAt")
                VALUES (
                    ${id}, ${session.tenantId}, ${bot.workspaceId}, ${botId},
                    ${dailyLimit ?? null},
                    ${monthlyLimit ?? null},
                    ${typeof enabled === 'boolean' ? enabled : true},
                    ${now}, ${now}
                )
            `;
        } else {
            const setClauses: string[] = ['"updatedAt" = NOW()'];
            if (dailyLimit !== undefined)  setClauses.push(`"dailyLimitUsd" = ${dailyLimit === null ? 'NULL' : dailyLimit}`);
            if (monthlyLimit !== undefined) setClauses.push(`"monthlyLimitUsd" = ${monthlyLimit === null ? 'NULL' : monthlyLimit}`);
            if (typeof enabled === 'boolean') setClauses.push(`"enabled" = ${enabled}`);
            await prisma.$executeRawUnsafe(
                `UPDATE "AgentBudgetConfig" SET ${setClauses.join(', ')} WHERE "botId" = $1 AND "tenantId" = $2`,
                botId,
                session.tenantId,
            );
        }

        const updated = await prisma.$queryRaw<BudgetConfigRow[]>`
            SELECT * FROM "AgentBudgetConfig"
            WHERE "botId" = ${botId} AND "tenantId" = ${session.tenantId}
            LIMIT 1
        `;
        const cfg = updated[0];
        return reply.send({
            bot_id: botId,
            config: cfg ? {
                id: cfg.id,
                daily_limit_usd: cfg.dailyLimitUsd,
                monthly_limit_usd: cfg.monthlyLimitUsd,
                enabled: cfg.enabled,
                updated_at: cfg.updatedAt,
            } : null,
        });
    });

    // DELETE /v1/agents/:botId/budget — remove budget cap
    app.delete<{ Params: { botId: string } }>('/v1/agents/:botId/budget', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) return reply.code(401).send({ error: 'unauthorized' });

        const { botId } = request.params;
        const prisma = await getPrisma();

        const bot = await prisma.bot.findFirst({
            where: { id: botId, workspace: { tenantId: session.tenantId } },
            select: { id: true },
        });
        if (!bot) return reply.code(404).send({ error: 'bot_not_found' });

        await prisma.$executeRaw`
            DELETE FROM "AgentBudgetConfig"
            WHERE "botId" = ${botId} AND "tenantId" = ${session.tenantId}
        `;

        return reply.code(204).send();
    });
};
