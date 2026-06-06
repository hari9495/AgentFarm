/**
 * Epic B1: Wake Run Routes (api-gateway surface)
 * Exposes workspace-scoped wake scheduling and run record listing,
 * proxying to the orchestrator service.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { WakeSource } from '@agentfarm/shared-types';

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    expiresAt: number;
};

export type RegisterWakeRunRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
    orchestratorBaseUrl?: string;
};

const VALID_WAKE_SOURCES: WakeSource[] = ['timer', 'assignment', 'on_demand', 'automation', 'proactive_signal', 'agent_handoff'];

const DEFAULT_ORCHESTRATOR_BASE_URL = process.env.ORCHESTRATOR_API_BASE_URL ?? 'http://localhost:3011';

const normalizeBaseUrl = (value: string | undefined): string => {
    const candidate = value?.trim();
    if (!candidate) return DEFAULT_ORCHESTRATOR_BASE_URL;
    return candidate.endsWith('/') ? candidate.slice(0, -1) : candidate;
};

const parseWakeSource = (value: unknown): WakeSource | null => {
    if (VALID_WAKE_SOURCES.includes(value as WakeSource)) return value as WakeSource;
    return null;
};

export const registerWakeRunRoutes = async (
    app: FastifyInstance,
    options: RegisterWakeRunRoutesOptions,
): Promise<void> => {
    const orchestratorBaseUrl = normalizeBaseUrl(options.orchestratorBaseUrl);

    // ── POST /v1/wake/schedule — schedule a wake or coalesce duplicate ──────
    app.post<{
        Body: {
            workspace_id?: string;
            bot_id?: string;
            wake_source?: string;
            dedupe_key?: string;
            interval?: string;
            correlation_id?: string;
            timestamp?: string;
        };
    }>('/v1/wake/schedule', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized', message: 'A valid authenticated session is required.' });
        }

        const workspaceId = request.body?.workspace_id?.trim() ?? '';
        if (!workspaceId || !session.workspaceIds.includes(workspaceId)) {
            return reply.code(403).send({
                error: 'workspace_scope_violation',
                message: 'workspace_id is required and must be in your authenticated session scope.',
            });
        }

        const wakeSource = parseWakeSource(request.body?.wake_source);
        if (!wakeSource) {
            return reply.code(400).send({
                error: 'invalid_wake_source',
                message: 'wake_source must be one of: timer, assignment, on_demand, automation, proactive_signal, agent_handoff.',
            });
        }

        const botId = request.body?.bot_id?.trim() ?? '';
        if (!botId) {
            return reply.code(400).send({ error: 'invalid_request', message: 'bot_id is required.' });
        }

        let response: Response;
        try {
            response = await fetch(`${orchestratorBaseUrl}/v1/wake/schedule`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    tenant_id: session.tenantId,
                    workspace_id: workspaceId,
                    bot_id: botId,
                    wake_source: wakeSource,
                    dedupe_key: request.body?.dedupe_key,
                    interval: request.body?.interval,
                    correlation_id: request.body?.correlation_id,
                    timestamp: request.body?.timestamp,
                }),
            });
        } catch {
            return reply.code(503).send({ error: 'orchestrator_unavailable', message: 'Orchestrator service is not reachable.' });
        }

        const body = await response.json().catch(() => ({
            error: 'upstream_error',
            message: 'Unable to parse orchestrator wake schedule response.',
        }));

        return reply.code(response.status).send(body);
    });

    // ── GET /v1/wake/runs — list run records with wake source + status ───────
    app.get('/v1/wake/runs', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized', message: 'A valid authenticated session is required.' });
        }

        const query = request.query as { workspace_id?: string; bot_id?: string; status?: string };
        const workspaceId = query.workspace_id?.trim() ?? '';

        // Workspace scope check: if workspace_id provided it must belong to session
        if (workspaceId && !session.workspaceIds.includes(workspaceId)) {
            return reply.code(403).send({
                error: 'workspace_scope_violation',
                message: 'workspace_id is not in your authenticated session scope.',
            });
        }

        // Build query params for orchestrator
        const params = new URLSearchParams();
        if (workspaceId) params.set('workspace_id', workspaceId);
        if (query.bot_id?.trim()) params.set('bot_id', query.bot_id.trim());
        if (query.status?.trim()) params.set('status', query.status.trim());

        let response: Response;
        try {
            response = await fetch(`${orchestratorBaseUrl}/v1/wake/runs?${params.toString()}`);
        } catch {
            return reply.code(503).send({ error: 'orchestrator_unavailable', message: 'Orchestrator service is not reachable.', runs: [] });
        }

        const body = await response.json().catch(() => ({
            error: 'upstream_error',
            message: 'Unable to parse orchestrator wake runs response.',
        }));

        return reply.code(response.status).send(body);
    });
};
