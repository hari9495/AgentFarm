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
