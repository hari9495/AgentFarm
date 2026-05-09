import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { VoxCPM2Client } from './voxcpm2-client.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fakeJsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    });
}

function fakeBinaryResponse(bytes: Buffer, status = 200): Response {
    // new Uint8Array(bytes) copies into a plain ArrayBuffer, satisfying Response BodyInit types
    return new Response(new Uint8Array(bytes).buffer, {
        status,
        headers: { 'content-type': 'audio/wav' },
    });
}

// Minimal 44-byte WAV header + silence (makes the buffer non-trivially sized)
function makeWavBytes(samples = 4): Buffer {
    const dataSize = samples * 2; // 16-bit PCM mono
    const buf = Buffer.alloc(44 + dataSize, 0);
    buf.write('RIFF', 0, 'ascii');
    buf.writeUInt32LE(36 + dataSize, 4);
    buf.write('WAVE', 8, 'ascii');
    buf.write('fmt ', 12, 'ascii');
    buf.writeUInt32LE(16, 16);
    buf.writeUInt16LE(1, 20);  // PCM
    buf.writeUInt16LE(1, 22);  // mono
    buf.writeUInt32LE(48000, 24);
    buf.writeUInt32LE(96000, 28);
    buf.writeUInt16LE(2, 32);
    buf.writeUInt16LE(16, 34);
    buf.write('data', 36, 'ascii');
    buf.writeUInt32LE(dataSize, 40);
    return buf;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VoxCPM2Client', () => {
    let client: VoxCPM2Client;

    before(() => {
        client = new VoxCPM2Client();
    });

    it('synthesize returns audio bytes as a Buffer', async (t) => {
        const fakeWav = makeWavBytes();
        t.mock.method(globalThis, 'fetch', async (_url: string, _opts: RequestInit) =>
            fakeBinaryResponse(fakeWav),
        );

        const result = await client.synthesize('Hello, world', 'en');

        assert.ok(result instanceof Buffer, 'result should be a Buffer');
        assert.deepEqual(result, fakeWav);
    });

    it('synthesize sends voice_id and sample_rate when provided', async (t) => {
        let capturedBody: string | null = null;
        t.mock.method(globalThis, 'fetch', async (_url: string, opts: RequestInit) => {
            capturedBody = opts.body as string;
            return fakeBinaryResponse(makeWavBytes());
        });

        await client.synthesize('Test', 'ja', { voiceId: 'ja-jp-1', sampleRate: 22050 });

        assert.ok(capturedBody !== null);
        const parsed = JSON.parse(capturedBody) as Record<string, unknown>;
        assert.equal(parsed['voice_id'], 'ja-jp-1');
        assert.equal(parsed['sample_rate'], 22050);
    });

    it('passes language code to synthesize endpoint', async (t) => {
        let capturedBody: string | null = null;
        t.mock.method(globalThis, 'fetch', async (_url: string, opts: RequestInit) => {
            capturedBody = opts.body as string;
            return fakeBinaryResponse(makeWavBytes());
        });

        await client.synthesize('こんにちは', 'ja');

        assert.ok(capturedBody !== null);
        const parsed = JSON.parse(capturedBody) as Record<string, unknown>;
        assert.equal(parsed['language'], 'ja');
    });

    it('defaults language to en when not provided', async (t) => {
        let capturedBody: string | null = null;
        t.mock.method(globalThis, 'fetch', async (_url: string, opts: RequestInit) => {
            capturedBody = opts.body as string;
            return fakeBinaryResponse(makeWavBytes());
        });

        await client.synthesize('Hello');

        assert.ok(capturedBody !== null);
        const parsed = JSON.parse(capturedBody) as Record<string, unknown>;
        assert.equal(parsed['language'], 'en');
    });

    it('cloneVoice returns string voice_id from the service', async (t) => {
        const fakeId = '550e8400-e29b-41d4-a716-446655440000';
        t.mock.method(globalThis, 'fetch', async (_url: string, _opts: RequestInit) =>
            fakeJsonResponse({ voice_id: fakeId, name: 'TestVoice', language: 'en' }),
        );

        const audioSample = Buffer.from('fake-audio-bytes');
        const result = await client.cloneVoice(audioSample, 'TestVoice', 'en');

        assert.equal(typeof result, 'string');
        assert.equal(result, fakeId);
    });

    it('listVoices returns an array of voice objects', async (t) => {
        const stubVoices = [
            { id: 'en-us-1', name: 'Alex', language: 'en' },
            { id: 'ja-jp-1', name: 'Hana', language: 'ja' },
            { id: 'ko-kr-1', name: 'Minjun', language: 'ko' },
        ];
        t.mock.method(globalThis, 'fetch', async (_url: string, _opts: RequestInit) =>
            fakeJsonResponse(stubVoices),
        );

        const result = await client.listVoices();

        assert.equal(result.length, 3);
        assert.equal(result[0]?.id, 'en-us-1');
        assert.equal(result[1]?.language, 'ja');
        assert.equal(result[2]?.name, 'Minjun');
    });

    it('healthCheck returns true when the service responds with 200', async (t) => {
        t.mock.method(globalThis, 'fetch', async (_url: string, _opts: RequestInit) =>
            new Response('{"status":"ok"}', { status: 200 }),
        );

        const result = await client.healthCheck();
        assert.equal(result, true);
    });

    it('healthCheck returns false when the service responds with non-200', async (t) => {
        t.mock.method(globalThis, 'fetch', async (_url: string, _opts: RequestInit) =>
            new Response('Service Unavailable', { status: 503 }),
        );

        const result = await client.healthCheck();
        assert.equal(result, false);
    });

    it('healthCheck returns false when fetch throws a network error', async (t) => {
        t.mock.method(globalThis, 'fetch', async (_url: string, _opts: RequestInit) => {
            throw new Error('ECONNREFUSED');
        });

        const result = await client.healthCheck();
        assert.equal(result, false);
    });
});
