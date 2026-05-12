import type { FastifyInstance, FastifyRequest } from 'fastify';

const getPrisma = async () => {
    const db = await import('../lib/db.js');
    return db.prisma;
};

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    scope?: 'customer' | 'internal';
    expiresAt: number;
};

type RegisterObservabilityRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
    findRuntimeEndpoint?: (input: {
        tenantId: string;
        workspaceId: string;
        botId: string;
    }) => Promise<string | null>;
    fetchImpl?: typeof fetch;
};

const resolveRuntimeToken = (): string | null => {
    return process.env.AGENTFARM_RUNTIME_TASK_SHARED_TOKEN
        ?? process.env.RUNTIME_TASK_SHARED_TOKEN
        ?? process.env.RUNTIME_SERVICE_TOKEN
        ?? null;
};

const findRuntimeEndpoint = async (input: {
    tenantId: string;
    workspaceId: string;
    botId: string;
}): Promise<string | null> => {
    const prisma = await getPrisma();
    const runtime = await prisma.runtimeInstance.findFirst({
        where: {
            tenantId: input.tenantId,
            workspaceId: input.workspaceId,
            botId: input.botId,
            endpoint: {
                not: null,
            },
        },
        orderBy: {
            updatedAt: 'desc',
        },
    });

    return runtime?.endpoint ?? null;
};

const requireWorkspaceSession = (
    request: FastifyRequest,
    options: RegisterObservabilityRoutesOptions,
    workspaceId: string,
): SessionContext | null => {
    const session = options.getSession(request);
    if (!session) {
        return null;
    }
    if (session.scope !== 'internal' && !session.workspaceIds.includes(workspaceId)) {
        return null;
    }
    return session;
};

export const registerObservabilityRoutes = async (
    app: FastifyInstance,
    options: RegisterObservabilityRoutesOptions,
): Promise<void> => {
    const resolveEndpoint = options.findRuntimeEndpoint ?? findRuntimeEndpoint;
    const fetchImpl = options.fetchImpl ?? fetch;

    app.get<{
        Params: { workspaceId: string; sessionId: string };
        Querystring: { tenant_id?: string; bot_id?: string };
    }>('/v1/observability/workspaces/:workspaceId/sessions/:sessionId/actions', async (request, reply) => {
        const workspaceId = request.params.workspaceId?.trim();
        const sessionId = request.params.sessionId?.trim();
        const session = workspaceId ? requireWorkspaceSession(request, options, workspaceId) : null;

        if (!workspaceId || !sessionId) {
            return reply.code(400).send({
                error: 'invalid_request',
                message: 'workspaceId and sessionId are required.',
            });
        }
        if (!session) {
            return reply.code(403).send({
                error: 'workspace_scope_violation',
                message: 'workspace_id is not in your authenticated session scope.',
            });
        }

        const tenantId = request.query?.tenant_id?.trim() || session.tenantId;
        const botId = request.query?.bot_id?.trim();
        if (!botId) {
            return reply.code(400).send({
                error: 'invalid_request',
                message: 'bot_id query parameter is required.',
            });
        }

        const runtimeEndpoint = await resolveEndpoint({
            tenantId,
            workspaceId,
            botId,
        });

        if (!runtimeEndpoint) {
            return reply.code(404).send({
                error: 'runtime_not_found',
                message: 'No runtime endpoint is registered for this workspace and bot.',
            });
        }

        const runtimeUrl = new URL(
            `/runtime/observability/sessions/${encodeURIComponent(sessionId)}/actions`,
            runtimeEndpoint,
        ).toString();

        const runtimeToken = resolveRuntimeToken();
        try {
            const response = await fetchImpl(runtimeUrl, {
                method: 'GET',
                headers: {
                    ...(runtimeToken ? { 'x-runtime-task-token': runtimeToken } : {}),
                },
                signal: AbortSignal.timeout(8_000),
            });

            const payload = await response.json() as Record<string, unknown>;
            if (!response.ok) {
                return reply.code(response.status).send(payload);
            }

            return {
                tenant_id: tenantId,
                workspace_id: workspaceId,
                bot_id: botId,
                ...payload,
            };
        } catch (error) {
            return reply.code(502).send({
                error: 'runtime_request_failed',
                message: error instanceof Error ? error.message : 'Unable to fetch runtime observability actions.',
            });
        }
    });

    app.post<{
        Params: { workspaceId: string };
        Body: {
            tenant_id?: string;
            bot_id?: string;
            provider?: string;
            model?: string;
            action_type?: string;
            correctness_score?: number;
            verified_actions?: number;
            total_actions?: number;
            assertion_passed?: number;
            assertion_total?: number;
            source?: string;
            reason?: string;
            metadata?: Record<string, unknown>;
            task_id?: string;
            correlation_id?: string;
        };
    }>('/v1/observability/workspaces/:workspaceId/quality/correctness', async (request, reply) => {
        const workspaceId = request.params.workspaceId?.trim();
        const session = workspaceId ? requireWorkspaceSession(request, options, workspaceId) : null;

        if (!workspaceId) {
            return reply.code(400).send({
                error: 'invalid_request',
                message: 'workspaceId is required.',
            });
        }
        if (!session) {
            return reply.code(403).send({
                error: 'workspace_scope_violation',
                message: 'workspace_id is not in your authenticated session scope.',
            });
        }

        const tenantId = request.body?.tenant_id?.trim() || session.tenantId;
        const botId = request.body?.bot_id?.trim();
        if (!botId) {
            return reply.code(400).send({
                error: 'invalid_request',
                message: 'bot_id is required.',
            });
        }

        const runtimeEndpoint = await resolveEndpoint({
            tenantId,
            workspaceId,
            botId,
        });

        if (!runtimeEndpoint) {
            return reply.code(404).send({
                error: 'runtime_not_found',
                message: 'No runtime endpoint is registered for this workspace and bot.',
            });
        }

        const runtimeToken = resolveRuntimeToken();
        const runtimeUrl = new URL('/runtime/quality/correctness', runtimeEndpoint).toString();
        try {
            const response = await fetchImpl(runtimeUrl, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    ...(runtimeToken ? { 'x-runtime-task-token': runtimeToken } : {}),
                },
                body: JSON.stringify({
                    provider: request.body?.provider,
                    model: request.body?.model,
                    action_type: request.body?.action_type,
                    correctness_score: request.body?.correctness_score,
                    verified_actions: request.body?.verified_actions,
                    total_actions: request.body?.total_actions,
                    assertion_passed: request.body?.assertion_passed,
                    assertion_total: request.body?.assertion_total,
                    source: request.body?.source,
                    reason: request.body?.reason,
                    metadata: request.body?.metadata,
                    task_id: request.body?.task_id,
                    correlation_id: request.body?.correlation_id,
                }),
                signal: AbortSignal.timeout(8_000),
            });

            const payload = await response.json() as Record<string, unknown>;
            return reply.code(response.status).send(payload);
        } catch (error) {
            return reply.code(502).send({
                error: 'runtime_request_failed',
                message: error instanceof Error ? error.message : 'Unable to post correctness signal to runtime.',
            });
        }
    });
};
