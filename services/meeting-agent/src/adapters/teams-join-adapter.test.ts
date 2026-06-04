import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TeamsJoinAdapter, createTeamsAdapterFromEnv, type FetchLike } from './teams-join-adapter.js';

// ── fetch mock builder ────────────────────────────────────────────────────────

interface FakeResponse { ok: boolean; status: number; body: unknown }

function makeFetch(responses: FakeResponse[]): FetchLike {
    const queue = [...responses];
    return async () => {
        const r = queue.shift() ?? { ok: true, status: 200, body: {} };
        return {
            ok: r.ok,
            status: r.status,
            json: async () => r.body,
            text: async () => (typeof r.body === 'string' ? r.body : JSON.stringify(r.body)),
        };
    };
}

const TOKEN_OK: FakeResponse = { ok: true, status: 200, body: { access_token: 'tok-1', expires_in: 3600 } };
const CALL_OK: FakeResponse = { ok: true, status: 201, body: { id: 'call-abc123', chatInfo: { threadId: 'thread-xyz' } } };

function makeAdapter(responses: FakeResponse[]): TeamsJoinAdapter {
    return new TeamsJoinAdapter({
        tenantId: 'tid', clientId: 'cid', clientSecret: 'sec',
        fetchImpl: makeFetch(responses),
    });
}

// ── Constructor ───────────────────────────────────────────────────────────────

describe('TeamsJoinAdapter — constructor', () => {
    it('throws when tenantId is missing', () => {
        assert.throws(
            () => new TeamsJoinAdapter({ tenantId: '', clientId: 'c', clientSecret: 's' }),
            /tenantId/u,
        );
    });

    it('throws when clientId is missing', () => {
        assert.throws(
            () => new TeamsJoinAdapter({ tenantId: 't', clientId: '', clientSecret: 's' }),
            /clientId/u,
        );
    });

    it('throws when clientSecret is missing', () => {
        assert.throws(
            () => new TeamsJoinAdapter({ tenantId: 't', clientId: 'c', clientSecret: '' }),
            /clientSecret/u,
        );
    });

    it('constructs with valid credentials', () => {
        assert.doesNotThrow(() => new TeamsJoinAdapter({ tenantId: 't', clientId: 'c', clientSecret: 's' }));
    });
});

// ── createTeamsAdapterFromEnv ─────────────────────────────────────────────────

describe('createTeamsAdapterFromEnv()', () => {
    it('returns null when env vars are not set', () => {
        const saved = {
            t: process.env['TEAMS_TENANT_ID'],
            c: process.env['TEAMS_CLIENT_ID'],
            s: process.env['TEAMS_CLIENT_SECRET'],
        };
        delete process.env['TEAMS_TENANT_ID'];
        delete process.env['TEAMS_CLIENT_ID'];
        delete process.env['TEAMS_CLIENT_SECRET'];
        const result = createTeamsAdapterFromEnv();
        assert.equal(result, null);
        // restore
        if (saved.t !== undefined) process.env['TEAMS_TENANT_ID'] = saved.t;
        if (saved.c !== undefined) process.env['TEAMS_CLIENT_ID'] = saved.c;
        if (saved.s !== undefined) process.env['TEAMS_CLIENT_SECRET'] = saved.s;
    });
});

// ── join() ────────────────────────────────────────────────────────────────────

describe('TeamsJoinAdapter.join()', () => {
    it('fetches a token then creates a call, returning call ID as sessionHandle', async () => {
        const calls: Array<{ url: string; method?: string }> = [];
        const fetchImpl: FetchLike = async (url, init) => {
            calls.push({ url, method: init?.method });
            if (url.includes('/oauth2/v2.0/token')) {
                return { ok: true, status: 200, json: async () => ({ access_token: 'tok-1', expires_in: 3600 }), text: async () => '' };
            }
            return { ok: true, status: 201, json: async () => ({ id: 'call-abc' }), text: async () => '' };
        };
        const adapter = new TeamsJoinAdapter({ tenantId: 'tid', clientId: 'cid', clientSecret: 'sec', fetchImpl });
        const result = await adapter.join('https://teams.microsoft.com/l/meetup-join/abc', 'Bot');

        assert.equal(result.ok, true);
        assert.equal(result.joinMethod, 'teams_sdk');
        assert.equal(result.sessionHandle, 'call-abc');
        // First call must be the token endpoint
        assert.ok(calls[0]!.url.includes('/oauth2/v2.0/token'));
        // Second call must be Graph API
        assert.ok(calls[1]!.url.includes('/communications/calls'));
    });

    it('returns ok:false when token fetch fails', async () => {
        const adapter = makeAdapter([{ ok: false, status: 401, body: 'Unauthorized' }]);
        const result = await adapter.join('https://teams.microsoft.com/l/meetup-join/abc');
        assert.equal(result.ok, false);
        assert.equal(result.joinMethod, 'teams_sdk');
        assert.ok(result.error);
    });

    it('returns ok:false when Graph API call fails', async () => {
        const adapter = makeAdapter([TOKEN_OK, { ok: false, status: 403, body: 'Forbidden' }]);
        const result = await adapter.join('https://teams.microsoft.com/l/meetup-join/abc');
        assert.equal(result.ok, false);
        assert.ok(result.error?.includes('403'));
    });

    it('returns ok:false when call response has no id', async () => {
        const adapter = makeAdapter([TOKEN_OK, { ok: true, status: 201, body: {} }]);
        const result = await adapter.join('https://teams.microsoft.com/l/meetup-join/abc');
        assert.equal(result.ok, false);
        assert.ok(result.error?.includes('no call ID'));
    });

    it('reuses cached token on second join', async () => {
        const tokenCalls: string[] = [];
        const fetchImpl: FetchLike = async (url, _init) => {
            if (url.includes('/oauth2/v2.0/token')) {
                tokenCalls.push(url);
                return { ok: true, status: 200, json: async () => ({ access_token: 'tok', expires_in: 3600 }), text: async () => '' };
            }
            return { ok: true, status: 201, json: async () => ({ id: `call-${tokenCalls.length}` }), text: async () => '' };
        };
        const adapter = new TeamsJoinAdapter({ tenantId: 't', clientId: 'c', clientSecret: 's', fetchImpl });
        await adapter.join('https://teams.microsoft.com/l/meetup-join/a');
        await adapter.join('https://teams.microsoft.com/l/meetup-join/b');
        // Token should only be fetched once
        assert.equal(tokenCalls.length, 1);
    });
});

// ── leave() ──────────────────────────────────────────────────────────────────

describe('TeamsJoinAdapter.leave()', () => {
    it('returns ok:true immediately when no sessionHandle', async () => {
        const adapter = makeAdapter([]);
        const result = await adapter.leave(undefined);
        assert.equal(result.ok, true);
    });

    it('DELETEs the call via Graph API', async () => {
        const calls: Array<{ url: string; method?: string }> = [];
        const fetchImpl: FetchLike = async (url, init) => {
            calls.push({ url, method: init?.method });
            return { ok: true, status: 204, json: async () => ({}), text: async () => '' };
        };
        const adapter = new TeamsJoinAdapter({ tenantId: 't', clientId: 'c', clientSecret: 's', fetchImpl });
        const result = await adapter.leave('call-abc');
        assert.equal(result.ok, true);
        const deleteCall = calls.find((c) => c.method === 'DELETE');
        assert.ok(deleteCall);
        assert.ok(deleteCall.url.includes('call-abc'));
    });
});

// ── sendChatMessage() ─────────────────────────────────────────────────────────

describe('TeamsJoinAdapter.sendChatMessage()', () => {
    it('POSTs to /chats/{threadId}/messages with correct content', async () => {
        let chatUrl = '';
        let chatBodyStr = '';
        const fetchImpl: FetchLike = async (url, init) => {
            if (url.includes('/token')) {
                return { ok: true, status: 200, json: async () => ({ access_token: 'tok', expires_in: 3600 }), text: async () => '' };
            }
            if (url.includes('/chats/')) {
                chatUrl = url;
                // Use String() to handle string, URLSearchParams, or undefined uniformly
                chatBodyStr = String(init?.body ?? '');
            }
            return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
        };
        const adapter = new TeamsJoinAdapter({ tenantId: 't', clientId: 'c', clientSecret: 's', fetchImpl });
        await adapter.sendChatMessage('thread-xyz', 'Hello team');

        assert.ok(chatUrl.includes('/chats/') && chatUrl.includes('/messages'), `unexpected URL: ${chatUrl}`);
        assert.ok(chatUrl.includes('thread-xyz'), `threadId not in URL: ${chatUrl}`);
        // Body must contain the message text (JSON-encoded)
        assert.ok(chatBodyStr.includes('Hello team'), `body missing text: ${chatBodyStr}`);
    });

    it('throws when Graph API returns an error', async () => {
        const fetchImpl: FetchLike = async (url) => {
            if (url.includes('/token')) return { ok: true, status: 200, json: async () => ({ access_token: 'tok', expires_in: 3600 }), text: async () => '' };
            return { ok: false, status: 403, json: async () => ({}), text: async () => 'Forbidden' };
        };
        const adapter = new TeamsJoinAdapter({ tenantId: 't', clientId: 'c', clientSecret: 's', fetchImpl });
        await assert.rejects(() => adapter.sendChatMessage('thread-xyz', 'Hi'), /403/u);
    });
});

// ── getCapabilities() ─────────────────────────────────────────────────────────

describe('TeamsJoinAdapter.getCapabilities()', () => {
    it('reports chat, screenShare, attendeeList, nativeAudioStream as true', () => {
        const adapter = new TeamsJoinAdapter({ tenantId: 't', clientId: 'c', clientSecret: 's' });
        const caps = adapter.getCapabilities();
        assert.equal(caps.chat, true);
        assert.equal(caps.screenShare, true);
        assert.equal(caps.attendeeList, true);
        assert.equal(caps.nativeAudioStream, true);
    });
});

// ── join() via sidecar ────────────────────────────────────────────────────────

describe('TeamsJoinAdapter.join() — sidecar path', () => {
    it('calls sidecar /v1/calls/join and returns callId as sessionHandle', async () => {
        let capturedUrl = '';
        let capturedBody: Record<string, unknown> = {};
        const fetchImpl: FetchLike = async (url, init) => {
            capturedUrl = String(url);
            capturedBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
            return { ok: true, status: 200, json: async () => ({ ok: true, callId: 'sidecar-call-1' }), text: async () => '' };
        };
        const adapter = new TeamsJoinAdapter({
            tenantId: 'tid', clientId: 'cid', clientSecret: 'sec',
            mediasBotUrl: 'http://teams-media-bot:8090',
            callbackBaseUrl: 'https://mybot.example.com',
            fetchImpl,
        });
        const result = await adapter.join('https://teams.microsoft.com/l/meetup-join/test', 'AgentBot');

        assert.equal(result.ok, true);
        assert.equal(result.joinMethod, 'teams_sdk');
        assert.equal(result.sessionHandle, 'sidecar-call-1');
        assert.equal(capturedUrl, 'http://teams-media-bot:8090/v1/calls/join');
        assert.equal(capturedBody['meetingUrl'], 'https://teams.microsoft.com/l/meetup-join/test');
        assert.equal(capturedBody['callbackBaseUrl'], 'https://mybot.example.com');
        assert.equal(capturedBody['botDisplayName'], 'AgentBot');
    });

    it('returns ok:false when sidecar returns non-2xx', async () => {
        const fetchImpl: FetchLike = async () => ({
            ok: false, status: 502, json: async () => ({}), text: async () => 'bad gateway',
        });
        const adapter = new TeamsJoinAdapter({
            tenantId: 't', clientId: 'c', clientSecret: 's',
            mediasBotUrl: 'http://teams-media-bot:8090',
            fetchImpl,
        });
        const result = await adapter.join('https://teams.microsoft.com/test');
        assert.equal(result.ok, false);
        assert.ok(result.error?.includes('502'));
    });

    it('returns ok:false when sidecar responds ok:false (no callId)', async () => {
        const fetchImpl: FetchLike = async () => ({
            ok: true, status: 200,
            json: async () => ({ ok: false, error: 'Azure AD auth failed' }),
            text: async () => '',
        });
        const adapter = new TeamsJoinAdapter({
            tenantId: 't', clientId: 'c', clientSecret: 's',
            mediasBotUrl: 'http://teams-media-bot:8090',
            fetchImpl,
        });
        const result = await adapter.join('https://teams.microsoft.com/test');
        assert.equal(result.ok, false);
        assert.ok(result.error?.includes('Azure AD auth failed'));
    });

    it('falls back to Graph REST join when mediasBotUrl is not set', async () => {
        let calledUrl = '';
        const fetchImpl: FetchLike = async (url) => {
            calledUrl = String(url);
            if (calledUrl.includes('/token'))
                return { ok: true, status: 200, json: async () => ({ access_token: 'tok', expires_in: 3600 }), text: async () => '' };
            return { ok: true, status: 201, json: async () => ({ id: 'graph-call-1' }), text: async () => '' };
        };
        const adapter = new TeamsJoinAdapter({ tenantId: 't', clientId: 'c', clientSecret: 's', fetchImpl });
        const result = await adapter.join('https://teams.microsoft.com/test');
        assert.equal(result.ok, true);
        assert.equal(result.sessionHandle, 'graph-call-1');
        assert.ok(calledUrl.includes('graph.microsoft.com'), 'should use Graph API, not sidecar');
    });
});

// ── startScreenShare() — sidecar path ─────────────────────────────────────────

describe('TeamsJoinAdapter.startScreenShare() — sidecar path', () => {
    it('calls desktop-agent start then sidecar inject/start when sidecar is configured', async () => {
        const calls: string[] = [];
        const fetchImpl: FetchLike = async (url) => {
            calls.push(url);
            if (url.includes('/token'))
                return { ok: true, status: 200, json: async () => ({ access_token: 'tok', expires_in: 3600 }), text: async () => '' };
            if (url.includes('/screen-share/start'))
                return { ok: true, status: 200, json: async () => ({ ok: true, streamUrl: 'http://da/stream.m3u8' }), text: async () => '' };
            if (url.includes('/inject/start'))
                return { ok: true, status: 200, json: async () => ({ ok: true }), text: async () => '' };
            return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
        };
        const adapter = new TeamsJoinAdapter({
            tenantId: 't', clientId: 'c', clientSecret: 's',
            mediasBotUrl: 'http://teams-media-bot:8090',
            fetchImpl,
        });
        const result = await adapter.startScreenShare!('call-abc', 'http://desktop-agent:5003');

        assert.equal(result.ok, true);
        assert.ok(result.streamUrl?.includes('stream.m3u8'));
        assert.ok(calls.some((u) => u.includes('/screen-share/start')));
        assert.ok(calls.some((u) => u.includes('/inject/start')));
        // Should NOT call Graph PATCH when sidecar is configured
        assert.ok(!calls.some((u) => u.includes('graph.microsoft.com/v1.0/communications')));
    });

    it('returns ok:false when sidecar inject/start fails', async () => {
        const fetchImpl: FetchLike = async (url) => {
            if (url.includes('/token'))
                return { ok: true, status: 200, json: async () => ({ access_token: 'tok', expires_in: 3600 }), text: async () => '' };
            if (url.includes('/screen-share/start'))
                return { ok: true, status: 200, json: async () => ({ ok: true, streamUrl: 'http://da/s.m3u8' }), text: async () => '' };
            if (url.includes('/inject/start'))
                return { ok: false, status: 503, json: async () => ({}), text: async () => 'sidecar unavailable' };
            return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
        };
        const adapter = new TeamsJoinAdapter({
            tenantId: 't', clientId: 'c', clientSecret: 's',
            mediasBotUrl: 'http://teams-media-bot:8090',
            fetchImpl,
        });
        const result = await adapter.startScreenShare!('call-abc', 'http://da:5003');
        assert.equal(result.ok, false);
        assert.ok(result.error?.includes('503'));
    });

    it('falls back to Graph PATCH when sidecar is not configured', async () => {
        const calls: string[] = [];
        const fetchImpl: FetchLike = async (url) => {
            calls.push(url);
            if (url.includes('/token'))
                return { ok: true, status: 200, json: async () => ({ access_token: 'tok', expires_in: 3600 }), text: async () => '' };
            if (url.includes('/screen-share/start'))
                return { ok: true, status: 200, json: async () => ({ ok: true, streamUrl: 'http://da/s.m3u8' }), text: async () => '' };
            return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
        };
        const adapter = new TeamsJoinAdapter({ tenantId: 't', clientId: 'c', clientSecret: 's', fetchImpl });
        const result = await adapter.startScreenShare!('call-abc', 'http://da:5003');

        assert.equal(result.ok, true);
        assert.ok(calls.some((u) => u.includes('/communications/calls/call-abc')), 'should PATCH Graph API');
        assert.ok(!calls.some((u) => u.includes('/inject/start')), 'should NOT call sidecar');
    });
});

// ── stopScreenShare() — sidecar path ──────────────────────────────────────────

describe('TeamsJoinAdapter.stopScreenShare() — sidecar path', () => {
    it('calls desktop-agent stop then sidecar inject/stop', async () => {
        const calls: string[] = [];
        const fetchImpl: FetchLike = async (url) => {
            calls.push(url);
            return { ok: true, status: 200, json: async () => ({ ok: true }), text: async () => '' };
        };
        const adapter = new TeamsJoinAdapter({
            tenantId: 't', clientId: 'c', clientSecret: 's',
            mediasBotUrl: 'http://teams-media-bot:8090',
            fetchImpl,
        });
        const result = await adapter.stopScreenShare!('call-abc', 'http://da:5003');

        assert.equal(result.ok, true);
        assert.ok(calls.some((u) => u.includes('/screen-share/stop')));
        assert.ok(calls.some((u) => u.includes('/inject/stop')));
    });

    it('returns ok:true even when sidecar inject/stop throws (non-fatal)', async () => {
        let stopCount = 0;
        const fetchImpl: FetchLike = async (url) => {
            if (url.includes('/screen-share/stop')) {
                stopCount++;
                return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
            }
            if (url.includes('/inject/stop')) throw new Error('sidecar gone');
            return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
        };
        const adapter = new TeamsJoinAdapter({
            tenantId: 't', clientId: 'c', clientSecret: 's',
            mediasBotUrl: 'http://teams-media-bot:8090',
            fetchImpl,
        });
        const result = await adapter.stopScreenShare!('call-abc', 'http://da:5003');
        assert.equal(result.ok, true);
        assert.equal(stopCount, 1, 'desktop-agent stop should have been called');
    });
});

// ── startScreenShare() ────────────────────────────────────────────────────────

describe('TeamsJoinAdapter.startScreenShare()', () => {
    const DA_URL = 'http://desktop-agent:5003';

    it('returns ok:true with streamUrl when desktop-agent and Graph PATCH succeed', async () => {
        const calls: string[] = [];
        const fetchImpl: FetchLike = async (url) => {
            calls.push(url);
            if (url.includes('/token'))
                return { ok: true, status: 200, json: async () => ({ access_token: 'tok', expires_in: 3600 }), text: async () => '' };
            if (url.includes('/screen-share/start'))
                return { ok: true, status: 200, json: async () => ({ ok: true, streamUrl: 'http://da:5003/v1/screen-share/stream.m3u8' }), text: async () => '' };
            // Graph PATCH
            return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
        };
        const adapter = new TeamsJoinAdapter({ tenantId: 't', clientId: 'c', clientSecret: 's', fetchImpl });
        const result = await adapter.startScreenShare!('call-abc', DA_URL);

        assert.equal(result.ok, true);
        assert.ok(result.streamUrl?.includes('stream.m3u8'));
        assert.ok(calls.some((u) => u.includes('/screen-share/start')), 'should have called desktop-agent');
        assert.ok(calls.some((u) => u.includes('/communications/calls/call-abc')), 'should have PATCHed Teams call');
    });

    it('returns ok:false when desktop-agent screen-share/start fails', async () => {
        const fetchImpl: FetchLike = async (url) => {
            if (url.includes('/token'))
                return { ok: true, status: 200, json: async () => ({ access_token: 'tok', expires_in: 3600 }), text: async () => '' };
            if (url.includes('/screen-share/start'))
                return { ok: false, status: 409, json: async () => ({ ok: false, error: 'already active' }), text: async () => 'already active' };
            return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
        };
        const adapter = new TeamsJoinAdapter({ tenantId: 't', clientId: 'c', clientSecret: 's', fetchImpl });
        const result = await adapter.startScreenShare!('call-abc', DA_URL);

        assert.equal(result.ok, false);
        assert.ok(result.error?.includes('409'));
    });

    it('returns ok:false when Graph PATCH to add video modality fails', async () => {
        const fetchImpl: FetchLike = async (url) => {
            if (url.includes('/token'))
                return { ok: true, status: 200, json: async () => ({ access_token: 'tok', expires_in: 3600 }), text: async () => '' };
            if (url.includes('/screen-share/start'))
                return { ok: true, status: 200, json: async () => ({ ok: true, streamUrl: 'http://da/stream.m3u8' }), text: async () => '' };
            // Graph PATCH fails
            return { ok: false, status: 403, json: async () => ({}), text: async () => 'Forbidden' };
        };
        const adapter = new TeamsJoinAdapter({ tenantId: 't', clientId: 'c', clientSecret: 's', fetchImpl });
        const result = await adapter.startScreenShare!('call-abc', DA_URL);

        assert.equal(result.ok, false);
        assert.ok(result.error?.includes('403'));
    });

    it('returns ok:false when fetch throws (network error)', async () => {
        const fetchImpl: FetchLike = async () => { throw new Error('network down'); };
        const adapter = new TeamsJoinAdapter({ tenantId: 't', clientId: 'c', clientSecret: 's', fetchImpl });
        const result = await adapter.startScreenShare!('call-abc', DA_URL);

        assert.equal(result.ok, false);
        assert.ok(result.error?.includes('network down'));
    });
});

// ── stopScreenShare() ─────────────────────────────────────────────────────────

describe('TeamsJoinAdapter.stopScreenShare()', () => {
    const DA_URL = 'http://desktop-agent:5003';

    it('returns ok:true when desktop-agent stop succeeds', async () => {
        let stoppedUrl = '';
        const fetchImpl: FetchLike = async (url) => {
            stoppedUrl = url;
            return { ok: true, status: 200, json: async () => ({ ok: true }), text: async () => '' };
        };
        const adapter = new TeamsJoinAdapter({ tenantId: 't', clientId: 'c', clientSecret: 's', fetchImpl });
        const result = await adapter.stopScreenShare!('call-abc', DA_URL);

        assert.equal(result.ok, true);
        assert.ok(stoppedUrl.includes('/screen-share/stop'));
    });

    it('returns ok:false when desktop-agent returns non-2xx', async () => {
        const fetchImpl: FetchLike = async () => ({ ok: false, status: 500, json: async () => ({}), text: async () => '' });
        const adapter = new TeamsJoinAdapter({ tenantId: 't', clientId: 'c', clientSecret: 's', fetchImpl });
        const result = await adapter.stopScreenShare!('call-abc', DA_URL);

        assert.equal(result.ok, false);
        assert.ok(result.error?.includes('500'));
    });

    it('returns ok:false when fetch throws', async () => {
        const fetchImpl: FetchLike = async () => { throw new Error('connection refused'); };
        const adapter = new TeamsJoinAdapter({ tenantId: 't', clientId: 'c', clientSecret: 's', fetchImpl });
        const result = await adapter.stopScreenShare!('call-abc', DA_URL);

        assert.equal(result.ok, false);
        assert.ok(result.error?.includes('connection refused'));
    });
});
