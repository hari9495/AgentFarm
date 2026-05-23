import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { ROLE_RANK } from '../lib/require-role.js';

const getPrisma = async () => {
    const db = await import('../lib/db.js');
    return db.prisma;
};

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    role?: string;
    expiresAt: number;
};

export type RegisterScheduledReportRoutesOptions = {
    getSession: (req: FastifyRequest) => SessionContext | null;
    prisma?: PrismaClient;
};

const VALID_FREQUENCIES = new Set(['daily', 'weekly', 'monthly']);
const VALID_REPORT_TYPES = new Set(['cost', 'performance']);

function validateCreateBody(body: unknown): {
    name: string;
    workspaceId: string;
    recipientEmail: string;
    frequency: string;
    reportTypes: string[];
    enabled?: boolean;
} | { error: string } {
    if (!body || typeof body !== 'object') return { error: 'body required' };
    const b = body as Record<string, unknown>;

    if (typeof b['name'] !== 'string' || b['name'].trim() === '') {
        return { error: 'name is required and must be a non-empty string' };
    }
    if (typeof b['workspaceId'] !== 'string' || b['workspaceId'].trim() === '') {
        return { error: 'workspaceId is required' };
    }
    if (typeof b['recipientEmail'] !== 'string' || !b['recipientEmail'].includes('@')) {
        return { error: 'recipientEmail must be a valid email address' };
    }
    const frequency = typeof b['frequency'] === 'string' ? b['frequency'] : 'weekly';
    if (!VALID_FREQUENCIES.has(frequency)) {
        return { error: 'frequency must be daily, weekly, or monthly' };
    }
    if (!Array.isArray(b['reportTypes']) || (b['reportTypes'] as unknown[]).length === 0) {
        return { error: 'reportTypes must be a non-empty array' };
    }
    const reportTypes = b['reportTypes'] as unknown[];
    for (const rt of reportTypes) {
        if (!VALID_REPORT_TYPES.has(rt as string)) {
            return { error: 'reportTypes may only contain cost and/or performance' };
        }
    }

    return {
        name: b['name'].trim(),
        workspaceId: b['workspaceId'].trim(),
        recipientEmail: b['recipientEmail'].trim(),
        frequency,
        reportTypes: reportTypes as string[],
        enabled: typeof b['enabled'] === 'boolean' ? b['enabled'] : undefined,
    };
}

function validatePatchBody(body: unknown): {
    name?: string;
    recipientEmail?: string;
    frequency?: string;
    reportTypes?: string[];
    enabled?: boolean;
} | { error: string } {
    if (!body || typeof body !== 'object') return { error: 'body required' };
    const b = body as Record<string, unknown>;
    const patch: Record<string, unknown> = {};

    if ('name' in b) {
        if (typeof b['name'] !== 'string' || b['name'].trim() === '') {
            return { error: 'name must be a non-empty string' };
        }
        patch['name'] = b['name'].trim();
    }
    if ('recipientEmail' in b) {
        if (typeof b['recipientEmail'] !== 'string' || !b['recipientEmail'].includes('@')) {
            return { error: 'recipientEmail must be a valid email address' };
        }
        patch['recipientEmail'] = b['recipientEmail'].trim();
    }
    if ('frequency' in b) {
        if (!VALID_FREQUENCIES.has(b['frequency'] as string)) {
            return { error: 'frequency must be daily, weekly, or monthly' };
        }
        patch['frequency'] = b['frequency'];
    }
    if ('reportTypes' in b) {
        if (!Array.isArray(b['reportTypes']) || (b['reportTypes'] as unknown[]).length === 0) {
            return { error: 'reportTypes must be a non-empty array' };
        }
        const reportTypes = b['reportTypes'] as unknown[];
        for (const rt of reportTypes) {
            if (!VALID_REPORT_TYPES.has(rt as string)) {
                return { error: 'reportTypes may only contain cost and/or performance' };
            }
        }
        patch['reportTypes'] = reportTypes;
    }
    if ('enabled' in b) {
        if (typeof b['enabled'] !== 'boolean') {
            return { error: 'enabled must be a boolean' };
        }
        patch['enabled'] = b['enabled'];
    }

    return patch as {
        name?: string;
        recipientEmail?: string;
        frequency?: string;
        reportTypes?: string[];
        enabled?: boolean;
    };
}

export async function registerScheduledReportRoutes(
    app: FastifyInstance,
    opts: RegisterScheduledReportRoutesOptions,
): Promise<void> {
    const resolvePrisma = async () =>
        opts.prisma ?? (await getPrisma());

    // -----------------------------------------------------------------------
    // POST /v1/scheduled-reports — create a new scheduled report
    // operator+ required
    // -----------------------------------------------------------------------
    app.post('/v1/scheduled-reports', async (request, reply) => {
        const session = opts.getSession(request);
        if (!session) return reply.status(401).send({ error: 'unauthorized' });
        const roleRank = ROLE_RANK[session.role ?? ''] ?? 0;
        if (roleRank < ROLE_RANK['operator']) {
            return reply.status(403).send({ error: 'forbidden' });
        }

        const validated = validateCreateBody(request.body);
        if ('error' in validated) {
            return reply.status(400).send({ error: validated.error });
        }

        const prisma = await resolvePrisma();
        const now = new Date();
        const report = await (prisma as PrismaClient).scheduledReport.create({
            data: {
                tenantId: session.tenantId,
                workspaceId: validated.workspaceId,
                name: validated.name,
                recipientEmail: validated.recipientEmail,
                frequency: validated.frequency,
                reportTypes: validated.reportTypes,
                enabled: validated.enabled ?? true,
                nextSendAt: now,
            },
        });
        return reply.status(201).send({ report });
    });

    // -----------------------------------------------------------------------
    // GET /v1/scheduled-reports — list reports for the session tenant
    // viewer+ required
    // -----------------------------------------------------------------------
    app.get('/v1/scheduled-reports', async (request, reply) => {
        const session = opts.getSession(request);
        if (!session) return reply.status(401).send({ error: 'unauthorized' });
        const roleRank = ROLE_RANK[session.role ?? ''] ?? 0;
        if (roleRank < ROLE_RANK['viewer']) {
            return reply.status(403).send({ error: 'forbidden' });
        }

        const prisma = await resolvePrisma();
        const reports = await (prisma as PrismaClient).scheduledReport.findMany({
            where: { tenantId: session.tenantId },
            orderBy: { createdAt: 'desc' },
        });
        return reply.status(200).send({ reports });
    });

    // -----------------------------------------------------------------------
    // PATCH /v1/scheduled-reports/:reportId — partial update
    // operator+ required
    // -----------------------------------------------------------------------
    app.patch<{ Params: { reportId: string } }>(
        '/v1/scheduled-reports/:reportId',
        async (request, reply) => {
            const session = opts.getSession(request);
            if (!session) return reply.status(401).send({ error: 'unauthorized' });
            const roleRank = ROLE_RANK[session.role ?? ''] ?? 0;
            if (roleRank < ROLE_RANK['operator']) {
                return reply.status(403).send({ error: 'forbidden' });
            }

            const { reportId } = request.params;
            const prisma = await resolvePrisma();

            const existing = await (prisma as PrismaClient).scheduledReport.findUnique({
                where: { id: reportId },
            });
            if (!existing) return reply.status(404).send({ error: 'not found' });
            if (existing.tenantId !== session.tenantId) {
                return reply.status(403).send({ error: 'forbidden' });
            }

            const patch = validatePatchBody(request.body);
            if ('error' in patch) {
                return reply.status(400).send({ error: patch.error });
            }

            const report = await (prisma as PrismaClient).scheduledReport.update({
                where: { id: reportId },
                data: patch,
            });
            return reply.status(200).send({ report });
        },
    );

    // -----------------------------------------------------------------------
    // DELETE /v1/scheduled-reports/:reportId — hard delete
    // operator+ required
    // -----------------------------------------------------------------------
    app.delete<{ Params: { reportId: string } }>(
        '/v1/scheduled-reports/:reportId',
        async (request, reply) => {
            const session = opts.getSession(request);
            if (!session) return reply.status(401).send({ error: 'unauthorized' });
            const roleRank = ROLE_RANK[session.role ?? ''] ?? 0;
            if (roleRank < ROLE_RANK['operator']) {
                return reply.status(403).send({ error: 'forbidden' });
            }

            const { reportId } = request.params;
            const prisma = await resolvePrisma();

            const existing = await (prisma as PrismaClient).scheduledReport.findUnique({
                where: { id: reportId },
            });
            if (!existing) return reply.status(404).send({ error: 'not found' });
            if (existing.tenantId !== session.tenantId) {
                return reply.status(403).send({ error: 'forbidden' });
            }

            await (prisma as PrismaClient).scheduledReport.delete({
                where: { id: reportId },
            });
            return reply.status(200).send({ deleted: true });
        },
    );
}
