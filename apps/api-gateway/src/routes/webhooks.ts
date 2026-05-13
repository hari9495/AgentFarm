import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { answerQuestion, PrismaQuestionStore } from '@agentfarm/agent-question-service';
import { MemoryStore } from '@agentfarm/memory-service';
import { verifyHmacSha256 } from '../lib/webhook-verify.js';

type WebhookRegisterBody = {
    provider: string;
    events: string[];
    target_url: string;
    secret?: string;
};

type WebhookIdParams = {
    id: string;
};

type ProviderParams = {
    provider: string;
};

type IngestBody = {
    headers: Record<string, string>;
    raw_body: string;
    source_ip?: string;
    registration_id?: string;
};

type QuestionWebhookPayload = {
    question_id?: string;
    answer?: string;
    answered_by?: string;
    event?: {
        text?: string;
        user?: string;
    };
    value?: {
        questionId?: string;
        answer?: string;
        answeredBy?: string;
    };
    data?: {
        questionId?: string;
        answerText?: string;
        answeredBy?: string;
    };
};

type CodeReviewPayload = {
    tenantId?: string;
    workspaceId?: string;
    sourceTaskId?: string;
    sourcePrUrl?: string;
    patternConfidence?: number;
    comments?: Array<{ body?: string }>;
    review_comments?: string[];
    review?: { body?: string };
    comment?: { body?: string };
    pull_request?: { html_url?: string };
};

const trimString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const extractAnswerPayload = (payload: QuestionWebhookPayload): { questionId: string; answer: string; answeredBy: string } | null => {
    const questionId = trimString(payload.question_id)
        || trimString(payload.value?.questionId)
        || trimString(payload.data?.questionId);
    const answer = trimString(payload.answer)
        || trimString(payload.value?.answer)
        || trimString(payload.data?.answerText)
        || trimString(payload.event?.text);
    const answeredBy = trimString(payload.answered_by)
        || trimString(payload.value?.answeredBy)
        || trimString(payload.data?.answeredBy)
        || trimString(payload.event?.user)
        || 'external_operator';

    if (!questionId || !answer) {
        return null;
    }

    return { questionId, answer, answeredBy };
};

const normalizePattern = (comment: string): string | null => {
    const cleaned = comment
        .replace(/`+/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    if (!cleaned) {
        return null;
    }

    const direct = cleaned.match(/(?:prefer|use|avoid|always|ensure|do not|don't)\s+(.+?)(?:[.!?]|$)/i);
    if (direct?.[0]) {
        return direct[0][0].toUpperCase() + direct[0].slice(1);
    }

    const sentence = cleaned.split(/[.!?]/)[0]?.trim();
    return sentence ? sentence[0].toUpperCase() + sentence.slice(1) : null;
};

export function registerWebhookRoutes(app: FastifyInstance, prisma: PrismaClient): void {
    const questionStore = new PrismaQuestionStore(prisma);
    const memoryStore = new MemoryStore(prisma);

    // List registrations
    app.get('/webhooks', async (_req, reply) => {
        const { globalWebhookEngine } = await import('@agentfarm/agent-runtime/webhook-ingestion.js').catch(
            () => import('../agent-runtime-stubs.js'),
        );
        return reply.send({ registrations: globalWebhookEngine.listRegistrations() });
    });

    // Register webhook
    app.post('/webhooks', async (req: FastifyRequest<{ Body: WebhookRegisterBody }>, reply) => {
        const body = (req.body ?? {}) as WebhookRegisterBody;
        if (!body.provider || !body.events?.length || !body.target_url) {
            return reply.status(400).send({ error: 'provider, events, and target_url required' });
        }
        const { globalWebhookEngine } = await import('@agentfarm/agent-runtime/webhook-ingestion.js').catch(
            () => import('../agent-runtime-stubs.js'),
        );
        const registration = globalWebhookEngine.registerWebhook({
            provider: body.provider,
            events: body.events,
            target_url: body.target_url,
            secret: body.secret,
        });
        return reply.status(201).send({ registration });
    });

    // Deactivate / delete webhook
    app.patch(
        '/webhooks/:id',
        async (req: FastifyRequest<{ Params: WebhookIdParams; Body: { active?: boolean } }>, reply) => {
            const { globalWebhookEngine } = await import(
                '@agentfarm/agent-runtime/webhook-ingestion.js'
            ).catch(() => import('../agent-runtime-stubs.js'));
            if (req.body?.active === false) {
                const ok = globalWebhookEngine.deactivateWebhook(req.params.id);
                if (!ok) return reply.status(404).send({ error: 'webhook not found' });
            }
            return reply.send({ ok: true });
        },
    );

    app.delete(
        '/webhooks/:id',
        async (req: FastifyRequest<{ Params: WebhookIdParams }>, reply) => {
            const { globalWebhookEngine } = await import(
                '@agentfarm/agent-runtime/webhook-ingestion.js'
            ).catch(() => import('../agent-runtime-stubs.js'));
            const ok = globalWebhookEngine.deleteWebhook(req.params.id);
            if (!ok) return reply.status(404).send({ error: 'webhook not found' });
            return reply.send({ deleted: true });
        },
    );

    // Recent events
    app.get(
        '/webhooks/events',
        async (req: FastifyRequest<{ Querystring: { limit?: string; provider?: string } }>, reply) => {
            const limit = Number(req.query.limit ?? 20);
            const { globalWebhookEngine } = await import(
                '@agentfarm/agent-runtime/webhook-ingestion.js'
            ).catch(() => import('../agent-runtime-stubs.js'));
            const events = req.query.provider
                ? globalWebhookEngine.getEventsByProvider(req.query.provider as never, limit)
                : globalWebhookEngine.getRecentEvents(limit);
            return reply.send({ events });
        },
    );

    // Ingest endpoint
    app.post(
        '/webhooks/ingest/:provider',
        async (req: FastifyRequest<{ Params: ProviderParams; Body: IngestBody }>, reply) => {
            const ingestSecret = process.env['WEBHOOK_INGEST_SECRET'];
            if (ingestSecret) {
                const sig = (req.headers['x-hub-signature-256'] as string)
                    ?? (req.headers['x-signature'] as string)
                    ?? '';
                const rawPayload = JSON.stringify(req.body);
                if (!verifyHmacSha256(rawPayload, ingestSecret, sig.replace('sha256=', ''))) {
                    return reply.code(401).send({ error: 'invalid signature' });
                }
            }
            const body = req.body ?? {};
            const { globalWebhookEngine } = await import(
                '@agentfarm/agent-runtime/webhook-ingestion.js'
            ).catch(() => import('../agent-runtime-stubs.js'));
            const result = await globalWebhookEngine.ingest({
                provider: req.params.provider as never,
                headers: body.headers ?? (req.headers as Record<string, string>),
                rawBody: body.raw_body ?? JSON.stringify(req.body),
                sourceIp: body.source_ip ?? req.ip,
                registrationId: body.registration_id,
            });
            return reply.send(result);
        },
    );

    app.post(
        '/api/v1/questions/webhooks/slack',
        async (req: FastifyRequest<{ Body: QuestionWebhookPayload }>, reply) => {
            const slackSecret = process.env['SLACK_WEBHOOK_SECRET'];
            if (slackSecret) {
                const sig = (req.headers['x-hub-signature-256'] as string)
                    ?? (req.headers['x-signature'] as string)
                    ?? '';
                if (!verifyHmacSha256(JSON.stringify(req.body), slackSecret, sig.replace('sha256=', ''))) {
                    return reply.code(401).send({ error: 'invalid signature' });
                }
            }
            const payload = extractAnswerPayload(req.body ?? {});
            if (!payload) {
                return reply.code(400).send({
                    error: 'invalid_request',
                    message: 'question_id and answer are required in the Slack payload.',
                });
            }

            const question = await answerQuestion(payload.questionId, payload.answer, payload.answeredBy, questionStore);
            if (!question) {
                return reply.code(404).send({ error: 'not_found', message: 'Pending question not found.' });
            }

            return reply.send({ question, message: 'Slack answer accepted.' });
        },
    );

    app.post(
        '/api/v1/questions/webhooks/teams',
        async (req: FastifyRequest<{ Body: QuestionWebhookPayload }>, reply) => {
            const teamsSecret = process.env['TEAMS_WEBHOOK_SECRET'];
            if (teamsSecret) {
                const sig = (req.headers['x-hub-signature-256'] as string)
                    ?? (req.headers['x-signature'] as string)
                    ?? '';
                if (!verifyHmacSha256(JSON.stringify(req.body), teamsSecret, sig.replace('sha256=', ''))) {
                    return reply.code(401).send({ error: 'invalid signature' });
                }
            }
            const payload = extractAnswerPayload(req.body ?? {});
            if (!payload) {
                return reply.code(400).send({
                    error: 'invalid_request',
                    message: 'question_id and answer are required in the Teams payload.',
                });
            }

            const question = await answerQuestion(payload.questionId, payload.answer, payload.answeredBy, questionStore);
            if (!question) {
                return reply.code(404).send({ error: 'not_found', message: 'Pending question not found.' });
            }

            return reply.send({ question, message: 'Teams answer accepted.' });
        },
    );

    app.post(
        '/api/v1/memory/patterns/code-review',
        async (req: FastifyRequest<{ Body: CodeReviewPayload }>, reply) => {
            const memorySecret = process.env['MEMORY_WEBHOOK_SECRET'];
            if (memorySecret) {
                const sig = (req.headers['x-hub-signature-256'] as string)
                    ?? (req.headers['x-signature'] as string)
                    ?? '';
                if (!verifyHmacSha256(JSON.stringify(req.body), memorySecret, sig.replace('sha256=', ''))) {
                    return reply.code(401).send({ error: 'invalid signature' });
                }
            }
            const body = req.body ?? {};
            const tenantId = trimString(body.tenantId);
            const workspaceId = trimString(body.workspaceId);

            if (!tenantId || !workspaceId) {
                return reply.code(400).send({
                    error: 'invalid_request',
                    message: 'tenantId and workspaceId are required.',
                });
            }

            const comments = [
                ...(Array.isArray(body.review_comments) ? body.review_comments : []),
                ...(Array.isArray(body.comments) ? body.comments.map((entry) => trimString(entry.body)) : []),
                trimString(body.review?.body),
                trimString(body.comment?.body),
            ].filter((value): value is string => Boolean(value));

            if (comments.length === 0) {
                return reply.code(400).send({
                    error: 'invalid_request',
                    message: 'At least one review comment is required.',
                });
            }

            const normalizedPatterns = [...new Set(comments.map(normalizePattern).filter((value): value is string => Boolean(value)))];
            const confidenceBase = typeof body.patternConfidence === 'number' && Number.isFinite(body.patternConfidence)
                ? Math.max(0.1, Math.min(1, body.patternConfidence))
                : 0.65;

            const learned = await Promise.all(
                normalizedPatterns.map(async (pattern, index) => memoryStore.writeLongTermMemory({
                    tenantId,
                    workspaceId,
                    pattern,
                    confidence: Math.max(0.1, Math.min(1, confidenceBase + (normalizedPatterns.length > 1 ? 0.05 : 0) - index * 0.01)),
                    observedCount: comments.filter((comment) => normalizePattern(comment) === pattern).length || 1,
                    lastSeen: new Date().toISOString(),
                })),
            );

            return reply.code(201).send({
                learnedCount: learned.length,
                patterns: learned,
                sourceTaskId: trimString(body.sourceTaskId) || undefined,
                sourcePrUrl: trimString(body.sourcePrUrl) || trimString(body.pull_request?.html_url) || undefined,
            });
        },
    );

    // ── Inbound webhook source management ────────────────────────────────────

    /**
     * GET /v1/webhooks/inbound/sources
     * Returns the list of registered inbound webhook sources for a tenant.
     * Query: tenantId (required)
     */
    app.get<{ Querystring: { tenantId?: string } }>('/v1/webhooks/inbound/sources', async (req, reply) => {
        const tenantId = trimString(req.query.tenantId);
        if (!tenantId) {
            return reply.code(400).send({ error: 'tenantId query parameter is required' });
        }
        const sources = await prisma.webhookSource.findMany({
            where: { tenantId },
            orderBy: { createdAt: 'desc' },
        });
        return reply.send({ sources });
    });

    /**
     * POST /v1/webhooks/inbound/sources
     * Registers a new inbound webhook source.
     * Body: { name: string, tenantId: string, description?: string }
     */
    app.post<{ Body: { name?: unknown; description?: unknown; tenantId?: unknown } }>(
        '/v1/webhooks/inbound/sources',
        async (req, reply) => {
            const name = trimString(req.body?.name);
            const tenantId = trimString(req.body?.tenantId);
            if (!name) {
                return reply.code(400).send({ error: 'name is required' });
            }
            if (!tenantId) {
                return reply.code(400).send({ error: 'tenantId is required' });
            }
            const description = trimString(req.body?.description) || undefined;
            const secret = randomUUID();
            const source = await prisma.webhookSource.create({
                data: { tenantId, name, description, secret },
            });
            const inboundUrl = `/webhooks/ingest/inbound?source=${source.id}`;
            return reply.code(201).send({ id: source.id, name: source.name, secret: source.secret, inboundUrl });
        },
    );

    /**
     * DELETE /v1/webhooks/inbound/sources/:sourceId
     * Removes a registered inbound webhook source.
     */
    app.delete<{ Params: { sourceId: string } }>(
        '/v1/webhooks/inbound/sources/:sourceId',
        async (req, reply) => {
            const existing = await prisma.webhookSource.findUnique({ where: { id: req.params.sourceId } });
            if (!existing) {
                return reply.code(404).send({ error: 'source not found' });
            }
            await prisma.webhookSource.delete({ where: { id: req.params.sourceId } });
            return reply.send({ deleted: true });
        },
    );

    /**
     * GET /v1/webhooks/inbound/events
     * Returns recent inbound webhook events.
     * Query: source?, tenantId?, limit?, cursor?
     * At least one of source or tenantId is required.
     */
    app.get<{ Querystring: { source?: string; tenantId?: string; limit?: string; cursor?: string } }>(
        '/v1/webhooks/inbound/events',
        async (req, reply) => {
            const sourceId = req.query.source ? trimString(req.query.source) : undefined;
            const tenantId = req.query.tenantId ? trimString(req.query.tenantId) : undefined;
            if (!sourceId && !tenantId) {
                return reply.code(400).send({ error: 'source or tenantId query parameter is required' });
            }
            const limit = Math.min(Number(req.query.limit ?? 20), 100);
            const cursor = req.query.cursor ? trimString(req.query.cursor) : undefined;
            const where: Record<string, unknown> = {};
            if (sourceId) where['sourceId'] = sourceId;
            if (tenantId) where['tenantId'] = tenantId;
            const events = await prisma.inboundWebhookEvent.findMany({
                where,
                orderBy: { receivedAt: 'desc' },
                take: limit,
                ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            });
            return reply.send({ events });
        },
    );

    /**
     * POST /v1/webhooks/inbound/test
     * Sends a test ping to the inbound webhook endpoint and measures latency.
     * Body: { sourceId: string }
     */
    app.post<{ Body: { sourceId?: unknown } }>(
        '/v1/webhooks/inbound/test',
        async (req, reply) => {
            const sourceId = trimString(req.body?.sourceId);
            if (!sourceId) {
                return reply.code(400).send({ error: 'sourceId is required' });
            }
            const baseUrl = process.env['INTERNAL_BASE_URL'] ?? 'http://localhost:3000';
            const testUrl = `${baseUrl}/webhooks/ingest/inbound?source=${sourceId}`;
            const t0 = Date.now();
            try {
                const res = await fetch(testUrl, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json', 'x-test-ping': '1' },
                    body: JSON.stringify({ test: true, sourceId }),
                    signal: AbortSignal.timeout(5_000),
                });
                const latencyMs = Date.now() - t0;
                return reply.send({ ok: res.ok || res.status < 500, statusCode: res.status, latencyMs });
            } catch {
                const latencyMs = Date.now() - t0;
                return reply.send({ ok: false, statusCode: 0, latencyMs });
            }
        },
    );
}
