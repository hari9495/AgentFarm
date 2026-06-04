import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { createHmac } from 'crypto';
import { WebhookIngestionEngine } from './webhook-ingestion.js';

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';

function makeGitHubSignature(body: string, secret: string): string {
    const hmac = createHmac('sha256', secret);
    hmac.update(body);
    return `sha256=${hmac.digest('hex')}`;
}

describe('webhook-ingestion: WebhookIngestionEngine', () => {
    let engine: WebhookIngestionEngine;

    beforeEach(() => {
        engine = new WebhookIngestionEngine();
    });

    it('registerWebhook returns a registration with id', async () => {
        const reg = await engine.registerWebhook({
            provider: 'github',
            events: ['push'],
            target_url: 'https://example.com/hook',
            secret: 'mysecret',
            tenantId: TENANT_A,
        });
        assert.ok(reg.id.length > 0);
        assert.equal(reg.provider, 'github');
        assert.equal(reg.active, true);
        assert.equal(reg.tenantId, TENANT_A);
    });

    it('listRegistrations scopes results to tenant', async () => {
        await engine.registerWebhook({
            provider: 'linear',
            events: ['issue'],
            target_url: 'https://example.com',
            secret: 'sec',
            tenantId: TENANT_A,
        });
        await engine.registerWebhook({
            provider: 'github',
            events: ['push'],
            target_url: 'https://example.com',
            secret: 'sec',
            tenantId: TENANT_B,
        });
        const listA = engine.listRegistrations(TENANT_A);
        assert.equal(listA.length, 1);
        assert.equal(listA[0].provider, 'linear');

        const listB = engine.listRegistrations(TENANT_B);
        assert.equal(listB.length, 1);
        assert.equal(listB[0].provider, 'github');
    });

    it('deactivateWebhook sets active=false for owner', async () => {
        const reg = await engine.registerWebhook({
            provider: 'pagerduty',
            events: ['incident'],
            target_url: 'https://example.com',
            secret: 'sec',
            tenantId: TENANT_A,
        });
        const result = await engine.deactivateWebhook(reg.id, TENANT_A);
        assert.equal(result, 'ok');
        const list = engine.listRegistrations(TENANT_A);
        const found = list.find((r) => r.id === reg.id);
        assert.equal(found?.active, false);
    });

    it('deactivateWebhook returns forbidden for wrong tenant', async () => {
        const reg = await engine.registerWebhook({
            provider: 'pagerduty',
            events: ['incident'],
            target_url: 'https://example.com',
            secret: 'sec',
            tenantId: TENANT_A,
        });
        const result = await engine.deactivateWebhook(reg.id, TENANT_B);
        assert.equal(result, 'forbidden');
    });

    it('deleteWebhook removes registration for owner', async () => {
        const reg = await engine.registerWebhook({
            provider: 'sentry',
            events: ['alert'],
            target_url: 'https://example.com',
            secret: 'sec',
            tenantId: TENANT_A,
        });
        const result = await engine.deleteWebhook(reg.id, TENANT_A);
        assert.equal(result, 'ok');
        const list = engine.listRegistrations(TENANT_A);
        assert.ok(!list.some((r) => r.id === reg.id));
    });

    it('deleteWebhook returns forbidden for wrong tenant', async () => {
        const reg = await engine.registerWebhook({
            provider: 'sentry',
            events: ['alert'],
            target_url: 'https://example.com',
            secret: 'sec',
            tenantId: TENANT_A,
        });
        const result = await engine.deleteWebhook(reg.id, TENANT_B);
        assert.equal(result, 'forbidden');
    });

    it('ingest processes GitHub push event with valid signature', async () => {
        const secret = 'test-secret-123';
        const reg = await engine.registerWebhook({
            provider: 'github',
            events: ['push'],
            target_url: 'https://example.com',
            secret,
            tenantId: TENANT_A,
        });
        const rawBody = JSON.stringify({ action: 'push', repository: { full_name: 'org/repo' } });
        const signature = makeGitHubSignature(rawBody, secret);

        const result = await engine.ingest({
            provider: 'github',
            headers: { 'x-hub-signature-256': signature, 'x-github-event': 'push' },
            rawBody,
            sourceIp: '127.0.0.1',
            registrationId: reg.id,
        });
        assert.equal(result.ok, true);
    });

    it('ingest stamps tenantId from registration onto the stored event', async () => {
        const reg = await engine.registerWebhook({
            provider: 'github',
            events: ['push'],
            target_url: 'https://example.com',
            secret: 'sec',
            tenantId: TENANT_A,
        });
        const rawBody = JSON.stringify({ action: 'push' });
        await engine.ingest({
            provider: 'github',
            headers: { 'x-github-event': 'push' },
            rawBody,
            sourceIp: '127.0.0.1',
            registrationId: reg.id,
        });
        const events = engine.getRecentEvents(1, TENANT_A);
        assert.equal(events.length, 1);
        assert.equal(events[0]?.tenantId, TENANT_A);

        const eventsB = engine.getRecentEvents(10, TENANT_B);
        assert.equal(eventsB.length, 0);
    });

    it('ingest with invalid signature records signature_valid=false but still returns ok:true', async () => {
        const reg = await engine.registerWebhook({
            provider: 'github',
            events: ['push'],
            target_url: 'https://example.com',
            secret: 'correct-secret',
            tenantId: TENANT_A,
        });
        const rawBody = JSON.stringify({ action: 'push' });

        const result = await engine.ingest({
            provider: 'github',
            headers: { 'x-hub-signature-256': 'sha256=invalidsignature', 'x-github-event': 'push' },
            rawBody,
            sourceIp: '127.0.0.1',
            registrationId: reg.id,
        });
        assert.equal(result.ok, true);
        const events = engine.getRecentEvents(1, TENANT_A);
        assert.equal(events[0]?.signature_valid, false);
    });

    it('onLoopTrigger callback fires when rule matches issue.opened', async () => {
        const triggered: string[] = [];
        engine.onLoopTrigger(async (task) => { triggered.push(task); });

        const secret = 'loop-secret';
        const reg = await engine.registerWebhook({
            provider: 'github',
            events: ['issue'],
            target_url: 'https://example.com',
            secret,
            tenantId: TENANT_A,
        });
        const rawBody = JSON.stringify({ action: 'opened', issue: { title: 'Bug found', number: 1 } });
        const signature = makeGitHubSignature(rawBody, secret);

        await engine.ingest({
            provider: 'github',
            headers: { 'x-hub-signature-256': signature, 'x-github-event': 'issues' },
            rawBody,
            sourceIp: '127.0.0.1',
            registrationId: reg.id,
        });
        assert.ok(Array.isArray(triggered));
        assert.ok(triggered.length >= 1);
        assert.ok(triggered[0].includes('Bug found'));
    });

    it('getRecentEvents returns array', () => {
        const events = engine.getRecentEvents(10, TENANT_A);
        assert.ok(Array.isArray(events));
    });

    it('listRoutingRules returns built-in rules', () => {
        const rules = engine.listRoutingRules();
        assert.ok(rules.length >= 1);
    });

    it('ingest rejects oversized payload', async () => {
        const reg = await engine.registerWebhook({
            provider: 'github',
            events: ['push'],
            target_url: 'https://example.com',
            secret: 'sec',
            tenantId: TENANT_A,
        });
        const bigBody = 'x'.repeat(1_100_000); // > 1MB
        const result = await engine.ingest({
            provider: 'github',
            headers: {},
            rawBody: bigBody,
            sourceIp: '127.0.0.1',
            registrationId: reg.id,
        });
        assert.equal(result.ok, false);
        assert.ok(result.error?.toLowerCase().includes('payload'));
    });
});
