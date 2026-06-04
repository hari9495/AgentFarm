import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BrowserJoinAdapter, type FetchLike } from './browser-join-adapter.js';

function makeFetch(responses: Array<{ ok: boolean; status: number; body: unknown }>): FetchLike {
    let i = 0;
    return async () => {
        const r = responses[i++] ?? { ok: true, status: 200, body: {} };
        return {
            ok: r.ok,
            status: r.status,
            json: async () => r.body,
            text: async () => JSON.stringify(r.body),
        };
    };
}

// ── Constructor ───────────────────────────────────────────────────────────────

describe('BrowserJoinAdapter — constructor', () => {
    it('throws when desktopAgentUrl is empty', () => {
        assert.throws(
            () => new BrowserJoinAdapter({ desktopAgentUrl: '' }),
            /desktopAgentUrl/u,
        );
    });

    it('constructs successfully with a valid URL', () => {
        assert.doesNotThrow(
            () => new BrowserJoinAdapter({ desktopAgentUrl: 'http://agent:5003' }),
        );
    });
});

// ── join() ────────────────────────────────────────────────────────────────────

describe('BrowserJoinAdapter.join()', () => {
    it('POSTs to /v1/meeting/join and returns ok:true with sessionHandle', async () => {
        const calls: Array<{ url: string; body: unknown }> = [];
        const fetchImpl: FetchLike = async (url, init) => {
            calls.push({ url, body: JSON.parse(init?.body ?? '{}') });
            return { ok: true, status: 200, json: async () => ({ pid: 4242 }), text: async () => '' };
        };

        const adapter = new BrowserJoinAdapter({
            desktopAgentUrl: 'http://agent:5003/',
            fetchImpl,
        });
        const result = await adapter.join('https://zoom.us/j/123', 'AgentFarm Bot');

        assert.equal(result.ok, true);
        assert.equal(result.joinMethod, 'browser');
        assert.equal(result.sessionHandle, '4242');
        assert.equal(calls.length, 1);
        assert.equal(calls[0]!.url, 'http://agent:5003/v1/meeting/join');
        assert.equal((calls[0]!.body as { url: string }).url, 'https://zoom.us/j/123');
        assert.equal((calls[0]!.body as { displayName: string }).displayName, 'AgentFarm Bot');
    });

    it('strips trailing slashes from the endpoint', async () => {
        const calls: string[] = [];
        const fetchImpl: FetchLike = async (url) => {
            calls.push(url);
            return { ok: true, status: 200, json: async () => ({ pid: 1 }), text: async () => '' };
        };
        const adapter = new BrowserJoinAdapter({ desktopAgentUrl: 'http://agent:5003///', fetchImpl });
        await adapter.join('https://zoom.us/j/1');
        assert.equal(calls[0], 'http://agent:5003/v1/meeting/join');
    });

    it('returns ok:false and error on non-2xx response', async () => {
        const adapter = new BrowserJoinAdapter({
            desktopAgentUrl: 'http://agent:5003',
            fetchImpl: makeFetch([{ ok: false, status: 502, body: 'gateway error' }]),
        });
        const result = await adapter.join('https://zoom.us/j/1');
        assert.equal(result.ok, false);
        assert.equal(result.joinMethod, 'browser');
        assert.ok(result.error?.includes('502'));
    });

    it('returns ok:false when fetch rejects (network error)', async () => {
        const fetchImpl: FetchLike = async () => { throw new Error('ECONNREFUSED'); };
        const adapter = new BrowserJoinAdapter({ desktopAgentUrl: 'http://agent:5003', fetchImpl });
        const result = await adapter.join('https://zoom.us/j/1');
        assert.equal(result.ok, false);
        assert.ok(result.error?.includes('ECONNREFUSED'));
    });

    it('sessionHandle is undefined when desktop-agent returns no pid', async () => {
        const adapter = new BrowserJoinAdapter({
            desktopAgentUrl: 'http://agent:5003',
            fetchImpl: makeFetch([{ ok: true, status: 200, body: {} }]),
        });
        const result = await adapter.join('https://zoom.us/j/1');
        assert.equal(result.ok, true);
        assert.equal(result.sessionHandle, undefined);
    });
});

// ── leave() ───────────────────────────────────────────────────────────────────

describe('BrowserJoinAdapter.leave()', () => {
    it('returns ok:true immediately when no sessionHandle', async () => {
        const adapter = new BrowserJoinAdapter({
            desktopAgentUrl: 'http://agent:5003',
            fetchImpl: async () => { throw new Error('should not be called'); },
        });
        const result = await adapter.leave(undefined);
        assert.equal(result.ok, true);
    });

    it('POSTs to /v1/meeting/leave with pid', async () => {
        const calls: Array<{ url: string; body: unknown }> = [];
        const fetchImpl: FetchLike = async (url, init) => {
            calls.push({ url, body: JSON.parse(init?.body ?? '{}') });
            return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
        };
        const adapter = new BrowserJoinAdapter({ desktopAgentUrl: 'http://agent:5003', fetchImpl });
        const result = await adapter.leave('4242');

        assert.equal(result.ok, true);
        assert.equal(calls[0]!.url, 'http://agent:5003/v1/meeting/leave');
        assert.equal((calls[0]!.body as { pid: number }).pid, 4242);
    });

    it('returns ok:false on non-2xx from leave endpoint', async () => {
        const adapter = new BrowserJoinAdapter({
            desktopAgentUrl: 'http://agent:5003',
            fetchImpl: makeFetch([{ ok: false, status: 500, body: {} }]),
        });
        const result = await adapter.leave('1');
        assert.equal(result.ok, false);
    });
});

// ── getCapabilities() ─────────────────────────────────────────────────────────

describe('BrowserJoinAdapter.getCapabilities()', () => {
    it('reports chat and screenShare as true, nativeAudioStream as false', () => {
        const adapter = new BrowserJoinAdapter({ desktopAgentUrl: 'http://agent:5003' });
        const caps = adapter.getCapabilities();
        assert.equal(caps.chat, true);
        assert.equal(caps.screenShare, true);
        assert.equal(caps.attendeeList, true);
        assert.equal(caps.nativeAudioStream, false);
    });
});

// ── startScreenShare() ────────────────────────────────────────────────────────

describe('BrowserJoinAdapter.startScreenShare()', () => {
    const DA_URL = 'http://agent:5003';

    /** Build an adapter that has already joined a Teams meeting (lastPlatform stored). */
    async function makeJoinedTeamsAdapter(fetchImpl: FetchLike): Promise<BrowserJoinAdapter> {
        const adapter = new BrowserJoinAdapter({ desktopAgentUrl: DA_URL, fetchImpl });
        await adapter.join('https://teams.microsoft.com/l/meetup-join/test', 'Bot');
        return adapter;
    }

    it('calls screen-share/start then screen-share/inject and returns ok:true with streamUrl', async () => {
        const calls: string[] = [];
        const fetchImpl: FetchLike = async (url) => {
            calls.push(url);
            if (url.includes('/v1/meeting/join'))
                return { ok: true, status: 202, json: async () => ({ pid: 1 }), text: async () => '' };
            if (url.includes('/screen-share/start'))
                return { ok: true, status: 200, json: async () => ({ ok: true, streamUrl: 'http://agent:5003/v1/screen-share/stream.m3u8' }), text: async () => '' };
            if (url.includes('/screen-share/inject'))
                return { ok: true, status: 200, json: async () => ({ ok: true }), text: async () => '' };
            return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
        };

        const adapter = await makeJoinedTeamsAdapter(fetchImpl);
        const result = await adapter.startScreenShare!('1', DA_URL);

        assert.equal(result.ok, true);
        assert.ok(result.streamUrl?.includes('stream.m3u8'));
        assert.ok(calls.some((u) => u.includes('/screen-share/start')));
        assert.ok(calls.some((u) => u.includes('/screen-share/inject')));
    });

    it('returns ok:false when screen-share/start fails', async () => {
        const fetchImpl: FetchLike = async (url) => {
            if (url.includes('/v1/meeting/join'))
                return { ok: true, status: 202, json: async () => ({ pid: 1 }), text: async () => '' };
            if (url.includes('/screen-share/start'))
                return { ok: false, status: 409, json: async () => ({ ok: false, error: 'already active' }), text: async () => 'already active' };
            return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
        };

        const adapter = await makeJoinedTeamsAdapter(fetchImpl);
        const result = await adapter.startScreenShare!('1', DA_URL);

        assert.equal(result.ok, false);
        assert.ok(result.error?.includes('409'));
    });

    it('returns ok:true with warning when inject fails (FFmpeg still running)', async () => {
        const fetchImpl: FetchLike = async (url) => {
            if (url.includes('/v1/meeting/join'))
                return { ok: true, status: 202, json: async () => ({ pid: 1 }), text: async () => '' };
            if (url.includes('/screen-share/start'))
                return { ok: true, status: 200, json: async () => ({ ok: true, streamUrl: 'http://agent/stream.m3u8' }), text: async () => '' };
            if (url.includes('/screen-share/inject'))
                return { ok: false, status: 404, json: async () => ({ ok: false, error: 'no chromium window' }), text: async () => 'no window' };
            return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
        };

        const adapter = await makeJoinedTeamsAdapter(fetchImpl);
        const result = await adapter.startScreenShare!('1', DA_URL);

        // FFmpeg started, inject failed non-fatally
        assert.equal(result.ok, true);
        assert.ok(result.streamUrl?.includes('stream.m3u8'));
        assert.ok(result.error?.toLowerCase().includes('inject'));
    });

    it('sends platform=teams when last joined URL was Teams', async () => {
        let injectBody: { platform?: string } = {};
        const fetchImpl: FetchLike = async (url, init) => {
            if (url.includes('/v1/meeting/join'))
                return { ok: true, status: 202, json: async () => ({ pid: 1 }), text: async () => '' };
            if (url.includes('/screen-share/start'))
                return { ok: true, status: 200, json: async () => ({ ok: true, streamUrl: 'http://a/s.m3u8' }), text: async () => '' };
            if (url.includes('/screen-share/inject')) {
                injectBody = JSON.parse(init?.body ?? '{}') as { platform?: string };
                return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
            }
            return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
        };

        const adapter = await makeJoinedTeamsAdapter(fetchImpl);
        await adapter.startScreenShare!('1', DA_URL);
        assert.equal(injectBody.platform, 'teams');
    });

    it('returns ok:false when fetch throws (network error)', async () => {
        const fetchImpl: FetchLike = async (url) => {
            if (url.includes('/v1/meeting/join'))
                return { ok: true, status: 202, json: async () => ({ pid: 1 }), text: async () => '' };
            throw new Error('ECONNREFUSED');
        };

        const adapter = await makeJoinedTeamsAdapter(fetchImpl);
        const result = await adapter.startScreenShare!('1', DA_URL);

        assert.equal(result.ok, false);
        assert.ok(result.error?.includes('ECONNREFUSED'));
    });
});

// ── stopScreenShare() ─────────────────────────────────────────────────────────

describe('BrowserJoinAdapter.stopScreenShare()', () => {
    const DA_URL = 'http://agent:5003';

    it('calls /screen-share/stop and returns ok:true', async () => {
        let stoppedUrl = '';
        const fetchImpl: FetchLike = async (url) => {
            stoppedUrl = url;
            return { ok: true, status: 200, json: async () => ({ ok: true }), text: async () => '' };
        };
        const adapter = new BrowserJoinAdapter({ desktopAgentUrl: DA_URL, fetchImpl });
        const result = await adapter.stopScreenShare!('handle', DA_URL);

        assert.equal(result.ok, true);
        assert.ok(stoppedUrl.includes('/screen-share/stop'));
    });

    it('returns ok:false when desktop-agent returns non-2xx', async () => {
        const fetchImpl: FetchLike = async () => ({ ok: false, status: 500, json: async () => ({}), text: async () => '' });
        const adapter = new BrowserJoinAdapter({ desktopAgentUrl: DA_URL, fetchImpl });
        const result = await adapter.stopScreenShare!('handle', DA_URL);

        assert.equal(result.ok, false);
        assert.ok(result.error?.includes('500'));
    });

    it('returns ok:false when fetch throws', async () => {
        const fetchImpl: FetchLike = async () => { throw new Error('network error'); };
        const adapter = new BrowserJoinAdapter({ desktopAgentUrl: DA_URL, fetchImpl });
        const result = await adapter.stopScreenShare!('handle', DA_URL);

        assert.equal(result.ok, false);
        assert.ok(result.error?.includes('network error'));
    });
});
