import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    NullChatSender,
    TeamsChatSender,
    ZoomChatSender,
    PlatformChatSender,
} from './chat-sender.js';
import { TeamsJoinAdapter } from './adapters/teams-join-adapter.js';
import { ZoomJoinAdapter } from './adapters/zoom-join-adapter.js';

// ── NullChatSender ────────────────────────────────────────────────────────────

describe('NullChatSender', () => {
    it('always returns ok:false', async () => {
        const sender = new NullChatSender();
        const result = await sender.send('teams', 'thread-1', 'Hello');
        assert.equal(result.ok, false);
        assert.equal(result.platform, 'teams');
        assert.ok(result.error?.length ?? 0 > 0);
    });

    it('reflects the platform in the result', async () => {
        const sender = new NullChatSender();
        const result = await sender.send('zoom', 'meeting-123', 'Hi');
        assert.equal(result.platform, 'zoom');
    });
});

// ── TeamsChatSender ───────────────────────────────────────────────────────────

describe('TeamsChatSender', () => {
    it('calls sendChatMessage on the adapter and returns ok:true', async () => {
        const calls: Array<{ threadId: string; text: string }> = [];
        const fakeFetch = async (url: string, _init?: unknown) => {
            if (url.includes('/oauth2/v2.0/token')) {
                return { ok: true, status: 200, json: async () => ({ access_token: 'tok', expires_in: 3600 }), text: async () => '' };
            }
            if (url.includes('/chats/')) {
                calls.push({
                    threadId: url.split('/chats/')[1]?.split('/messages')[0] ?? '',
                    text: '',
                });
                return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
            }
            return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
        };

        const adapter = new TeamsJoinAdapter({
            tenantId: 't1', clientId: 'c1', clientSecret: 's1',
            fetchImpl: fakeFetch as never,
        });
        const sender = new TeamsChatSender(adapter);
        const result = await sender.send('teams', 'thread-abc', 'Hello everyone');
        assert.equal(result.ok, true);
        assert.equal(result.platform, 'teams');
        assert.equal(calls.length, 1);
        assert.equal(calls[0]!.threadId, 'thread-abc');
    });

    it('returns ok:false when adapter throws', async () => {
        const failFetch = async () => ({
            ok: false, status: 401,
            json: async () => ({}),
            text: async () => 'Unauthorized',
        });
        const adapter = new TeamsJoinAdapter({
            tenantId: 't1', clientId: 'c1', clientSecret: 's1',
            fetchImpl: failFetch as never,
        });
        const sender = new TeamsChatSender(adapter);
        const result = await sender.send('teams', 'thread-abc', 'Hello');
        assert.equal(result.ok, false);
        assert.ok(result.error);
    });
});

// ── ZoomChatSender ────────────────────────────────────────────────────────────

describe('ZoomChatSender', () => {
    it('calls sendChatMessage on the adapter and returns ok:true', async () => {
        const calls: string[] = [];
        const fakeFetch = async (url: string, init?: { body?: string }) => {
            if (url.includes('/oauth/token')) {
                return { ok: true, status: 200, json: async () => ({ access_token: 'ztok', expires_in: 3600 }), text: async () => '' };
            }
            if (url.includes('/chat/users/me/messages')) {
                calls.push(init?.body ?? '');
                return { ok: true, status: 201, json: async () => ({}), text: async () => '' };
            }
            return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
        };

        const adapter = new ZoomJoinAdapter({
            accountId: 'a1', clientId: 'c1', clientSecret: 's1',
            fetchImpl: fakeFetch as never,
        });
        const sender = new ZoomChatSender(adapter);
        const result = await sender.send('zoom', '987654321', 'Hi team');
        assert.equal(result.ok, true);
        assert.equal(result.platform, 'zoom');
        assert.equal(calls.length, 1);
        const body = JSON.parse(calls[0]!);
        assert.equal(body.message, 'Hi team');
    });

    it('returns ok:false when adapter throws', async () => {
        const failFetch = async () => ({
            ok: false, status: 403,
            json: async () => ({}),
            text: async () => 'Forbidden',
        });
        const adapter = new ZoomJoinAdapter({
            accountId: 'a1', clientId: 'c1', clientSecret: 's1',
            fetchImpl: failFetch as never,
        });
        const sender = new ZoomChatSender(adapter);
        const result = await sender.send('zoom', '987654321', 'Hi');
        assert.equal(result.ok, false);
        assert.ok(result.error);
    });
});

// ── PlatformChatSender ────────────────────────────────────────────────────────

describe('PlatformChatSender', () => {
    it('routes to the correct sender by platform', async () => {
        const called: string[] = [];
        const fakeSender = { send: async (platform: string) => { called.push(platform); return { ok: true, platform }; } };

        const router = new PlatformChatSender();
        router.register('teams', fakeSender);
        router.register('zoom', fakeSender);

        await router.send('teams', 'h1', 'hi');
        await router.send('zoom', 'h2', 'hi');
        assert.deepEqual(called, ['teams', 'zoom']);
    });

    it('falls back to NullChatSender for unregistered platform', async () => {
        const router = new PlatformChatSender();
        const result = await router.send('webex', 'h1', 'hello');
        assert.equal(result.ok, false);
        assert.equal(result.platform, 'webex');
    });

    it('register() is chainable', () => {
        const router = new PlatformChatSender();
        const ret = router.register('teams', new NullChatSender());
        assert.strictEqual(ret, router);
    });
});
