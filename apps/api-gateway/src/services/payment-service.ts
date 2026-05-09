import Stripe from 'stripe';
import Razorpay from 'razorpay';
import crypto from 'node:crypto';
import type { PrismaClient, Order, Invoice } from '@prisma/client';

const getPrisma = async (): Promise<PrismaClient> => {
    const db = await import('../lib/db.js');
    return db.prisma;
};

// ---------------------------------------------------------------------------
// Provider selection
// ---------------------------------------------------------------------------

export function getProviderForCountry(country: string): 'stripe' | 'razorpay' {
    return country === 'IN' ? 'razorpay' : 'stripe';
}

// ---------------------------------------------------------------------------
// Stripe
// ---------------------------------------------------------------------------

export async function createStripeOrder(params: {
    amountCents: number;
    currency: string;
    customerEmail: string;
    tenantId: string;
    planId: string;
    metadata?: Record<string, string>;
}): Promise<{ orderId: string; clientSecret: string; providerOrderId: string }> {
    const stripeKey = process.env['STRIPE_SECRET_KEY'] ?? '';
    const stripe = new Stripe(stripeKey);
    const orderId = crypto.randomUUID();
    const intent = await stripe.paymentIntents.create({
        amount: params.amountCents,
        currency: params.currency,
        receipt_email: params.customerEmail,
        metadata: {
            tenantId: params.tenantId,
            planId: params.planId,
            orderId,
            ...params.metadata,
        },
    });
    return {
        orderId,
        clientSecret: intent.client_secret ?? '',
        providerOrderId: intent.id,
    };
}

export async function verifyStripeWebhook(
    payload: string,
    signature: string,
): Promise<{
    success: boolean;
    providerOrderId: string;
    providerPaymentId: string;
    customerEmail: string;
}> {
    const stripeKey = process.env['STRIPE_SECRET_KEY'] ?? '';
    const webhookSecret = process.env['STRIPE_WEBHOOK_SECRET'] ?? '';
    const stripe = new Stripe(stripeKey);
    const empty = { success: false, providerOrderId: '', providerPaymentId: '', customerEmail: '' };
    try {
        const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
        if (event.type !== 'payment_intent.succeeded') {
            return empty;
        }
        const intent = event.data.object as Stripe.PaymentIntent;
        const providerPaymentId =
            typeof intent.latest_charge === 'string'
                ? intent.latest_charge
                : (intent.latest_charge as Stripe.Charge | null)?.id ?? '';
        return {
            success: true,
            providerOrderId: intent.id,
            providerPaymentId,
            customerEmail: intent.receipt_email ?? '',
        };
    } catch {
        return empty;
    }
}

// ---------------------------------------------------------------------------
// Razorpay
// ---------------------------------------------------------------------------

export async function createRazorpayOrder(params: {
    amountCents: number;
    currency: string;
    customerEmail: string;
    tenantId: string;
    planId: string;
}): Promise<{
    orderId: string;
    razorpayOrderId: string;
    amount: number;
    currency: string;
    keyId: string;
}> {
    const keyId = process.env['RAZORPAY_KEY_ID'] ?? '';
    const keySecret = process.env['RAZORPAY_KEY_SECRET'] ?? '';
    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const orderId = crypto.randomUUID();
    const order = await razorpay.orders.create({
        amount: params.amountCents,
        currency: params.currency,
        receipt: orderId,
        notes: {
            tenantId: params.tenantId,
            planId: params.planId,
            customerEmail: params.customerEmail,
        },
    });
    return {
        orderId,
        razorpayOrderId: order.id,
        amount: typeof order.amount === 'number' ? order.amount : Number(order.amount),
        currency: order.currency,
        keyId,
    };
}

export function verifyRazorpayWebhook(params: {
    orderId: string;
    paymentId: string;
    signature: string;
}): boolean {
    const keySecret = process.env['RAZORPAY_KEY_SECRET'] ?? '';
    const body = `${params.orderId}|${params.paymentId}`;
    const expectedSignature = crypto.createHmac('sha256', keySecret).update(body).digest('hex');
    return expectedSignature === params.signature;
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

export async function createOrderRecord(
    params: {
        tenantId: string;
        planId: string;
        amountCents: number;
        currency: string;
        paymentProvider: 'stripe' | 'razorpay';
        providerOrderId: string;
        customerEmail: string;
        customerCountry?: string;
    },
    prismaOverride?: PrismaClient,
): Promise<Order> {
    const prisma = prismaOverride ?? (await getPrisma());
    return prisma.order.create({
        data: {
            tenantId: params.tenantId,
            planId: params.planId,
            amountCents: params.amountCents,
            currency: params.currency,
            status: 'pending',
            paymentProvider: params.paymentProvider,
            providerOrderId: params.providerOrderId,
            customerEmail: params.customerEmail,
            customerCountry: params.customerCountry,
        },
    });
}

export async function markOrderPaid(
    params: {
        providerOrderId: string;
        providerPaymentId: string;
        providerSignature?: string;
    },
    prismaOverride?: PrismaClient,
): Promise<Order> {
    const prisma = prismaOverride ?? (await getPrisma());
    const order = await prisma.order.findFirst({
        where: { providerOrderId: params.providerOrderId },
    });
    if (!order) {
        throw new Error(`Order not found for providerOrderId: ${params.providerOrderId}`);
    }
    return prisma.order.update({
        where: { id: order.id },
        data: {
            status: 'paid',
            providerPaymentId: params.providerPaymentId,
            providerSignature: params.providerSignature,
            updatedAt: new Date(),
        },
    });
}

export function generateInvoiceNumber(): string {
    const year = new Date().getFullYear();
    const suffix = String(Math.floor(Math.random() * 900) + 100);
    return `INV-${year}-${suffix}`;
}

export async function createInvoiceRecord(
    params: {
        orderId: string;
        tenantId: string;
        amountCents: number;
        currency: string;
    },
    prismaOverride?: PrismaClient,
): Promise<Invoice> {
    const prisma = prismaOverride ?? (await getPrisma());
    return prisma.invoice.create({
        data: {
            orderId: params.orderId,
            tenantId: params.tenantId,
            number: generateInvoiceNumber(),
            amountCents: params.amountCents,
            currency: params.currency,
        },
    });
}
