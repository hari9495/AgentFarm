/**
 * Gateway route — Agent Questions API
 * Frozen 2026-05-07
 *
 * Allows the dashboard / bot to:
 *   POST /questions                   — human creates or agent parks a question
 *   POST /questions/:id/answer        — human answers a parked question
 *   GET  /questions?workspaceId=...   — list pending questions for a workspace
 *
 * Follows the same FastifyInstance plugin pattern as approvals.ts.
 * In production the question store is injected; for simplicity the route
 * decorates the Fastify instance with an in-memory store on first load.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';

// ── Minimal inline types (avoids cross-package import cycles in the gateway) ──

type QuestionStatus = 'pending' | 'answered' | 'timed_out' | 'abandoned';

type QuestionRecord = {
    id: string;
    tenantId: string;
    workspaceId: string;
    taskId: string;
    questionText: string;
    status: QuestionStatus;
    answer: string | null;
    answeredBy: string | null;
    askedAt: string;
    answeredAt: string | null;
    expiresAt: string;
};

// ── In-memory store (replace with DB-backed store in production) ──────────────

const store = new Map<string, QuestionRecord>();

function getStore() {
    return store;
}

// ── Route helpers ─────────────────────────────────────────────────────────────

function requireStringField(
    body: Record<string, unknown>,
    field: string,
    reply: { code: (n: number) => { send: (v: unknown) => void } },
): string | null {
    const val = body[field];
    if (typeof val !== 'string' || !val.trim()) {
        reply.code(400).send({ error: `Missing required field: ${field}` });
        return null;
    }
    return val.trim();
}

// ── Plugin ────────────────────────────────────────────────────────────────────

export async function questionsRoutes(fastify: FastifyInstance): Promise<void> {
    // POST /questions — create a new question (agent or dashboard)
    fastify.post(
        '/questions',
        async (
            req: FastifyRequest<{
                Body: {
                    tenantId?: string;
                    workspaceId?: string;
                    taskId?: string;
                    questionText?: string;
                    timeoutSeconds?: number;
                };
            }>,
            reply,
        ) => {
            const body = req.body as Record<string, unknown>;

            const tenantId = requireStringField(body, 'tenantId', reply);
            if (!tenantId) return;
            const workspaceId = requireStringField(body, 'workspaceId', reply);
            if (!workspaceId) return;
            const taskId = requireStringField(body, 'taskId', reply);
            if (!taskId) return;
            const questionText = requireStringField(body, 'questionText', reply);
            if (!questionText) return;

            const timeoutSeconds =
                typeof body['timeoutSeconds'] === 'number' ? body['timeoutSeconds'] : 4 * 60 * 60;

            const now = new Date();
            const record: QuestionRecord = {
                id: randomUUID(),
                tenantId,
                workspaceId,
                taskId,
                questionText,
                status: 'pending',
                answer: null,
                answeredBy: null,
                askedAt: now.toISOString(),
                answeredAt: null,
                expiresAt: new Date(now.getTime() + timeoutSeconds * 1000).toISOString(),
            };

            getStore().set(record.id, record);
            return reply.code(201).send(record);
        },
    );

    // POST /questions/:id/answer — human (or test harness) answers a question
    fastify.post(
        '/questions/:id/answer',
        async (
            req: FastifyRequest<{
                Params: { id: string };
                Body: { answer?: string; answeredBy?: string; tenantId?: string; workspaceId?: string };
            }>,
            reply,
        ) => {
            const { id } = req.params;
            const body = req.body as Record<string, unknown>;

            const answer = requireStringField(body, 'answer', reply);
            if (!answer) return;

            const record = getStore().get(id);
            if (!record) {
                return reply.code(404).send({ error: `Question ${id} not found` });
            }

            // Authorisation: tenantId/workspaceId must match
            if (
                typeof body['tenantId'] === 'string' && body['tenantId'] !== record.tenantId ||
                typeof body['workspaceId'] === 'string' && body['workspaceId'] !== record.workspaceId
            ) {
                return reply.code(403).send({ error: 'Tenant or workspace mismatch' });
            }

            if (record.status !== 'pending') {
                return reply.code(409).send({ error: `Question is already ${record.status}` });
            }

            record.status = 'answered';
            record.answer = answer;
            record.answeredBy = typeof body['answeredBy'] === 'string' ? body['answeredBy'] : null;
            record.answeredAt = new Date().toISOString();

            return reply.send(record);
        },
    );

    // GET /questions?workspaceId=...&tenantId=...&status=pending
    fastify.get(
        '/questions',
        async (
            req: FastifyRequest<{
                Querystring: { workspaceId?: string; tenantId?: string; status?: QuestionStatus };
            }>,
            reply,
        ) => {
            const { workspaceId, tenantId, status } = req.query;

            if (!workspaceId || !tenantId) {
                return reply.code(400).send({ error: 'workspaceId and tenantId are required' });
            }

            const records = Array.from(getStore().values()).filter((r) => {
                if (r.workspaceId !== workspaceId) return false;
                if (r.tenantId !== tenantId) return false;
                if (status && r.status !== status) return false;
                return true;
            });

            return reply.send({ items: records, total: records.length });
        },
    );
}

export default questionsRoutes;
