import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach, mock } from 'node:test';

describe('message-sender', () => {
    let savedEnv: Record<string, string | undefined>;

    beforeEach(() => {
        savedEnv = {
            MCP_SLACK_URL: process.env['MCP_SLACK_URL'],
            MCP_TEAMS_URL: process.env['MCP_TEAMS_URL'],
        };
    });

    afterEach(() => {
        process.env['MCP_SLACK_URL'] = savedEnv['MCP_SLACK_URL'];
        process.env['MCP_TEAMS_URL'] = savedEnv['MCP_TEAMS_URL'];
        mock.reset();
    });

    // -------------------------------------------------------------------------
    // Error path — connector not configured
    // -------------------------------------------------------------------------

    it('throws MessageConnectorUnavailableError when MCP_SLACK_URL is unset', async () => {
        delete process.env['MCP_SLACK_URL'];

        const { sendMessage, MessageConnectorUnavailableError } = await import('./message-sender.js');

        await assert.rejects(
            () => sendMessage({
                tenantId: 'tenant-1',
                botId: 'bot-1',
                platform: 'slack',
                recipient: '#general',
                message: 'Hello world',
            }),
            (err: unknown) => err instanceof MessageConnectorUnavailableError,
        );
    });

    it('throws MessageConnectorUnavailableError when MCP_TEAMS_URL is unset', async () => {
        delete process.env['MCP_TEAMS_URL'];

        const { sendMessage, MessageConnectorUnavailableError } = await import('./message-sender.js');

        await assert.rejects(
            () => sendMessage({
                tenantId: 'tenant-1',
                botId: 'bot-1',
                platform: 'teams',
                recipient: 'alice@example.com',
                message: 'Meeting reminder',
            }),
            (err: unknown) => err instanceof MessageConnectorUnavailableError,
        );
    });

    // -------------------------------------------------------------------------
    // Happy path — Slack
    // -------------------------------------------------------------------------

    it('sends a Slack message and returns sent=true with messageId', async () => {
        process.env['MCP_SLACK_URL'] = 'http://localhost:9991';

        mock.method(global, 'fetch', async () => ({
            ok: true,
            json: async () => ({ sent: true, messageId: 'slack-msg-001' }),
        }));

        const { sendMessage } = await import('./message-sender.js');

        const result = await sendMessage({
            tenantId: 'tenant-1',
            botId: 'bot-1',
            platform: 'slack',
            recipient: '#eng-alerts',
            message: 'Deployment completed.',
        });

        assert.equal(result.sent, true);
        assert.equal(result.messageId, 'slack-msg-001');
        assert.equal(result.platform, 'slack');
    });

    // -------------------------------------------------------------------------
    // Happy path — Teams
    // -------------------------------------------------------------------------

    it('sends a Teams message and returns sent=true with messageId', async () => {
        process.env['MCP_TEAMS_URL'] = 'http://localhost:9992';

        mock.method(global, 'fetch', async () => ({
            ok: true,
            json: async () => ({ sent: true, message_id: 'teams-msg-042' }),
        }));

        const { sendMessage } = await import('./message-sender.js');

        const result = await sendMessage({
            tenantId: 'tenant-2',
            botId: 'bot-2',
            platform: 'teams',
            recipient: 'bob@corp.com',
            message: 'Your weekly summary is ready.',
        });

        assert.equal(result.sent, true);
        assert.equal(result.messageId, 'teams-msg-042');
        assert.equal(result.platform, 'teams');
    });

    // -------------------------------------------------------------------------
    // HTTP error path
    // -------------------------------------------------------------------------

    it('throws on non-ok HTTP response', async () => {
        process.env['MCP_SLACK_URL'] = 'http://localhost:9991';

        mock.method(global, 'fetch', async () => ({
            ok: false,
            status: 503,
            text: async () => 'Service unavailable',
        }));

        const { sendMessage } = await import('./message-sender.js');

        await assert.rejects(
            () => sendMessage({
                tenantId: 'tenant-1',
                botId: 'bot-1',
                platform: 'slack',
                recipient: '#ops',
                message: 'Alert',
            }),
            /HTTP 503/,
        );
    });

    // -------------------------------------------------------------------------
    // Connector URL override (used in tests without env var)
    // -------------------------------------------------------------------------

    it('uses connector override instead of env var', async () => {
        delete process.env['MCP_TEAMS_URL'];

        let capturedUrl = '';
        mock.method(global, 'fetch', async (url: string) => {
            capturedUrl = url;
            return { ok: true, json: async () => ({ sent: true, messageId: 'override-msg' }) };
        });

        const { sendMessage } = await import('./message-sender.js');

        await sendMessage({
            tenantId: 'tenant-1',
            botId: 'bot-1',
            platform: 'teams',
            recipient: 'user@example.com',
            message: 'Test via override',
            connector: 'http://localhost:12345',
        });

        assert.ok(capturedUrl.startsWith('http://localhost:12345'), `expected override URL, got: ${capturedUrl}`);
    });
});
