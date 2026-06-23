import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { answerQuestion, PrismaQuestionStore } from '@agentfarm/agent-question-service';
import { writeEpisodicMemoryNoEmbed } from '@agentfarm/memory-service';
import { verifyHmacSha256 } from '../../lib/webhook-verify.js';
import { enqueueTask, type QueuePriority } from '../../lib/task-queue.js';

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

// Headers we never persist — they carry caller credentials, not webhook payload data.
const SENSITIVE_HEADERS = new Set(['authorization', 'cookie', 'x-api-key', 'proxy-authorization']);

const sanitizeHeaders = (
    headers: Record<string, unknown>,
): import('@prisma/client').Prisma.InputJsonValue => {
    const clean: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
        if (SENSITIVE_HEADERS.has(key.toLowerCase())) continue;
        clean[key] = Array.isArray(value) ? value.join(', ') : String(value);
    }
    return clean;
};

// ── Webhook trigger-rule helpers ────────────────────────────────────────────

const VALID_PRIORITIES = new Set<QueuePriority>(['high', 'normal', 'low']);

/** Resolve a dot-path (e.g. "issue.title") into a nested object; undefined if absent. */
const getByPath = (obj: unknown, path: string): unknown => {
    if (!path) return undefined;
    let cur: unknown = obj;
    for (const part of path.split('.')) {
        if (cur == null || typeof cur !== 'object') return undefined;
        cur = (cur as Record<string, unknown>)[part];
    }
    return cur;
};

/** Replace {{dot.path}} placeholders in a template with values from the event body. */
const renderTemplate = (template: string, body: unknown): string =>
    template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, path: string) => {
        const value = getByPath(body, path);
        if (value == null) return '';
        return typeof value === 'string' ? value : JSON.stringify(value);
    });

type TriggerRule = {
    id: string;
    tenantId: string;
    workspaceId: string;
    sourceId: string | null;
    enabled: boolean;
    matchEventType: string | null;
    matchField: string | null;
    matchValue: string | null;
    botId: string;
    promptTemplate: string;
    priority: string;
};

/** A rule matches when every condition it specifies holds (empty rule = match all). */
const ruleMatches = (rule: TriggerRule, eventType: string, body: unknown): boolean => {
    if (rule.matchEventType && rule.matchEventType.toLowerCase() !== eventType.toLowerCase()) {
        return false;
    }
    if (rule.matchField) {
        const actual = getByPath(body, rule.matchField);
        const actualStr = actual == null ? '' : String(actual);
        if (actualStr !== (rule.matchValue ?? '')) return false;
    }
    return true;
};

/**
 * Evaluate every enabled trigger rule for the event's source/tenant and enqueue
 * an agent task for each match. Tasks go through the normal task queue, so risk
 * classification and approval still apply. Best-effort: failures are logged and
 * never block webhook ingestion.
 */
async function evaluateTriggerRules(args: {
    prisma: PrismaClient;
    source: { id: string; tenantId: string };
    eventId: string;
    eventType: string;
    body: unknown;
}): Promise<void> {
    const { prisma, source, eventId, eventType, body } = args;
    try {
        const rules = (await prisma.webhookTriggerRule.findMany({
            where: {
                tenantId: source.tenantId,
                enabled: true,
                OR: [{ sourceId: source.id }, { sourceId: null }],
            },
        })) as unknown as TriggerRule[];

        for (const rule of rules) {
            if (!ruleMatches(rule, eventType, body)) continue;

            const prompt = renderTemplate(rule.promptTemplate, body).trim()
                || `Handle inbound webhook event from source ${source.id}.`;
            const priority: QueuePriority = VALID_PRIORITIES.has(rule.priority as QueuePriority)
                ? (rule.priority as QueuePriority)
                : 'normal';
            const taskId = randomUUID();
            const payload = {
                prompt,
                tenantId: source.tenantId,
                workspaceId: rule.workspaceId,
                botId: rule.botId,
                agentId: rule.botId,
                triggeredBy: 'webhook',
                source: 'webhook',
                webhookEventId: eventId,
                webhookRuleId: rule.id,
            };

            await prisma.taskQueueEntry.create({
                data: {
                    id: taskId,
                    tenantId: source.tenantId,
                    workspaceId: rule.workspaceId,
                    botId: rule.botId,
                    priority,
                    status: 'pending',
                    payload: payload as import('@prisma/client').Prisma.InputJsonValue,
                    dependsOn: [],
                    dependencyMet: true,
                },
            });
            enqueueTask({
                id: taskId,
                tenantId: source.tenantId,
                workspaceId: rule.workspaceId,
                botId: rule.botId,
                priority,
                payload,
                enqueuedAt: Date.now(),
            });
        }
    } catch (err) {
        console.error('[webhooks] trigger-rule evaluation failed', err);
    }
}

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    scope?: 'customer' | 'internal';
    expiresAt: number;
};


type RegisterWebhookRoutesOptions = {
    getSession: (request: import('fastify').FastifyRequest) => SessionContext | null;
};

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

export function registerWebhookRoutes(app: FastifyInstance, prisma: PrismaClient, options: RegisterWebhookRoutesOptions): void {
    const { getSession } = options;
    const questionStore = new PrismaQuestionStore(prisma);

    // List registrations
    app.get('/webhooks', async (req, reply) => {
        const session = getSession(req);
        if (!session) return reply.status(401).send({ error: 'Unauthorized' });
        const { globalWebhookEngine } = await import('@agentfarm/agent-runtime/webhook-ingestion.js').catch(
            () => import('../../agent-runtime-stubs.js'),
        );
        return reply.send({ registrations: globalWebhookEngine.listRegistrations(session.tenantId) });
    });

    // Register webhook
    app.post('/webhooks', async (req: FastifyRequest<{ Body: WebhookRegisterBody }>, reply) => {
        const session = getSession(req);
        if (!session) return reply.status(401).send({ error: 'Unauthorized' });
        const body = (req.body ?? {}) as WebhookRegisterBody;
        if (!body.provider || !body.events?.length || !body.target_url) {
            return reply.status(400).send({ error: 'provider, events, and target_url required' });
        }
        const { globalWebhookEngine } = await import('@agentfarm/agent-runtime/webhook-ingestion.js').catch(
            () => import('../../agent-runtime-stubs.js'),
        );
        const registration = await globalWebhookEngine.registerWebhook({
            provider: body.provider,
            events: body.events,
            target_url: body.target_url,
            secret: body.secret,
            tenantId: session.tenantId,
        });
        return reply.status(201).send({ registration });
    });

    // Deactivate / update webhook
    app.patch(
        '/webhooks/:id',
        async (req: FastifyRequest<{ Params: WebhookIdParams; Body: { active?: boolean } }>, reply) => {
            const session = getSession(req);
            if (!session) return reply.status(401).send({ error: 'Unauthorized' });
            const { globalWebhookEngine } = await import(
                '@agentfarm/agent-runtime/webhook-ingestion.js'
            ).catch(() => import('../../agent-runtime-stubs.js'));
            if (req.body?.active === false) {
                const result = await globalWebhookEngine.deactivateWebhook(req.params.id, session.tenantId);
                if (result === 'not_found') return reply.status(404).send({ error: 'webhook not found' });
                if (result === 'forbidden') return reply.status(403).send({ error: 'Forbidden' });
            }
            return reply.send({ ok: true });
        },
    );

    app.delete(
        '/webhooks/:id',
        async (req: FastifyRequest<{ Params: WebhookIdParams }>, reply) => {
            const session = getSession(req);
            if (!session) return reply.status(401).send({ error: 'Unauthorized' });
            const { globalWebhookEngine } = await import(
                '@agentfarm/agent-runtime/webhook-ingestion.js'
            ).catch(() => import('../../agent-runtime-stubs.js'));
            const result = await globalWebhookEngine.deleteWebhook(req.params.id, session.tenantId);
            if (result === 'not_found') return reply.status(404).send({ error: 'webhook not found' });
            if (result === 'forbidden') return reply.status(403).send({ error: 'Forbidden' });
            return reply.send({ deleted: true });
        },
    );

    // Recent events
    app.get(
        '/webhooks/events',
        async (req: FastifyRequest<{ Querystring: { limit?: string; provider?: string } }>, reply) => {
            const session = getSession(req);
            if (!session) return reply.status(401).send({ error: 'Unauthorized' });
            const limit = Number(req.query.limit ?? 20);
            const { globalWebhookEngine } = await import(
                '@agentfarm/agent-runtime/webhook-ingestion.js'
            ).catch(() => import('../../agent-runtime-stubs.js'));
            const events = req.query.provider
                ? globalWebhookEngine.getEventsByProvider(req.query.provider as never, limit, session.tenantId)
                : globalWebhookEngine.getRecentEvents(limit, session.tenantId);
            return reply.send({ events });
        },
    );

    // Ingest endpoint
    app.post(
        '/webhooks/ingest/:provider',
        async (
            req: FastifyRequest<{
                Params: ProviderParams;
                Body: IngestBody;
                Querystring: { source?: string };
            }>,
            reply,
        ) => {
            const body = req.body ?? {};
            const sourceId = typeof req.query.source === 'string' ? req.query.source.trim() : undefined;
            // Raw bytes as received (populated by the custom JSON parser in server.ts);
            // fall back to the wrapper's raw_body or a re-serialization for non-JSON callers.
            const rawBody = (req as unknown as { rawBody?: string }).rawBody
                ?? body.raw_body
                ?? JSON.stringify(req.body);
            const isTestPing = req.headers['x-test-ping'] === '1';
            const sigHeader = ((req.headers['x-hub-signature-256'] as string)
                ?? (req.headers['x-signature'] as string)
                ?? '').replace('sha256=', '');

            // ── Per-source path: signature is verified against the SOURCE's own secret ──
            if (sourceId) {
                const source = await prisma.webhookSource.findUnique({ where: { id: sourceId } });
                if (!source) {
                    return reply.code(404).send({ error: 'unknown webhook source' });
                }

                // Reachability ping from the dashboard "Test" button — no signature, not persisted.
                if (isTestPing) {
                    return reply.send({ ok: true, test: true });
                }

                // Fail-closed for HMAC sources: a registered source MUST send a valid
                // HMAC signature over the raw body using its per-source signing secret.
                // Sources registered with verificationMode 'none' accept any POST
                // (for external services that cannot sign their webhooks).
                if (source.verificationMode !== 'none'
                    && !verifyHmacSha256(rawBody, source.secret, sigHeader)) {
                    return reply.code(401).send({ error: 'invalid signature' });
                }

                const parsedBody: unknown = (() => {
                    try { return JSON.parse(rawBody) as unknown; } catch { return { raw: rawBody }; }
                })();
                const event = await prisma.inboundWebhookEvent.create({
                    data: {
                        tenantId: source.tenantId,
                        sourceId: source.id,
                        method: req.method,
                        headers: sanitizeHeaders(req.headers),
                        body: parsedBody as import('@prisma/client').Prisma.InputJsonValue,
                        status: 'processed',
                    },
                });

                // Evaluate trigger rules → enqueue agent tasks for matching rules.
                // The event type comes from the provider's event header when present.
                const eventType = (req.headers['x-github-event'] as string)
                    ?? (req.headers['x-gitlab-event'] as string)
                    ?? (req.headers['x-event-type'] as string)
                    ?? '';
                await evaluateTriggerRules({
                    prisma,
                    source: { id: source.id, tenantId: source.tenantId },
                    eventId: event.id,
                    eventType,
                    body: parsedBody,
                });
            } else {
                // ── Legacy provider path: optional global shared secret ──
                const ingestSecret = process.env['WEBHOOK_INGEST_SECRET'];
                if (ingestSecret && !verifyHmacSha256(rawBody, ingestSecret, sigHeader)) {
                    return reply.code(401).send({ error: 'invalid signature' });
                }
            }

            const { globalWebhookEngine } = await import(
                '@agentfarm/agent-runtime/webhook-ingestion.js'
            ).catch(() => import('../../agent-runtime-stubs.js'));
            const result = await globalWebhookEngine.ingest({
                provider: req.params.provider as never,
                headers: body.headers ?? (req.headers as Record<string, string>),
                rawBody: body.raw_body ?? rawBody,
                sourceIp: body.source_ip ?? req.ip,
                registrationId: body.registration_id ?? sourceId,
            });
            return reply.send(result);
        },
    );

    app.post(
        '/api/v1/questions/webhooks/slack',
        async (req: FastifyRequest<{ Body: QuestionWebhookPayload }>, reply) => {
            // Fail-closed: secret must be configured or the endpoint is disabled
            const slackSecret = process.env['SLACK_WEBHOOK_SECRET'];
            if (!slackSecret) {
                return reply.code(503).send({ error: 'Slack webhook not configured' });
            }
            const sig = (req.headers['x-hub-signature-256'] as string)
                ?? (req.headers['x-signature'] as string)
                ?? '';
            if (!verifyHmacSha256(JSON.stringify(req.body), slackSecret, sig.replace('sha256=', ''))) {
                return reply.code(401).send({ error: 'invalid signature' });
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
            // Fail-closed: secret must be configured or the endpoint is disabled
            const teamsSecret = process.env['TEAMS_WEBHOOK_SECRET'];
            if (!teamsSecret) {
                return reply.code(503).send({ error: 'Teams webhook not configured' });
            }
            const sig = (req.headers['x-hub-signature-256'] as string)
                ?? (req.headers['x-signature'] as string)
                ?? '';
            if (!verifyHmacSha256(JSON.stringify(req.body), teamsSecret, sig.replace('sha256=', ''))) {
                return reply.code(401).send({ error: 'invalid signature' });
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
            // Primary auth: require a valid session
            const session = getSession(req);
            if (!session) return reply.code(401).send({ error: 'Unauthorized' });

            // Secondary guard: honour optional HMAC secret for machine-to-machine callers
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
            // Always scope to the authenticated tenant — never trust tenantId from the body
            const tenantId = session.tenantId;
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
                normalizedPatterns.map(async (pattern, index) => {
                    const confidence = Math.max(0.1, Math.min(1, confidenceBase + (normalizedPatterns.length > 1 ? 0.05 : 0) - index * 0.01));
                    await writeEpisodicMemoryNoEmbed({
                        tenantId,
                        botId: '',
                        workspaceId,
                        summary: pattern,
                        pattern,
                        confidence,
                        taskId: '',
                    }, prisma);
                    return { pattern, confidence };
                }),
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
     * Returns the list of registered inbound webhook sources for the authenticated tenant.
     */
    app.get('/v1/webhooks/inbound/sources', async (req, reply) => {
        const session = getSession(req);
        if (!session) return reply.code(401).send({ error: 'Unauthorized' });

        const rows = await prisma.webhookSource.findMany({
            where: { tenantId: session.tenantId },
            orderBy: { createdAt: 'desc' },
        });
        const sources = rows.map(s => ({ ...s, inboundUrl: `/webhooks/ingest/inbound?source=${s.id}` }));
        return reply.send({ sources });
    });

    /**
     * POST /v1/webhooks/inbound/sources
     * Registers a new inbound webhook source for the authenticated tenant.
     * Body: { name: string, description?: string, verificationMode?: 'hmac' | 'none' }
     */
    app.post<{ Body: { name?: unknown; description?: unknown; verificationMode?: unknown } }>(
        '/v1/webhooks/inbound/sources',
        async (req, reply) => {
            const session = getSession(req);
            if (!session) return reply.code(401).send({ error: 'Unauthorized' });

            const name = trimString(req.body?.name);
            if (!name) {
                return reply.code(400).send({ error: 'name is required' });
            }
            const description = trimString(req.body?.description) || undefined;
            // Only 'hmac' (default) and 'none' are valid; anything else falls back to 'hmac'.
            const verificationMode = trimString(req.body?.verificationMode) === 'none' ? 'none' : 'hmac';
            const secret = randomUUID();
            const source = await prisma.webhookSource.create({
                data: { tenantId: session.tenantId, name, description, secret, verificationMode },
            });
            const inboundUrl = `/webhooks/ingest/inbound?source=${source.id}`;
            return reply.code(201).send({
                id: source.id,
                name: source.name,
                secret: source.secret,
                verificationMode: source.verificationMode,
                inboundUrl,
            });
        },
    );

    /**
     * DELETE /v1/webhooks/inbound/sources/:sourceId
     * Removes a registered inbound webhook source (must belong to the authenticated tenant).
     */
    app.delete<{ Params: { sourceId: string } }>(
        '/v1/webhooks/inbound/sources/:sourceId',
        async (req, reply) => {
            const session = getSession(req);
            if (!session) return reply.code(401).send({ error: 'Unauthorized' });

            const existing = await prisma.webhookSource.findUnique({ where: { id: req.params.sourceId } });
            if (!existing) {
                return reply.code(404).send({ error: 'source not found' });
            }
            if (existing.tenantId !== session.tenantId) {
                return reply.code(403).send({ error: 'Forbidden' });
            }
            await prisma.webhookSource.delete({ where: { id: req.params.sourceId } });
            return reply.send({ deleted: true });
        },
    );

    /**
     * GET /v1/webhooks/inbound/events
     * Returns recent inbound webhook events scoped to the authenticated tenant.
     * Query: source?, limit?, cursor?
     */
    app.get<{ Querystring: { source?: string; limit?: string; cursor?: string } }>(
        '/v1/webhooks/inbound/events',
        async (req, reply) => {
            const session = getSession(req);
            if (!session) return reply.code(401).send({ error: 'Unauthorized' });

            const sourceId = req.query.source ? trimString(req.query.source) : undefined;
            const limit = Math.min(Number(req.query.limit ?? 20), 100);
            const cursor = req.query.cursor ? trimString(req.query.cursor) : undefined;

            // Always filter by session tenant; optionally narrow by sourceId
            const where: Record<string, unknown> = { tenantId: session.tenantId };
            if (sourceId) where['sourceId'] = sourceId;

            const rows = await prisma.inboundWebhookEvent.findMany({
                where,
                orderBy: { receivedAt: 'desc' },
                take: limit,
                ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            });
            const events = rows.map(r => ({
                id: r.id,
                sourceId: r.sourceId,
                receivedAt: r.receivedAt,
                method: r.method,
                status: r.status,
                body: typeof r.body === 'string' ? r.body : JSON.stringify(r.body),
            }));
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
            const session = getSession(req);
            if (!session) return reply.code(401).send({ error: 'Unauthorized' });

            const sourceId = trimString(req.body?.sourceId);
            if (!sourceId) {
                return reply.code(400).send({ error: 'sourceId is required' });
            }
            // Only allow testing sources owned by the caller's tenant
            const source = await prisma.webhookSource.findUnique({ where: { id: sourceId } });
            if (!source) return reply.code(404).send({ error: 'source not found' });
            if (source.tenantId !== session.tenantId) return reply.code(403).send({ error: 'Forbidden' });

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

    // ── Webhook trigger rules ────────────────────────────────────────────────

    /**
     * GET /v1/webhooks/inbound/rules
     * Lists trigger rules for the authenticated tenant.
     */
    app.get('/v1/webhooks/inbound/rules', async (req, reply) => {
        const session = getSession(req);
        if (!session) return reply.code(401).send({ error: 'Unauthorized' });

        const rules = await prisma.webhookTriggerRule.findMany({
            where: { tenantId: session.tenantId },
            orderBy: { createdAt: 'desc' },
        });
        return reply.send({ rules });
    });

    /**
     * POST /v1/webhooks/inbound/rules
     * Creates a trigger rule. Body:
     *   { name, botId, promptTemplate, workspaceId?, sourceId?,
     *     matchEventType?, matchField?, matchValue?, priority? }
     */
    app.post<{
        Body: {
            name?: unknown; botId?: unknown; promptTemplate?: unknown;
            workspaceId?: unknown; sourceId?: unknown;
            matchEventType?: unknown; matchField?: unknown; matchValue?: unknown;
            priority?: unknown;
        };
    }>('/v1/webhooks/inbound/rules', async (req, reply) => {
        const session = getSession(req);
        if (!session) return reply.code(401).send({ error: 'Unauthorized' });

        const name = trimString(req.body?.name);
        const botId = trimString(req.body?.botId);
        const promptTemplate = trimString(req.body?.promptTemplate);
        if (!name || !botId || !promptTemplate) {
            return reply.code(400).send({ error: 'name, botId and promptTemplate are required' });
        }

        // workspaceId must be in the caller's session scope
        const workspaceId = trimString(req.body?.workspaceId) || session.workspaceIds?.[0] || '';
        if (!workspaceId) {
            return reply.code(400).send({ error: 'workspaceId is required' });
        }
        if (session.workspaceIds && !session.workspaceIds.includes(workspaceId)) {
            return reply.code(403).send({ error: 'workspaceId is not in your session scope' });
        }

        // The target bot must exist and belong to the rule's workspace (which is
        // already scoped to the caller's tenant) — prevents pointing a rule at
        // another tenant's agent.
        const bot = await prisma.bot.findUnique({ where: { id: botId } });
        if (!bot) return reply.code(404).send({ error: 'bot not found' });
        if (bot.workspaceId !== workspaceId) {
            return reply.code(403).send({ error: 'bot does not belong to the selected workspace' });
        }

        // If a sourceId is given, it must belong to the caller's tenant.
        const sourceId = trimString(req.body?.sourceId) || null;
        if (sourceId) {
            const src = await prisma.webhookSource.findUnique({ where: { id: sourceId } });
            if (!src) return reply.code(404).send({ error: 'source not found' });
            if (src.tenantId !== session.tenantId) return reply.code(403).send({ error: 'Forbidden' });
        }

        const priorityRaw = trimString(req.body?.priority) || 'normal';
        const priority = VALID_PRIORITIES.has(priorityRaw as QueuePriority) ? priorityRaw : 'normal';

        const rule = await prisma.webhookTriggerRule.create({
            data: {
                tenantId: session.tenantId,
                workspaceId,
                sourceId,
                name,
                botId,
                promptTemplate,
                matchEventType: trimString(req.body?.matchEventType) || null,
                matchField: trimString(req.body?.matchField) || null,
                matchValue: trimString(req.body?.matchValue) || null,
                priority,
            },
        });
        return reply.code(201).send({ rule });
    });

    /**
     * PATCH /v1/webhooks/inbound/rules/:ruleId
     * Toggles a rule's enabled flag. Body: { enabled: boolean }
     */
    app.patch<{ Params: { ruleId: string }; Body: { enabled?: unknown } }>(
        '/v1/webhooks/inbound/rules/:ruleId',
        async (req, reply) => {
            const session = getSession(req);
            if (!session) return reply.code(401).send({ error: 'Unauthorized' });

            const existing = await prisma.webhookTriggerRule.findUnique({ where: { id: req.params.ruleId } });
            if (!existing) return reply.code(404).send({ error: 'rule not found' });
            if (existing.tenantId !== session.tenantId) return reply.code(403).send({ error: 'Forbidden' });

            const enabled = typeof req.body?.enabled === 'boolean' ? req.body.enabled : existing.enabled;
            const rule = await prisma.webhookTriggerRule.update({
                where: { id: req.params.ruleId },
                data: { enabled },
            });
            return reply.send({ rule });
        },
    );

    /**
     * DELETE /v1/webhooks/inbound/rules/:ruleId
     * Removes a trigger rule (must belong to the authenticated tenant).
     */
    app.delete<{ Params: { ruleId: string } }>(
        '/v1/webhooks/inbound/rules/:ruleId',
        async (req, reply) => {
            const session = getSession(req);
            if (!session) return reply.code(401).send({ error: 'Unauthorized' });

            const existing = await prisma.webhookTriggerRule.findUnique({ where: { id: req.params.ruleId } });
            if (!existing) return reply.code(404).send({ error: 'rule not found' });
            if (existing.tenantId !== session.tenantId) return reply.code(403).send({ error: 'Forbidden' });

            await prisma.webhookTriggerRule.delete({ where: { id: req.params.ruleId } });
            return reply.send({ deleted: true });
        },
    );
}
