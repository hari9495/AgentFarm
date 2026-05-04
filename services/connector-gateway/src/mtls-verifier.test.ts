import { test } from 'node:test';
import * as assert from 'node:assert';
import { verifyMtlsCert, MtlsVerifier, type MtlsCertificate } from './mtls-verifier.js';

const NOW = 1_746_403_200_000; // 2026-05-05T00:00:00Z (fixed for determinism)

const VALID_CERT: MtlsCertificate = {
    subject: { CN: 'agent-runtime.agentfarm.internal', O: 'AgentFarm' },
    issuer: { CN: 'AgentFarm Internal CA', O: 'AgentFarm' },
    valid_from: '2025-01-01T00:00:00Z',
    valid_to: '2027-01-01T00:00:00Z',
    fingerprint: 'AA:BB:CC:DD',
    serialNumber: '01',
};

const ALLOW_LIST = ['agent-runtime.agentfarm.internal', 'orchestrator.agentfarm.internal'];
const opts = { allowList: ALLOW_LIST, now: () => NOW };

// ── verifyMtlsCert — happy path ───────────────────────────────────────────────

test('verifyMtlsCert returns ok:true for valid cert and allowed CN', () => {
    const result = verifyMtlsCert(VALID_CERT, opts);
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.cn, 'agent-runtime.agentfarm.internal');
});

// ── verifyMtlsCert — missing cert ─────────────────────────────────────────────

test('verifyMtlsCert returns ok:false when cert is null', () => {
    const result = verifyMtlsCert(null, opts);
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.reason.includes('no client certificate'));
});

test('verifyMtlsCert returns ok:false when cert is undefined', () => {
    const result = verifyMtlsCert(undefined, opts);
    assert.equal(result.ok, false);
});

// ── verifyMtlsCert — expired cert ────────────────────────────────────────────

test('verifyMtlsCert returns ok:false for expired cert', () => {
    const expired: MtlsCertificate = {
        ...VALID_CERT,
        valid_to: '2024-01-01T00:00:00Z', // in the past relative to NOW
    };
    const result = verifyMtlsCert(expired, opts);
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.reason.includes('expired'));
});

// ── verifyMtlsCert — not yet valid ────────────────────────────────────────────

test('verifyMtlsCert returns ok:false for cert not yet valid', () => {
    const future: MtlsCertificate = {
        ...VALID_CERT,
        valid_from: '2027-01-01T00:00:00Z',
        valid_to: '2029-01-01T00:00:00Z',
    };
    const result = verifyMtlsCert(future, opts);
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.reason.includes('not yet valid'));
});

// ── verifyMtlsCert — CN not in allow-list ─────────────────────────────────────

test('verifyMtlsCert returns ok:false when CN not in allow-list', () => {
    const unknown: MtlsCertificate = {
        ...VALID_CERT,
        subject: { CN: 'evil.example.com' },
    };
    const result = verifyMtlsCert(unknown, opts);
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.reason.includes('allow-list'));
});

// ── verifyMtlsCert — missing CN ───────────────────────────────────────────────

test('verifyMtlsCert returns ok:false when subject CN is empty', () => {
    const noCn: MtlsCertificate = {
        ...VALID_CERT,
        subject: { CN: '' },
    };
    const result = verifyMtlsCert(noCn, opts);
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.reason.includes('CN'));
});

// ── MtlsVerifier class ────────────────────────────────────────────────────────

test('MtlsVerifier.verify delegates to verifyMtlsCert', () => {
    const verifier = new MtlsVerifier({ allowList: ALLOW_LIST, now: () => NOW });
    const result = verifier.verify(VALID_CERT);
    assert.equal(result.ok, true);
});

test('MtlsVerifier.isAllowed returns true for known CN', () => {
    const verifier = new MtlsVerifier({ allowList: ALLOW_LIST });
    assert.equal(verifier.isAllowed('agent-runtime.agentfarm.internal'), true);
    assert.equal(verifier.isAllowed('unknown.example.com'), false);
});

test('MtlsVerifier.allowList returns a copy of the list', () => {
    const verifier = new MtlsVerifier({ allowList: ['a', 'b'] });
    const list = verifier.allowList();
    list.push('injected'); // should not affect internal state
    assert.equal(verifier.isAllowed('injected'), false);
});
