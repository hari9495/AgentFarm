/**
 * Epic B4: Feature-Flagged Routine Scheduler (api-gateway surface)
 *
 * Exposes workspace-scoped endpoints for managing the orchestrator's
 * RoutineScheduler: feature-flag control, scheduled task creation,
 * run triggering, and error visibility.
 *
 * All mutating routes require an authenticated session with workspace scope.
 * Feature-flag admin routes require the `admin` role or higher.
 *
 * Proxies to the orchestrator via ORCHESTRATOR_API_BASE_URL.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    role?: string;
    expiresAt: number;
};

export type RegisterRoutineSchedulerRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
    orchestratorBaseUrl?: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_ORCHESTRATOR_BASE_URL = process.env.ORCHESTRATOR_API_BASE_URL ?? 'http://localhost:3011';

const normalizeBaseUrl = (value: string | undefined): string => {
    const candidate = value?.trim();
    if (!candidate) return DEFAULT_ORCHESTRATOR_BASE_URL;
    return candidate.endsWith('/') ? candidate.slice(0, -1) : candidate;
};

const VALID_CONCURRENCY_POLICIES = ['queue', 'replace', 'skip'] as const;
type ConcurrencyPolicy = (typeof VALID_CONCURRENCY_POLICIES)[number];

const parseConcurrencyPolicy = (value: unknown): ConcurrencyPolicy | null => {
    if (VALID_CONCURRENCY_POLICIES.includes(value as ConcurrencyPolicy)) return value as ConcurrencyPolicy;
    return null;
};

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export const registerRoutineSchedulerRoutes = async (
    app: FastifyInstance,
    options: RegisterRoutineSchedulerRoutesOptions,
): Promise<void> => {
    const orchestratorBaseUrl = normalizeBaseUrl(options.orchestratorBaseUrl);

    // ── POST /v1/runtime-flags/:flagKey/enable — admin: enable feature flag ─
    app.post('/v1/runtime-flags/:flagKey/enable', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized', message: 'A valid authenticated session is required.' });
        }

        // Only admin role may toggle feature flags
        if (session.role !== 'admin') {
            return reply.code(403).send({
                error: 'insufficient_role',
                required: 'admin',
                actual: session.role ?? 'none',
            });
        }

        const { flagKey } = request.params as { flagKey: string };
        if (!flagKey?.trim()) {
            return reply.code(400).send({ error: 'invalid_request', message: 'flagKey path param is required.' });
        }

        const response = await fetch(`${orchestratorBaseUrl}/v1/feature-flags/${encodeURIComponent(flagKey)}/enable`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
        });

        const body = await response.json().catch(() => ({
            error: 'upstream_error',
            message: 'Unable to parse orchestrator feature-flag response.',
        }));

        return reply.code(response.status).send(body);
    });

    // ── POST /v1/runtime-flags/:flagKey/disable — admin: disable feature flag
    app.post('/v1/runtime-flags/:flagKey/disable', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized', message: 'A valid authenticated session is required.' });
        }

        if (session.role !== 'admin') {
            return reply.code(403).send({
                error: 'insufficient_role',
                required: 'admin',
                actual: session.role ?? 'none',
            });
        }

        const { flagKey } = request.params as { flagKey: string };
        if (!flagKey?.trim()) {
            return reply.code(400).send({ error: 'invalid_request', message: 'flagKey path param is required.' });
        }

        const response = await fetch(`${orchestratorBaseUrl}/v1/feature-flags/${encodeURIComponent(flagKey)}/disable`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
        });

        const body = await response.json().catch(() => ({
            error: 'upstream_error',
            message: 'Unable to parse orchestrator feature-flag response.',
        }));

        return reply.code(response.status).send(body);
    });

    // ── POST /v1/routine-tasks — create a workspace-scoped scheduled task ───
    app.post<{
        Body: {
            workspace_id?: string;
            bot_id?: string;
            schedule_type?: string;
            schedule_expression?: string;
            task_payload?: Record<string, unknown>;
            policy?: {
                dedupe_key?: string;
                concurrency_policy?: string;
                max_retries?: number;
                retry_backoff_ms?: number;
            };
            policy_pack_version?: string;
            feature_flag_key?: string;
            correlation_id?: string;
        };
    }>('/v1/routine-tasks', async (request, reply) => {
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

        const botId = request.body?.bot_id?.trim() ?? '';
        if (!botId) {
            return reply.code(400).send({ error: 'invalid_request', message: 'bot_id is required.' });
        }

        const scheduleType = request.body?.schedule_type?.trim() ?? '';
        const scheduleExpression = request.body?.schedule_expression?.trim() ?? '';
        if (!scheduleType || !scheduleExpression) {
            return reply.code(400).send({
                error: 'invalid_request',
                message: 'schedule_type and schedule_expression are required.',
            });
        }

        const policy = request.body?.policy ?? {};
        const concurrencyPolicy = parseConcurrencyPolicy(policy.concurrency_policy);
        if (!concurrencyPolicy) {
            return reply.code(400).send({
                error: 'invalid_policy',
                message: 'policy.concurrency_policy must be one of: queue, replace, skip.',
            });
        }

        const dedupeKey = policy.dedupe_key?.trim() ?? '';
        if (!dedupeKey) {
            return reply.code(400).send({
                error: 'invalid_policy',
                message: 'policy.dedupe_key is required.',
            });
        }

        const response = await fetch(`${orchestratorBaseUrl}/v1/schedules`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                tenant_id: session.tenantId,
                workspace_id: workspaceId,
                bot_id: botId,
                schedule_type: scheduleType,
                schedule_expression: scheduleExpression,
                task_payload: request.body?.task_payload ?? {},
                policy: {
                    dedupe_key: dedupeKey,
                    concurrency_policy: concurrencyPolicy,
                    max_retries: typeof policy.max_retries === 'number' ? policy.max_retries : 0,
                    retry_backoff_ms: typeof policy.retry_backoff_ms === 'number' ? policy.retry_backoff_ms : 0,
                },
                policy_pack_version: request.body?.policy_pack_version ?? 'control_plane_v1',
                feature_flag_key: request.body?.feature_flag_key ?? 'scheduler.routine_tasks',
                correlation_id: request.body?.correlation_id,
            }),
        });

        const body = await response.json().catch(() => ({
            error: 'upstream_error',
            message: 'Unable to parse orchestrator scheduled task response.',
        }));

        return reply.code(response.status).send(body);
    });

    // ── GET /v1/routine-tasks/:id — get a scheduled task ────────────────────
    app.get('/v1/routine-tasks/:id', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized', message: 'A valid authenticated session is required.' });
        }

        const { id } = request.params as { id: string };

        const response = await fetch(`${orchestratorBaseUrl}/v1/schedules/${encodeURIComponent(id)}`);

        if (response.status === 404) {
            return reply.code(404).send({ error: 'not_found', message: 'Scheduled task not found.' });
        }

        const body = await response.json().catch(() => ({
            error: 'upstream_error',
            message: 'Unable to parse orchestrator response.',
        }));

        // Tenant isolation — if the task does not belong to this session's tenant, 404
        if (response.ok && typeof body === 'object' && body !== null) {
            const task = body as Record<string, unknown>;
            if (task.tenantId !== session.tenantId) {
                return reply.code(404).send({ error: 'not_found', message: 'Scheduled task not found.' });
            }
        }

        return reply.code(response.status).send(body);
    });

    // ── GET /v1/bots/:botId/routine-tasks — list scheduled tasks for bot ────
    app.get('/v1/bots/:botId/routine-tasks', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized', message: 'A valid authenticated session is required.' });
        }

        const { botId } = request.params as { botId: string };

        const response = await fetch(`${orchestratorBaseUrl}/v1/bots/${encodeURIComponent(botId)}/schedules`);

        const body = await response.json().catch(() => ({
            error: 'upstream_error',
            message: 'Unable to parse orchestrator response.',
        }));

        return reply.code(response.status).send(body);
    });

    // ── POST /v1/routine-tasks/:id/runs — trigger a scheduled run ───────────
    app.post<{
        Body: { correlation_id?: string };
    }>('/v1/routine-tasks/:id/runs', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized', message: 'A valid authenticated session is required.' });
        }

        const { id } = request.params as { id: string };

        const response = await fetch(`${orchestratorBaseUrl}/v1/schedules/${encodeURIComponent(id)}/runs`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ correlation_id: request.body?.correlation_id }),
        });

        const body = await response.json().catch(() => ({
            error: 'upstream_error',
            message: 'Unable to parse orchestrator response.',
        }));

        return reply.code(response.status).send(body);
    });

    // ── POST /v1/routine-tasks/:id/runs/:runId/complete — complete a run ────
    app.post<{
        Body: { final_status?: string; correlation_id?: string };
    }>('/v1/routine-tasks/:id/runs/:runId/complete', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized', message: 'A valid authenticated session is required.' });
        }

        const { id, runId } = request.params as { id: string; runId: string };

        const response = await fetch(
            `${orchestratorBaseUrl}/v1/schedules/${encodeURIComponent(id)}/runs/${encodeURIComponent(runId)}/complete`,
            {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    final_status: request.body?.final_status,
                    correlation_id: request.body?.correlation_id,
                }),
            },
        );

        const body = await response.json().catch(() => ({
            error: 'upstream_error',
            message: 'Unable to parse orchestrator response.',
        }));

        return reply.code(response.status).send(body);
    });

    // ── GET /v1/routine-scheduler/errors — recent scheduler error log ───────
    app.get('/v1/routine-scheduler/errors', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized', message: 'A valid authenticated session is required.' });
        }

        if (session.role !== 'admin') {
            return reply.code(403).send({
                error: 'insufficient_role',
                required: 'admin',
                actual: session.role ?? 'none',
            });
        }

        const query = request.query as { limit?: string };
        const limitParam = query.limit ? Number(query.limit) : 10;
        const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.floor(limitParam) : 10;

        const response = await fetch(`${orchestratorBaseUrl}/v1/scheduler/errors?limit=${limit}`);

        const body = await response.json().catch(() => ({
            error: 'upstream_error',
            message: 'Unable to parse orchestrator scheduler errors.',
        }));

        return reply.code(response.status).send(body);
    });
};
