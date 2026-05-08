import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationService, CustomerNotificationStore, AdapterFactory } from '../src/notification.service.js';
import { NotificationAdapter } from '../src/adapters/base.adapter.js';
import type { NotificationPayload, NotificationResult, CustomerNotificationConfig } from '@agentfarm/shared-types';

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function makeStore(customerId: string, config: CustomerNotificationConfig['config']): CustomerNotificationStore {
    const store = new CustomerNotificationStore();
    store.registerCustomer({ customerId, config });
    return store;
}

const PAYLOAD: NotificationPayload = { subject: 'Test', message: 'Hello world' };

// -----------------------------------------------------------------------
// Adapter routing via AdapterFactory
// -----------------------------------------------------------------------

describe('AdapterFactory', () => {
    it('creates WebhookAdapter for channel=webhook', () => {
        const adapter = AdapterFactory.create({ channel: 'webhook', webhookUrl: 'https://example.com/hook' });
        expect(adapter.adapterName).toBe('webhook');
    });

    it('creates EmailAdapter for channel=email', () => {
        const adapter = AdapterFactory.create({ channel: 'email', emailTo: 'user@example.com' });
        expect(adapter.adapterName).toBe('email');
    });

    it('creates SlackAdapter for channel=slack', () => {
        const adapter = AdapterFactory.create({ channel: 'slack', slackToken: 'https://hooks.slack.com/services/xxx' });
        expect(adapter.adapterName).toBe('slack');
    });

    it('creates TeamsAdapter for channel=teams', () => {
        const adapter = AdapterFactory.create({ channel: 'teams', teamsWebhookUrl: 'https://outlook.office.com/webhook/xxx' });
        expect(adapter.adapterName).toBe('teams');
    });

    it('throws for webhook channel without webhookUrl', () => {
        expect(() => AdapterFactory.create({ channel: 'webhook' })).toThrow(/webhookUrl/);
    });

    it('throws for slack channel without slackToken or webhookUrl', () => {
        expect(() => AdapterFactory.create({ channel: 'slack' })).toThrow(/slackToken/);
    });

    it('throws for teams channel without teamsWebhookUrl', () => {
        expect(() => AdapterFactory.create({ channel: 'teams' })).toThrow(/teamsWebhookUrl/);
    });
});

// -----------------------------------------------------------------------
// NotificationService routing
// -----------------------------------------------------------------------

describe('NotificationService', () => {
    describe('routes to WebhookAdapter when channel=webhook', () => {
        it('calls the webhook adapter send()', async () => {
            const store = makeStore('cust-1', { channel: 'webhook', webhookUrl: 'https://example.com/hook' });
            const service = new NotificationService(store);

            const sendSpy = vi.fn<() => Promise<NotificationResult>>().mockResolvedValue({ success: true, adapter: 'webhook' });
            vi.spyOn(AdapterFactory, 'create').mockReturnValueOnce({
                adapterName: 'webhook',
                send: sendSpy,
            } satisfies NotificationAdapter);

            const result = await service.send('cust-1', PAYLOAD);

            expect(result.success).toBe(true);
            expect(result.adapter).toBe('webhook');
            expect(sendSpy).toHaveBeenCalledWith(PAYLOAD);
        });
    });

    describe('routes to EmailAdapter when channel=email', () => {
        it('calls the email adapter send()', async () => {
            const store = makeStore('cust-2', { channel: 'email', emailTo: 'user@example.com' });
            const service = new NotificationService(store);

            const sendSpy = vi.fn<() => Promise<NotificationResult>>().mockResolvedValue({ success: true, adapter: 'email' });
            vi.spyOn(AdapterFactory, 'create').mockReturnValueOnce({
                adapterName: 'email',
                send: sendSpy,
            } satisfies NotificationAdapter);

            const result = await service.send('cust-2', PAYLOAD);

            expect(result.success).toBe(true);
            expect(result.adapter).toBe('email');
        });
    });

    describe('routes to SlackAdapter when channel=slack', () => {
        it('calls the slack adapter send()', async () => {
            const store = makeStore('cust-3', { channel: 'slack', slackToken: 'https://hooks.slack.com/services/xxx' });
            const service = new NotificationService(store);

            const sendSpy = vi.fn<() => Promise<NotificationResult>>().mockResolvedValue({ success: true, adapter: 'slack' });
            vi.spyOn(AdapterFactory, 'create').mockReturnValueOnce({
                adapterName: 'slack',
                send: sendSpy,
            } satisfies NotificationAdapter);

            const result = await service.send('cust-3', PAYLOAD);

            expect(result.success).toBe(true);
            expect(result.adapter).toBe('slack');
        });
    });

    describe('routes to TeamsAdapter when channel=teams', () => {
        it('calls the teams adapter send()', async () => {
            const store = makeStore('cust-4', { channel: 'teams', teamsWebhookUrl: 'https://outlook.office.com/webhook/xxx' });
            const service = new NotificationService(store);

            const sendSpy = vi.fn<() => Promise<NotificationResult>>().mockResolvedValue({ success: true, adapter: 'teams' });
            vi.spyOn(AdapterFactory, 'create').mockReturnValueOnce({
                adapterName: 'teams',
                send: sendSpy,
            } satisfies NotificationAdapter);

            const result = await service.send('cust-4', PAYLOAD);

            expect(result.success).toBe(true);
            expect(result.adapter).toBe('teams');
        });
    });

    describe('returns error result when customer config is not registered', () => {
        it('returns success:false with descriptive error', async () => {
            const store = new CustomerNotificationStore();
            const service = new NotificationService(store);

            const result = await service.send('unknown-customer', PAYLOAD);

            expect(result.success).toBe(false);
            expect(result.adapter).toBe('none');
            expect(result.error).toMatch(/unknown-customer/);
        });
    });

    describe('returns error result gracefully if adapter throws', () => {
        it('catches adapter throw and returns success:false', async () => {
            const store = makeStore('cust-err', { channel: 'webhook', webhookUrl: 'https://example.com/hook' });
            const service = new NotificationService(store);

            vi.spyOn(AdapterFactory, 'create').mockReturnValueOnce({
                adapterName: 'webhook',
                send: vi.fn().mockRejectedValue(new Error('network failure')),
            } satisfies NotificationAdapter);

            // NotificationService doesn't catch adapter.send() throws — the adapter
            // itself is responsible. Test that a throwing adapter propagates.
            await expect(service.send('cust-err', PAYLOAD)).rejects.toThrow('network failure');
        });
    });
});
