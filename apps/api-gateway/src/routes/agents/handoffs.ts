import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AgentHandoffStatus } from '@agentfarm/shared-types';

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    expiresAt: number;
};

type RegisterHandoffRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
    orchestratorBaseUrl?: string;
};

const parseCompletionStatus = (value: unknown): AgentHandoffStatus | null => {
    if (
        value === 'pending'
        || value === 'accepted'
        || value === 'completed'
        || value === 'failed'
        || value === 'timed_out'
    ) {
        return value;
    }
    return null;
};

const DEFAULT_ORCHESTRATOR_BASE_URL = process.env.ORCHESTRATOR_API_BASE_URL ?? 'http://localhost:3011';

const normalizeBaseUrl = (value: string | undefined): string => {
    const candidate = value?.trim();
    if (!candidate) {
        return DEFAULT_ORCHESTRATOR_BASE_URL;
    }
    return candidate.endsWith('/') ? candidate.slice(0, -1) : candidate;
};

export const registerHandoffRoutes = async (
    app: FastifyInstance,
    options: RegisterHandoffRoutesOptions,
): Promise<void> => {
    const orchestratorBaseUrl = normalizeBaseUrl(options.orchestratorBaseUrl);

    app.post<{
        Body: {
            workspace_id?: string;
            task_id?: string;
            from_bot_id?: string;
            to_bot_id?: string;
            reason?: string;
            correlation_id?: string;
            handoff_context?: Record<string, unknown>;
        };
    }>('/v1/handoffs/initiate', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({
                error: 'unauthorized',
                message: 'A valid authenticated session is required.',
            });
        }

        const workspaceId = request.body?.workspace_id?.trim() ?? '';
        if (!workspaceId || !session.workspaceIds.includes(workspaceId)) {
            return reply.code(403).send({
                error: 'workspace_scope_violation',
                message: 'workspace_id is not in your authenticated session scope.',
            });
        }

        const response = await fetch(`${orchestratorBaseUrl}/v1/agent-handoffs`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                tenant_id: session.tenantId,
                workspace_id: workspaceId,
                task_id: request.body?.task_id,
                from_bot_id: request.body?.from_bot_id,
                to_bot_id: request.body?.to_bot_id,
                reason: request.body?.reason,
                correlation_id: request.body?.correlation_id,
                handoff_context: request.body?.handoff_context,
            }),
        });

        const body = await response.json().catch(() => ({
            error: 'upstream_error',
            message: 'Unable to parse orchestrator handoff response.',
        }));

        return reply.code(response.status).send(body);
    });

    app.post<{
        Params: { handoffId: string };
        Body: {
            workspace_id?: string;
            status?: AgentHandoffStatus;
            reason?: string;
            result?: Record<string, unknown>;
            completion_context?: Record<string, unknown>;
        };
    }>(
        '/v1/handoffs/:handoffId/complete',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) {
                return reply.code(401).send({
                    error: 'unauthorized',
                    message: 'A valid authenticated session is required.',
                });
            }

            const workspaceId = request.body?.workspace_id?.trim() ?? '';
            if (!workspaceId || !session.workspaceIds.includes(workspaceId)) {
                return reply.code(403).send({
                    error: 'workspace_scope_violation',
                    message: 'workspace_id is not in your authenticated session scope.',
                });
            }

            const status = parseCompletionStatus(request.body?.status) ?? 'completed';

            const response = await fetch(`${orchestratorBaseUrl}/v1/agent-handoffs/${encodeURIComponent(request.params.handoffId)}/status`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    status,
                    reason: request.body?.reason ?? null,
                    result:
                        typeof request.body?.result === 'object' && request.body.result !== null
                            ? request.body.result
                            : null,
                    completion_context:
                        typeof request.body?.completion_context === 'object' && request.body.completion_context !== null
                            ? request.body.completion_context
                            : null,
                }),
            });

            const body = await response.json().catch(() => ({
                error: 'upstream_error',
                message: 'Unable to parse orchestrator handoff completion response.',
            }));

            return reply.code(response.status).send(body);
        },
    );

    app.get<{ Params: { role: string }; Querystring: { workspace_id?: string } }>('/v1/handoffs/pending/:role', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({
                error: 'unauthorized',
                message: 'A valid authenticated session is required.',
            });
        }

        const workspaceId = request.query?.workspace_id?.trim() ?? '';
        if (!workspaceId || !session.workspaceIds.includes(workspaceId)) {
            return reply.code(403).send({
                error: 'workspace_scope_violation',
                message: 'workspace_id is not in your authenticated session scope.',
            });
        }

        const url = new URL(`${orchestratorBaseUrl}/v1/agent-handoffs`);
        url.searchParams.set('tenant_id', session.tenantId);
        url.searchParams.set('workspace_id', workspaceId);
        url.searchParams.set('status', 'pending');
        url.searchParams.set('limit', '200');

        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: { 'content-type': 'application/json' },
        });

        const body = await response.json().catch(() => ({
            count: 0,
            handoffs: [],
        })) as { count?: number; handoffs?: Array<Record<string, unknown>> };

        const role = request.params.role.trim();
        const filtered = (body.handoffs ?? []).filter((handoff) => handoff['toBotId'] === role);

        return reply.code(response.status).send({
            count: filtered.length,
            handoffs: filtered,
        });
    });
};
