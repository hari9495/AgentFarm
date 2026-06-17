import type { FastifyInstance, FastifyRequest } from 'fastify';

const getPrisma = async () => {
    const db = await import('../../lib/db.js');
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
    /** Customer-portal session fallback (portal_session cookie). Always treated
     *  as customer scope so portal users are tenant-locked and get redacted views. */
    getPortalSession?: (cookies: string) => Promise<{ userId: string; tenantId: string; workspaceIds: string[]; expiresAt: number } | null>;
    findRuntimeEndpoint?: (input: {
        tenantId: string;
        workspaceId: string;
        botId: string;
    }) => Promise<string | null>;
    fetchImpl?: typeof fetch;
    /** Langfuse connection override (defaults to env). Injectable for tests. */
    langfuse?: { host: string; publicKey: string; secretKey: string };
    /** Axiom QUERY connection (read). Defaults to env. Injectable for tests.
     *  Note: this needs a QUERY-scoped token (AXIOM_QUERY_TOKEN), distinct from
     *  the ingest token the collector/audit-mirror use. */
    axiomQuery?: { url: string; token: string };
};

// ─── Axiom query proxy (infra logs/metrics per customer) ───────────────────────
//
// Reads Docker/app/audit telemetry from Axiom for the dashboards. The query
// token lives server-side. Customers are tenant-locked (tenant.id forced to
// session.tenantId); internal operators may scope to a tenant or see all.

type AxiomQueryConn = { url: string; token: string };

const resolveAxiomQuery = (options: RegisterObservabilityRoutesOptions): AxiomQueryConn | null => {
    const url = (options.axiomQuery?.url ?? process.env['AXIOM_URL'] ?? 'https://api.axiom.co').replace(/\/+$/, '');
    // Prefer a query-scoped token; fall back to the general token if that's all there is.
    const token = options.axiomQuery?.token ?? process.env['AXIOM_QUERY_TOKEN'] ?? process.env['AXIOM_TOKEN'] ?? '';
    if (!token.trim()) return null;
    return { url, token };
};

/** Escape a string for safe embedding in an APL double-quoted literal. */
const aplString = (value: string): string => `"${value.replace(/["\\]/g, '\\$&')}"`;

/**
 * Resolve either an API session (internal/customer scope) or a customer-portal
 * session. Portal sessions are forced to customer scope so they are tenant
 * -locked and receive redacted (metadata-only) trace views.
 */
const resolveAnySession = async (
    request: FastifyRequest,
    options: RegisterObservabilityRoutesOptions,
): Promise<SessionContext | null> => {
    const apiSession = options.getSession(request);
    if (apiSession) return apiSession;
    if (options.getPortalSession) {
        const cookies = typeof request.headers.cookie === 'string' ? request.headers.cookie : '';
        const portal = await options.getPortalSession(cookies);
        if (portal) {
            return { ...portal, scope: 'customer' };
        }
    }
    return null;
};

// ─── Langfuse trace proxy ──────────────────────────────────────────────────────
//
// Surfaces Langfuse LLM traces in the dashboards WITHOUT exposing the Langfuse
// API key to the browser. The key lives here, server-side. Customer sessions
// are hard-scoped to their own tenant: the Langfuse `userId` filter is forced
// to session.tenantId (we set userId=tenantId when emitting traces), and any
// client-supplied tenant is ignored. Internal operators may pass ?tenantId to
// view one tenant, or omit it to see all.

type LangfuseConn = { host: string; authHeader: string };

const resolveLangfuse = (options: RegisterObservabilityRoutesOptions): LangfuseConn | null => {
    const host = (options.langfuse?.host ?? process.env['LANGFUSE_HOST'] ?? process.env['LANGFUSE_BASE_URL'] ?? '').replace(/\/+$/, '');
    const publicKey = options.langfuse?.publicKey ?? process.env['LANGFUSE_PUBLIC_KEY'] ?? '';
    const secretKey = options.langfuse?.secretKey ?? process.env['LANGFUSE_SECRET_KEY'] ?? '';
    if (!host || !publicKey.trim() || !secretKey.trim()) {
        return null;
    }
    const authHeader = 'Basic ' + Buffer.from(`${publicKey}:${secretKey}`).toString('base64');
    return { host, authHeader };
};

/** Resolve the tenant filter for a trace query. Customers are locked to their
 *  own tenant; internal operators may scope to a tenant or omit for all. */
const resolveTraceTenantFilter = (
    session: SessionContext,
    requestedTenantId: string | undefined,
): { userId?: string } => {
    if (session.scope === 'internal') {
        const t = requestedTenantId?.trim();
        return t ? { userId: t } : {};
    }
    return { userId: session.tenantId };
};

/**
 * Strip raw prompt input / model output from a trace for customer-facing views.
 * Customers see metadata only (model, usage, cost, latency, action) — never the
 * system prompt or RAG context. Enforced server-side so it holds even if the
 * customer calls the API directly. Internal operators receive the full trace.
 */
const redactTraceForCustomer = (trace: Record<string, unknown>): Record<string, unknown> => {
    const redacted: Record<string, unknown> = { ...trace };
    delete redacted['input'];
    delete redacted['output'];
    const observations = trace['observations'];
    if (Array.isArray(observations)) {
        redacted['observations'] = observations.map((obs) => {
            if (obs && typeof obs === 'object') {
                const o = { ...(obs as Record<string, unknown>) };
                delete o['input'];
                delete o['output'];
                return o;
            }
            return obs;
        });
    }
    redacted['redacted'] = true;
    return redacted;
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

    // ── GET /v1/observability/llm-traces — list LLM traces (tenant-scoped) ──────
    app.get<{
        Querystring: {
            tenantId?: string;
            tag?: string;
            sessionId?: string;
            from?: string;
            to?: string;
            limit?: string;
        };
    }>('/v1/observability/llm-traces', async (request, reply) => {
        const session = await resolveAnySession(request, options);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized', message: 'A valid authenticated session is required.' });
        }

        const conn = resolveLangfuse(options);
        if (!conn) {
            return reply.code(503).send({ error: 'observability_not_configured', message: 'Langfuse is not configured.' });
        }

        const tenantFilter = resolveTraceTenantFilter(session, request.query.tenantId);
        const limit = Math.max(1, Math.min(Number(request.query.limit ?? 50) || 50, 100));

        const params = new URLSearchParams();
        if (tenantFilter.userId) params.set('userId', tenantFilter.userId);
        if (request.query.tag?.trim()) params.set('tags', request.query.tag.trim());
        if (request.query.sessionId?.trim()) params.set('sessionId', request.query.sessionId.trim());
        if (request.query.from?.trim()) params.set('fromTimestamp', request.query.from.trim());
        if (request.query.to?.trim()) params.set('toTimestamp', request.query.to.trim());
        params.set('limit', String(limit));
        params.set('orderBy', 'timestamp.desc');

        try {
            const response = await fetchImpl(`${conn.host}/api/public/traces?${params.toString()}`, {
                method: 'GET',
                headers: { authorization: conn.authHeader },
                signal: AbortSignal.timeout(8_000),
            });
            const payload = await response.json() as Record<string, unknown>;
            if (!response.ok) {
                return reply.code(502).send({ error: 'observability_upstream_error', status: response.status });
            }
            return { scope: tenantFilter.userId ?? 'all', traces: payload['data'] ?? [], meta: payload['meta'] };
        } catch (error) {
            return reply.code(502).send({
                error: 'observability_request_failed',
                message: error instanceof Error ? error.message : 'Unable to fetch traces.',
            });
        }
    });

    // ── GET /v1/observability/llm-traces/:taskId — single trace drill-down ──────
    app.get<{ Params: { taskId: string } }>('/v1/observability/llm-traces/:taskId', async (request, reply) => {
        const session = await resolveAnySession(request, options);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized', message: 'A valid authenticated session is required.' });
        }

        const conn = resolveLangfuse(options);
        if (!conn) {
            return reply.code(503).send({ error: 'observability_not_configured', message: 'Langfuse is not configured.' });
        }

        const taskId = request.params.taskId?.trim();
        if (!taskId) {
            return reply.code(400).send({ error: 'invalid_request', message: 'taskId is required.' });
        }

        try {
            const response = await fetchImpl(`${conn.host}/api/public/traces/${encodeURIComponent(taskId)}`, {
                method: 'GET',
                headers: { authorization: conn.authHeader },
                signal: AbortSignal.timeout(8_000),
            });

            if (response.status === 404) {
                return reply.code(404).send({ error: 'trace_not_found' });
            }
            if (!response.ok) {
                return reply.code(502).send({ error: 'observability_upstream_error', status: response.status });
            }

            const trace = await response.json() as Record<string, unknown> & { userId?: string };
            // Defense-in-depth: never return another tenant's trace to a customer,
            // even if they guess a taskId. 404 (not 403) avoids leaking existence.
            if (session.scope !== 'internal' && trace.userId !== session.tenantId) {
                return reply.code(404).send({ error: 'trace_not_found' });
            }

            // Customers get metadata only — strip raw prompt/output server-side.
            return session.scope === 'internal' ? trace : redactTraceForCustomer(trace);
        } catch (error) {
            return reply.code(502).send({
                error: 'observability_request_failed',
                message: error instanceof Error ? error.message : 'Unable to fetch trace.',
            });
        }
    });

    // ── GET /v1/observability/infra-logs — Docker/app/audit logs from Axiom ─────
    // Tenant-scoped: customers see only their own VM's telemetry (tenant.id).
    app.get<{
        Querystring: { tenantId?: string; dataset?: string; q?: string; hours?: string; limit?: string };
    }>('/v1/observability/infra-logs', async (request, reply) => {
        const session = await resolveAnySession(request, options);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized', message: 'A valid authenticated session is required.' });
        }

        const conn = resolveAxiomQuery(options);
        if (!conn) {
            return reply.code(503).send({
                error: 'observability_not_configured',
                message: 'Axiom query token not configured (set AXIOM_QUERY_TOKEN — a query-scoped token, not the ingest token).',
            });
        }

        // Dataset allowlist — never let a client query arbitrary datasets.
        const allowed: Record<string, string> = {
            logs: process.env['AXIOM_DATASET_LOGS'] ?? 'agentfarm-logs',
            metrics: process.env['AXIOM_DATASET_METRICS'] ?? 'agentfarm-metrics',
            audit: process.env['AXIOM_DATASET_AUDIT'] ?? 'axiom-audit',
        };
        const dataset = allowed[request.query.dataset ?? 'logs'] ?? allowed['logs']!;

        // Tenant scope: customers locked to their own tenant; internal optional.
        const tenant = session.scope === 'internal' ? request.query.tenantId?.trim() : session.tenantId;

        const hours = Math.max(1, Math.min(Number(request.query.hours ?? 24) || 24, 168));
        const limit = Math.max(1, Math.min(Number(request.query.limit ?? 100) || 100, 500));
        const now = Date.now();

        const clauses = [`['${dataset}']`];
        if (tenant) clauses.push(`| where ['tenant.id'] == ${aplString(tenant)}`);
        if (request.query.q?.trim()) clauses.push(`| search ${aplString(request.query.q.trim())}`);
        clauses.push('| sort by _time desc');
        clauses.push(`| limit ${limit}`);
        const apl = clauses.join(' ');

        try {
            const response = await fetchImpl(`${conn.url}/v1/datasets/_apl?format=legacy`, {
                method: 'POST',
                headers: { authorization: `Bearer ${conn.token}`, 'content-type': 'application/json' },
                body: JSON.stringify({
                    apl,
                    startTime: new Date(now - hours * 3_600_000).toISOString(),
                    endTime: new Date(now).toISOString(),
                }),
                signal: AbortSignal.timeout(10_000),
            });

            if (!response.ok) {
                return reply.code(502).send({ error: 'observability_upstream_error', status: response.status });
            }
            const body = await response.json() as { matches?: Array<{ data?: unknown }>; tables?: unknown };
            const rows = Array.isArray(body.matches) ? body.matches.map((m) => m.data ?? m) : (body.tables ?? []);
            return { scope: tenant ?? 'all', dataset, rows };
        } catch (error) {
            return reply.code(502).send({
                error: 'observability_request_failed',
                message: error instanceof Error ? error.message : 'Unable to query Axiom.',
            });
        }
    });
};
