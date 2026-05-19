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

// ---------------------------------------------------------------------------
// createVoiceProfile (multipart upload)
// ---------------------------------------------------------------------------

test('createVoiceProfile posts multipart form data and returns VoiceProfile', async (t) => {
    const expected = { id: 'vp-001', name: 'Alex', language: 'en' };
    const capturedRequests: { url: string; init?: RequestInit }[] = [];

    t.mock.method(globalThis, 'fetch', async (url: string, init?: RequestInit) => {
        capturedRequests.push({ url, init });
        return new Response(JSON.stringify(expected), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        });
    });

    const client = new VoiceboxClient();
    const fakeAudio = Buffer.from([0x00, 0x01, 0x02]);
    const profile = await client.createVoiceProfile(fakeAudio, 'Alex', 'en');

    assert.strictEqual(profile.id, 'vp-001');
    assert.strictEqual(profile.name, 'Alex');
    assert.strictEqual(profile.language, 'en');

    const req = capturedRequests[0];
    assert.ok(req?.url.endsWith('/v1/profiles'), `expected POST to /v1/profiles, got: ${req?.url}`);
    assert.strictEqual(req?.init?.method, 'POST');
});

test('createVoiceProfile throws on non-OK response', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => {
        return new Response(JSON.stringify({ error: 'bad request' }), {
            status: 400,
            headers: { 'content-type': 'application/json' },
        });
    });

    const client = new VoiceboxClient();
    await assert.rejects(
        () => client.createVoiceProfile(Buffer.from([]), 'Fail', 'en'),
        (err: Error) => {
            assert.ok(err.message.includes('400'), `expected 400 in error, got: ${err.message}`);
            return true;
        },
    );
});

// ---------------------------------------------------------------------------
// createVoiceProfileFromDescription (design mode)
// ---------------------------------------------------------------------------

test('createVoiceProfileFromDescription posts design-mode JSON and returns VoiceProfile', async (t) => {
    const expected = { id: 'vp-design-002', name: 'Morgan', language: 'en' };
    let capturedBody: unknown;

    t.mock.method(globalThis, 'fetch', async (_url: string, init?: RequestInit) => {
        capturedBody = init?.body ? JSON.parse(init.body as string) : undefined;
        return new Response(JSON.stringify(expected), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        });
    });

    const client = new VoiceboxClient();
    const profile = await client.createVoiceProfileFromDescription(
        'Morgan',
        'Warm and persuasive',
        'en',
    );

    assert.strictEqual(profile.id, 'vp-design-002');
    assert.strictEqual(profile.name, 'Morgan');
    assert.deepEqual((capturedBody as any)?.mode, 'design');
    assert.deepEqual((capturedBody as any)?.name, 'Morgan');
    assert.deepEqual((capturedBody as any)?.description, 'Warm and persuasive');
    assert.deepEqual((capturedBody as any)?.language, 'en');
});

test('createVoiceProfileFromDescription throws on non-OK response', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => {
        return new Response(JSON.stringify({ error: 'server error' }), {
            status: 500,
            headers: { 'content-type': 'application/json' },
        });
    });

    const client = new VoiceboxClient();
    await assert.rejects(
        () => client.createVoiceProfileFromDescription('Fail', 'desc', 'en'),
        (err: Error) => {
            assert.ok(err.message.includes('500'), `expected 500 in error, got: ${err.message}`);
            return true;
        },
    );
});

test('healthCheck returns false when fetch throws a network error', async (t) => {
    t.mock.method(globalThis, 'fetch', async (_url: string) => {
        throw new Error('ECONNREFUSED');
    });

    const client = new VoiceboxClient();
    const healthy = await client.healthCheck();

    assert.strictEqual(healthy, false);
});
