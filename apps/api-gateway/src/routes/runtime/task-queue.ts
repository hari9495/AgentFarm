/**
 * Phase 24 — Priority task queue routes.
 *
 * POST   /v1/task-queue                      — operator+, enqueue a new task
 * GET    /v1/task-queue                      — viewer+,   list entries for tenant
 * GET    /v1/task-queue/status               — viewer+,   in-memory queue depth + snapshot
 * GET    /v1/task-queue/:entryId             — viewer+,   fetch single entry
 * DELETE /v1/task-queue/:entryId             — operator+, cancel a pending entry
 * POST   /v1/task-queue/:entryId/complete    — operator+, mark entry done/failed and promote dependents
 */

import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ROLE_RANK } from '../lib/require-role.js';
import { checkDependenciesMet, type DepCheckDb } from '../lib/task-dep-utils.js';
import {
    enqueueTask,
    getQueueSnapshot,
    getQueueDepth,
    cancelFromQueue,
    type QueuePriority,
} from '../lib/task-queue.js';

// ─── Types ────────────────────────────────────────────────────────────────────

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    role?: string;
    expiresAt: number;
};

// Minimal shape of the Prisma operations this route needs.
// After `prisma generate` the real PrismaClient will satisfy this shape.
type TaskQueuePrisma = {
    taskQueueEntry: {
        create: (args: { data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
        findMany: (args: {
            where: Record<string, unknown>;
            orderBy?: unknown[];
            take?: number;
            select?: Record<string, boolean>;
        }) => Promise<Record<string, unknown>[]>;
        findFirst: (args: {
            where: Record<string, unknown>;
            select?: Record<string, boolean>;
        }) => Promise<Record<string, unknown> | null>;
        update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
    };
};

export type RegisterTaskQueueRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
    prisma?: TaskQueuePrisma;
};

const VALID_PRIORITIES: QueuePriority[] = ['high', 'normal', 'low'];

const getPrisma = async (): Promise<TaskQueuePrisma> => {
    const db = await import('../lib/db.js');
    return db.prisma as unknown as TaskQueuePrisma;
};

type EntryIdParams = { entryId: string };

// ─── Route registration ───────────────────────────────────────────────────────

export async function registerTaskQueueRoutes(
    app: FastifyInstance,
    options: RegisterTaskQueueRoutesOptions,
): Promise<void> {
    const resolvePrisma = options.prisma
        ? () => Promise.resolve(options.prisma!)
        : getPrisma;

    const { getSession } = options;

    // ── POST /v1/task-queue ──────────────────────────────────────────────────
    // Operator+ — validate body, create DB entry, enqueue in memory.
    app.post('/v1/task-queue', async (request, reply) => {
        const session = getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized', message: 'Authentication required.' });
        }
        const roleRank = ROLE_RANK[session.role ?? ''] ?? 0;
        if (roleRank < ROLE_RANK['operator']) {
            return reply.code(403).send({ error: 'forbidden', requiredRole: 'operator' });
        }

        const body = request.body as {
            workspaceId?: unknown;
            priority?: unknown;
            botId?: unknown;
            payload?: unknown;
            parentTaskId?: unknown;
            dependsOn?: unknown;
        };

        const workspaceId = typeof body.workspaceId === 'string' ? body.workspaceId.trim() : '';
        if (!workspaceId) {
            return reply.code(400).send({ error: 'invalid_input', message: 'workspaceId is required.' });
        }

        const rawPriority = body.priority ?? 'normal';
        if (!VALID_PRIORITIES.includes(rawPriority as QueuePriority)) {
            return reply.code(400).send({
                error: 'invalid_input',
                message: `priority must be one of: ${VALID_PRIORITIES.join(', ')}.`,
            });
        }
        const priority = rawPriority as QueuePriority;

        if (body.payload === undefined || body.payload === null) {
            return reply.code(400).send({ error: 'invalid_input', message: 'payload is required.' });
        }

        const botId = typeof body.botId === 'string' ? body.botId.trim() || undefined : undefined;

        const parentTaskId = typeof body.parentTaskId === 'string' && body.parentTaskId.trim()
            ? body.parentTaskId.trim()
            : undefined;

        let dependsOn: string[] = [];
        if (body.dependsOn !== undefined && body.dependsOn !== null) {
            if (!Array.isArray(body.dependsOn)) {
                return reply.code(400).send({ error: 'invalid_input', message: 'dependsOn must be an array of strings.' });
            }
            if (body.dependsOn.length > 50) {
                return reply.code(400).send({ error: 'invalid_input', message: 'dependsOn may not exceed 50 entries.' });
            }
            for (const dep of body.dependsOn) {
                if (typeof dep !== 'string' || !dep.trim()) {
                    return reply.code(400).send({ error: 'invalid_input', message: 'Each dependsOn entry must be a non-empty string.' });
                }
            }
            dependsOn = (body.dependsOn as string[]).map((d) => d.trim());
        }

        const id = randomUUID();
        const tenantId = session.tenantId;

        const prisma = await resolvePrisma();

        // Check whether all declared dependencies are already done.
        const depsCheck = dependsOn.length > 0
            ? await checkDependenciesMet(dependsOn, prisma as unknown as DepCheckDb)
            : { met: true, blocking: [] as string[] };

        await prisma.taskQueueEntry.create({
            data: {
                id,
                tenantId,
                workspaceId,
                botId: botId ?? null,
                priority,
                status: 'pending',
                payload: body.payload as Record<string, unknown>,
                parentTaskId: parentTaskId ?? null,
                dependsOn,
                dependencyMet: depsCheck.met,
            },
        });

        enqueueTask({
            id,
            tenantId,
            workspaceId,
            botId,
            priority,
            payload: body.payload,
            enqueuedAt: Date.now(),
        });

        return reply.code(202).send({
            queued: true,
            id,
            priority,
            position: getQueueDepth(),
        });
    });

    // ── GET /v1/task-queue ───────────────────────────────────────────────────
    // Viewer+ — list DB entries for the current tenant (up to 50, priority+time ordered).
    app.get<{ Querystring: { status?: string } }>('/v1/task-queue', async (request, reply) => {
        const session = getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized', message: 'Authentication required.' });
        }
        const roleRank = ROLE_RANK[session.role ?? ''] ?? 0;
        if (roleRank < ROLE_RANK['viewer']) {
            return reply.code(403).send({ error: 'forbidden', requiredRole: 'viewer' });
        }

        const statusFilter = request.query.status?.trim();
        const where: Record<string, unknown> = { tenantId: session.tenantId };
        if (statusFilter) {
            where['status'] = statusFilter;
        }

        const prisma = await resolvePrisma();
        const entries = await prisma.taskQueueEntry.findMany({
            where,
            orderBy: [{ priority: 'asc' }, { enqueuedAt: 'asc' }],
            take: 50,
        });

        return reply.code(200).send({ entries, count: entries.length });
    });

    // ── POST /v1/task-queue/:entryId/complete ───────────────────────────────
    // Operator+ — mark a queue entry as done or failed, then re-evaluate
    // the dependencyMet flag for every entry that listed it in dependsOn.
    // NOTE: registered BEFORE /:entryId routes to prevent radix-tree shadowing.
    app.post<{ Params: EntryIdParams; Body: { outcome?: unknown } }>(
        '/v1/task-queue/:entryId/complete',
        async (request, reply) => {
            const session = getSession(request);
            if (!session) {
                return reply.code(401).send({ error: 'unauthorized', message: 'Authentication required.' });
            }
            const roleRank = ROLE_RANK[session.role ?? ''] ?? 0;
            if (roleRank < ROLE_RANK['operator']) {
                return reply.code(403).send({ error: 'forbidden', requiredRole: 'operator' });
            }

            const { entryId } = request.params;
            const outcome = (request.body as Record<string, unknown>)?.['outcome'];
            if (outcome !== 'success' && outcome !== 'failed') {
                return reply.code(400).send({
                    error: 'invalid_input',
                    message: "outcome must be 'success' or 'failed'.",
                });
            }

            const prisma = await resolvePrisma();
            const entry = await prisma.taskQueueEntry.findFirst({
                where: { id: entryId, tenantId: session.tenantId },
            });

            if (!entry) {
                return reply.code(404).send({ error: 'not_found', message: 'Queue entry not found.' });
            }

            const newStatus = outcome === 'success' ? 'done' : 'failed';
            await prisma.taskQueueEntry.update({
                where: { id: entryId },
                data: { status: newStatus },
            });

            // Find all entries blocked on this one and re-check their deps.
            const dependents = await prisma.taskQueueEntry.findMany({
                where: { dependsOn: { has: entryId }, dependencyMet: false } as Record<string, unknown>,
            });

            const promoted: string[] = [];
            for (const dep of dependents) {
                const depId = String(dep['id']);
                const depDeps = Array.isArray(dep['dependsOn'])
                    ? (dep['dependsOn'] as string[])
                    : [];
                const check = await checkDependenciesMet(depDeps, prisma as unknown as DepCheckDb);
                if (check.met) {
                    await prisma.taskQueueEntry.update({
                        where: { id: depId },
                        data: { dependencyMet: true },
                    });
                    promoted.push(depId);
                }
            }

            return reply.code(200).send({ updated: entryId, promoted });
        },
    );

    // ── GET /v1/task-queue/status ────────────────────────────────────────────
    // Viewer+ — returns the current in-memory queue depth and a snapshot.
    // NOTE: registered BEFORE /:entryId to prevent radix-tree shadowing.
    app.get('/v1/task-queue/status', async (request, reply) => {
        const session = getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized', message: 'Authentication required.' });
        }
        const roleRank = ROLE_RANK[session.role ?? ''] ?? 0;
        if (roleRank < ROLE_RANK['viewer']) {
            return reply.code(403).send({ error: 'forbidden', requiredRole: 'viewer' });
        }

        return reply.code(200).send({
            depth: getQueueDepth(),
            snapshot: getQueueSnapshot(),
        });
    });

    // ── GET /v1/task-queue/:entryId ──────────────────────────────────────────
    // Viewer+ — fetch a single entry by id (must belong to caller's tenant).
    app.get<{ Params: EntryIdParams }>('/v1/task-queue/:entryId', async (request, reply) => {
        const session = getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized', message: 'Authentication required.' });
        }
        const roleRank = ROLE_RANK[session.role ?? ''] ?? 0;
        if (roleRank < ROLE_RANK['viewer']) {
            return reply.code(403).send({ error: 'forbidden', requiredRole: 'viewer' });
        }

        const { entryId } = request.params;
        const prisma = await resolvePrisma();
        const entry = await prisma.taskQueueEntry.findFirst({
            where: { id: entryId, tenantId: session.tenantId },
        });

        if (!entry) {
            return reply.code(404).send({ error: 'not_found', message: 'Queue entry not found.' });
        }

        return reply.code(200).send({ entry });
    });

    // ── DELETE /v1/task-queue/:entryId ───────────────────────────────────────
    // Operator+ — cancel a pending entry (409 if already running/done/failed/cancelled).
    app.delete<{ Params: EntryIdParams }>('/v1/task-queue/:entryId', async (request, reply) => {
        const session = getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized', message: 'Authentication required.' });
        }
        const roleRank = ROLE_RANK[session.role ?? ''] ?? 0;
        if (roleRank < ROLE_RANK['operator']) {
            return reply.code(403).send({ error: 'forbidden', requiredRole: 'operator' });
        }

        const { entryId } = request.params;
        const prisma = await resolvePrisma();

        // Find by id only first so we can distinguish 404 vs 403
        const entry = await prisma.taskQueueEntry.findFirst({
            where: { id: entryId },
        });

        if (!entry) {
            return reply.code(404).send({ error: 'not_found', message: 'Queue entry not found.' });
        }

        if (entry['tenantId'] !== session.tenantId) {
            return reply.code(403).send({ error: 'forbidden', message: 'Queue entry belongs to a different tenant.' });
        }

        if (entry['status'] !== 'pending') {
            return reply.code(409).send({
                error: 'cannot_cancel',
                message: `Queue entry cannot be cancelled in status '${String(entry['status'])}'.`,
                status: entry['status'],
            });
        }

        await prisma.taskQueueEntry.update({
            where: { id: entryId },
            data: { status: 'cancelled' },
        });

        cancelFromQueue(entryId);

        return reply.code(200).send({ cancelled: true });
    });
}
