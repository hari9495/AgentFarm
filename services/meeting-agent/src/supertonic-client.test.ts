import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SupertonicClient, type FetchLike } from './supertonic-client.js';

function fakeFetch(opts: {
    status?: number;
    statusText?: string;
    body?: ArrayBuffer | string;
    capture?: { url?: string; init?: { method?: string; headers?: Record<string, string>; body?: string } };
}): FetchLike {
    return async (url, init) => {
        if (opts.capture) {
            opts.capture.url = url;
            opts.capture.init = init;
        }
        const status = opts.status ?? 200;
        const ok = status >= 200 && status < 300;
        const buf = opts.body instanceof ArrayBuffer
            ? opts.body
            : new TextEncoder().encode(typeof opts.body === 'string' ? opts.body : 'audio').buffer;
        return {
            ok,
            status,
            statusText: opts.statusText ?? (ok ? 'OK' : 'Error'),
            arrayBuffer: async () => buf as ArrayBuffer,
            text: async () => (typeof opts.body === 'string' ? opts.body : ''),
        };
    };
}

describe('SupertonicClient.constructor', () => {
    it('throws when endpoint is missing', () => {
        assert.throws(
            () => new SupertonicClient({ endpoint: '' }),
            /endpoint is required/u,
        );
    });

    it('strips trailing slashes from the endpoint', async () => {
        const capture: { url?: string } = {};
        const client = new SupertonicClient({
            endpoint: 'http://supertonic:8000///',
            fetchImpl: fakeFetch({ capture }),
        });
        await client.synthesize('hi');
        assert.equal(capture.url, 'http://supertonic:8000/v1/audio/speech');
    });
});

describe('SupertonicClient.synthesize', () => {
    it('rejects empty text', async () => {
        const client = new SupertonicClient({ endpoint: 'http://x', fetchImpl: fakeFetch({}) });
        await assert.rejects(() => client.synthesize('   '), /text is required/u);
    });

    it('returns audio bytes and elapsed time', async () => {
        const audio = new TextEncoder().encode('FAKEAUDIO').buffer;
        const client = new SupertonicClient({
            endpoint: 'http://supertonic:8000',
            fetchImpl: fakeFetch({ body: audio }),
        });
        const result = await client.synthesize('hello world');
        assert.equal(result.audio.byteLength, audio.byteLength);
        assert.equal(typeof result.durationMs, 'number');
    });

    it('sends model + voice + auth header', async () => {
        const capture: { url?: string; init?: { method?: string; headers?: Record<string, string>; body?: string } } = {};
        const client = new SupertonicClient({
            endpoint: 'http://supertonic:8000',
            apiKey: 'sk-test',
            model: 'supertonic-en',
            fetchImpl: fakeFetch({ capture }),
        });
        await client.synthesize('howdy', { voice: 'emma' });
        assert.equal(capture.init?.method, 'POST');
        assert.equal(capture.init?.headers?.['Authorization'], 'Bearer sk-test');
        const body = JSON.parse(capture.init!.body!);
        assert.equal(body.model, 'supertonic-en');
        assert.equal(body.input, 'howdy');
        assert.equal(body.voice, 'emma');
        assert.equal(body.response_format, 'mp3');
    });

    it('throws on non-2xx with detail in message', async () => {
        const client = new SupertonicClient({
            endpoint: 'http://supertonic:8000',
            fetchImpl: fakeFetch({ status: 503, statusText: 'Unavailable', body: 'overloaded' }),
        });
        await assert.rejects(() => client.synthesize('x'), /503 Unavailable.*overloaded/u);
    });
});
