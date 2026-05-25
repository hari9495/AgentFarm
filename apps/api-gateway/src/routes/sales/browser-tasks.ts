import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { BrowserTaskRecord, BrowserTaskRequest, SalesAgentConfigRecord } from '@agentfarm/shared-types';
import { runBrowserTask } from '@agentfarm/agent-runtime/sales/browser-executor.js';

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    role?: string;
    expiresAt: number;
};

export type RegisterBrowserTasksRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
    prisma?: PrismaClient;
    runBrowserTaskFn?: typeof runBrowserTask;
};

type PrismaWithBrowser = {
    browserTask: {
        create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }>;
        update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<{ id: string }>;
        findUnique: (args: { where: { id: string } }) => Promise<Record<string, unknown> | null>;
        findMany: (args: {
            where: Record<string, unknown>;
            skip?: number;
            take?: number;
            orderBy?: Record<string, unknown>;
        }) => Promise<Record<string, unknown>[]>;
        count: (args: { where: Record<string, unknown> }) => Promise<number>;
    };
    salesAgentConfig: {
        findFirst: (args: { where: Record<string, unknown> }) => Promise<Record<string, unknown> | null>;
    };
};

type TaskIdParams = { id: string };
type CreateBody = { botId: string; goal: string; prospectId?: string; dealId?: string };
type ListQuery = { page?: string; limit?: string; botId?: string };

const getPrisma = async (): Promise<PrismaClient> => {
    const { prisma } = await import('../../lib/db.js');
    return prisma;
};

function parseSteps(raw: unknown): BrowserTaskRecord['steps'] {
    if (!raw) return [];
    if (typeof raw === 'string') {
        try { return JSON.parse(raw) as BrowserTaskRecord['steps']; } catch { return []; }
    }
    if (Array.isArray(raw)) return raw as BrowserTaskRecord['steps'];
    return [];
}

function rowToRecord(row: Record<string, unknown>): BrowserTaskRecord {
    return {
        id: String(row['id'] ?? ''),
        tenantId: String(row['tenantId'] ?? ''),
        botId: String(row['botId'] ?? ''),
        prospectId: row['prospectId'] != null ? String(row['prospectId']) : null,
        dealId: row['dealId'] != null ? String(row['dealId']) : null,
        goal: String(row['goal'] ?? ''),
        allowedDomain: row['allowedDomain'] != null ? String(row['allowedDomain']) : null,
        status: (row['status'] as BrowserTaskRecord['status']) ?? 'pending',
        steps: parseSteps(row['steps']),
        result: row['result'] != null ? String(row['result']) : null,
        errorMessage: row['errorMessage'] != null ? String(row['errorMessage']) : null,
        startedAt: row['startedAt'] ? new Date(row['startedAt'] as string) : null,
        completedAt: row['completedAt'] ? new Date(row['completedAt'] as string) : null,
        createdAt: new Date(row['createdAt'] as string),
        updatedAt: new Date(row['updatedAt'] as string),
    };
}

export async function registerBrowserTasksRoutes(
    app: FastifyInstance,
    options: RegisterBrowserTasksRoutesOptions,
): Promise<void> {
    const resolvePrisma = options.prisma
        ? () => Promise.resolve(options.prisma!)
        : getPrisma;

    const doRunBrowserTask = options.runBrowserTaskFn ?? runBrowserTask;

    // -------------------------------------------------------------------------
    // POST /v1/sales/browser-tasks   — fire-and-forget, 202 Accepted
    // -------------------------------------------------------------------------
    app.post<{ Body: CreateBody }>(
        '/v1/sales/browser-tasks',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) return reply.code(401).send({ error: 'unauthorized' });

            const { botId, goal, prospectId, dealId } = request.body ?? {};
            if (!botId || !goal) {
                return reply.code(400).send({ error: 'botId and goal are required' });
            }

            const prisma = await resolvePrisma();
            const db = prisma as unknown as PrismaWithBrowser;

            // Load config — required for domain allowlist + enabled gate
            const configRow = await db.salesAgentConfig.findFirst({
                where: { tenantId: session.tenantId, botId },
            });
            if (!configRow) {
                return reply.code(404).send({ error: 'SalesAgentConfig not found for botId' });
            }
            const config = configRow as unknown as SalesAgentConfigRecord;

            const req: BrowserTaskRequest = {
                tenantId: session.tenantId,
                botId,
                goal,
                prospectId: prospectId ?? undefined,
                dealId: dealId ?? undefined,
            };

            // Fire-and-forget — return 202 immediately with a task ID stub
            // The executor creates the DB record synchronously but the browser
            // run is awaited in background.
            const taskPromise = doRunBrowserTask(req, config, prisma);

            // Return 202 with a reference that the dashboard can poll
            taskPromise.catch((err: unknown) => {
                app.log.error({ err }, '[browser-tasks] background task error');
            });

            // Peek at the created record (it's fast — just the DB create, not the browser run)
            const result = await taskPromise;
            return reply.code(202).send({ taskId: result.id, status: result.status });
        },
    );

    // -------------------------------------------------------------------------
    // GET /v1/sales/browser-tasks/:id
    // -------------------------------------------------------------------------
    app.get<{ Params: TaskIdParams }>(
        '/v1/sales/browser-tasks/:id',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) return reply.code(401).send({ error: 'unauthorized' });

            const { id } = request.params;
            const prisma = await resolvePrisma();
            const db = prisma as unknown as PrismaWithBrowser;

            const row = await db.browserTask.findUnique({ where: { id } });
            if (!row || String(row['tenantId']) !== session.tenantId) {
                return reply.code(404).send({ error: 'task not found' });
            }

            return reply.send(rowToRecord(row));
        },
    );

    // -------------------------------------------------------------------------
    // GET /v1/sales/browser-tasks   — paginated list
    // -------------------------------------------------------------------------
    app.get<{ Querystring: ListQuery }>(
        '/v1/sales/browser-tasks',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) return reply.code(401).send({ error: 'unauthorized' });

            const page = Math.max(1, parseInt(request.query.page ?? '1', 10));
            const limit = Math.min(50, Math.max(1, parseInt(request.query.limit ?? '25', 10)));
            const skip = (page - 1) * limit;

            const where: Record<string, unknown> = { tenantId: session.tenantId };
            if (request.query.botId) where['botId'] = request.query.botId;

            const prisma = await resolvePrisma();
            const db = prisma as unknown as PrismaWithBrowser;

            const [rows, total] = await Promise.all([
                db.browserTask.findMany({
                    where,
                    skip,
                    take: limit,
                    orderBy: { createdAt: 'desc' } as Record<string, unknown>,
                }),
                db.browserTask.count({ where }),
            ]);

            return reply.send({
                tasks: rows.map(rowToRecord),
                total,
                page,
                limit,
            });
        },
    );
}
