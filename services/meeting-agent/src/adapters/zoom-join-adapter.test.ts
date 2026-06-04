import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ZoomJoinAdapter, createZoomAdapterFromEnv, type FetchLike } from './zoom-join-adapter.js';

// ── fetch mock helpers ────────────────────────────────────────────────────────

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

const TOKEN_OK: FakeResponse = { ok: true, status: 200, body: { access_token: 'ztok', expires_in: 3600 } };
const JOIN_TOKEN_OK: FakeResponse = { ok: true, status: 200, body: { token: 'join-tok-xyz' } };

function makeAdapter(responses: FakeResponse[]): ZoomJoinAdapter {
    return new ZoomJoinAdapter({
        accountId: 'acc', clientId: 'cid', clientSecret: 'sec',
        fetchImpl: makeFetch(responses),
    });
}

// ── Constructor ───────────────────────────────────────────────────────────────

describe('ZoomJoinAdapter — constructor', () => {
    it('throws when accountId is missing', () => {
        assert.throws(
            () => new ZoomJoinAdapter({ accountId: '', clientId: 'c', clientSecret: 's' }),
            /accountId/u,
        );
    });

    it('throws when clientId is missing', () => {
        assert.throws(
            () => new ZoomJoinAdapter({ accountId: 'a', clientId: '', clientSecret: 's' }),
            /clientId/u,
        );
    });

    it('constructs with valid credentials', () => {
        assert.doesNotThrow(() => new ZoomJoinAdapter({ accountId: 'a', clientId: 'c', clientSecret: 's' }));
    });
});

// ── createZoomAdapterFromEnv ──────────────────────────────────────────────────

describe('createZoomAdapterFromEnv()', () => {
    it('returns null when env vars are not set', () => {
        const saved = {
            a: process.env['ZOOM_ACCOUNT_ID'],
            c: process.env['ZOOM_CLIENT_ID'],
            s: process.env['ZOOM_CLIENT_SECRET'],
        };
        delete process.env['ZOOM_ACCOUNT_ID'];
        delete process.env['ZOOM_CLIENT_ID'];
        delete process.env['ZOOM_CLIENT_SECRET'];
        const result = createZoomAdapterFromEnv();
        assert.equal(result, null);
        if (saved.a !== undefined) process.env['ZOOM_ACCOUNT_ID'] = saved.a;
        if (saved.c !== undefined) process.env['ZOOM_CLIENT_ID'] = saved.c;
        if (saved.s !== undefined) process.env['ZOOM_CLIENT_SECRET'] = saved.s;
    });
});

// ── join() ────────────────────────────────────────────────────────────────────

describe('ZoomJoinAdapter.join()', () => {
    it('fetches a token, gets a join token, and returns JSON sessionHandle', async () => {
        const calls: string[] = [];
        const fetchImpl: FetchLike = async (url) => {
            calls.push(url);
            if (url.includes('/oauth/token')) return { ok: true, status: 200, json: async () => ({ access_token: 'ztok', expires_in: 3600 }), text: async () => '' };
            if (url.includes('/jointoken')) return { ok: true, status: 200, json: async () => ({ token: 'jt-123' }), text: async () => '' };
            return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
        };
        const adapter = new ZoomJoinAdapter({ accountId: 'a', clientId: 'c', clientSecret: 's', fetchImpl });
        const result = await adapter.join('https://zoom.us/j/123456789', 'AgentFarm Bot');

        assert.equal(result.ok, true);
        assert.equal(result.joinMethod, 'zoom_sdk');
        assert.ok(result.sessionHandle);
        const handle = JSON.parse(result.sessionHandle!);
        assert.equal(handle.meetingId, '123456789');
        assert.equal(handle.joinToken, 'jt-123');
        assert.equal(handle.displayName, 'AgentFarm Bot');
    });

    it('returns ok:false for a URL with no meeting ID', async () => {
        const adapter = makeAdapter([TOKEN_OK]);
        const result = await adapter.join('https://zoom.us/webinar/join');
        assert.equal(result.ok, false);
        assert.ok(result.error?.includes('Cannot extract'));
    });

    it('returns ok:false when token fetch fails', async () => {
        const adapter = makeAdapter([{ ok: false, status: 401, body: 'Unauthorized' }]);
        const result = await adapter.join('https://zoom.us/j/123456789');
        assert.equal(result.ok, false);
        assert.ok(result.error);
    });

    it('returns ok:false when join token fetch fails', async () => {
        const adapter = makeAdapter([TOKEN_OK, { ok: false, status: 404, body: 'Not Found' }]);
        const result = await adapter.join('https://zoom.us/j/123456789');
        assert.equal(result.ok, false);
        assert.ok(result.error?.includes('404'));
    });

    it('returns ok:false when join token response has no token field', async () => {
        const adapter = makeAdapter([TOKEN_OK, { ok: true, status: 200, body: {} }]);
        const result = await adapter.join('https://zoom.us/j/123456789');
        assert.equal(result.ok, false);
        assert.ok(result.error?.includes('missing token'));
    });

    it('reuses cached token on second join', async () => {
        const tokenCalls: string[] = [];
        const fetchImpl: FetchLike = async (url) => {
            if (url.includes('/oauth/token')) {
                tokenCalls.push(url);
                return { ok: true, status: 200, json: async () => ({ access_token: 'ztok', expires_in: 3600 }), text: async () => '' };
            }
            return { ok: true, status: 200, json: async () => ({ token: 'jt' }), text: async () => '' };
        };
        const adapter = new ZoomJoinAdapter({ accountId: 'a', clientId: 'c', clientSecret: 's', fetchImpl });
        await adapter.join('https://zoom.us/j/111');
        await adapter.join('https://zoom.us/j/222');
        assert.equal(tokenCalls.length, 1);
    });

    it('extracts meeting ID from custom subdomain Zoom URL', async () => {
        let capturedUrl = '';
        const fetchImpl: FetchLike = async (url) => {
            capturedUrl = url;
            if (url.includes('/oauth/token')) return { ok: true, status: 200, json: async () => ({ access_token: 'tok', expires_in: 3600 }), text: async () => '' };
            return { ok: true, status: 200, json: async () => ({ token: 'jt' }), text: async () => '' };
        };
        const adapter = new ZoomJoinAdapter({ accountId: 'a', clientId: 'c', clientSecret: 's', fetchImpl });
        await adapter.join('https://mycompany.zoom.us/j/987654321');
        assert.ok(capturedUrl.includes('987654321'));
    });
});

// ── leave() ──────────────────────────────────────────────────────────────────

describe('ZoomJoinAdapter.leave()', () => {
    it('always resolves ok:true (SDK-side leave, no REST call needed)', async () => {
        const adapter = makeAdapter([]);
        const result = await adapter.leave('some-handle');
        assert.equal(result.ok, true);
    });

    it('resolves ok:true with no handle', async () => {
        const adapter = makeAdapter([]);
        const result = await adapter.leave(undefined);
        assert.equal(result.ok, true);
    });
});

// ── sendChatMessage() ─────────────────────────────────────────────────────────

describe('ZoomJoinAdapter.sendChatMessage()', () => {
    it('POSTs to /v2/chat/users/me/messages with meeting ID and text', async () => {
        const calls: Array<{ url: string; body: unknown }> = [];
        const fetchImpl: FetchLike = async (url, init) => {
            calls.push({ url, body: JSON.parse((init?.body as string | undefined) ?? '{}') });
            if (url.includes('/oauth/token')) return { ok: true, status: 200, json: async () => ({ access_token: 'ztok', expires_in: 3600 }), text: async () => '' };
            return { ok: true, status: 201, json: async () => ({}), text: async () => '' };
        };
        const adapter = new ZoomJoinAdapter({ accountId: 'a', clientId: 'c', clientSecret: 's', fetchImpl });
        await adapter.sendChatMessage('987654321', 'Hello team');

        const msgCall = calls.find((c) => c.url.includes('/chat/users/me/messages'));
        assert.ok(msgCall);
        assert.equal((msgCall!.body as { message: string }).message, 'Hello team');
        assert.equal((msgCall!.body as { to_channel: string }).to_channel, '987654321');
    });

    it('throws when API returns non-2xx', async () => {
        const fetchImpl: FetchLike = async (url) => {
            if (url.includes('/oauth/token')) return { ok: true, status: 200, json: async () => ({ access_token: 'tok', expires_in: 3600 }), text: async () => '' };
            return { ok: false, status: 429, json: async () => ({}), text: async () => 'Rate limited' };
        };
        const adapter = new ZoomJoinAdapter({ accountId: 'a', clientId: 'c', clientSecret: 's', fetchImpl });
        await assert.rejects(() => adapter.sendChatMessage('123', 'Hi'), /429/u);
    });
});

// ── getCapabilities() ─────────────────────────────────────────────────────────

describe('ZoomJoinAdapter.getCapabilities()', () => {
    it('reports chat, screenShare, attendeeList, nativeAudioStream as true', () => {
        const adapter = new ZoomJoinAdapter({ accountId: 'a', clientId: 'c', clientSecret: 's' });
        const caps = adapter.getCapabilities();
        assert.equal(caps.chat, true);
        assert.equal(caps.screenShare, true);
        assert.equal(caps.attendeeList, true);
        assert.equal(caps.nativeAudioStream, true);
    });
});

// ── startScreenShare() ────────────────────────────────────────────────────────

describe('ZoomJoinAdapter.startScreenShare()', () => {
    const DA_URL = 'http://desktop-agent:5003';
    const SESSION_HANDLE = JSON.stringify({ meetingId: '987654321', joinToken: 'jt-abc', displayName: 'Bot' });

    it('returns ok:true with streamUrl when desktop-agent and Zoom API succeed', async () => {
        const calls: string[] = [];
        const fetchImpl: FetchLike = async (url) => {
            calls.push(url);
            if (url.includes('/oauth/token'))
                return { ok: true, status: 200, json: async () => ({ access_token: 'ztok', expires_in: 3600 }), text: async () => '' };
            if (url.includes('/screen-share/start'))
                return { ok: true, status: 200, json: async () => ({ ok: true, streamUrl: 'http://da:5003/v1/screen-share/stream.m3u8' }), text: async () => '' };
            // Zoom status PUT
            return { ok: true, status: 204, json: async () => ({}), text: async () => '' };
        };
        const adapter = new ZoomJoinAdapter({ accountId: 'a', clientId: 'c', clientSecret: 's', fetchImpl });
        const result = await adapter.startScreenShare!(SESSION_HANDLE, DA_URL);

        assert.equal(result.ok, true);
        assert.ok(result.streamUrl?.includes('stream.m3u8'));
        assert.ok(calls.some((u) => u.includes('/screen-share/start')));
    });

    it('returns ok:true even when Zoom status PUT returns non-2xx (best-effort)', async () => {
        const fetchImpl: FetchLike = async (url) => {
            if (url.includes('/oauth/token'))
                return { ok: true, status: 200, json: async () => ({ access_token: 'ztok', expires_in: 3600 }), text: async () => '' };
            if (url.includes('/screen-share/start'))
                return { ok: true, status: 200, json: async () => ({ ok: true, streamUrl: 'http://da/stream.m3u8' }), text: async () => '' };
            // Zoom status endpoint fails — should not abort the screen share
            return { ok: false, status: 404, json: async () => ({}), text: async () => 'Not Found' };
        };
        const adapter = new ZoomJoinAdapter({ accountId: 'a', clientId: 'c', clientSecret: 's', fetchImpl });
        const result = await adapter.startScreenShare!(SESSION_HANDLE, DA_URL);

        assert.equal(result.ok, true, 'Zoom API failure should not abort screen share');
        assert.ok(result.streamUrl?.includes('stream.m3u8'));
    });

    it('returns ok:false when desktop-agent screen-share/start fails', async () => {
        const fetchImpl: FetchLike = async (url) => {
            if (url.includes('/screen-share/start'))
                return { ok: false, status: 409, json: async () => ({ ok: false, error: 'already active' }), text: async () => 'already active' };
            return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
        };
        const adapter = new ZoomJoinAdapter({ accountId: 'a', clientId: 'c', clientSecret: 's', fetchImpl });
        const result = await adapter.startScreenShare!(SESSION_HANDLE, DA_URL);

        assert.equal(result.ok, false);
        assert.ok(result.error?.includes('409'));
    });

    it('works with a plain meetingId string session handle (non-JSON)', async () => {
        const fetchImpl: FetchLike = async (url) => {
            if (url.includes('/screen-share/start'))
                return { ok: true, status: 200, json: async () => ({ ok: true, streamUrl: 'http://da/stream.m3u8' }), text: async () => '' };
            return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
        };
        const adapter = new ZoomJoinAdapter({ accountId: 'a', clientId: 'c', clientSecret: 's', fetchImpl });
        // Non-JSON handle should not throw — JSON.parse fails silently
        const result = await adapter.startScreenShare!('not-json-handle', DA_URL);

        assert.equal(result.ok, true);
    });

    it('returns ok:false when fetch throws', async () => {
        const fetchImpl: FetchLike = async () => { throw new Error('ECONNREFUSED'); };
        const adapter = new ZoomJoinAdapter({ accountId: 'a', clientId: 'c', clientSecret: 's', fetchImpl });
        const result = await adapter.startScreenShare!(SESSION_HANDLE, DA_URL);

        assert.equal(result.ok, false);
        assert.ok(result.error?.includes('ECONNREFUSED'));
    });
});

// ── stopScreenShare() ─────────────────────────────────────────────────────────

describe('ZoomJoinAdapter.stopScreenShare()', () => {
    const DA_URL = 'http://desktop-agent:5003';

    it('calls /screen-share/stop and returns ok:true on success', async () => {
        let stoppedUrl = '';
        const fetchImpl: FetchLike = async (url) => {
            stoppedUrl = url;
            return { ok: true, status: 200, json: async () => ({ ok: true }), text: async () => '' };
        };
        const adapter = new ZoomJoinAdapter({ accountId: 'a', clientId: 'c', clientSecret: 's', fetchImpl });
        const result = await adapter.stopScreenShare!('handle', DA_URL);

        assert.equal(result.ok, true);
        assert.ok(stoppedUrl.includes('/screen-share/stop'));
    });

    it('returns ok:false when desktop-agent returns non-2xx', async () => {
        const fetchImpl: FetchLike = async () => ({ ok: false, status: 500, json: async () => ({}), text: async () => '' });
        const adapter = new ZoomJoinAdapter({ accountId: 'a', clientId: 'c', clientSecret: 's', fetchImpl });
        const result = await adapter.stopScreenShare!('handle', DA_URL);

        assert.equal(result.ok, false);
        assert.ok(result.error?.includes('500'));
    });

    it('returns ok:false when fetch throws', async () => {
        const fetchImpl: FetchLike = async () => { throw new Error('network error'); };
        const adapter = new ZoomJoinAdapter({ accountId: 'a', clientId: 'c', clientSecret: 's', fetchImpl });
        const result = await adapter.stopScreenShare!('handle', DA_URL);

        assert.equal(result.ok, false);
        assert.ok(result.error?.includes('network error'));
    });
});

// ── join() via sidecar ────────────────────────────────────────────────────────

describe('ZoomJoinAdapter.join() — sidecar path', () => {
    const SIDECAR = 'http://zoom-video-sidecar:8091';

    it('calls sidecar /v1/sessions/join and returns sessionId as sessionHandle', async () => {
        let capturedUrl = '';
        let capturedBody: Record<string, unknown> = {};
        const fetchImpl: FetchLike = async (url, init) => {
            capturedUrl = url;
            capturedBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
            return { ok: true, status: 201, json: async () => ({ ok: true, sessionId: 'zoom-sess-1' }), text: async () => '' };
        };
        const adapter = new ZoomJoinAdapter({ accountId: 'a', clientId: 'c', clientSecret: 's', videoSidecarUrl: SIDECAR, fetchImpl });
        const result = await adapter.join('https://zoom.us/j/987654321?pwd=abc', 'TestBot');

        assert.equal(result.ok, true);
        assert.equal(result.joinMethod, 'zoom_sdk');
        assert.equal(result.sessionHandle, 'zoom-sess-1');
        assert.equal(capturedUrl, `${SIDECAR}/v1/sessions/join`);
        assert.equal(capturedBody['meetingUrl'], 'https://zoom.us/j/987654321?pwd=abc');
        assert.equal(capturedBody['displayName'], 'TestBot');
    });

    it('returns ok:false when sidecar returns non-2xx', async () => {
        const fetchImpl: FetchLike = async () => ({
            ok: false, status: 502, json: async () => ({}), text: async () => 'bad gateway',
        });
        const adapter = new ZoomJoinAdapter({ accountId: 'a', clientId: 'c', clientSecret: 's', videoSidecarUrl: SIDECAR, fetchImpl });
        const result = await adapter.join('https://zoom.us/j/1');

        assert.equal(result.ok, false);
        assert.ok(result.error?.includes('502'));
    });

    it('returns ok:false when sidecar responds ok:false', async () => {
        const fetchImpl: FetchLike = async () => ({
            ok: true, status: 200,
            json: async () => ({ ok: false, error: 'desktop-agent unreachable' }),
            text: async () => '',
        });
        const adapter = new ZoomJoinAdapter({ accountId: 'a', clientId: 'c', clientSecret: 's', videoSidecarUrl: SIDECAR, fetchImpl });
        const result = await adapter.join('https://zoom.us/j/1');

        assert.equal(result.ok, false);
        assert.ok(result.error?.includes('desktop-agent unreachable'));
    });

    it('falls back to REST join when videoSidecarUrl is not set', async () => {
        let calledUrl = '';
        const fetchImpl: FetchLike = async (url) => {
            calledUrl = url;
            if (url.includes('/oauth/token'))
                return { ok: true, status: 200, json: async () => ({ access_token: 'tok', expires_in: 3600 }), text: async () => '' };
            return { ok: true, status: 200, json: async () => ({ token: 'join-tok' }), text: async () => '' };
        };
        const adapter = new ZoomJoinAdapter({ accountId: 'a', clientId: 'c', clientSecret: 's', fetchImpl });
        const result = await adapter.join('https://zoom.us/j/123');

        assert.equal(result.ok, true);
        assert.ok(calledUrl.includes('zoom.us'), 'should use Zoom REST, not sidecar');
        assert.ok(!calledUrl.includes(SIDECAR));
    });
});

// ── startScreenShare() — sidecar path ─────────────────────────────────────────

describe('ZoomJoinAdapter.startScreenShare() — sidecar path', () => {
    const DA_URL  = 'http://desktop-agent:5003';
    const SIDECAR = 'http://zoom-video-sidecar:8091';

    it('starts FFmpeg then calls sidecar share/start', async () => {
        const calls: string[] = [];
        const fetchImpl: FetchLike = async (url) => {
            calls.push(url);
            if (url.includes('/screen-share/start'))
                return { ok: true, status: 200, json: async () => ({ ok: true, streamUrl: 'http://da/stream.m3u8' }), text: async () => '' };
            if (url.includes('/share/start'))
                return { ok: true, status: 200, json: async () => ({ ok: true }), text: async () => '' };
            return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
        };
        const adapter = new ZoomJoinAdapter({ accountId: 'a', clientId: 'c', clientSecret: 's', videoSidecarUrl: SIDECAR, fetchImpl });
        const result = await adapter.startScreenShare!('zoom-sess-1', DA_URL);

        assert.equal(result.ok, true);
        assert.ok(result.streamUrl?.includes('stream.m3u8'));
        assert.ok(calls.some(u => u.includes('/screen-share/start')), 'should start FFmpeg');
        assert.ok(calls.some(u => u.includes('/share/start')), 'should call sidecar share/start');
        // Should NOT call Zoom REST API when sidecar is configured
        assert.ok(!calls.some(u => u.includes('api.zoom.us')));
    });

    it('returns ok:false when sidecar share/start fails', async () => {
        const fetchImpl: FetchLike = async (url) => {
            if (url.includes('/screen-share/start'))
                return { ok: true, status: 200, json: async () => ({ ok: true, streamUrl: 'http://da/s.m3u8' }), text: async () => '' };
            if (url.includes('/share/start'))
                return { ok: false, status: 503, json: async () => ({}), text: async () => 'sidecar down' };
            return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
        };
        const adapter = new ZoomJoinAdapter({ accountId: 'a', clientId: 'c', clientSecret: 's', videoSidecarUrl: SIDECAR, fetchImpl });
        const result = await adapter.startScreenShare!('zoom-sess-1', DA_URL);

        assert.equal(result.ok, false);
        assert.ok(result.error?.includes('503'));
    });

    it('falls back to best-effort REST PUT when no sidecar configured', async () => {
        const calls: string[] = [];
        const fetchImpl: FetchLike = async (url) => {
            calls.push(url);
            if (url.includes('/screen-share/start'))
                return { ok: true, status: 200, json: async () => ({ ok: true, streamUrl: 'http://da/s.m3u8' }), text: async () => '' };
            if (url.includes('/oauth/token'))
                return { ok: true, status: 200, json: async () => ({ access_token: 'tok', expires_in: 3600 }), text: async () => '' };
            return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
        };
        // No videoSidecarUrl — should fall back to REST PUT
        const handle = JSON.stringify({ meetingId: '123', joinToken: 'jt' });
        const adapter = new ZoomJoinAdapter({ accountId: 'a', clientId: 'c', clientSecret: 's', fetchImpl });
        const result = await adapter.startScreenShare!(handle, DA_URL);

        assert.equal(result.ok, true);
        assert.ok(calls.some(u => u.includes('api.zoom.us')), 'should call Zoom REST');
        assert.ok(!calls.some(u => u.includes(SIDECAR)), 'should not call sidecar');
    });
});

// ── stopScreenShare() — sidecar path ──────────────────────────────────────────

describe('ZoomJoinAdapter.stopScreenShare() — sidecar path', () => {
    const DA_URL  = 'http://desktop-agent:5003';
    const SIDECAR = 'http://zoom-video-sidecar:8091';

    it('stops FFmpeg then notifies sidecar share/stop', async () => {
        const calls: string[] = [];
        const fetchImpl: FetchLike = async (url) => {
            calls.push(url);
            return { ok: true, status: 200, json: async () => ({ ok: true }), text: async () => '' };
        };
        const adapter = new ZoomJoinAdapter({ accountId: 'a', clientId: 'c', clientSecret: 's', videoSidecarUrl: SIDECAR, fetchImpl });
        const result = await adapter.stopScreenShare!('zoom-sess-1', DA_URL);

        assert.equal(result.ok, true);
        assert.ok(calls.some(u => u.includes('/screen-share/stop')));
        assert.ok(calls.some(u => u.includes('/share/stop')));
    });

    it('returns ok:true even when sidecar share/stop throws (non-fatal)', async () => {
        let stopCount = 0;
        const fetchImpl: FetchLike = async (url) => {
            if (url.includes('/screen-share/stop')) { stopCount++; return { ok: true, status: 200, json: async () => ({}), text: async () => '' }; }
            throw new Error('sidecar gone');
        };
        const adapter = new ZoomJoinAdapter({ accountId: 'a', clientId: 'c', clientSecret: 's', videoSidecarUrl: SIDECAR, fetchImpl });
        const result = await adapter.stopScreenShare!('zoom-sess-1', DA_URL);

        assert.equal(result.ok, true);
        assert.equal(stopCount, 1, 'desktop-agent stop should have been called');
    });
});
