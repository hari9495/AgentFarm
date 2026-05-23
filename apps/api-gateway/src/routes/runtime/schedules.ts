import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { ROLE_RANK } from '../lib/require-role.js';

// ---------------------------------------------------------------------------
// Cron validation — exactly 5 whitespace-separated fields, each matching the
// allowed pattern: * | */n | n | n,m,... | n-m
// ---------------------------------------------------------------------------

const CRON_FIELD_RE = /^(\*|(\*\/\d+)|\d+(,\d+)*|(\d+-\d+))$/;

function isValidCronExpr(expr: string): boolean {
    const fields = expr.trim().split(/\s+/);
    if (fields.length !== 5) return false;
    return fields.every((f) => CRON_FIELD_RE.test(f));
}

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

export type RegisterScheduleRoutesOptions = {
    getSession: (req: FastifyRequest) => SessionContext | null;
    prisma?: PrismaClient;
};

const getPrisma = async () => {
    const db = await import('../lib/db.js');
    return db.prisma;
};

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export const registerScheduleRoutes = async (
    app: FastifyInstance,
    options: RegisterScheduleRoutesOptions,
): Promise<void> => {
    const resolvePrisma = options.prisma
        ? () => Promise.resolve(options.prisma!)
        : getPrisma;

    // ── GET /v1/schedules — viewer+ ─────────────────────────────────────────
    app.get('/v1/schedules', async (req, reply) => {
        const session = options.getSession(req);
        if (!session) return reply.code(401).send({ error: 'unauthorized' });
        if ((ROLE_RANK[session.role ?? ''] ?? 0) < (ROLE_RANK['viewer'] ?? 99)) {
            return reply.code(403).send({
                error: 'insufficient_role',
                required: 'viewer',
                actual: session.role,
            });
        }

        const db = await resolvePrisma();
        const schedules = await db.scheduledJob.findMany({
            where: { tenantId: session.tenantId },
            orderBy: { createdAt: 'desc' },
        });

        return reply.code(200).send({ schedules });
    });

    // ── POST /v1/schedules — operator+ ──────────────────────────────────────
    app.post<{
        Body: {
            name?: unknown;
            cronExpr?: unknown;
            goal?: unknown;
            agentId?: unknown;
            enabled?: unknown;
        };
    }>('/v1/schedules', async (req, reply) => {
        const session = options.getSession(req);
        if (!session) return reply.code(401).send({ error: 'unauthorized' });
        if ((ROLE_RANK[session.role ?? ''] ?? 0) < (ROLE_RANK['operator'] ?? 99)) {
            return reply.code(403).send({
                error: 'insufficient_role',
                required: 'operator',
                actual: session.role,
            });
        }

        const { name, cronExpr, goal, agentId, enabled } = req.body ?? {};

        if (typeof name !== 'string' || name.trim().length === 0) {
            return reply.code(400).send({ error: 'name is required' });
        }
        if (typeof cronExpr !== 'string' || !isValidCronExpr(cronExpr)) {
            return reply.code(400).send({ error: 'invalid cronExpr' });
        }
        if (typeof goal !== 'string' || goal.trim().length === 0) {
            return reply.code(400).send({ error: 'goal is required' });
        }

        const db = await resolvePrisma();
        const job = await db.scheduledJob.create({
            data: {
                tenantId: session.tenantId,
                name: name.trim(),
                cronExpr,
                goal: goal.trim(),
                agentId: typeof agentId === 'string' ? agentId : null,
                enabled: typeof enabled === 'boolean' ? enabled : true,
                nextRunAt: new Date(),
            },
        });

        return reply.code(201).send(job);
    });

    // ── GET /v1/schedules/:id — viewer+ ─────────────────────────────────────
    app.get<{ Params: { id: string } }>('/v1/schedules/:id', async (req, reply) => {
        const session = options.getSession(req);
        if (!session) return reply.code(401).send({ error: 'unauthorized' });
        if ((ROLE_RANK[session.role ?? ''] ?? 0) < (ROLE_RANK['viewer'] ?? 99)) {
            return reply.code(403).send({
                error: 'insufficient_role',
                required: 'viewer',
                actual: session.role,
            });
        }

        const db = await resolvePrisma();
        const job = await db.scheduledJob.findUnique({ where: { id: req.params.id } });

        if (!job || job.tenantId !== session.tenantId) {
            return reply.code(404).send({ error: 'not_found' });
        }

        return reply.code(200).send(job);
    });

    // ── PATCH /v1/schedules/:id — operator+ ─────────────────────────────────
    app.patch<{
        Params: { id: string };
        Body: {
            name?: unknown;
            cronExpr?: unknown;
            goal?: unknown;
            agentId?: unknown;
            enabled?: unknown;
        };
    }>('/v1/schedules/:id', async (req, reply) => {
        const session = options.getSession(req);
        if (!session) return reply.code(401).send({ error: 'unauthorized' });
        if ((ROLE_RANK[session.role ?? ''] ?? 0) < (ROLE_RANK['operator'] ?? 99)) {
            return reply.code(403).send({
                error: 'insufficient_role',
                required: 'operator',
                actual: session.role,
            });
        }

        const db = await resolvePrisma();
        const existing = await db.scheduledJob.findUnique({ where: { id: req.params.id } });

        if (!existing || existing.tenantId !== session.tenantId) {
            return reply.code(404).send({ error: 'not_found' });
        }

        const { name, cronExpr, goal, agentId, enabled } = req.body ?? {};
        const update: Record<string, unknown> = {};

        if (typeof name === 'string') update['name'] = name;
        if (typeof goal === 'string') update['goal'] = goal;
        if (typeof enabled === 'boolean') update['enabled'] = enabled;
        if (agentId === null || typeof agentId === 'string') update['agentId'] = agentId;

        if (cronExpr !== undefined) {
            if (typeof cronExpr !== 'string' || !isValidCronExpr(cronExpr)) {
                return reply.code(400).send({ error: 'invalid cronExpr' });
            }
            update['cronExpr'] = cronExpr;
            update['nextRunAt'] = new Date();
        }

        const updated = await db.scheduledJob.update({
            where: { id: req.params.id },
            data: update,
        });

        return reply.code(200).send(updated);
    });

    // ── DELETE /v1/schedules/:id — admin+ ───────────────────────────────────
    app.delete<{ Params: { id: string } }>('/v1/schedules/:id', async (req, reply) => {
        const session = options.getSession(req);
        if (!session) return reply.code(401).send({ error: 'unauthorized' });
        if ((ROLE_RANK[session.role ?? ''] ?? 0) < (ROLE_RANK['admin'] ?? 99)) {
            return reply.code(403).send({
                error: 'insufficient_role',
                required: 'admin',
                actual: session.role,
            });
        }

        const db = await resolvePrisma();
        const existing = await db.scheduledJob.findUnique({ where: { id: req.params.id } });

        if (!existing || existing.tenantId !== session.tenantId) {
            return reply.code(404).send({ error: 'not_found' });
        }

        await db.scheduledJob.delete({ where: { id: req.params.id } });
        return reply.code(204).send();
    });
};
