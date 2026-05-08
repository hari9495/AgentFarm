import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { NotificationChannelConfig, NotificationRecord } from '@agentfarm/shared-types';
import { CONTRACT_VERSIONS } from '@agentfarm/shared-types';
import { buildDiscordRequest } from './channels/discord-adapter.js';
import { buildSlackRequest } from './channels/slack-adapter.js';
import { buildTelegramRequest } from './channels/telegram-adapter.js';
import { dispatch, dispatchApprovalAlert } from './notification-dispatcher.js';

function makeRecord(
    channel: NotificationRecord['channel'],
    overrides: Partial<NotificationRecord> = {},
): NotificationRecord {
    return {
        id: 'rec-1',
        contractVersion: CONTRACT_VERSIONS.NOTIFICATION,
        tenantId: 'tenant-1',
        workspaceId: 'ws-1',
        channel,
        trigger: 'run_completed',
        title: 'Run completed',
        body: 'Your agent run finished successfully.',
        status: 'pending',
        retryCount: 0,
        correlationId: 'corr-1',
        createdAt: new Date().toISOString(),
        ...overrides,
    };
}

// ── Telegram request builder ──────────────────────────────────────────────────

describe('buildTelegramRequest', () => {
    it('builds the correct URL and body', () => {
        const req = buildTelegramRequest('BOT_TOKEN', 'CHAT_ID', 'hello');
        assert.equal(req.url, 'https://api.telegram.org/botBOT_TOKEN/sendMessage');
        assert.equal(req.body['chat_id'], 'CHAT_ID');
        assert.equal(req.body['text'], 'hello');
        assert.equal(req.body['parse_mode'], 'Markdown');
    });
});

// ── Slack request builder ─────────────────────────────────────────────────────

describe('buildSlackRequest', () => {
    it('builds incoming webhook payload without channelId', () => {
        const req = buildSlackRequest('https://hooks.slack.com/X', 'hi');
        assert.equal(req.url, 'https://hooks.slack.com/X');
        assert.equal(req.body['text'], 'hi');
        assert.equal(req.body['channel'], undefined);
    });

    it('includes channelId when provided', () => {
        const req = buildSlackRequest('https://hooks.slack.com/X', 'hi', '#general');
        assert.equal(req.body['channel'], '#general');
    });
});

// ── Discord request builder ───────────────────────────────────────────────────

describe('buildDiscordRequest', () => {
    it('builds embed payload', () => {
        const req = buildDiscordRequest('https://discord.com/api/webhooks/X', 'Title', 'Body');
        assert.equal(req.url, 'https://discord.com/api/webhooks/X');
        const embeds = req.body['embeds'] as Array<{ title: string; description: string }>;
        assert.equal(embeds[0].title, 'Title');
        assert.equal(embeds[0].description, 'Body');
    });
});

// ── NotificationDispatcher ────────────────────────────────────────────────────

describe('dispatch — telegram', () => {
    it('returns success when fetcher resolves', async () => {
        const record = makeRecord('telegram');
        const configs: NotificationChannelConfig[] = [
            { channel: 'telegram', enabled: true, config: { botToken: 'TK', chatId: '42' } },
        ];
        const fakeFetch = async (_url: string, _body: Record<string, unknown>) => 'msg-123';
        const [result] = await dispatch(record, configs, fakeFetch);
        assert.equal(result.success, true);
        assert.equal(result.platformMessageId, 'msg-123');
    });

    it('returns failure when botToken is missing', async () => {
        const record = makeRecord('telegram');
        const configs: NotificationChannelConfig[] = [
            { channel: 'telegram', enabled: true, config: { chatId: '42' } },
        ];
        const [result] = await dispatch(record, configs);
        assert.equal(result.success, false);
        assert.match(result.errorMessage ?? '', /botToken/);
    });

    it('returns failure when fetcher throws', async () => {
        const record = makeRecord('telegram');
        const configs: NotificationChannelConfig[] = [
            { channel: 'telegram', enabled: true, config: { botToken: 'TK', chatId: '42' } },
        ];
        const fakeFetch = async () => { throw new Error('network error'); };
        const [result] = await dispatch(record, configs, fakeFetch);
        assert.equal(result.success, false);
        assert.match(result.errorMessage ?? '', /network error/);
    });
});

describe('dispatch — slack', () => {
    it('returns success for webhook URL', async () => {
        const record = makeRecord('slack');
        const configs: NotificationChannelConfig[] = [
            { channel: 'slack', enabled: true, config: { webhookUrl: 'https://hooks.slack.com/X' } },
        ];
        const fakeFetch = async () => 'ts-456';
        const [result] = await dispatch(record, configs, fakeFetch);
        assert.equal(result.success, true);
    });

    it('returns failure when no webhookUrl or botToken', async () => {
        const record = makeRecord('slack');
        const configs: NotificationChannelConfig[] = [
            { channel: 'slack', enabled: true, config: {} },
        ];
        const [result] = await dispatch(record, configs);
        assert.equal(result.success, false);
    });
});

describe('dispatch — discord', () => {
    it('returns success with webhookUrl', async () => {
        const record = makeRecord('discord');
        const configs: NotificationChannelConfig[] = [
            { channel: 'discord', enabled: true, config: { webhookUrl: 'https://discord.com/api/webhooks/X' } },
        ];
        const fakeFetch = async () => undefined;
        const [result] = await dispatch(record, configs, fakeFetch);
        assert.equal(result.success, true);
    });

    it('returns failure when webhookUrl is missing', async () => {
        const record = makeRecord('discord');
        const configs: NotificationChannelConfig[] = [
            { channel: 'discord', enabled: true, config: {} },
        ];
        const [result] = await dispatch(record, configs);
        assert.equal(result.success, false);
        assert.match(result.errorMessage ?? '', /webhookUrl/);
    });
});

describe('dispatch — no active config', () => {
    it('returns error when no enabled config matches channel', async () => {
        const record = makeRecord('telegram');
        const [result] = await dispatch(record, []);
        assert.equal(result.success, false);
        assert.match(result.errorMessage ?? '', /No active config/);
    });

    it('skips disabled configs', async () => {
        const record = makeRecord('telegram');
        const configs: NotificationChannelConfig[] = [
            { channel: 'telegram', enabled: false, config: { botToken: 'TK', chatId: '42' } },
        ];
        const [result] = await dispatch(record, configs);
        assert.equal(result.success, false);
    });
});

describe('dispatch — webhook', () => {
    it('returns success with valid url', async () => {
        const record = makeRecord('webhook');
        const configs: NotificationChannelConfig[] = [
            { channel: 'webhook', enabled: true, config: { url: 'https://my.hook/events' } },
        ];
        const fakeFetch = async () => 'req-789';
        const [result] = await dispatch(record, configs, fakeFetch);
        assert.equal(result.success, true);
        assert.equal(result.platformMessageId, 'req-789');
    });
});

describe('dispatch — email', () => {
    it('returns success when relay URL and to address are configured', async () => {
        const record = makeRecord('email');
        const configs: NotificationChannelConfig[] = [
            { channel: 'email', enabled: true, config: { to: 'admin@example.com', relayUrl: 'https://mail-relay.internal' } },
        ];
        const fakeFetch = async (_url: string, _body: Record<string, unknown>) => 'msg-email-1';
        const [result] = await dispatch(record, configs, fakeFetch);
        assert.equal(result.success, true);
        assert.equal(result.platformMessageId, 'msg-email-1');
    });

    it('returns failure when to address is missing', async () => {
        const record = makeRecord('email');
        const configs: NotificationChannelConfig[] = [
            { channel: 'email', enabled: true, config: { relayUrl: 'https://mail-relay.internal' } },
        ];
        const [result] = await dispatch(record, configs);
        assert.equal(result.success, false);
        assert.match(result.errorMessage ?? '', /to/);
    });

    it('returns failure when relayUrl is missing', async () => {
        const record = makeRecord('email');
        const configs: NotificationChannelConfig[] = [
            { channel: 'email', enabled: true, config: { to: 'admin@example.com' } },
        ];
        const [result] = await dispatch(record, configs);
        assert.equal(result.success, false);
        assert.match(result.errorMessage ?? '', /relayUrl/);
    });

    it('returns failure when fetcher throws', async () => {
        const record = makeRecord('email');
        const configs: NotificationChannelConfig[] = [
            { channel: 'email', enabled: true, config: { to: 'admin@example.com', relayUrl: 'https://mail-relay.internal' } },
        ];
        const fakeFetch = async () => { throw new Error('SMTP relay unreachable'); };
        const [result] = await dispatch(record, configs, fakeFetch);
        assert.equal(result.success, false);
        assert.match(result.errorMessage ?? '', /SMTP relay unreachable/);
    });
});

// ── allowedTriggers filtering ────────────────────────────────────────────────

describe('dispatch — allowedTriggers', () => {
    it('sends when trigger is in allowedTriggers', async () => {
        const record = makeRecord('telegram', { trigger: 'approval_requested' });
        const configs: NotificationChannelConfig[] = [
            {
                channel: 'telegram',
                enabled: true,
                config: { botToken: 'TK', chatId: '42' },
                allowedTriggers: ['approval_requested', 'approval_decided'],
            },
        ];
        const fakeFetch = async () => 'msg-ok';
        const [result] = await dispatch(record, configs, fakeFetch);
        assert.equal(result.success, true);
    });

    it('skips when trigger is not in allowedTriggers', async () => {
        const record = makeRecord('telegram', { trigger: 'run_completed' });
        const configs: NotificationChannelConfig[] = [
            {
                channel: 'telegram',
                enabled: true,
                config: { botToken: 'TK', chatId: '42' },
                allowedTriggers: ['approval_requested', 'approval_decided'],
            },
        ];
        const [result] = await dispatch(record, configs);
        assert.equal(result.success, false);
        assert.match(result.errorMessage ?? '', /No active config/);
    });

    it('sends when allowedTriggers is undefined (no restriction)', async () => {
        const record = makeRecord('telegram', { trigger: 'run_completed' });
        const configs: NotificationChannelConfig[] = [
            { channel: 'telegram', enabled: true, config: { botToken: 'TK', chatId: '42' } },
        ];
        const fakeFetch = async () => 'msg-ok';
        const [result] = await dispatch(record, configs, fakeFetch);
        assert.equal(result.success, true);
    });
});

// ── dispatchApprovalAlert ────────────────────────────────────────────────────

describe('dispatchApprovalAlert', () => {
    it('returns empty array for non-approval triggers', async () => {
        const record = makeRecord('telegram', { trigger: 'run_completed' });
        const configs: NotificationChannelConfig[] = [
            { channel: 'telegram', enabled: true, config: { botToken: 'TK', chatId: '42' } },
        ];
        const results = await dispatchApprovalAlert(record, configs);
        assert.deepEqual(results, []);
    });

    it('dispatches for approval_requested trigger', async () => {
        const record = makeRecord('telegram', { trigger: 'approval_requested' });
        const configs: NotificationChannelConfig[] = [
            { channel: 'telegram', enabled: true, config: { botToken: 'TK', chatId: '42' } },
        ];
        const fakeFetch = async () => 'msg-approval';
        const [result] = await dispatchApprovalAlert(record, configs, fakeFetch);
        assert.equal(result.success, true);
        assert.equal(result.platformMessageId, 'msg-approval');
    });

    it('dispatches for approval_decided trigger', async () => {
        const record = makeRecord('slack', { trigger: 'approval_decided' });
        const configs: NotificationChannelConfig[] = [
            { channel: 'slack', enabled: true, config: { webhookUrl: 'https://hooks.slack.com/X' } },
        ];
        const fakeFetch = async () => 'ts-decided';
        const [result] = await dispatchApprovalAlert(record, configs, fakeFetch);
        assert.equal(result.success, true);
    });

    it('returns empty array for kill_switch_activated trigger', async () => {
        const record = makeRecord('discord', { trigger: 'kill_switch_activated' });
        const configs: NotificationChannelConfig[] = [
            { channel: 'discord', enabled: true, config: { webhookUrl: 'https://discord.com/api/webhooks/X' } },
        ];
        const results = await dispatchApprovalAlert(record, configs);
        assert.deepEqual(results, []);
    });

    it('respects disabled configs within approval flow', async () => {
        const record = makeRecord('telegram', { trigger: 'approval_requested' });
        const configs: NotificationChannelConfig[] = [
            { channel: 'telegram', enabled: false, config: { botToken: 'TK', chatId: '42' } },
        ];
        const [result] = await dispatchApprovalAlert(record, configs);
        assert.equal(result.success, false);
        assert.match(result.errorMessage ?? '', /No active config/);
    });
});
