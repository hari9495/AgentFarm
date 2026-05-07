import type { FastifyInstance, FastifyRequest } from 'fastify';

const getPrisma = async () => {
    const db = await import('../lib/db.js');
    return db.prisma;
};

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    expiresAt: number;
};

type AuditSeverity = 'info' | 'warn' | 'error';

type AuditEventRecord = {
    id: string;
    tenantId: string;
    workspaceId: string;
    botId: string;
    eventType: string;
    severity: AuditSeverity;
    summary: string;
    sourceSystem: string;
    correlationId: string;
    createdAt: Date;
};

type AuditRepo = {
    createEvent(input: {
        tenantId: string;
        workspaceId: string;
        botId: string;
        eventType: string;
        severity: AuditSeverity;
        summary: string;
        sourceSystem: string;
        correlationId: string;
        createdAt: Date;
    }): Promise<AuditEventRecord>;
    listEvents(input: {
        tenantId: string;
        workspaceId: string;
        botId?: string;
        eventType?: string;
        severity?: AuditSeverity;
        from?: Date;
        to?: Date;
        before?: Date;
        limit: number;
    }): Promise<AuditEventRecord[]>;
    countRetentionCandidates(input: {
        tenantId: string;
        workspaceId: string;
        cutoff: Date;
    }): Promise<number>;
    deleteRetentionCandidates(input: {
        tenantId: string;
        workspaceId: string;
        cutoff: Date;
    }): Promise<number>;
};

type RegisterAuditRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
    repo?: AuditRepo;
    now?: () => number;
    defaultRetentionDays?: number;
};

type CreateAuditEventBody = {
    workspace_id?: string;
    bot_id?: string;
    event_type?: string;
    severity?: string;
    summary?: string;
    source_system?: string;
    correlation_id?: string;
};

type AuditQuery = {
    workspace_id?: string;
    bot_id?: string;
    event_type?: string;
    severity?: string;
    from?: string;
    to?: string;
    cursor?: string;
    limit?: string;
};

type RetentionBody = {
    workspace_id?: string;
    retention_days?: number;
    dry_run?: boolean;
};

const DEFAULT_RETENTION_DAYS = 90;

const normalizeSeverity = (value: string | undefined): AuditSeverity | null => {
    if (!value) {
        return null;
    }

    const normalized = value.trim().toLowerCase();
    if (normalized === 'info' || normalized === 'warn' || normalized === 'error') {
        return normalized;
    }

    return null;
};

const parseDate = (value: string | undefined): Date | null => {
    if (!value) {
        return null;
    }

    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) {
        return null;
    }

    return parsed;
};

const toApiEvent = (item: AuditEventRecord) => ({
    event_id: item.id,
    tenant_id: item.tenantId,
    workspace_id: item.workspaceId,
    bot_id: item.botId,
    event_type: item.eventType,
    severity: item.severity,
    summary: item.summary,
    source_system: item.sourceSystem,
    correlation_id: item.correlationId,
    created_at: item.createdAt.toISOString(),
});

const defaultRepo: AuditRepo = {
    async createEvent(input) {
        const prisma = await getPrisma();
        const created = await prisma.auditEvent.create({
            data: {
                tenantId: input.tenantId,
                workspaceId: input.workspaceId,
                botId: input.botId,
                eventType: input.eventType as never,
                severity: input.severity as never,
                summary: input.summary,
                sourceSystem: input.sourceSystem,
                correlationId: input.correlationId,
                createdAt: input.createdAt,
            },
        });

        return {
            id: created.id,
            tenantId: created.tenantId,
            workspaceId: created.workspaceId,
            botId: created.botId,
            eventType: created.eventType,
            severity: created.severity as AuditSeverity,
            summary: created.summary,
            sourceSystem: created.sourceSystem,
            correlationId: created.correlationId,
            createdAt: created.createdAt,
        };
    },

    async listEvents(input) {
        const prisma = await getPrisma();
        const events = (await prisma.auditEvent.findMany({
            where: {
                tenantId: input.tenantId,
                workspaceId: input.workspaceId,
                ...(input.botId ? { botId: input.botId } : {}),
                ...(input.eventType ? { eventType: input.eventType as never } : {}),
                ...(input.severity ? { severity: input.severity as never } : {}),
                createdAt: {
                    ...(input.from ? { gte: input.from } : {}),
                    ...(input.to ? { lte: input.to } : {}),
                    ...(input.before ? { lt: input.before } : {}),
                },
            },
            orderBy: [
                { createdAt: 'desc' },
                { id: 'desc' },
            ],
            take: input.limit,
        })) as AuditEventRecord[];

        return events.map((event: AuditEventRecord) => ({
            id: event.id,
            tenantId: event.tenantId,
            workspaceId: event.workspaceId,
            botId: event.botId,
            eventType: event.eventType,
            severity: event.severity as AuditSeverity,
            summary: event.summary,
            sourceSystem: event.sourceSystem,
            correlationId: event.correlationId,
            createdAt: event.createdAt,
        }));
    },

    async countRetentionCandidates(input) {
        const prisma = await getPrisma();
        return prisma.auditEvent.count({
            where: {
                tenantId: input.tenantId,
                workspaceId: input.workspaceId,
                createdAt: { lt: input.cutoff },
            },
        });
    },

    async deleteRetentionCandidates(input) {
        const prisma = await getPrisma();
        const result = await prisma.auditEvent.deleteMany({
            where: {
                tenantId: input.tenantId,
                workspaceId: input.workspaceId,
                createdAt: { lt: input.cutoff },
            },
        });

        return result.count;
    },
};

export const registerAuditRoutes = async (
    app: FastifyInstance,
    options: RegisterAuditRoutesOptions,
): Promise<void> => {
    const repo = options.repo ?? defaultRepo;
    const now = options.now ?? (() => Date.now());
    const defaultRetentionDays = Math.max(7, options.defaultRetentionDays ?? DEFAULT_RETENTION_DAYS);

    app.post<{ Body: CreateAuditEventBody }>('/v1/audit/events', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({
                error: 'unauthorized',
                message: 'A valid authenticated session is required.',
            });
        }

        const workspaceId = request.body?.workspace_id ?? session.workspaceIds[0];
        if (!workspaceId || !session.workspaceIds.includes(workspaceId)) {
            return reply.code(403).send({
                error: 'workspace_scope_violation',
                message: 'workspace_id is not in your authenticated session scope.',
            });
        }

        const botId = request.body?.bot_id?.trim();
        const eventType = request.body?.event_type?.trim();
        const summary = request.body?.summary?.trim();
        const sourceSystem = request.body?.source_system?.trim() ?? 'api-gateway';
        if (!botId || !eventType || !summary) {
            return reply.code(400).send({
                error: 'invalid_request',
                message: 'bot_id, event_type, and summary are required.',
            });
        }

        const severity = normalizeSeverity(request.body?.severity) ?? 'info';
        const correlationId = request.body?.correlation_id?.trim() || `audit_${Math.floor(now())}`;

        const created = await repo.createEvent({
            tenantId: session.tenantId,
            workspaceId,
            botId,
            eventType,
            severity,
            summary,
            sourceSystem,
            correlationId,
            createdAt: new Date(now()),
        });

        return reply.code(201).send({
            status: 'created',
            event: toApiEvent(created),
        });
    });

    app.get<{ Querystring: AuditQuery }>('/v1/audit/events', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({
                error: 'unauthorized',
                message: 'A valid authenticated session is required.',
            });
        }

        const workspaceId = request.query?.workspace_id ?? session.workspaceIds[0];
        if (!workspaceId || !session.workspaceIds.includes(workspaceId)) {
            return reply.code(403).send({
                error: 'workspace_scope_violation',
                message: 'workspace_id is not in your authenticated session scope.',
            });
        }

        const severity = request.query?.severity
            ? normalizeSeverity(request.query?.severity)
            : null;
        if (request.query?.severity && !severity) {
            return reply.code(400).send({
                error: 'invalid_severity',
                message: 'severity must be one of info, warn, error.',
            });
        }

        const from = parseDate(request.query?.from);
        if (request.query?.from && !from) {
            return reply.code(400).send({
                error: 'invalid_from',
                message: 'from must be a valid ISO timestamp.',
            });
        }

        const to = parseDate(request.query?.to);
        if (request.query?.to && !to) {
            return reply.code(400).send({
                error: 'invalid_to',
                message: 'to must be a valid ISO timestamp.',
            });
        }

        const before = parseDate(request.query?.cursor);
        if (request.query?.cursor && !before) {
            return reply.code(400).send({
                error: 'invalid_cursor',
                message: 'cursor must be a valid ISO timestamp.',
            });
        }

        const rawLimit = Number(request.query?.limit ?? '50');
        if (!Number.isFinite(rawLimit) || rawLimit <= 0) {
            return reply.code(400).send({
                error: 'invalid_limit',
                message: 'limit must be a positive integer.',
            });
        }

        const limit = Math.min(Math.trunc(rawLimit), 200);
        const events = await repo.listEvents({
            tenantId: session.tenantId,
            workspaceId,
            botId: request.query?.bot_id?.trim() || undefined,
            eventType: request.query?.event_type?.trim() || undefined,
            severity: severity ?? undefined,
            from: from ?? undefined,
            to: to ?? undefined,
            before: before ?? undefined,
            limit,
        });

        const nextCursor = events.length === limit
            ? events[events.length - 1]?.createdAt.toISOString() ?? null
            : null;

        return {
            workspace_id: workspaceId,
            count: events.length,
            next_cursor: nextCursor,
            events: events.map(toApiEvent),
        };
    });

    app.post<{ Body: RetentionBody }>('/v1/audit/retention/cleanup', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({
                error: 'unauthorized',
                message: 'A valid authenticated session is required.',
            });
        }

        const workspaceId = request.body?.workspace_id ?? session.workspaceIds[0];
        if (!workspaceId || !session.workspaceIds.includes(workspaceId)) {
            return reply.code(403).send({
                error: 'workspace_scope_violation',
                message: 'workspace_id is not in your authenticated session scope.',
            });
        }

        const retentionDays = request.body?.retention_days ?? defaultRetentionDays;
        if (!Number.isInteger(retentionDays) || retentionDays < 7 || retentionDays > 3650) {
            return reply.code(400).send({
                error: 'invalid_retention_days',
                message: 'retention_days must be an integer between 7 and 3650.',
            });
        }

        const cutoff = new Date(now() - retentionDays * 24 * 60 * 60 * 1000);
        const dryRun = request.body?.dry_run !== false;

        const candidateCount = await repo.countRetentionCandidates({
            tenantId: session.tenantId,
            workspaceId,
            cutoff,
        });

        if (dryRun) {
            return {
                status: 'dry_run',
                workspace_id: workspaceId,
                retention_days: retentionDays,
                cutoff_at: cutoff.toISOString(),
                candidate_count: candidateCount,
                deleted_count: 0,
            };
        }

        const deletedCount = await repo.deleteRetentionCandidates({
            tenantId: session.tenantId,
            workspaceId,
            cutoff,
        });

        return {
            status: 'deleted',
            workspace_id: workspaceId,
            retention_days: retentionDays,
            cutoff_at: cutoff.toISOString(),
            candidate_count: candidateCount,
            deleted_count: deletedCount,
        };
    });
};
