/**
 * task-notify.ts — Task completion notification endpoint.
 *
 * The agent-runtime calls POST /v1/tasks/notify when a task finishes
 * (success or failure). This fires outbound webhooks for task_completed
 * and task_failed event types, enabling customers to stream task results
 * to their own systems (Slack, CRM, Jira, etc.).
 *
 * Auth: HMAC shared token via x-runtime-dispatch-token header.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { dispatchOutboundWebhooks } from '../../lib/webhook-dispatcher.js';

const getPrisma = async () => {
    const db = await import('../../lib/db.js');
    return db.prisma;
};

type NotifyBody = {
    task_id?: string;
    bot_id?: string;
    workspace_id?: string;
    tenant_id?: string;
    outcome?: string;          // 'success' | 'failed' | 'approval_queued'
    duration_ms?: number;
    cost_usd?: number;
    output_summary?: string;
    error_reason?: string;
    correlation_id?: string;
};

export type RegisterTaskNotifyRoutesOptions = {
    getSession?: (req: FastifyRequest) => { tenantId: string } | null;
    dispatchToken?: string;
    now?: () => number;
    prisma?: PrismaClient;
};

const readDispatchToken = (request: FastifyRequest): string | null => {
    const header = request.headers['x-runtime-dispatch-token'];
    if (typeof header === 'string' && header.trim()) return header.trim();
    const auth = request.headers.authorization;
    if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
    return null;
};

export const registerTaskNotifyRoutes = async (
    app: FastifyInstance,
    options: RegisterTaskNotifyRoutesOptions = {},
): Promise<void> => {
    const resolveDispatchToken = () =>
        options.dispatchToken
        ?? process.env.AGENTFARM_RUNTIME_DISPATCH_SHARED_TOKEN
        ?? process.env.RUNTIME_DISPATCH_SHARED_TOKEN
        ?? null;

    const now = options.now ?? (() => Date.now());
    const resolvePrisma = options.prisma
        ? () => Promise.resolve(options.prisma!)
        : getPrisma;

    app.post<{ Body: NotifyBody }>('/v1/tasks/notify', async (request, reply) => {
        // Auth: accept HMAC dispatch token OR an authenticated session
        const providedToken = readDispatchToken(request);
        const dispatchToken = resolveDispatchToken();
        const tokenAuthorized = Boolean(dispatchToken && providedToken === dispatchToken);

        if (!tokenAuthorized && options.getSession) {
            const session = options.getSession(request);
            if (!session) {
                return reply.code(401).send({ error: 'unauthorized' });
            }
        } else if (!tokenAuthorized) {
            return reply.code(401).send({ error: 'unauthorized' });
        }

        const body = request.body ?? {};
        const taskId = body.task_id?.trim();
        const botId = body.bot_id?.trim();
        const workspaceId = body.workspace_id?.trim();
        const tenantId = body.tenant_id?.trim();
        const outcome = body.outcome?.trim() ?? 'success';

        if (!taskId || !botId || !workspaceId || !tenantId) {
            return reply.code(400).send({
                error: 'invalid_request',
                message: 'task_id, bot_id, workspace_id, and tenant_id are required.',
            });
        }

        const timestamp = new Date(now()).toISOString();
        const prisma = await resolvePrisma();

        const isFailure = outcome === 'failed' || outcome === 'failure';

        if (isFailure) {
            void dispatchOutboundWebhooks(
                {
                    tenantId,
                    workspaceId,
                    eventType: 'task_failed',
                    taskId,
                    payload: {
                        eventType: 'task_failed',
                        tenantId,
                        workspaceId,
                        timestamp,
                        taskId,
                        botId,
                        reason: body.error_reason ?? 'Task failed during execution.',
                        correlationId: body.correlation_id ?? null,
                    },
                    timestamp,
                },
                prisma,
            );
        } else {
            void dispatchOutboundWebhooks(
                {
                    tenantId,
                    workspaceId,
                    eventType: 'task_completed',
                    taskId,
                    payload: {
                        eventType: 'task_completed',
                        tenantId,
                        workspaceId,
                        timestamp,
                        taskId,
                        botId,
                        outcome,
                        durationMs: body.duration_ms ?? null,
                        costUsd: body.cost_usd ?? null,
                        outputSummary: body.output_summary ?? null,
                        correlationId: body.correlation_id ?? null,
                    },
                    timestamp,
                },
                prisma,
            );
        }

        return reply.code(202).send({
            accepted: true,
            task_id: taskId,
            event_type: isFailure ? 'task_failed' : 'task_completed',
            timestamp,
        });
    });
};
