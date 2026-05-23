import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { SlackNotificationProvider } from './slack-notification-provider.js';
import { TeamsNotificationProvider } from './teams-notification-provider.js';
import { WebhookNotificationProvider } from './webhook-notification-provider.js';
import { EmailNotificationProvider } from './email-notification-provider.js';
import { createNotificationProvider } from './notification-provider-factory.js';
import type { WinLossNotificationPayload } from './notification-provider.js';
import type { SalesAgentConfigRecord } from '@agentfarm/shared-types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WON_PAYLOAD: WinLossNotificationPayload = {
    outcome: 'won',
    dealId: 'deal-1',
    prospectName: 'Alice Smith',
    company: 'Acme Corp',
    dealValue: 15000,
    currency: 'USD',
    daysToClose: 21,
    tenantId: 't1',
    botId: 'bot-1',
};

const LOST_PAYLOAD: WinLossNotificationPayload = { ...WON_PAYLOAD, outcome: 'lost' };

const makeConfig = (overrides?: Partial<SalesAgentConfigRecord>): SalesAgentConfigRecord =>
({
    winNotificationProvider: null,
    winNotificationTarget: null,
    winNotificationSecret: null,
    ...overrides,
} as unknown as SalesAgentConfigRecord);

// ---------------------------------------------------------------------------
// fetch mock
// ---------------------------------------------------------------------------

let originalFetch: typeof globalThis.fetch;
type ReceivedRequest = { url: string; body: string; headers: Record<string, string> };
const received: ReceivedRequest[] = [];

before(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
        received.push({
            url: String(url),
            body: String(init?.body ?? ''),
            headers: (init?.headers ?? {}) as Record<string, string>,
        });
        return new Response('ok', { status: 200 });
    }) as typeof globalThis.fetch;
});

after(() => {
    globalThis.fetch = originalFetch;
    received.length = 0;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SlackNotificationProvider', () => {
    test('sends Slack Block Kit message', async () => {
        const p = new SlackNotificationProvider('https://hooks.slack.com/services/test');
        const result = await p.send(WON_PAYLOAD);
        assert.equal(result.sent, true);
        const req = received.find(r => r.url.includes('slack'));
        assert.ok(req, 'Should have posted to Slack URL');
        const parsed = JSON.parse(req!.body) as { blocks?: unknown[] };
        assert.ok(Array.isArray(parsed.blocks), 'Payload should have blocks array');
    });
});

describe('TeamsNotificationProvider', () => {
    test('sends Teams MessageCard', async () => {
        const p = new TeamsNotificationProvider('https://teams.example.com/webhook/test');
        const result = await p.send(LOST_PAYLOAD);
        assert.equal(result.sent, true);
        const req = received.find(r => r.url.includes('teams'));
        assert.ok(req, 'Should have posted to Teams URL');
        const parsed = JSON.parse(req!.body) as { '@type'?: string };
        assert.equal(parsed['@type'], 'MessageCard');
    });
});

describe('WebhookNotificationProvider', () => {
    test('signs payload with HMAC when secret provided', async () => {
        const p = new WebhookNotificationProvider('https://webhook.example.com/hook', 'mysecret');
        const result = await p.send(WON_PAYLOAD);
        assert.equal(result.sent, true);
        const req = received.find(r => r.url.includes('webhook.example'));
        assert.ok(req, 'Should have posted to webhook URL');
        const sig = req!.headers['x-agentfarm-signature'];
        assert.ok(typeof sig === 'string' && sig.length > 0, 'HMAC signature header should be present');
    });

    test('sends without signature when no secret provided', async () => {
        const p = new WebhookNotificationProvider('https://webhook.example.com/nosig');
        const result = await p.send(LOST_PAYLOAD);
        assert.equal(result.sent, true);
        const req = received.find(r => r.url.includes('nosig'));
        assert.ok(req, 'Should have posted to URL');
        assert.equal(req!.headers['x-agentfarm-signature'], undefined, 'No signature header when no secret');
    });
});

describe('EmailNotificationProvider', () => {
    test('sends email and returns sent:true', async () => {
        let emailSent = false;
        const stubProvider = {
            providerName: 'smtp' as const,
            sendEmail: async () => { emailSent = true; return { success: true, provider: 'smtp' as const }; },
        };
        const p = new EmailNotificationProvider('notify@example.com', stubProvider, { fromEmail: 'sales@agentfarm.dev' });
        const result = await p.send(WON_PAYLOAD);
        assert.equal(result.sent, true);
        assert.ok(emailSent, 'Email provider should have been called');
    });
});

describe('createNotificationProvider', () => {
    test('returns null when provider is not configured', () => {
        const p = createNotificationProvider(makeConfig());
        assert.equal(p, null);
    });

    test('returns WebhookNotificationProvider for webhook config', () => {
        const config = makeConfig({
            winNotificationProvider: 'webhook',
            winNotificationTarget: 'https://webhook.example.com/target',
            winNotificationSecret: 'secret',
        });
        const p = createNotificationProvider(config);
        assert.ok(p instanceof WebhookNotificationProvider, 'Should return WebhookNotificationProvider');
    });
});
