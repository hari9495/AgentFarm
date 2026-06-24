// ============================================================================
// Tracker poll-source management (C4 / C4.1).
//
// CRUD over TrackerPollSource so operators can configure which trackers an
// agent pulls assigned tickets from — first-class (jira/linear/github) or a
// universal custom REST tracker (CustomPollSpec). Tenant-scoped, session-gated.
//
// The raw token/secretRef is never returned to the browser; responses expose
// `hasSecret` only.
// ============================================================================

import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { ROLE_RANK } from '../../lib/require-role.js';

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    role?: string;
    expiresAt: number;
};

export type RegisterTrackerPollSourceRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
    prisma?: PrismaClient;
};

const TRACKERS = ['jira', 'linear', 'github', 'custom'] as const;
type Tracker = (typeof TRACKERS)[number];

type PollSourceBody = {
    tracker?: string;
    agentId?: string | null;
    baseUrl?: string | null;
    assignee?: string;
    projectFilter?: string | null;
    secretRef?: string | null;
    enabled?: boolean;
    intervalSec?: number;
    customConfig?: unknown;
};

const getPrisma = async () => {
    const db = await import('../../lib/db.js');
    return db.prisma;
};

/** Shape a row for the browser — never leak the secret. */
function present(row: Record<string, unknown>) {
    return {
        id: row['id'],
        tenantId: row['tenantId'],
        agentId: row['agentId'] ?? null,
        tracker: row['tracker'],
        baseUrl: row['baseUrl'] ?? null,
        assignee: row['assignee'],
        projectFilter: row['projectFilter'] ?? null,
        hasSecret: Boolean(row['secretRef']),
        enabled: row['enabled'],
        intervalSec: row['intervalSec'],
        customConfig: row['customConfig'] ?? null,
        lastPolledAt: row['lastPolledAt'] ?? null,
        lastError: row['lastError'] ?? null,
        createdAt: row['createdAt'],
        updatedAt: row['updatedAt'],
    };
}

/** Validate create/update input. Returns an error string or null. */
function validate(body: PollSourceBody, isCreate: boolean): string | null {
    if (isCreate || body.tracker !== undefined) {
        if (!body.tracker || !TRACKERS.includes(body.tracker as Tracker)) {
            return `tracker must be one of: ${TRACKERS.join(', ')}`;
        }
    }
    if (isCreate || body.assignee !== undefined) {
        if (!body.assignee || !body.assignee.trim()) return 'assignee is required';
    }
    if (body.intervalSec !== undefined && (!Number.isInteger(body.intervalSec) || body.intervalSec < 30)) {
        return 'intervalSec must be an integer >= 30';
    }
    const tracker = body.tracker as Tracker | undefined;
    if (tracker === 'custom' || (body.customConfig !== undefined && body.customConfig !== null)) {
        const c = body.customConfig as { url?: string; idField?: string } | undefined | null;
        if (tracker === 'custom' && (!c || typeof c !== 'object')) return 'custom tracker requires customConfig';
        if (c && (!c.url || !c.idField)) return 'customConfig requires url and idField';
    }
    if (tracker === 'github' && isCreate && (!body.projectFilter || !String(body.projectFilter).includes('/'))) {
        return 'github source requires projectFilter "owner/repo"';
    }
    return null;
}

export const registerTrackerPollSourceRoutes = async (
    app: FastifyInstance,
    options: RegisterTrackerPollSourceRoutesOptions,
): Promise<void> => {
    const resolvePrisma = options.prisma ? () => Promise.resolve(options.prisma!) : getPrisma;

    const requireRole = (session: SessionContext, min: string): boolean =>
        (ROLE_RANK[session.role ?? ''] ?? 0) >= (ROLE_RANK[min] ?? 99);

    // GET /v1/tracker-poll-sources — list for the tenant
    app.get('/v1/tracker-poll-sources', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) return reply.code(401).send({ error: 'unauthorized' });
        if (!requireRole(session, 'viewer')) {
            return reply.code(403).send({ error: 'insufficient_role', required: 'viewer' });
        }
        const db = await resolvePrisma();
        const rows = await (db as any).trackerPollSource.findMany({
            where: { tenantId: session.tenantId },
            orderBy: { createdAt: 'desc' },
        });
        return reply.send({ sources: rows.map(present) });
    });

    // POST /v1/tracker-poll-sources — create
    app.post<{ Body: PollSourceBody }>('/v1/tracker-poll-sources', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) return reply.code(401).send({ error: 'unauthorized' });
        if (!requireRole(session, 'operator')) {
            return reply.code(403).send({ error: 'insufficient_role', required: 'operator' });
        }
        const body = request.body ?? {};
        const err = validate(body, true);
        if (err) return reply.code(400).send({ error: 'invalid_input', message: err });

        const db = await resolvePrisma();
        const row = await (db as any).trackerPollSource.create({
            data: {
                tenantId: session.tenantId,
                agentId: body.agentId ?? null,
                tracker: body.tracker,
                baseUrl: body.baseUrl ?? null,
                assignee: body.assignee!.trim(),
                projectFilter: body.projectFilter ?? null,
                secretRef: body.secretRef ?? null,
                enabled: body.enabled ?? true,
                intervalSec: body.intervalSec ?? 300,
                customConfig: (body.customConfig ?? null) as any,
            },
        });
        return reply.code(201).send({ source: present(row) });
    });

    // PATCH /v1/tracker-poll-sources/:id — update
    app.patch<{ Params: { id: string }; Body: PollSourceBody }>(
        '/v1/tracker-poll-sources/:id',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) return reply.code(401).send({ error: 'unauthorized' });
            if (!requireRole(session, 'operator')) {
                return reply.code(403).send({ error: 'insufficient_role', required: 'operator' });
            }
            const body = request.body ?? {};
            const err = validate(body, false);
            if (err) return reply.code(400).send({ error: 'invalid_input', message: err });

            const db = await resolvePrisma();
            const existing = await (db as any).trackerPollSource.findFirst({
                where: { id: request.params.id, tenantId: session.tenantId },
            });
            if (!existing) return reply.code(404).send({ error: 'not_found' });

            const data: Record<string, unknown> = {};
            if (body.tracker !== undefined) data['tracker'] = body.tracker;
            if (body.agentId !== undefined) data['agentId'] = body.agentId;
            if (body.baseUrl !== undefined) data['baseUrl'] = body.baseUrl;
            if (body.assignee !== undefined) data['assignee'] = body.assignee.trim();
            if (body.projectFilter !== undefined) data['projectFilter'] = body.projectFilter;
            // Only overwrite the secret when a non-empty value is supplied.
            if (body.secretRef !== undefined && body.secretRef !== null && body.secretRef !== '') {
                data['secretRef'] = body.secretRef;
            }
            if (body.enabled !== undefined) data['enabled'] = body.enabled;
            if (body.intervalSec !== undefined) data['intervalSec'] = body.intervalSec;
            if (body.customConfig !== undefined) data['customConfig'] = body.customConfig as any;

            const row = await (db as any).trackerPollSource.update({
                where: { id: request.params.id },
                data,
            });
            return reply.send({ source: present(row) });
        },
    );

    // DELETE /v1/tracker-poll-sources/:id
    app.delete<{ Params: { id: string } }>('/v1/tracker-poll-sources/:id', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) return reply.code(401).send({ error: 'unauthorized' });
        if (!requireRole(session, 'operator')) {
            return reply.code(403).send({ error: 'insufficient_role', required: 'operator' });
        }
        const db = await resolvePrisma();
        const existing = await (db as any).trackerPollSource.findFirst({
            where: { id: request.params.id, tenantId: session.tenantId },
        });
        if (!existing) return reply.code(404).send({ error: 'not_found' });
        await (db as any).trackerPollSource.delete({ where: { id: request.params.id } });
        return reply.send({ deleted: true });
    });
};
