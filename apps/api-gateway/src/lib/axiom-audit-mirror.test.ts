import test from 'node:test';
import assert from 'node:assert/strict';
import { mirrorAuditEventToAxiom } from './axiom-audit-mirror.js';

const event = {
    tenantId: 'tenant-acme', workspaceId: 'ws1', botId: 'bot1', userId: 'u1',
    eventType: 'approval_event', severity: 'info', summary: 'approved', sourceSystem: 'api-gateway', correlationId: 'audit_1',
};

test('mirrorAuditEventToAxiom no-ops (false) when AXIOM_TOKEN is unset', async () => {
    let called = false;
    const ok = await mirrorAuditEventToAxiom(event, { env: {}, fetchImpl: (async () => { called = true; return new Response('', { status: 200 }); }) as typeof fetch });
    assert.equal(ok, false);
    assert.equal(called, false);
});

test('mirrorAuditEventToAxiom posts a tenant-tagged event to the ingest endpoint', async () => {
    let url = ''; let body: any; let authz = '';
    const fetchImpl = (async (u: string | URL | Request, init?: RequestInit) => {
        url = String(u);
        authz = String((init?.headers as Record<string, string>)?.['authorization'] ?? '');
        body = JSON.parse(String(init?.body ?? '[]'));
        return new Response('', { status: 200 });
    }) as typeof fetch;
    const ok = await mirrorAuditEventToAxiom(event, {
        env: { AXIOM_TOKEN: 'xaat-test', AXIOM_URL: 'https://api.axiom.co', AXIOM_DATASET_AUDIT: 'axiom-audit' },
        fetchImpl,
    });
    assert.equal(ok, true);
    assert.equal(url, 'https://api.axiom.co/v1/datasets/axiom-audit/ingest');
    assert.equal(authz, 'Bearer xaat-test');
    assert.equal(body[0]['tenant.id'], 'tenant-acme');
    assert.equal(body[0].eventType, 'approval_event');
    assert.ok(body[0]._time);
});

test('mirrorAuditEventToAxiom swallows fetch errors (returns false)', async () => {
    const ok = await mirrorAuditEventToAxiom(event, {
        env: { AXIOM_TOKEN: 'xaat-test' },
        fetchImpl: (async () => { throw new Error('network'); }) as typeof fetch,
    });
    assert.equal(ok, false);
});
