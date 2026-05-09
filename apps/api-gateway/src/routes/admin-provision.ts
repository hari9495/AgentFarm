import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';

const getPrisma = async () => {
    const db = await import('../lib/db.js');
    return db.prisma;
};

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    scope?: 'customer' | 'internal';
    expiresAt: number;
};

type ProvisionBody = {
    tenantId: string;
    orderId: string;
};

type JobIdParams = {
    jobId: string;
};

export type RegisterAdminProvisionRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
    prisma?: PrismaClient;
};

export async function registerAdminProvisionRoutes(
    app: FastifyInstance,
    options: RegisterAdminProvisionRoutesOptions,
): Promise<void> {
    const resolvePrisma = options.prisma
        ? () => Promise.resolve(options.prisma!)
        : getPrisma;

    // -----------------------------------------------------------------------
    // POST /v1/admin/provision
    // Triggers a provisioning job from a paid billing order.
    // Requires internal scope session.
    // -----------------------------------------------------------------------
    app.post<{ Body: ProvisionBody }>('/v1/admin/provision', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'Authentication required.' });
        }
        if (session.scope !== 'internal') {
            return reply.code(403).send({ error: 'Admin access required.' });
        }

        const { tenantId, orderId } = request.body ?? ({} as ProvisionBody);
        if (!tenantId || !orderId) {
            return reply.code(400).send({ error: 'tenantId and orderId are required.' });
        }

        const prisma = await resolvePrisma();

        // Look up the order
        const order = await prisma.order.findFirst({ where: { id: orderId } });
        if (!order) {
            return reply.code(404).send({ error: 'Order not found.' });
        }

        // Ensure order is paid
        if (order.status !== 'paid') {
            return reply.code(400).send({ error: `Order status is '${order.status}'; must be 'paid' before provisioning.` });
        }

        // Look up the plan
        const plan = await prisma.plan.findFirst({ where: { id: order.planId } });
        if (!plan) {
            return reply.code(404).send({ error: 'Plan not found.' });
        }

        // Look up the tenant's workspace and bot
        const workspace = await (prisma.workspace as any).findFirst({ where: { tenantId } });
        if (!workspace) {
            return reply.code(404).send({ error: 'Workspace not found for tenant.' });
        }

        const bot = await (prisma.bot as any).findFirst({ where: { workspaceId: workspace.id } });
        if (!bot) {
            return reply.code(404).send({ error: 'Bot not found for workspace.' });
        }

        // Create the provisioning job
        const job = await prisma.provisioningJob.create({
            data: {
                tenantId,
                workspaceId: workspace.id,
                botId: bot.id,
                planId: order.planId,
                runtimeTier: 'dedicated_vm',
                roleType: 'developer_agent',
                correlationId: `corr_provision_${Date.now()}`,
                triggerSource: 'admin_billing',
                status: 'queued',
                requestedBy: session.userId,
                requestedAt: new Date(),
                orderId: order.id,
                triggeredBy: 'admin',
                metadata: JSON.stringify({
                    planName: plan.name,
                    customerEmail: order.customerEmail,
                    agentSlots: plan.agentSlots,
                }),
            },
        });

        return reply.code(200).send({
            jobId: job.id,
            status: 'queued',
            message: 'Provisioning started',
        });
    });

    // -----------------------------------------------------------------------
    // GET /v1/admin/provision/:jobId/status
    // Returns current status of a provisioning job.
    // Requires any valid session.
    // -----------------------------------------------------------------------
    app.get<{ Params: JobIdParams }>('/v1/admin/provision/:jobId/status', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'Authentication required.' });
        }

        const { jobId } = request.params;
        const prisma = await resolvePrisma();

        const job = await prisma.provisioningJob.findFirst({ where: { id: jobId } });
        if (!job) {
            return reply.code(404).send({ error: 'Job not found.' });
        }

        return reply.code(200).send({
            jobId: job.id,
            status: job.status,
            tenantId: job.tenantId,
            orderId: (job as any).orderId ?? null,
            triggeredBy: (job as any).triggeredBy ?? null,
            createdAt: job.createdAt,
            updatedAt: job.updatedAt,
        });
    });
}
