import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
    getProviderForCountry,
    verifyRazorpayWebhook,
    generateInvoiceNumber,
    createOrderRecord,
    markOrderPaid,
} from './payment-service.js';

import type { PrismaClient, Order } from '@prisma/client';

const stubOrder: Order = {
    id: 'ord-001',
    tenantId: 't1',
    planId: 'starter',
    amountCents: 9900,
    currency: 'usd',
    status: 'pending',
    paymentProvider: 'stripe',
    providerOrderId: 'pi_test_001',
    providerPaymentId: null,
    providerSignature: null,
    customerEmail: 'buyer@example.com',
    customerCountry: 'US',
    createdAt: new Date('2026-05-09T10:00:00Z'),
    updatedAt: new Date('2026-05-09T10:00:00Z'),
    contractPdfUrl: null,
    zohoSignRequestId: null,
    signatureStatus: null,
    signedAt: null,
    contractSentAt: null,
};

describe('payment-service', () => {
    // -----------------------------------------------------------------------
    // getProviderForCountry
    // -----------------------------------------------------------------------

    test('getProviderForCountry returns razorpay for IN', () => {
        assert.equal(getProviderForCountry('IN'), 'razorpay');
    });

    test('getProviderForCountry returns stripe for US', () => {
        assert.equal(getProviderForCountry('US'), 'stripe');
    });

    test('getProviderForCountry returns stripe for GB', () => {
        assert.equal(getProviderForCountry('GB'), 'stripe');
    });

    // -----------------------------------------------------------------------
    // verifyRazorpayWebhook
    // -----------------------------------------------------------------------

    test('verifyRazorpayWebhook returns false for invalid signature', () => {
        process.env['RAZORPAY_KEY_SECRET'] = 'test-webhook-secret';
        const result = verifyRazorpayWebhook({
            orderId: 'order_123',
            paymentId: 'pay_456',
            signature: 'not-a-valid-signature',
        });
        assert.equal(result, false);
        delete process.env['RAZORPAY_KEY_SECRET'];
    });

    // -----------------------------------------------------------------------
    // generateInvoiceNumber
    // -----------------------------------------------------------------------

    test('generateInvoiceNumber returns string starting with INV-', () => {
        const num = generateInvoiceNumber();
        assert.ok(num.startsWith('INV-'), `Expected "${num}" to start with "INV-"`);
    });

    test('generateInvoiceNumber returns unique values on multiple calls', () => {
        const results = new Set(Array.from({ length: 20 }, () => generateInvoiceNumber()));
        // With 3-digit random suffix there is 1/900 chance of collision per pair — statistically
        // at least 2 distinct values in 20 calls is essentially guaranteed.
        assert.ok(results.size > 1, 'Expected at least 2 distinct invoice numbers in 20 calls');
    });

    // -----------------------------------------------------------------------
    // createOrderRecord (mock prisma)
    // -----------------------------------------------------------------------

    test('createOrderRecord creates an order with status pending', async () => {
        const mockPrisma = {
            order: {
                create: async (_args: unknown) => ({ ...stubOrder }),
            },
        } as unknown as PrismaClient;

        const result = await createOrderRecord(
            {
                tenantId: 't1',
                planId: 'starter',
                amountCents: 9900,
                currency: 'usd',
                paymentProvider: 'stripe',
                providerOrderId: 'pi_test_001',
                customerEmail: 'buyer@example.com',
                customerCountry: 'US',
            },
            mockPrisma,
        );

        assert.equal(result.status, 'pending');
        assert.equal(result.tenantId, 't1');
        assert.equal(result.paymentProvider, 'stripe');
    });

    // -----------------------------------------------------------------------
    // markOrderPaid (mock prisma)
    // -----------------------------------------------------------------------

    test('markOrderPaid updates order status to paid', async () => {
        const paidOrder: Order = {
            ...stubOrder,
            status: 'paid',
            providerPaymentId: 'ch_test_001',
        };

        const mockPrisma = {
            order: {
                findFirst: async (_args: unknown) => ({ ...stubOrder }),
                update: async (_args: unknown) => ({ ...paidOrder }),
            },
        } as unknown as PrismaClient;

        const result = await markOrderPaid(
            {
                providerOrderId: 'pi_test_001',
                providerPaymentId: 'ch_test_001',
            },
            mockPrisma,
        );

        assert.equal(result.status, 'paid');
        assert.equal(result.providerPaymentId, 'ch_test_001');
    });
});
