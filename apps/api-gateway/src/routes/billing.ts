import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import {
    getProviderForCountry,
    createStripeOrder,
    createRazorpayOrder,
    verifyStripeWebhook,
    verifyRazorpayWebhook,
    createOrderRecord,
    markOrderPaid,
    createInvoiceRecord,
} from '../services/payment-service.js';
import { generateContractPdf } from '../services/contract-generator.js';
import { uploadContractDocument, submitDocumentForSigning } from '../services/zoho-sign-client.js';

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

type TenantIdParams = {
    tenantId: string;
};

type CreateOrderBody = {
    planId: string;
    customerEmail: string;
    customerCountry?: string;
    tenantId: string;
};

type RazorpayWebhookBody = {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
    orderId: string;
};

export type RegisterBillingRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
    prisma?: PrismaClient;
};

export async function registerBillingRoutes(
    app: FastifyInstance,
    options: RegisterBillingRoutesOptions,
): Promise<void> {
    const resolvePrisma = options.prisma
        ? () => Promise.resolve(options.prisma!)
        : getPrisma;

    // -----------------------------------------------------------------------
    // POST /v1/billing/create-order
    // -----------------------------------------------------------------------
    app.post<{ Body: CreateOrderBody }>(
        '/v1/billing/create-order',
        async (request, reply) => {
            const { planId, customerEmail, customerCountry = 'US', tenantId } = request.body;
            const prisma = await resolvePrisma();

            const plan = await prisma.plan.findFirst({ where: { id: planId, isActive: true } });
            if (!plan) {
                return reply.code(404).send({ error: 'Plan not found' });
            }

            const provider = getProviderForCountry(customerCountry);

            if (provider === 'stripe') {
                const providerData = await createStripeOrder({
                    amountCents: plan.priceUsd * 100,
                    currency: 'usd',
                    customerEmail,
                    tenantId,
                    planId,
                });
                const dbOrder = await createOrderRecord({
                    tenantId,
                    planId,
                    amountCents: plan.priceUsd * 100,
                    currency: 'usd',
                    paymentProvider: 'stripe',
                    providerOrderId: providerData.providerOrderId,
                    customerEmail,
                    customerCountry,
                });
                return reply.send({
                    provider,
                    orderId: dbOrder.id,
                    clientSecret: providerData.clientSecret,
                    providerOrderId: providerData.providerOrderId,
                });
            } else {
                const providerData = await createRazorpayOrder({
                    amountCents: plan.priceInr * 100,
                    currency: 'INR',
                    customerEmail,
                    tenantId,
                    planId,
                });
                const dbOrder = await createOrderRecord({
                    tenantId,
                    planId,
                    amountCents: plan.priceInr * 100,
                    currency: 'INR',
                    paymentProvider: 'razorpay',
                    providerOrderId: providerData.razorpayOrderId,
                    customerEmail,
                    customerCountry,
                });
                return reply.send({
                    provider,
                    orderId: dbOrder.id,
                    razorpayOrderId: providerData.razorpayOrderId,
                    amount: providerData.amount,
                    currency: providerData.currency,
                    keyId: providerData.keyId,
                });
            }
        },
    );

    // -----------------------------------------------------------------------
    // POST /v1/billing/webhook/stripe
    // -----------------------------------------------------------------------
    app.post(
        '/v1/billing/webhook/stripe',
        async (request, reply) => {
            const signature = (request.headers['stripe-signature'] as string) ?? '';
            const payload =
                typeof (request as unknown as { rawBody?: unknown }).rawBody === 'string'
                    ? ((request as unknown as { rawBody: string }).rawBody)
                    : JSON.stringify(request.body);

            const result = await verifyStripeWebhook(payload, signature);
            if (!result.success) {
                return reply.code(400).send({ error: 'Webhook verification failed' });
            }

            const order = await markOrderPaid({
                providerOrderId: result.providerOrderId,
                providerPaymentId: result.providerPaymentId,
            }).catch(() => null);

            if (order) {
                await createInvoiceRecord({
                    orderId: order.id,
                    tenantId: order.tenantId,
                    amountCents: order.amountCents,
                    currency: order.currency,
                }).catch(() => null);

                // Generate contract and send for signing (non-blocking)
                setImmediate(async () => {
                    try {
                        const prisma = await resolvePrisma();
                        const fullOrder = await prisma.order.findUnique({
                            where: { providerOrderId: result.providerOrderId },
                            include: { plan: true },
                        });
                        if (!fullOrder) return;

                        const pdfBuffer = await generateContractPdf({
                            customerName: fullOrder.customerEmail.split('@')[0],
                            customerEmail: fullOrder.customerEmail,
                            companyName: 'AgentFarm',
                            planName: fullOrder.plan.name,
                            agentSlots: fullOrder.plan.agentSlots,
                            amountCents: fullOrder.amountCents,
                            currency: fullOrder.currency,
                            features: fullOrder.plan.features,
                            orderId: fullOrder.id,
                            date: new Date(),
                        });

                        const { requestId } = await uploadContractDocument({
                            pdfBuffer,
                            fileName: `AgentFarm-Contract-${fullOrder.id}.pdf`,
                            recipientName: fullOrder.customerEmail.split('@')[0],
                            recipientEmail: fullOrder.customerEmail,
                            requestName: `AgentFarm Service Agreement - ${fullOrder.plan.name}`,
                        });

                        await submitDocumentForSigning(requestId);

                        await prisma.order.update({
                            where: { id: fullOrder.id },
                            data: {
                                zohoSignRequestId: requestId,
                                contractSentAt: new Date(),
                                signatureStatus: 'sent',
                            },
                        });
                    } catch (err) {
                        console.error('Contract generation failed (stripe):', err);
                    }
                });
            }

            return reply.send({ received: true });
        },
    );

    // -----------------------------------------------------------------------
    // POST /v1/billing/webhook/razorpay
    // -----------------------------------------------------------------------
    app.post<{ Body: RazorpayWebhookBody }>(
        '/v1/billing/webhook/razorpay',
        async (request, reply) => {
            const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = request.body;

            const valid = verifyRazorpayWebhook({
                orderId: razorpay_order_id,
                paymentId: razorpay_payment_id,
                signature: razorpay_signature,
            });
            if (!valid) {
                return reply.code(400).send({ error: 'Webhook verification failed' });
            }

            const order = await markOrderPaid({
                providerOrderId: razorpay_order_id,
                providerPaymentId: razorpay_payment_id,
                providerSignature: razorpay_signature,
            }).catch(() => null);

            if (order) {
                await createInvoiceRecord({
                    orderId: order.id,
                    tenantId: order.tenantId,
                    amountCents: order.amountCents,
                    currency: order.currency,
                }).catch(() => null);

                // Generate contract and send for signing (non-blocking)
                setImmediate(async () => {
                    try {
                        const prisma = await resolvePrisma();
                        const fullOrder = await prisma.order.findUnique({
                            where: { providerOrderId: razorpay_order_id },
                            include: { plan: true },
                        });
                        if (!fullOrder) return;

                        const pdfBuffer = await generateContractPdf({
                            customerName: fullOrder.customerEmail.split('@')[0],
                            customerEmail: fullOrder.customerEmail,
                            companyName: 'AgentFarm',
                            planName: fullOrder.plan.name,
                            agentSlots: fullOrder.plan.agentSlots,
                            amountCents: fullOrder.amountCents,
                            currency: fullOrder.currency,
                            features: fullOrder.plan.features,
                            orderId: fullOrder.id,
                            date: new Date(),
                        });

                        const { requestId } = await uploadContractDocument({
                            pdfBuffer,
                            fileName: `AgentFarm-Contract-${fullOrder.id}.pdf`,
                            recipientName: fullOrder.customerEmail.split('@')[0],
                            recipientEmail: fullOrder.customerEmail,
                            requestName: `AgentFarm Service Agreement - ${fullOrder.plan.name}`,
                        });

                        await submitDocumentForSigning(requestId);

                        await prisma.order.update({
                            where: { id: fullOrder.id },
                            data: {
                                zohoSignRequestId: requestId,
                                contractSentAt: new Date(),
                                signatureStatus: 'sent',
                            },
                        });
                    } catch (err) {
                        console.error('Contract generation failed (razorpay):', err);
                    }
                });
            }

            return reply.send({ received: true });
        },
    );

    // -----------------------------------------------------------------------
    // GET /v1/billing/orders/:tenantId
    // -----------------------------------------------------------------------
    app.get<{ Params: TenantIdParams }>(
        '/v1/billing/orders/:tenantId',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) {
                return reply.code(401).send({ error: 'Unauthorized' });
            }
            const { tenantId } = request.params;
            const prisma = await resolvePrisma();
            const orders = await prisma.order.findMany({
                where: { tenantId },
                include: { invoice: true },
                orderBy: { createdAt: 'desc' },
            });
            return reply.send({ orders });
        },
    );

    // -----------------------------------------------------------------------
    // GET /v1/billing/plans
    // -----------------------------------------------------------------------
    app.get(
        '/v1/billing/plans',
        async (_request, reply) => {
            const prisma = await resolvePrisma();
            const plans = await prisma.plan.findMany({ where: { isActive: true } });
            return reply.send({ plans });
        },
    );
}
