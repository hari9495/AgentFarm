import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    cloneAgentVoice,
    speakResponse,
    listenAndRespond,
    runSpeakingAgentLoop,
} from './speaking-agent.js';

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
    return new Response(new Uint8Array(bytes).buffer, {
        status,
        headers: { 'content-type': 'audio/wav' },
    });
}

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

describe('speaking-agent', () => {
    // -----------------------------------------------------------------------
    // cloneAgentVoice
    // -----------------------------------------------------------------------

    it('cloneAgentVoice returns a voiceId string', async (t) => {
        // Both calls (clone-voice + PATCH session) return the same fake JSON;
        // cloneVoice reads voice_id from the first call.
        t.mock.method(globalThis, 'fetch', async () =>
            fakeJsonResponse({ voice_id: 'clone-abc', name: 'agent-sess-1', language: 'en' }),
        );

        const result = await cloneAgentVoice('sess-1', Buffer.from('fake-audio'));

        assert.equal(typeof result, 'string');
        assert.equal(result, 'clone-abc');
    });

    it('cloneAgentVoice patches the meeting session with the voiceId', async (t) => {
        const calls: Array<{ url: string; method: string; body: string }> = [];

        t.mock.method(globalThis, 'fetch', async (url: string, opts: RequestInit) => {
            calls.push({
                url: String(url),
                method: opts.method ?? 'GET',
                body: (opts.body as string) ?? '',
            });
            return fakeJsonResponse({ voice_id: 'patch-xyz', name: 'agent-sess-patch', language: 'en' });
        });

        await cloneAgentVoice('sess-patch', Buffer.from('audio-bytes'));

        assert.equal(calls.length, 2, 'expected 2 fetch calls (clone + patch)');

        const patchCall = calls[1]!;
        assert.equal(patchCall.method, 'PATCH');
        assert.ok(patchCall.url.includes('sess-patch'), 'PATCH URL should contain sessionId');

        const body = JSON.parse(patchCall.body) as Record<string, unknown>;
        assert.equal(body['agentVoiceId'], 'patch-xyz');
    });

    // -----------------------------------------------------------------------
    // speakResponse
    // -----------------------------------------------------------------------

    it('speakResponse returns a Buffer', async (t) => {
        const fakeWav = makeWavBytes();
        t.mock.method(globalThis, 'fetch', async () => fakeBinaryResponse(fakeWav));

        const result = await speakResponse('Hello there', 'voice-123', 'en');

        assert.ok(result instanceof Buffer, 'result should be a Buffer');
        assert.deepEqual(result, fakeWav);
    });

    it('speakResponse passes language to synthesize endpoint', async (t) => {
        let capturedBody: string | null = null;
        t.mock.method(globalThis, 'fetch', async (_url: string, opts: RequestInit) => {
            capturedBody = opts.body as string;
            return fakeBinaryResponse(makeWavBytes());
        });

        await speakResponse('こんにちは', 'voice-ja', 'ja');

        assert.ok(capturedBody !== null, 'fetch body should be captured');
        const parsed = JSON.parse(capturedBody) as Record<string, unknown>;
        assert.equal(parsed['language'], 'ja');
    });

    // -----------------------------------------------------------------------
    // listenAndRespond
    // -----------------------------------------------------------------------

    it('listenAndRespond returns a Buffer', async (t) => {
        const fakeWav = makeWavBytes();

        // Sequential responses for each fetch call in order:
        // 1. GET /v1/meetings/:sessionId  (session with voiceId)
        // 2. POST /v1/transcribe          (VoiceboxClient multipart → TranscribeResult)
        // 3. POST anthropic.com           (Anthropic → content block)
        // 4. POST /v1/synthesize          (VoxCPM2 → WAV bytes)
        const responses = [
            fakeJsonResponse({ agentVoiceId: 'voice-loop', speakingEnabled: true }),
            fakeJsonResponse({ text: 'test input text', language: 'en', confidence: 0.95 }),
            fakeJsonResponse({ content: [{ type: 'text', text: 'Agent reply here.' }] }),
            fakeBinaryResponse(fakeWav),
        ];
        let callIdx = 0;
        t.mock.method(globalThis, 'fetch', async () => responses[callIdx++]!);

        const result = await listenAndRespond('sess-listen', Buffer.from('audio'), 'en');

        assert.ok(result instanceof Buffer, 'result should be a Buffer');
        assert.deepEqual(result, fakeWav);
    });

    // -----------------------------------------------------------------------
    // runSpeakingAgentLoop
    // -----------------------------------------------------------------------

    it('runSpeakingAgentLoop returns early if speakingEnabled is false', async (t) => {
        let fetchCallCount = 0;
        t.mock.method(globalThis, 'fetch', async () => {
            fetchCallCount++;
            return fakeJsonResponse({ agentVoiceId: null, speakingEnabled: false });
        });

        await runSpeakingAgentLoop('sess-disabled', 'en');

        // Only the one GET to check speakingEnabled should have been made
        assert.equal(fetchCallCount, 1, 'should only fetch the session once before returning early');
    });
});
