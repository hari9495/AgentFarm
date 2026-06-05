import test from 'node:test';
import assert from 'node:assert/strict';
import { SarvamRealtimeTtsClient, type FetchLike } from './sarvam-realtime-tts.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStreamingFetch(chunks: Uint8Array[]): FetchLike {
    return async () => {
        let index = 0;
        const body: ReadableStream<Uint8Array> = new ReadableStream({
            pull(controller) {
                if (index < chunks.length) {
                    controller.enqueue(chunks[index++]!);
                } else {
                    controller.close();
                }
            },
        });
        return {
            ok: true,
            status: 200,
            statusText: 'OK',
            body,
            text: async () => '',
        };
    };
}

function makeErrorFetch(status: number, body: string): FetchLike {
    return async () => ({
        ok: false,
        status,
        statusText: 'Error',
        body: null,
        text: async () => body,
    });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('SarvamRealtimeTtsClient — constructor requires apiKey', () => {
    assert.throws(
        () => new SarvamRealtimeTtsClient({ apiKey: '' }),
        /apiKey is required/,
    );
});

test('SarvamRealtimeTtsClient — synthesizeStream yields chunks', async () => {
    const mockChunks = [
        new Uint8Array([0x01, 0x02]),
        new Uint8Array([0x03, 0x04]),
        new Uint8Array([0x05]),
    ];
    const client = new SarvamRealtimeTtsClient({
        apiKey: 'key',
        fetch: makeStreamingFetch(mockChunks),
    });

    const yielded: ArrayBuffer[] = [];
    for await (const chunk of client.synthesizeStream('Hello', 'en-IN')) {
        yielded.push(chunk);
    }

    assert.equal(yielded.length, 3);
    assert.equal(new Uint8Array(yielded[0]!)[0], 0x01);
    assert.equal(new Uint8Array(yielded[1]!)[0], 0x03);
    assert.equal(new Uint8Array(yielded[2]!)[0], 0x05);
});

test('SarvamRealtimeTtsClient — synthesizeStream uses correct speaker for language', async () => {
    let capturedBody = '';
    const mockFetch: FetchLike = async (_url, init) => {
        capturedBody = init?.body as string;
        const chunk = new Uint8Array([0x00]);
        const body = new ReadableStream<Uint8Array>({
            start(c) { c.enqueue(chunk); c.close(); },
        });
        return { ok: true, status: 200, statusText: 'OK', body, text: async () => '' };
    };
    const client = new SarvamRealtimeTtsClient({ apiKey: 'key', fetch: mockFetch });
    // consume the stream
    for await (const _ of client.synthesizeStream('test', 'ta-IN')) { /* drain */ }

    const parsed = JSON.parse(capturedBody) as { speaker?: string; target_language_code?: string };
    assert.equal(parsed.speaker, 'pavithra', 'Tamil should use pavithra speaker');
    assert.equal(parsed.target_language_code, 'ta-IN');
});

test('SarvamRealtimeTtsClient — falls back to meera for unknown language', async () => {
    let capturedBody = '';
    const mockFetch: FetchLike = async (_url, init) => {
        capturedBody = init?.body as string;
        const body = new ReadableStream<Uint8Array>({ start(c) { c.close(); } });
        return { ok: true, status: 200, statusText: 'OK', body, text: async () => '' };
    };
    const client = new SarvamRealtimeTtsClient({ apiKey: 'key', fetch: mockFetch });
    for await (const _ of client.synthesizeStream('test', 'xx-XX')) { /* drain */ }

    const parsed = JSON.parse(capturedBody) as { speaker?: string };
    assert.equal(parsed.speaker, 'meera');
});

test('SarvamRealtimeTtsClient — throws on non-OK response', async () => {
    const client = new SarvamRealtimeTtsClient({
        apiKey: 'key',
        fetch: makeErrorFetch(429, 'rate limited'),
    });

    await assert.rejects(
        async () => { for await (const _ of client.synthesizeStream('hi', 'hi-IN')) {} },
        /429/,
    );
});

test('SarvamRealtimeTtsClient — throws on empty text', async () => {
    const client = new SarvamRealtimeTtsClient({
        apiKey: 'key',
        fetch: makeStreamingFetch([]),
    });

    await assert.rejects(
        async () => { for await (const _ of client.synthesizeStream('  ', 'hi-IN')) {} },
        /text is required/,
    );
});

test('SarvamRealtimeTtsClient — passes api-subscription-key header', async () => {
    let capturedHeaders: Record<string, string> = {};
    const mockFetch: FetchLike = async (_url, init) => {
        capturedHeaders = (init?.headers ?? {}) as Record<string, string>;
        const body = new ReadableStream<Uint8Array>({ start(c) { c.close(); } });
        return { ok: true, status: 200, statusText: 'OK', body, text: async () => '' };
    };
    const client = new SarvamRealtimeTtsClient({ apiKey: 'my-secret', fetch: mockFetch });
    for await (const _ of client.synthesizeStream('test', 'hi-IN')) {}

    assert.equal(capturedHeaders['api-subscription-key'], 'my-secret');
});
