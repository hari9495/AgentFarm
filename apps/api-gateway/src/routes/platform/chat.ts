import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ROLE_RANK } from '../lib/require-role.js';

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

export type RegisterChatRoutesOptions = {
    getSession: (req: FastifyRequest) => SessionContext | null;
    fetch?: typeof globalThis.fetch;
};

function getRuntimeUrl(): string {
    return (process.env['AGENT_RUNTIME_URL'] ?? 'http://localhost:3001').replace(/\/+$/, '');
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export const registerChatRoutes = async (
    app: FastifyInstance,
    options: RegisterChatRoutesOptions,
): Promise<void> => {
    const resolveFetch = options.fetch ?? globalThis.fetch;

    // ── GET /v1/chat/sessions — viewer+ ─────────────────────────────────────
    app.get('/v1/chat/sessions', async (req, reply) => {
        const session = options.getSession(req);
        if (!session) return reply.code(401).send({ error: 'unauthorized' });
        if ((ROLE_RANK[session.role ?? ''] ?? 0) < (ROLE_RANK['viewer'] ?? 99)) {
            return reply.code(403).send({
                error: 'insufficient_role',
                required: 'viewer',
                actual: session.role,
            });
        }

        const url = `${getRuntimeUrl()}/chat/sessions?tenantId=${encodeURIComponent(session.tenantId)}`;
        const upstream = await resolveFetch(url);
        const body = await upstream.json();
        return reply.code(upstream.status).send(body);
    });

    // ── POST /v1/chat/sessions — operator+ ──────────────────────────────────
    app.post<{
        Body: { agentId?: unknown; title?: unknown };
    }>('/v1/chat/sessions', async (req, reply) => {
        const session = options.getSession(req);
        if (!session) return reply.code(401).send({ error: 'unauthorized' });
        if ((ROLE_RANK[session.role ?? ''] ?? 0) < (ROLE_RANK['operator'] ?? 99)) {
            return reply.code(403).send({
                error: 'insufficient_role',
                required: 'operator',
                actual: session.role,
            });
        }

        const { agentId, title } = req.body ?? {};
        const payload = {
            tenantId: session.tenantId, // always from session — never trust client
            agentId: agentId ?? undefined,
            title: title ?? undefined,
        };

        const url = `${getRuntimeUrl()}/chat/sessions`;
        const upstream = await resolveFetch(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const body = await upstream.json();
        return reply.code(upstream.status).send(body);
    });

    // ── GET /v1/chat/sessions/:sessionId/messages — viewer+ ─────────────────
    app.get<{ Params: { sessionId: string } }>(
        '/v1/chat/sessions/:sessionId/messages',
        async (req, reply) => {
            const session = options.getSession(req);
            if (!session) return reply.code(401).send({ error: 'unauthorized' });
            if ((ROLE_RANK[session.role ?? ''] ?? 0) < (ROLE_RANK['viewer'] ?? 99)) {
                return reply.code(403).send({
                    error: 'insufficient_role',
                    required: 'viewer',
                    actual: session.role,
                });
            }

            const { sessionId } = req.params;
            const url = `${getRuntimeUrl()}/chat/sessions/${encodeURIComponent(sessionId)}/messages?tenantId=${encodeURIComponent(session.tenantId)}`;
            const upstream = await resolveFetch(url);
            const body = await upstream.json();
            return reply.code(upstream.status).send(body);
        },
    );

    // ── POST /v1/chat/sessions/:sessionId/messages — operator+ ──────────────
    app.post<{
        Params: { sessionId: string };
        Body: { content?: unknown };
    }>('/v1/chat/sessions/:sessionId/messages', async (req, reply) => {
        const session = options.getSession(req);
        if (!session) return reply.code(401).send({ error: 'unauthorized' });
        if ((ROLE_RANK[session.role ?? ''] ?? 0) < (ROLE_RANK['operator'] ?? 99)) {
            return reply.code(403).send({
                error: 'insufficient_role',
                required: 'operator',
                actual: session.role,
            });
        }

        const { sessionId } = req.params;
        const { content } = req.body ?? {};

        const payload = {
            tenantId: session.tenantId, // always from session — never trust client
            content,
        };

        const url = `${getRuntimeUrl()}/chat/sessions/${encodeURIComponent(sessionId)}/messages`;
        const upstream = await resolveFetch(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const body = await upstream.json();
        return reply.code(upstream.status).send(body);
    });

    // ── DELETE /v1/chat/sessions/:sessionId — admin+ ─────────────────────────
    app.delete<{ Params: { sessionId: string } }>(
        '/v1/chat/sessions/:sessionId',
        async (req, reply) => {
            const session = options.getSession(req);
            if (!session) return reply.code(401).send({ error: 'unauthorized' });
            if ((ROLE_RANK[session.role ?? ''] ?? 0) < (ROLE_RANK['admin'] ?? 99)) {
                return reply.code(403).send({
                    error: 'insufficient_role',
                    required: 'admin',
                    actual: session.role,
                });
            }

            const { sessionId } = req.params;
            const url = `${getRuntimeUrl()}/chat/sessions/${encodeURIComponent(sessionId)}?tenantId=${encodeURIComponent(session.tenantId)}`;
            const upstream = await resolveFetch(url, { method: 'DELETE' });

            if (upstream.status === 204) {
                return reply.code(204).send();
            }
            const body = await upstream.json();
            return reply.code(upstream.status).send(body);
        },
    );
};
