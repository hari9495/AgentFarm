/**
 * agent-lifecycle.ts — Sprint 9: Fire-agent / Graceful Deprovision
 *
 * POST /v1/agents/:botId/terminate
 *   Fires a graceful teardown of a running agent.  Creates a ProvisioningJob
 *   with status='cleanup_pending' and triggerSource='termination' so the
 *   provisioning worker's existing cleanup runner picks it up and runs the
 *   full deprovision sequence: deprovision_vm → delete_storage →
 *   delete_network → delete_resource_group.
 *
 * Idempotent: if an active terminate job already exists for the bot it is
 * returned without creating a duplicate.
 *
 * GET /v1/agents/:botId/terminate/status
 *   Returns the latest termination job status for the bot.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    scope?: 'customer' | 'internal';
    expiresAt: number;
};

type BotIdParams = { botId: string };

// Statuses that indicate a termination job is already in flight
const ACTIVE_TERMINATE_STATUSES = ['cleanup_pending'] as const;

export type RegisterAgentLifecycleRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
    prisma?: PrismaClient;
};

const getPrismaDefault = async () => {
    const db = await import('../../lib/db.js');
    return db.prisma;
};

export async function registerAgentLifecycleRoutes(
    app: FastifyInstance,
    options: RegisterAgentLifecycleRoutesOptions,
): Promise<void> {
    const resolvePrisma = options.prisma
        ? () => Promise.resolve(options.prisma!)
        : getPrismaDefault;

    // -----------------------------------------------------------------------
    // POST /v1/agents/:botId/terminate
    // Initiates graceful agent teardown.  Requires an authenticated session
    // scoped to the bot's tenant.
    // -----------------------------------------------------------------------
    app.post<{ Params: BotIdParams }>(
        '/v1/agents/:botId/terminate',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) {
                return reply.code(401).send({ error: 'Authentication required.' });
            }

            const { botId } = request.params;
            if (!botId) {
                return reply.code(400).send({ error: 'botId is required.' });
            }

            const prisma = await resolvePrisma();

            // Resolve bot
            const bot = await (prisma.bot as any).findUnique({
                where: { id: botId },
            }) as { id: string; workspaceId: string; role: string } | null;

            if (!bot) {
                return reply.code(404).send({ error: 'Bot not found.' });
            }

            // Resolve workspace and guard tenant scope
            const workspace = await (prisma.workspace as any).findUnique({
                where: { id: bot.workspaceId },
            }) as { id: string; tenantId: string } | null;

            if (!workspace) {
                return reply.code(404).send({ error: 'Workspace not found.' });
            }

            if (workspace.tenantId !== session.tenantId && session.scope !== 'internal') {
                return reply.code(403).send({ error: 'Forbidden: bot does not belong to your tenant.' });
            }

            // Idempotency guard: return existing active termination job if present
            const existing = await (prisma.provisioningJob as any).findFirst({
                where: {
                    botId,
                    triggerSource: 'termination',
                    status: { in: [...ACTIVE_TERMINATE_STATUSES] },
                },
                orderBy: { createdAt: 'desc' },
            }) as { id: string } | null;

            if (existing) {
                return reply.code(202).send({
                    jobId: existing.id,
                    status: 'cleanup_pending',
                    reused: true,
                    message: 'Termination already in progress.',
                });
            }

            const correlationId = `corr_terminate_${botId}_${Date.now()}`;

            // Create termination job in cleanup_pending — the provisioning worker's
            // listCleanupPending() path picks this up and runs the full deprovision
            // sequence (deprovision_vm → delete_storage → delete_network →
            // delete_resource_group).
            const job = await (prisma.provisioningJob as any).create({
                data: {
                    tenantId: workspace.tenantId,
                    workspaceId: workspace.id,
                    botId,
                    planId: 'termination',
                    runtimeTier: 'dedicated_vm',
                    roleType: bot.role,
                    correlationId,
                    triggerSource: 'termination',
                    status: 'cleanup_pending',
                    requestedBy: session.userId,
                    requestedAt: new Date(),
                    triggeredBy: 'user_terminate',
                    metadata: JSON.stringify({ reason: 'agent_fired_by_customer' }),
                },
            });

            return reply.code(202).send({
                jobId: job.id,
                status: 'cleanup_pending',
                reused: false,
                message: 'Agent termination initiated. Resources will be deprovisioned shortly.',
            });
        },
    );

    // -----------------------------------------------------------------------
    // GET /v1/agents/:botId/terminate/status
    // Returns the latest termination job for the bot.
    // -----------------------------------------------------------------------
    app.get<{ Params: BotIdParams }>(
        '/v1/agents/:botId/terminate/status',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) {
                return reply.code(401).send({ error: 'Authentication required.' });
            }

            const { botId } = request.params;
            const prisma = await resolvePrisma();

            const job = await (prisma.provisioningJob as any).findFirst({
                where: {
                    botId,
                    triggerSource: 'termination',
                },
                orderBy: { createdAt: 'desc' },
            }) as {
                id: string;
                status: string;
                correlationId: string;
                requestedAt: Date;
                completedAt: Date | null;
                cleanupResult: string | null;
                failureReason: string | null;
            } | null;

            if (!job) {
                return reply.code(404).send({ error: 'No termination job found for this bot.' });
            }

            return reply.code(200).send({
                jobId: job.id,
                status: job.status,
                correlationId: job.correlationId,
                requestedAt: job.requestedAt,
                completedAt: job.completedAt,
                cleanupResult: job.cleanupResult,
                failureReason: job.failureReason,
            });
        },
    );

    // -----------------------------------------------------------------------
    // POST /v1/agents/:botId/pause
    // Pauses a running agent — stops the container, keeps the VM alive so
    // resume is fast (no re-bootstrap needed).
    // Bot.status → 'paused'.  Billing continues (VM reserved).
    // -----------------------------------------------------------------------
    app.post<{ Params: BotIdParams }>(
        '/v1/agents/:botId/pause',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) {
                return reply.code(401).send({ error: 'Authentication required.' });
            }

            const { botId } = request.params;
            const prisma = await resolvePrisma();

            const bot = await (prisma.bot as any).findUnique({ where: { id: botId } }) as {
                id: string; workspaceId: string; role: string; status: string;
            } | null;
            if (!bot) return reply.code(404).send({ error: 'Bot not found.' });

            const workspace = await (prisma.workspace as any).findUnique({ where: { id: bot.workspaceId } }) as {
                id: string; tenantId: string;
            } | null;
            if (!workspace) return reply.code(404).send({ error: 'Workspace not found.' });
            if (workspace.tenantId !== session.tenantId && session.scope !== 'internal') {
                return reply.code(403).send({ error: 'Forbidden.' });
            }

            if (bot.status === 'paused') {
                return reply.code(200).send({ botId, status: 'paused', message: 'Agent is already paused.' });
            }
            if (bot.status !== 'active') {
                return reply.code(409).send({ error: `Cannot pause agent in status '${bot.status}'. Must be active.` });
            }

            await (prisma.bot as any).update({ where: { id: botId }, data: { status: 'paused' } });

            return reply.code(200).send({
                botId,
                status: 'paused',
                message: 'Agent paused. The VM is kept alive — resume will be instant.',
            });
        },
    );

    // -----------------------------------------------------------------------
    // POST /v1/agents/:botId/resume
    // Resumes a paused agent — restarts the container on the existing VM.
    // Bot.status → 'active'.
    // -----------------------------------------------------------------------
    app.post<{ Params: BotIdParams }>(
        '/v1/agents/:botId/resume',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) {
                return reply.code(401).send({ error: 'Authentication required.' });
            }

            const { botId } = request.params;
            const prisma = await resolvePrisma();

            const bot = await (prisma.bot as any).findUnique({ where: { id: botId } }) as {
                id: string; workspaceId: string; role: string; status: string;
            } | null;
            if (!bot) return reply.code(404).send({ error: 'Bot not found.' });

            const workspace = await (prisma.workspace as any).findUnique({ where: { id: bot.workspaceId } }) as {
                id: string; tenantId: string;
            } | null;
            if (!workspace) return reply.code(404).send({ error: 'Workspace not found.' });
            if (workspace.tenantId !== session.tenantId && session.scope !== 'internal') {
                return reply.code(403).send({ error: 'Forbidden.' });
            }

            if (bot.status === 'active') {
                return reply.code(200).send({ botId, status: 'active', message: 'Agent is already active.' });
            }
            if (bot.status !== 'paused') {
                return reply.code(409).send({ error: `Cannot resume agent in status '${bot.status}'. Must be paused.` });
            }

            await (prisma.bot as any).update({ where: { id: botId }, data: { status: 'active' } });

            return reply.code(200).send({
                botId,
                status: 'active',
                message: 'Agent resumed.',
            });
        },
    );
}
