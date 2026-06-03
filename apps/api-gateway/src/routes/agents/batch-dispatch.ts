/**
 * batch-dispatch.ts — Batch task submission.
 *
 * Accepts a task template with {{variable}} placeholders and an array of
 * row objects. Expands each row into a concrete task description and queues
 * all tasks as AgentDispatchRecords linked to one OrchestrationRun.
 *
 * Example:
 *   template: "Research {{name}} at {{company}} and draft outreach email."
 *   rows:     [{ name: "Alice", company: "Acme" }, ...]
 *
 * POST /v1/agents/batch-dispatch
 * GET  /v1/agents/batch-dispatch              (list recent batches)
 * GET  /v1/agents/batch-dispatch/:batchId     (single batch status)
 */

import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';

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

export type RegisterBatchDispatchRoutesOptions = {
    getSession: (req: FastifyRequest) => SessionContext | null;
};

const MAX_ROWS = 200;
const BATCH_SOURCE = 'user:batch-dispatch';

// Expand {{variable}} placeholders in a template string using a row object
function expandTemplate(template: string, row: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
        const value = row[key];
        return value !== undefined ? String(value) : `{{${key}}}`;
    });
}

// Extract variable names from a template string
function extractVariables(template: string): string[] {
    const matches = [...template.matchAll(/\{\{(\w+)\}\}/g)];
    return [...new Set(matches.map((m) => m[1] ?? ''))];
}

type CreateBatchBody = {
    to_agent_id?: unknown;
    workspace_id?: unknown;
    template?: unknown;
    rows?: unknown;
    batch_name?: unknown;
};

type BatchParams = { batchId: string };

export const registerBatchDispatchRoutes = async (
    app: FastifyInstance,
    options: RegisterBatchDispatchRoutesOptions,
): Promise<void> => {

    // ── POST /v1/agents/batch-dispatch — create batch ────────────────────────
    app.post<{ Body: CreateBatchBody }>('/v1/agents/batch-dispatch', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) return reply.code(401).send({ error: 'unauthorized' });

        const { to_agent_id, workspace_id, template, rows, batch_name } = request.body ?? {};

        const toAgentId = typeof to_agent_id === 'string' ? to_agent_id.trim() : '';
        const workspaceId = typeof workspace_id === 'string' ? workspace_id.trim() : '';
        const tmpl = typeof template === 'string' ? template.trim() : '';
        const batchName = typeof batch_name === 'string' ? batch_name.trim() : '';

        if (!toAgentId) return reply.code(400).send({ error: 'to_agent_id is required.' });
        if (!workspaceId) return reply.code(400).send({ error: 'workspace_id is required.' });
        if (!session.workspaceIds.includes(workspaceId)) {
            return reply.code(403).send({ error: 'workspace_scope_violation' });
        }
        if (!tmpl) return reply.code(400).send({ error: 'template is required.' });
        if (!Array.isArray(rows) || rows.length === 0) {
            return reply.code(400).send({ error: 'rows must be a non-empty array.' });
        }
        if (rows.length > MAX_ROWS) {
            return reply.code(400).send({ error: `rows must not exceed ${MAX_ROWS} items.` });
        }

        // Validate all rows are objects
        for (let i = 0; i < rows.length; i++) {
            if (typeof rows[i] !== 'object' || rows[i] === null || Array.isArray(rows[i])) {
                return reply.code(400).send({ error: `rows[${i}] must be an object.` });
            }
        }

        // Verify bot belongs to this tenant
        const prisma = await getPrisma();
        const bot = await prisma.bot.findFirst({
            where: { id: toAgentId, workspace: { tenantId: session.tenantId } },
            select: { id: true, workspaceId: true },
        });
        if (!bot) return reply.code(404).send({ error: 'Agent not found in this tenant.' });

        const variables = extractVariables(tmpl);
        const displayName = batchName || `Batch: ${tmpl.slice(0, 60)}${tmpl.length > 60 ? '…' : ''}`;

        // Create OrchestrationRun for the batch
        const run = await prisma.orchestrationRun.create({
            data: {
                tenantId: session.tenantId,
                workspaceId,
                coordinatorBotId: toAgentId,
                goal: displayName,
                status: 'running',
                subTaskCount: rows.length,
                completedCount: 0,
                failedCount: 0,
            },
        });

        // Create AgentDispatchRecord for each row
        const typedRows = rows as Record<string, string>[];
        const dispatches = await Promise.all(
            typedRows.map(async (row, index) => {
                const taskDescription = expandTemplate(tmpl, row);
                const dispatch = await prisma.agentDispatchRecord.create({
                    data: {
                        id: randomUUID(),
                        fromAgentId: BATCH_SOURCE,
                        toAgentId,
                        workspaceId,
                        tenantId: session.tenantId,
                        taskDescription,
                        status: 'queued',
                        wakeSource: 'batch_dispatch',
                        orchestrationRunId: run.id,
                        subTaskIndex: index,
                    },
                });
                return { dispatch_id: dispatch.id, index, task_description: taskDescription };
            }),
        );

        return reply.code(201).send({
            batch_id: run.id,
            batch_name: displayName,
            to_agent_id: toAgentId,
            workspace_id: workspaceId,
            total: rows.length,
            variables,
            status: 'queued',
            dispatched_at: run.startedAt.toISOString(),
            dispatches,
        });
    });

    // ── POST /v1/agents/batch-dispatch/preview — expand without saving ───────
    app.post<{ Body: { template?: unknown; rows?: unknown } }>(
        '/v1/agents/batch-dispatch/preview',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) return reply.code(401).send({ error: 'unauthorized' });

            const tmpl = typeof request.body?.template === 'string' ? request.body.template.trim() : '';
            const rows = Array.isArray(request.body?.rows) ? request.body.rows : [];

            if (!tmpl) return reply.code(400).send({ error: 'template is required.' });

            const variables = extractVariables(tmpl);
            const preview = (rows as Record<string, string>[]).slice(0, 5).map((row, i) => ({
                index: i,
                task_description: expandTemplate(tmpl, row),
                row,
            }));

            return reply.send({ variables, preview, total: rows.length });
        },
    );

    // ── GET /v1/agents/batch-dispatch — list recent batches ──────────────────
    app.get<{ Querystring: { limit?: string; workspace_id?: string } }>(
        '/v1/agents/batch-dispatch',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) return reply.code(401).send({ error: 'unauthorized' });

            const limit = Math.min(parseInt(request.query.limit ?? '20', 10), 100);
            const workspaceId = request.query.workspace_id?.trim();

            if (workspaceId && !session.workspaceIds.includes(workspaceId)) {
                return reply.code(403).send({ error: 'workspace_scope_violation' });
            }

            const prisma = await getPrisma();
            const runs = await prisma.orchestrationRun.findMany({
                where: {
                    tenantId: session.tenantId,
                    ...(workspaceId ? { workspaceId } : {}),
                    // Filter to batches created via batch-dispatch (wakeSource)
                    dispatches: { some: { wakeSource: 'batch_dispatch' } },
                },
                orderBy: { createdAt: 'desc' },
                take: limit,
                select: {
                    id: true,
                    goal: true,
                    coordinatorBotId: true,
                    workspaceId: true,
                    status: true,
                    subTaskCount: true,
                    completedCount: true,
                    failedCount: true,
                    startedAt: true,
                    completedAt: true,
                },
            });

            return reply.send({ batches: runs });
        },
    );

    // ── GET /v1/agents/batch-dispatch/:batchId — single batch ────────────────
    app.get<{ Params: BatchParams }>(
        '/v1/agents/batch-dispatch/:batchId',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) return reply.code(401).send({ error: 'unauthorized' });

            const prisma = await getPrisma();
            const run = await prisma.orchestrationRun.findFirst({
                where: { id: request.params.batchId, tenantId: session.tenantId },
                include: {
                    dispatches: {
                        select: {
                            id: true,
                            taskDescription: true,
                            status: true,
                            subTaskIndex: true,
                            completedAt: true,
                            result: true,
                        },
                        orderBy: { subTaskIndex: 'asc' },
                    },
                },
            });

            if (!run) return reply.code(404).send({ error: 'batch_not_found' });

            return reply.send({
                batch_id: run.id,
                batch_name: run.goal,
                to_agent_id: run.coordinatorBotId,
                workspace_id: run.workspaceId,
                status: run.status,
                total: run.subTaskCount,
                completed: run.completedCount,
                failed: run.failedCount,
                queued: run.subTaskCount - run.completedCount - run.failedCount,
                started_at: run.startedAt.toISOString(),
                completed_at: run.completedAt?.toISOString() ?? null,
                tasks: run.dispatches.map((d) => ({
                    dispatch_id: d.id,
                    index: d.subTaskIndex ?? 0,
                    task_description: d.taskDescription,
                    status: d.status,
                    completed_at: d.completedAt?.toISOString() ?? null,
                })),
            });
        },
    );
};
