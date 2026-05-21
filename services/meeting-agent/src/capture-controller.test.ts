import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HttpCaptureController, type FetchLike } from './capture-controller.js';

describe('HttpCaptureController', () => {
    it('POSTs start with bearer and captures the returned capture_id', async () => {
        const calls: Array<{ url: string; init: { method?: string; headers?: Record<string, string>; body?: string } }> = [];
        const fetchImpl: FetchLike = async (url, init) => {
            calls.push({ url, init: init ?? {} });
            return {
                ok: true,
                status: 200,
                statusText: 'OK',
                json: async () => ({ capture_id: 'cap-42' }),
                text: async () => '',
            };
        };
        const ctl = new HttpCaptureController({
            endpoint: 'http://desktop-agent:7800/',
            authToken: 'sidecar-token',
            fetchImpl,
        });
        const result = await ctl.start({
            sessionId: 'sess-1',
            callbackUrl: 'http://meeting-agent:7799/v1/sessions/sess-1/transcript/inbound',
            callbackToken: 'inbound-token',
        });
        assert.deepEqual(result, { ok: true, captureId: 'cap-42' });
        assert.equal(calls.length, 1);
        assert.equal(calls[0]!.url, 'http://desktop-agent:7800/v1/capture/start');
        assert.equal(calls[0]!.init.method, 'POST');
        assert.equal(calls[0]!.init.headers!['Authorization'], 'Bearer sidecar-token');
        const body = JSON.parse(calls[0]!.init.body!);
        assert.equal(body.session_id, 'sess-1');
        assert.equal(
            body.callback_url,
            'http://meeting-agent:7799/v1/sessions/sess-1/transcript/inbound',
        );
        assert.equal(body.callback_token, 'inbound-token');
    });

    it('returns ok:false with an error message on non-2xx', async () => {
        const fetchImpl: FetchLike = async () => ({
            ok: false,
            status: 502,
            statusText: 'Bad Gateway',
            json: async () => ({}),
            text: async () => 'sidecar offline',
        });
        const ctl = new HttpCaptureController({ endpoint: 'http://desktop-agent:7800', fetchImpl });
        const result = await ctl.start({
            sessionId: 'sess-1',
            callbackUrl: 'http://meeting-agent:7799/v1/sessions/sess-1/transcript/inbound',
        });
        assert.equal(result.ok, false);
        assert.ok(result.error?.includes('sidecar_status_502'));
    });

    it('POSTs stop with the session id', async () => {
        const calls: Array<{ url: string; init: { body?: string } }> = [];
        const fetchImpl: FetchLike = async (url, init) => {
            calls.push({ url, init: init ?? {} });
            return {
                ok: true,
                status: 200,
                statusText: 'OK',
                json: async () => ({}),
                text: async () => '',
            };
        };
        const ctl = new HttpCaptureController({ endpoint: 'http://desktop-agent:7800', fetchImpl });
        const result = await ctl.stop({ sessionId: 'sess-1' });
        assert.equal(result.ok, true);
        assert.equal(calls[0]!.url, 'http://desktop-agent:7800/v1/capture/stop');
        const body = JSON.parse(calls[0]!.init.body!);
        assert.equal(body.session_id, 'sess-1');
    });
});
