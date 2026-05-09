import test from 'node:test';
import assert from 'node:assert/strict';
import { VoiceboxClient } from './voicebox-client.js';

// ---------------------------------------------------------------------------
// transcribeAudio
// ---------------------------------------------------------------------------

test('transcribeAudio returns parsed TranscribeResult from the Voicebox service', async (t) => {
    const expected = { text: 'Hello world', language: 'en', confidence: 0.97 };

    t.mock.method(globalThis, 'fetch', async (_url: string) => {
        return new Response(JSON.stringify(expected), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        });
    });

    const client = new VoiceboxClient();
    const result = await client.transcribeAudio(Buffer.from('fake-audio'), 'audio/wav');

    assert.strictEqual(result.text, 'Hello world');
    assert.strictEqual(result.language, 'en');
    assert.strictEqual(result.confidence, 0.97);
});

// ---------------------------------------------------------------------------
// synthesizeSpeech
// ---------------------------------------------------------------------------

test('synthesizeSpeech returns audio bytes as a Buffer', async (t) => {
    const fakeAudio = Buffer.from([0x52, 0x49, 0x46, 0x46]); // fake RIFF header

    t.mock.method(globalThis, 'fetch', async (_url: string) => {
        return new Response(fakeAudio, {
            status: 200,
            headers: { 'content-type': 'audio/wav' },
        });
    });

    const client = new VoiceboxClient();
    const result = await client.synthesizeSpeech('こんにちは', 'ja', 'voice-ja-001');

    assert.ok(result instanceof Buffer, 'result should be a Buffer');
    assert.deepEqual(result, fakeAudio);
});

// ---------------------------------------------------------------------------
// listVoices
// ---------------------------------------------------------------------------

test('listVoices passes language query param and returns voice list', async (t) => {
    const voices = [
        { id: 'v-ja-001', name: 'Hana', language: 'ja' },
        { id: 'v-ja-002', name: 'Kenji', language: 'ja' },
    ];

    const capturedUrls: string[] = [];
    t.mock.method(globalThis, 'fetch', async (url: string) => {
        capturedUrls.push(url);
        return new Response(JSON.stringify(voices), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        });
    });

    const client = new VoiceboxClient();
    const result = await client.listVoices('ja');

    assert.ok(capturedUrls[0]?.includes('language=ja'), `expected URL to include language=ja, got: ${capturedUrls[0]}`);
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0]?.id, 'v-ja-001');
    assert.strictEqual(result[1]?.name, 'Kenji');
});

// ---------------------------------------------------------------------------
// healthCheck
// ---------------------------------------------------------------------------

test('healthCheck returns true when Voicebox responds with 200', async (t) => {
    t.mock.method(globalThis, 'fetch', async (_url: string) => {
        return new Response(null, { status: 200 });
    });

    const client = new VoiceboxClient();
    const healthy = await client.healthCheck();

    assert.strictEqual(healthy, true);
});

test('healthCheck returns false when Voicebox responds with non-200', async (t) => {
    t.mock.method(globalThis, 'fetch', async (_url: string) => {
        return new Response(null, { status: 503 });
    });

    const client = new VoiceboxClient();
    const healthy = await client.healthCheck();

    assert.strictEqual(healthy, false);
});

test('healthCheck returns false when fetch throws a network error', async (t) => {
    t.mock.method(globalThis, 'fetch', async (_url: string) => {
        throw new Error('ECONNREFUSED');
    });

    const client = new VoiceboxClient();
    const healthy = await client.healthCheck();

    assert.strictEqual(healthy, false);
});
