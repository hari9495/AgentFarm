import test from 'node:test';
import assert from 'node:assert/strict';
import { reactivateSubscription } from './payment-service.js';

const makeMockPrisma = (subStatus: string | null, txError?: Error) => {
    let transactionCalled = 0;
    return {
        tenantSubscription: {
            findUnique: async () =>
                subStatus === null
                    ? null
                    : { id: 'sub-1', status: subStatus, expiresAt: new Date() },
            update: async () => ({}),
        },
        subscriptionEvent: {
            create: async () => ({}),
        },
        $transaction: async (ops: any[]) => {
            transactionCalled++;
            if (txError) throw txError;
            return Promise.all(ops);
        },
        _txCount: () => transactionCalled,
    } as any;
};

test('reactivateSubscription — no existing subscription — returns silently, no transaction', async () => {
    const mock = makeMockPrisma(null);
    await reactivateSubscription('t-1', 'stripe', 'evt-1', mock);
    assert.equal(mock._txCount(), 0);
});

test('reactivateSubscription — status already active — returns silently, no transaction', async () => {
    const mock = makeMockPrisma('active');
    await reactivateSubscription('t-1', 'stripe', 'evt-1', mock);
    assert.equal(mock._txCount(), 0);
});

test('reactivateSubscription — status suspended — runs transaction, sets status to active', async () => {
    const mock = makeMockPrisma('suspended');
    await reactivateSubscription('t-1', 'stripe', 'evt-1', mock);
    assert.equal(mock._txCount(), 1);
});

test('reactivateSubscription — status expired — runs transaction, sets status to active', async () => {
    const mock = makeMockPrisma('expired');
    await reactivateSubscription('t-1', 'razorpay', 'pay_abc', mock);
    assert.equal(mock._txCount(), 1);
});

test('reactivateSubscription — transaction error — throws error', async () => {
    const txError = new Error('DB transaction failed');
    const mock = makeMockPrisma('suspended', txError);
    await assert.rejects(
        () => reactivateSubscription('t-1', 'stripe', 'evt-1', mock),
        (err: Error) => {
            assert.equal(err.message, 'DB transaction failed');
            return true;
        },
    );
});

test('reactivateSubscription — idempotent: calling twice with active on second call — only 1 transaction total', async () => {
    let call = 0;
    let txCount = 0;
    const mock = {
        tenantSubscription: {
            findUnique: async () => {
                call++;
                return { id: 'sub-1', status: call === 1 ? 'suspended' : 'active', expiresAt: new Date() };
            },
            update: async () => ({}),
        },
        subscriptionEvent: {
            create: async () => ({}),
        },
        $transaction: async (ops: any[]) => {
            txCount++;
            return Promise.all(ops);
        },
    } as any;

    await reactivateSubscription('t-1', 'stripe', 'evt-1', mock);
    await reactivateSubscription('t-1', 'stripe', 'evt-1', mock);
    assert.equal(txCount, 1);
});
