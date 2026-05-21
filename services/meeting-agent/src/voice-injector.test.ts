import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HttpVoiceInjector } from './voice-injector.js';

describe('HttpVoiceInjector', () => {
    it('POSTs raw audio to /v1/inject with the correct headers', async () => {
        const captured: { url?: string; init?: { method?: string; headers?: Record<string, string>; body?: unknown } } = {};
        const injector = new HttpVoiceInjector({
            endpoint: 'http://desktop-agent:7800/',
            authToken: 'pipecat-token',
            fetchImpl: async (url, init) => {
                captured.url = url;
                captured.init = init;
                return {
                    ok: true,
                    status: 200,
                    statusText: 'OK',
                    json: async () => ({ bytes_played: 16000, sink: 'AgentMic' }),
                    text: async () => '',
                };
            },
        });

        const audio = new Uint8Array([1, 2, 3, 4, 5]);
        const result = await injector.inject({
            audio,
            contentType: 'audio/mpeg',
            sessionId: 'sess-123',
            sink: 'CustomSink',
        });

        assert.deepEqual(result, { ok: true, bytesPlayed: 16000, sink: 'AgentMic' });
        assert.equal(captured.url, 'http://desktop-agent:7800/v1/inject');
        assert.equal(captured.init?.method, 'POST');
        const headers = captured.init?.headers ?? {};
        assert.equal(headers['Content-Type'], 'audio/mpeg');
        assert.equal(headers['X-Session-Id'], 'sess-123');
        assert.equal(headers['X-Pulse-Sink'], 'CustomSink');
        assert.equal(headers['Authorization'], 'Bearer pipecat-token');
        assert.equal(captured.init?.body, audio);
    });

    it('reports sidecar non-2xx as ok=false with the response detail', async () => {
        const injector = new HttpVoiceInjector({
            endpoint: 'http://desktop-agent:7800',
            fetchImpl: async () => ({
                ok: false,
                status: 503,
                statusText: 'Service Unavailable',
                json: async () => ({}),
                text: async () => 'pulse_audio_not_running',
            }),
        });

        const result = await injector.inject({
            audio: new Uint8Array([0]),
            contentType: 'audio/wav',
            sessionId: 's',
        });

        assert.equal(result.ok, false);
        assert.match(result.error ?? '', /sidecar_status_503/);
        assert.match(result.error ?? '', /pulse_audio_not_running/);
    });

    it('converts ArrayBuffer audio to Uint8Array before sending', async () => {
        let bodyType = '';
        const injector = new HttpVoiceInjector({
            endpoint: 'http://desktop-agent:7800',
            fetchImpl: async (_url, init) => {
                bodyType = init?.body instanceof Uint8Array ? 'uint8array' : typeof init?.body;
                return {
                    ok: true,
                    status: 200,
                    statusText: 'OK',
                    json: async () => ({}),
                    text: async () => '',
                };
            },
        });
        const audio = new TextEncoder().encode('hello').buffer;
        const result = await injector.inject({
            audio,
            contentType: 'audio/mpeg',
            sessionId: 's',
        });
        assert.equal(result.ok, true);
        assert.equal(bodyType, 'uint8array');
    });

    it('omits Authorization when no token is configured', async () => {
        let authHeader: string | undefined;
        const injector = new HttpVoiceInjector({
            endpoint: 'http://desktop-agent:7800',
            fetchImpl: async (_url, init) => {
                authHeader = init?.headers?.['Authorization'];
                return {
                    ok: true,
                    status: 200,
                    statusText: 'OK',
                    json: async () => ({}),
                    text: async () => '',
                };
            },
        });
        await injector.inject({
            audio: new Uint8Array([0]),
            contentType: 'audio/mpeg',
            sessionId: 's',
        });
        assert.equal(authHeader, undefined);
    });
});
