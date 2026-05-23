import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { verifyTimingSafeEqual } from '../lib/webhook-verify.js';

const getPrisma = async () => {
    const db = await import('../lib/db.js');
    return db.prisma;
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ZohoSignWebhookBody = {
    requests?: {
        request_id: string;
        request_status: string;
        actions?: Array<{ recipient_email?: string }>;
    };
};

export type RegisterZohoSignWebhookRoutesOptions = {
    getSession?: (request: FastifyRequest) => unknown;
    prisma?: PrismaClient;
};

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export async function registerZohoSignWebhookRoutes(
    app: FastifyInstance,
    options: RegisterZohoSignWebhookRoutesOptions = {},
): Promise<void> {
    const resolvePrisma = options.prisma
        ? () => Promise.resolve(options.prisma!)
        : getPrisma;

    // -----------------------------------------------------------------------
    // POST /v1/webhooks/zoho-sign
    // Called by Zoho Sign when a document status changes.
    // No auth session required — verified via shared webhook token.
    // -----------------------------------------------------------------------
    app.post<{ Body: ZohoSignWebhookBody }>(
        '/v1/webhooks/zoho-sign',
        async (request, reply) => {
            // Verify webhook token
            const incomingToken = request.headers['x-zoho-webhook-token'];
            const expectedToken = process.env['ZOHO_SIGN_WEBHOOK_TOKEN'];
            if (!incomingToken || !expectedToken ||
                !verifyTimingSafeEqual(incomingToken as string, expectedToken)) {
                return reply.code(401).send({ error: 'Unauthorized' });
            }

            const { requests } = request.body ?? {};
            if (!requests) {
                return reply.code(400).send({ error: 'Missing requests body' });
            }

            const { request_id, request_status } = requests;

            // Only act on completed documents
            if (request_status !== 'completed') {
                return reply.code(200).send({ received: true });
            }

            const prisma = await resolvePrisma();

            // Find the order linked to this Zoho Sign request
            const order = await prisma.order.findFirst({
                where: { zohoSignRequestId: request_id },
            });
            if (!order) {
                // Idempotent — unknown request ID
                return reply.code(200).send({ received: true });
            }

            // Mark the order as signed
            await prisma.order.update({
                where: { id: order.id },
                data: {
                    signatureStatus: 'signed',
                    signedAt: new Date(),
                },
            });

            // Idempotency: skip if a non-failed provisioning job already exists
            const existingJob = await prisma.provisioningJob.findFirst({
                where: { orderId: order.id },
            });
            if (existingJob && String(existingJob.status) !== 'failed') {
                return reply.code(200).send({ received: true });
            }

            // Look up the plan for slot/metadata details
            const plan = await prisma.plan.findFirst({ where: { id: order.planId } });
            if (!plan) {
                return reply.code(200).send({ received: true });
            }

            // Best-effort workspace and bot lookups (required schema fields)
            const workspace = await (prisma.workspace as any)
                .findFirst({ where: { tenantId: order.tenantId } })
                .catch(() => null);
            const bot = workspace
                ? await (prisma.bot as any)
                    .findFirst({ where: { workspaceId: workspace.id } })
                    .catch(() => null)
                : null;

            // Create provisioning job
            const job = await prisma.provisioningJob.create({
                data: {
                    tenantId: order.tenantId,
                    workspaceId: workspace?.id ?? '',
                    botId: bot?.id ?? '',
                    planId: order.planId,
                    runtimeTier: 'dedicated_vm',
                    roleType: 'developer_agent',
                    correlationId: `corr_zoho_${Date.now()}`,
                    triggerSource: 'zoho_sign_webhook',
                    status: 'queued',
                    requestedAt: new Date(),
                    requestedBy: 'zoho_sign_webhook',
                    triggeredBy: 'zoho_sign_webhook',
                    orderId: order.id,
                    metadata: JSON.stringify({
                        planName: plan.name,
                        customerEmail: order.customerEmail,
                        signedAt: new Date().toISOString(),
                    }),
                },
            });

            return reply.code(200).send({ received: true, jobId: job.id });
        },
    );
}
