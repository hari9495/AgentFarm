import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { generateContractPdf, formatAmount } from './contract-generator.js';

const sampleParams = {
    customerName: 'Alice Smith',
    customerEmail: 'alice@example.com',
    companyName: 'AgentFarm',
    planName: 'Professional',
    agentSlots: 5,
    amountCents: 999900,
    currency: 'INR',
    features: 'Unlimited API calls, Priority support, Custom integrations',
    orderId: 'order-abc-123',
    date: new Date('2025-01-15T10:00:00Z'),
};

describe('contract-generator', () => {
    test('generateContractPdf returns a Buffer', async () => {
        const result = await generateContractPdf(sampleParams);
        assert.ok(Buffer.isBuffer(result), 'result should be a Buffer');
    });

    test('generateContractPdf buffer length is greater than 1000 bytes', async () => {
        const result = await generateContractPdf(sampleParams);
        assert.ok(
            result.length > 1000,
            `PDF buffer too small: ${result.length} bytes`,
        );
    });

    test('formatAmount returns correct INR format', () => {
        const result = formatAmount(999900, 'INR');
        assert.ok(result.startsWith('₹'), `expected ₹ prefix, got: ${result}`);
        assert.ok(result.includes('9,999'), `expected formatted number, got: ${result}`);
    });

    test('formatAmount returns correct USD format', () => {
        const result = formatAmount(50000, 'USD');
        assert.ok(result.startsWith('$'), `expected $ prefix, got: ${result}`);
        assert.ok(result.includes('500'), `expected formatted number, got: ${result}`);
    });
});
