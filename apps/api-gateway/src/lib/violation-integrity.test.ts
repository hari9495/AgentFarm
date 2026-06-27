import test from 'node:test';
import assert from 'node:assert/strict';
import type { PrismaClient } from '@prisma/client';
import { computeViolationHash } from '@agentfarm/shared-types';
import { verifyViolationChain, type PrismaLike } from './compliance-export.js';

// --- computeViolationHash (pure) ---------------------------------------------

const base = { tenantId: 't1', actionType: 'deploy_production', connector: null, effect: 'deny', reason: 'no prod', matchedPolicyId: 'p1', policyVersion: 1, source: 'role' };

test('computeViolationHash is deterministic and chain-sensitive', () => {
    assert.equal(computeViolationHash('', base), computeViolationHash('', base));
    assert.notEqual(computeViolationHash('', base), computeViolationHash('x', base));
    assert.notEqual(computeViolationHash('', base), computeViolationHash('', { ...base, reason: 'edited' }));
});

// --- verifyViolationChain ----------------------------------------------------

function chainedRows(reasons: string[]) {
    let prev = '';
    return reasons.map((reason, i) => {
        const fields = { ...base, reason };
        const hash = computeViolationHash(prev, fields);
        const row = { id: `v${i + 1}`, ...fields, prevHash: prev, hash, createdAt: new Date(2026, 0, 1, 0, i) };
        prev = hash;
        return row;
    });
}

function prismaWith(rows: any[]): PrismaLike {
    return {
        governancePolicy: {} as never,
        policyDocument: {} as never,
        policyViolation: {
            findMany: async ({ where }: any) =>
                rows.filter((r) => r.tenantId === where.tenantId && (!where.hash || r.hash != null)),
        },
    } as unknown as PrismaLike;
}

test('verifyViolationChain — valid chain passes', async () => {
    const rows = chainedRows(['a', 'b', 'c']);
    const r = await verifyViolationChain(prismaWith(rows), 't1');
    assert.equal(r.chainValid, true);
    assert.equal(r.recordsChecked, 3);
});

test('verifyViolationChain — tampered row content detected', async () => {
    const rows = chainedRows(['a', 'b', 'c']);
    rows[1].reason = 'TAMPERED'; // hash no longer matches content
    const r = await verifyViolationChain(prismaWith(rows), 't1');
    assert.equal(r.chainValid, false);
    assert.equal(r.brokenAtId, 'v2');
});

test('verifyViolationChain — deleted/inserted row breaks the link', async () => {
    const rows = chainedRows(['a', 'b', 'c']);
    rows.splice(1, 1); // delete v2 → v3.prevHash no longer matches v1.hash
    const r = await verifyViolationChain(prismaWith(rows), 't1');
    assert.equal(r.chainValid, false);
    assert.equal(r.brokenAtId, 'v3');
});

test('verifyViolationChain — empty chain is valid', async () => {
    const r = await verifyViolationChain(prismaWith([]), 't1');
    assert.equal(r.chainValid, true);
    assert.equal(r.recordsChecked, 0);
});
