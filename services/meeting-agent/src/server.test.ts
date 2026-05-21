import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { AddressInfo } from 'node:net';
import { createMeetingAgentServer, type MeetingAgentApp } from './server.js';
import { SupertonicClient } from './supertonic-client.js';
import type { VoiceInjectInput, VoiceInjectResult, VoiceInjector } from './voice-injector.js';
import type {
    CaptureController,
    CaptureStartInput,
    CaptureStopInput,
    CaptureResult,
} from './capture-controller.js';

let app: MeetingAgentApp | undefined;
let baseUrl = '';

beforeEach(async () => {
    app = createMeetingAgentServer({
        // Inject a fake TTS so /say doesn't fan out to the network.
        tts: new SupertonicClient({
            endpoint: 'http://fake-tts:8000',
            fetchImpl: async () => ({
                ok: true,
                status: 200,
                statusText: 'OK',
                arrayBuffer: async () => new TextEncoder().encode('AUDIO').buffer,
                text: async () => '',
            }),
        }),
    });
    await app.listen(0);
    const addr = app.server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterEach(async () => {
    if (app) {
        await app.close();
        app = undefined;
    }
});

async function call(path: string, method = 'GET', body?: unknown): Promise<{ status: number; json: any }> {
    const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await response.json()) as any;
    return { status: response.status, json };
}

describe('GET /health', () => {
    it('returns ok and zero sessions on a fresh instance', async () => {
        const r = await call('/health');
        assert.equal(r.status, 200);
        assert.equal(r.json.ok, true);
        assert.equal(r.json.sessions, 0);
    });
});

describe('POST /v1/sessions', () => {
    it('rejects missing fields', async () => {
        const r = await call('/v1/sessions', 'POST', { tenantId: 't1' });
        assert.equal(r.status, 400);
        assert.equal(r.json.error, 'invalid_request');
        assert.ok(Array.isArray(r.json.details));
    });

    it('creates a session and returns the record', async () => {
        const r = await call('/v1/sessions', 'POST', {
            tenantId: 't1', workspaceId: 'ws1', botId: 'b1',
            platform: 'teams', mode: 'standup', meetingId: 'm1',
        });
        assert.equal(r.status, 201);
        assert.equal(r.json.session.status, 'scheduled');
        assert.equal(r.json.session.disclosureAnnounced, false);
        assert.ok(r.json.session.id);
    });
});

describe('session lifecycle (start / say / transcript / stop)', () => {
    it('drives a full happy path through the FSM', async () => {
        const create = await call('/v1/sessions', 'POST', {
            tenantId: 't1', workspaceId: 'ws1', botId: 'b1',
            platform: 'zoom', mode: 'interactive_qa', meetingId: 'm1',
        });
        const id = create.json.session.id as string;

        const start = await call(`/v1/sessions/${id}/start`, 'POST');
        assert.equal(start.status, 200);
        assert.equal(start.json.session.status, 'listening');

        // Auto-disclosure: the first /say automatically prepends the disclosure
        // phrase and marks disclosureAnnounced=true — no 409, no caller flag needed.
        const sayFirst = await call(`/v1/sessions/${id}/say`, 'POST', { text: 'hello team' });
        assert.equal(sayFirst.status, 200);
        assert.equal(sayFirst.json.session.status, 'listening');
        assert.equal(sayFirst.json.session.disclosureAnnounced, true);

        // Subsequent /say calls work without any disclosure flag (already announced).
        const sayOk = await call(`/v1/sessions/${id}/say`, 'POST', {
            text: 'I am an AI assistant; I will be transcribing this call.',
        });
        assert.equal(sayOk.status, 200);
        assert.equal(sayOk.json.session.status, 'listening');
        assert.equal(sayOk.json.audioBytes, 5);

        const transcript = await call(`/v1/sessions/${id}/transcript`);
        assert.equal(transcript.status, 200);
        assert.ok(transcript.json.transcript.some((entry: { source: string }) => entry.source === 'agent'));

        const stop = await call(`/v1/sessions/${id}/stop`, 'POST');
        assert.equal(stop.status, 200);
        assert.equal(stop.json.session.status, 'completed');
    });

    it('returns 404 for unknown session ids', async () => {
        const r = await call('/v1/sessions/does-not-exist', 'GET');
        assert.equal(r.status, 404);
    });
});

describe('auth token', () => {
    it('rejects requests without bearer when token is configured', async () => {
        // Spin up an authenticated server alongside the default.
        const secured = createMeetingAgentServer({ authToken: 'secret-token' });
        await secured.listen(0);
        try {
            const addr = secured.server.address() as AddressInfo;
            const r = await fetch(`http://127.0.0.1:${addr.port}/v1/sessions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: '{}',
            });
            assert.equal(r.status, 401);

            const ok = await fetch(`http://127.0.0.1:${addr.port}/health`, {
                headers: { Authorization: 'Bearer secret-token' },
            });
            assert.equal(ok.status, 200);
        } finally {
            await secured.close();
        }
    });
});

describe('voice injector fan-out (/say → desktop-agent sidecar)', () => {
    it('forwards synthesised audio to the injector and surfaces the result', async () => {
        const calls: VoiceInjectInput[] = [];
        const injector: VoiceInjector = {
            async inject(input: VoiceInjectInput): Promise<VoiceInjectResult> {
                calls.push(input);
                return { ok: true, bytesPlayed: 4242, sink: 'AgentMic' };
            },
        };

        const isolated = createMeetingAgentServer({
            tts: new SupertonicClient({
                endpoint: 'http://fake-tts:8000',
                fetchImpl: async () => ({
                    ok: true,
                    status: 200,
                    statusText: 'OK',
                    arrayBuffer: async () => new TextEncoder().encode('AUDIO').buffer,
                    text: async () => '',
                }),
            }),
            voiceInjector: injector,
        });
        await isolated.listen(0);
        try {
            const addr = isolated.server.address() as AddressInfo;
            const url = `http://127.0.0.1:${addr.port}`;
            const created = await fetch(`${url}/v1/sessions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tenantId: 't1', workspaceId: 'ws1', botId: 'b1',
                    platform: 'meet', mode: 'standup', meetingId: 'm1',
                }),
            });
            const session = (await created.json() as { session: { id: string } }).session;

            await fetch(`${url}/v1/sessions/${session.id}/start`, { method: 'POST' });

            const sayResp = await fetch(`${url}/v1/sessions/${session.id}/say`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: 'AI disclosure complete.',
                    disclosureAnnounced: true,
                    sink: 'CustomSink',
                }),
            });
            const sayBody = await sayResp.json() as {
                audioBytes: number;
                injection: { ok: boolean; bytesPlayed?: number; sink?: string };
            };
            assert.equal(sayResp.status, 200);
            assert.equal(sayBody.audioBytes, 5);
            assert.deepEqual(sayBody.injection, { ok: true, bytesPlayed: 4242, sink: 'AgentMic' });

            assert.equal(calls.length, 1);
            assert.equal(calls[0]!.sessionId, session.id);
            assert.equal(calls[0]!.sink, 'CustomSink');
            assert.equal((calls[0]!.audio as ArrayBuffer).byteLength, 5);
        } finally {
            await isolated.close();
        }
    });

    it('records injection failure but still completes the FSM transition', async () => {
        const injector: VoiceInjector = {
            async inject(): Promise<VoiceInjectResult> {
                return { ok: false, error: 'sidecar_unreachable' };
            },
        };
        const isolated = createMeetingAgentServer({
            tts: new SupertonicClient({
                endpoint: 'http://fake-tts:8000',
                fetchImpl: async () => ({
                    ok: true,
                    status: 200,
                    statusText: 'OK',
                    arrayBuffer: async () => new TextEncoder().encode('A').buffer,
                    text: async () => '',
                }),
            }),
            voiceInjector: injector,
            logger: () => { /* silence expected log */ },
        });
        await isolated.listen(0);
        try {
            const addr = isolated.server.address() as AddressInfo;
            const url = `http://127.0.0.1:${addr.port}`;
            const created = await fetch(`${url}/v1/sessions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tenantId: 't1', workspaceId: 'ws1', botId: 'b1',
                    platform: 'webex', mode: 'standup', meetingId: 'm1',
                }),
            });
            const session = (await created.json() as { session: { id: string } }).session;
            await fetch(`${url}/v1/sessions/${session.id}/start`, { method: 'POST' });
            const sayResp = await fetch(`${url}/v1/sessions/${session.id}/say`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: 'hello', disclosureAnnounced: true }),
            });
            const sayBody = await sayResp.json() as {
                session: { status: string };
                injection: { ok: boolean; error?: string };
            };
            assert.equal(sayResp.status, 200);
            assert.equal(sayBody.session.status, 'listening');
            assert.equal(sayBody.injection.ok, false);
            assert.equal(sayBody.injection.error, 'sidecar_unreachable');
        } finally {
            await isolated.close();
        }
    });
});

describe('inbound transcript ingestion (POST /v1/sessions/:id/transcript/inbound)', () => {
    it('appends a participant utterance and exposes it via GET /transcript', async () => {
        const create = await call('/v1/sessions', 'POST', {
            tenantId: 't1', workspaceId: 'ws1', botId: 'b1',
            platform: 'meet', mode: 'interactive_qa', meetingId: 'm1',
        });
        const id = create.json.session.id as string;
        await call(`/v1/sessions/${id}/start`, 'POST');

        const inbound = await call(`/v1/sessions/${id}/transcript/inbound`, 'POST', {
            session_id: id,
            sequence: 1,
            event: 'final',
            text: 'Can you summarise the action items?',
            source: 'live_capture',
            started_at: '2026-05-20T10:00:00.000Z',
            ended_at: '2026-05-20T10:00:03.500Z',
            speaker: 'remote',
        });
        assert.equal(inbound.status, 202);
        assert.equal(inbound.json.accepted, true);

        const transcript = await call(`/v1/sessions/${id}/transcript`);
        assert.equal(transcript.status, 200);
        const participant = transcript.json.transcript.find(
            (entry: { source: string; text: string }) =>
                entry.source === 'participant' && entry.text === 'Can you summarise the action items?',
        );
        assert.ok(participant, 'expected participant transcript entry');
        assert.equal(participant.speaker, 'remote');
    });

    it('rejects bodies missing text with 400', async () => {
        const create = await call('/v1/sessions', 'POST', {
            tenantId: 't1', workspaceId: 'ws1', botId: 'b1',
            platform: 'meet', mode: 'standup', meetingId: 'm1',
        });
        const id = create.json.session.id as string;
        const inbound = await call(`/v1/sessions/${id}/transcript/inbound`, 'POST', {
            session_id: id,
            sequence: 1,
            event: 'final',
        });
        assert.equal(inbound.status, 400);
        assert.equal(inbound.json.error, 'invalid_request');
    });

    it('enforces bearer auth on the inbound route', async () => {
        const secured = createMeetingAgentServer({ authToken: 'inbound-secret' });
        await secured.listen(0);
        try {
            const addr = secured.server.address() as AddressInfo;
            const url = `http://127.0.0.1:${addr.port}`;
            const created = await fetch(`${url}/v1/sessions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer inbound-secret',
                },
                body: JSON.stringify({
                    tenantId: 't1', workspaceId: 'ws1', botId: 'b1',
                    platform: 'meet', mode: 'standup', meetingId: 'm1',
                }),
            });
            const session = (await created.json() as { session: { id: string } }).session;

            const blocked = await fetch(`${url}/v1/sessions/${session.id}/transcript/inbound`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: 'no auth' }),
            });
            assert.equal(blocked.status, 401);

            const ok = await fetch(`${url}/v1/sessions/${session.id}/transcript/inbound`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer inbound-secret',
                },
                body: JSON.stringify({ text: 'with auth' }),
            });
            assert.equal(ok.status, 202);
        } finally {
            await secured.close();
        }
    });
});

describe('capture controller auto-start/stop', () => {
    it('engages capture on /start with a callback URL pointing at the inbound route', async () => {
        const startCalls: CaptureStartInput[] = [];
        const stopCalls: CaptureStopInput[] = [];
        const capture: CaptureController = {
            async start(input: CaptureStartInput): Promise<CaptureResult> {
                startCalls.push(input);
                return { ok: true, captureId: 'cap-1' };
            },
            async stop(input: CaptureStopInput): Promise<CaptureResult> {
                stopCalls.push(input);
                return { ok: true };
            },
        };
        const isolated = createMeetingAgentServer({
            captureController: capture,
            publicBaseUrl: 'http://meeting-agent:7799',
            authToken: 'inbound-secret',
        });
        await isolated.listen(0);
        try {
            const addr = isolated.server.address() as AddressInfo;
            const url = `http://127.0.0.1:${addr.port}`;
            const headers = {
                'Content-Type': 'application/json',
                Authorization: 'Bearer inbound-secret',
            };
            const created = await fetch(`${url}/v1/sessions`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    tenantId: 't1', workspaceId: 'ws1', botId: 'b1',
                    platform: 'meet', mode: 'standup', meetingId: 'm1',
                }),
            });
            const session = (await created.json() as { session: { id: string } }).session;

            const startResp = await fetch(`${url}/v1/sessions/${session.id}/start`, {
                method: 'POST',
                headers,
            });
            const startBody = await startResp.json() as {
                capture: { ok: boolean; captureId?: string };
            };
            assert.equal(startResp.status, 200);
            assert.deepEqual(startBody.capture, { ok: true, captureId: 'cap-1' });
            assert.equal(startCalls.length, 1);
            assert.equal(startCalls[0]!.sessionId, session.id);
            assert.equal(
                startCalls[0]!.callbackUrl,
                `http://meeting-agent:7799/v1/sessions/${session.id}/transcript/inbound`,
            );
            assert.equal(startCalls[0]!.callbackToken, 'inbound-secret');

            const stopResp = await fetch(`${url}/v1/sessions/${session.id}/stop`, {
                method: 'POST',
                headers,
            });
            const stopBody = await stopResp.json() as { capture: { ok: boolean } };
            assert.equal(stopResp.status, 200);
            assert.deepEqual(stopBody.capture, { ok: true });
            assert.equal(stopCalls.length, 1);
            assert.equal(stopCalls[0]!.sessionId, session.id);
        } finally {
            await isolated.close();
        }
    });

    it('surfaces capture failure on /start without aborting the FSM transition', async () => {
        const capture: CaptureController = {
            async start(): Promise<CaptureResult> {
                return { ok: false, error: 'sidecar_status_502' };
            },
            async stop(): Promise<CaptureResult> {
                return { ok: true };
            },
        };
        const isolated = createMeetingAgentServer({
            captureController: capture,
            logger: () => { /* silence expected log */ },
        });
        await isolated.listen(0);
        try {
            const addr = isolated.server.address() as AddressInfo;
            const url = `http://127.0.0.1:${addr.port}`;
            const created = await fetch(`${url}/v1/sessions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tenantId: 't1', workspaceId: 'ws1', botId: 'b1',
                    platform: 'meet', mode: 'standup', meetingId: 'm1',
                }),
            });
            const session = (await created.json() as { session: { id: string } }).session;

            const startResp = await fetch(`${url}/v1/sessions/${session.id}/start`, {
                method: 'POST',
            });
            const startBody = await startResp.json() as {
                session: { status: string };
                capture: { ok: boolean; error?: string };
            };
            assert.equal(startResp.status, 200);
            assert.equal(startBody.session.status, 'listening');
            assert.equal(startBody.capture.ok, false);
            assert.equal(startBody.capture.error, 'sidecar_status_502');
        } finally {
            await isolated.close();
        }
    });
});

// ---------------------------------------------------------------------------
// POST /v1/sessions/:id/join — unified browser join + capture start
// ---------------------------------------------------------------------------

describe('POST /v1/sessions/:id/join', () => {
    it('returns 400 when meetingUrl is missing', async () => {
        const created = await call('/v1/sessions', 'POST', {
            tenantId: 't1', workspaceId: 'ws1', botId: 'b1',
            platform: 'meet', mode: 'standup', meetingId: 'm1',
        });
        const id = (created.json as { session: { id: string } }).session.id;
        const r = await call(`/v1/sessions/${id}/join`, 'POST', {});
        assert.equal(r.status, 400);
        assert.equal(r.json.error, 'invalid_request');
    });

    it('returns 400 for an unrecognised meeting URL', async () => {
        const created = await call('/v1/sessions', 'POST', {
            tenantId: 't1', workspaceId: 'ws1', botId: 'b1',
            platform: 'meet', mode: 'standup', meetingId: 'm1',
        });
        const id = (created.json as { session: { id: string } }).session.id;
        const r = await call(`/v1/sessions/${id}/join`, 'POST', {
            meetingUrl: 'https://example.com/not-a-meeting',
        });
        assert.equal(r.status, 400);
        assert.deepEqual(r.json.details, ['meetingUrl must be a Google Meet, Microsoft Teams, or Zoom URL']);
    });

    it('transitions to joining and returns 202 — no desktop-agent configured', async () => {
        const created = await call('/v1/sessions', 'POST', {
            tenantId: 't1', workspaceId: 'ws1', botId: 'b1',
            platform: 'meet', mode: 'standup', meetingId: 'm1',
        });
        const id = (created.json as { session: { id: string } }).session.id;
        const r = await call(`/v1/sessions/${id}/join`, 'POST', {
            meetingUrl: 'https://meet.google.com/abc-defg-hij',
            joinDelayMs: 60_000, // large enough to not fire in this test
        });
        assert.equal(r.status, 202);
        assert.equal(r.json.platform, 'meet');
        assert.equal(r.json.session.status, 'joining');
        assert.equal(r.json.joinPid, null);
    });

    it('detects teams and zoom URLs correctly', async () => {
        const platforms: Array<[string, string]> = [
            ['https://teams.microsoft.com/l/meetup-join/abc', 'teams'],
            ['https://teams.live.com/meet/abc', 'teams'],
            ['https://zoom.us/j/123456?pwd=abc', 'zoom'],
        ];
        for (const [meetingUrl, expectedPlatform] of platforms) {
            const created = await call('/v1/sessions', 'POST', {
                tenantId: 't1', workspaceId: 'ws1', botId: 'b1',
                platform: 'meet', mode: 'standup', meetingId: 'm1',
            });
            const id = (created.json as { session: { id: string } }).session.id;
            const r = await call(`/v1/sessions/${id}/join`, 'POST', {
                meetingUrl,
                joinDelayMs: 60_000,
            });
            assert.equal(r.status, 202, `expected 202 for ${meetingUrl}`);
            assert.equal(r.json.platform, expectedPlatform, `expected ${expectedPlatform} for ${meetingUrl}`);
        }
    });

    it('calls the desktop-agent and records joinPid', async () => {
        // Spin up a fake desktop-agent server that accepts /v1/meeting/join.
        const http = await import('node:http');
        let joinReceived: unknown;
        const fakeDesktop = http.createServer((req, res) => {
            let body = '';
            req.on('data', (c: Buffer) => { body += c.toString(); });
            req.on('end', () => {
                joinReceived = JSON.parse(body);
                res.writeHead(202, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, pid: 9999, platform: 'meet', url: 'https://meet.google.com/abc' }));
            });
        });
        await new Promise<void>((resolve) => fakeDesktop.listen(0, '127.0.0.1', resolve));
        const fakePort = (fakeDesktop.address() as import('node:net').AddressInfo).port;

        const isolated = createMeetingAgentServer({
            desktopAgentUrl: `http://127.0.0.1:${fakePort}`,
        });
        await isolated.listen(0);
        try {
            const url = `http://127.0.0.1:${(isolated.server.address() as import('node:net').AddressInfo).port}`;
            const created = await fetch(`${url}/v1/sessions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tenantId: 't1', workspaceId: 'ws1', botId: 'b1',
                    platform: 'meet', mode: 'standup', meetingId: 'm1',
                }),
            });
            const session = (await created.json() as { session: { id: string } }).session;

            const joinResp = await fetch(`${url}/v1/sessions/${session.id}/join`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    meetingUrl: 'https://meet.google.com/abc-defg-hij',
                    displayName: 'TestAgent',
                    joinDelayMs: 60_000,
                }),
            });
            const joinBody = await joinResp.json() as { platform: string; joinPid: number; session: { status: string } };
            assert.equal(joinResp.status, 202);
            assert.equal(joinBody.platform, 'meet');
            assert.equal(joinBody.joinPid, 9999);
            assert.equal(joinBody.session.status, 'joining');
            assert.deepEqual(joinReceived, {
                platform: 'meet',
                url: 'https://meet.google.com/abc-defg-hij',
                displayName: 'TestAgent',
            });
        } finally {
            await isolated.close();
            fakeDesktop.close();
        }
    });

    it('returns 409 when session is not in scheduled state', async () => {
        const created = await call('/v1/sessions', 'POST', {
            tenantId: 't1', workspaceId: 'ws1', botId: 'b1',
            platform: 'meet', mode: 'standup', meetingId: 'm1',
        });
        const id = (created.json as { session: { id: string } }).session.id;
        // Advance FSM first via /start
        await call(`/v1/sessions/${id}/start`, 'POST');
        // Now /join should 409 because session is already in listening state
        const r = await call(`/v1/sessions/${id}/join`, 'POST', {
            meetingUrl: 'https://meet.google.com/abc-defg-hij',
        });
        assert.equal(r.status, 409);
        assert.equal(r.json.error, 'invalid_transition');
    });
});
