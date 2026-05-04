import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVoiceRequest, sendVoice } from './voice-adapter.js';
import type { NotificationRecord, NotificationChannelConfig } from '@agentfarm/shared-types';

const baseRecord: NotificationRecord = {
    id: 'notif_voice_001',
    contractVersion: '1.0.0',
    tenantId: 'tenant_1',
    workspaceId: 'ws_1',
    channel: 'voice',
    trigger: 'approval_requested',
    title: 'Approval needed',
    body: 'A high-risk action requires your approval.',
    status: 'pending',
    retryCount: 0,
    correlationId: 'corr_v_1',
    createdAt: '2026-01-01T00:00:00Z',
};

const fullConfig: NotificationChannelConfig = {
    channel: 'voice',
    enabled: true,
    config: {
        voiceApiUrl: 'https://api.voxcpm.io',
        toNumber: '+15551234567',
        fromNumber: '+15559876543',
        apiKey: 'sk-test-voice',
        ttsModel: 'voxcpm-tts-1',
        voiceId: 'nova',
    },
};

// ── buildVoiceRequest ─────────────────────────────────────────────────────────

test('buildVoiceRequest uses defaults when optional params omitted', () => {
    const req = buildVoiceRequest('+1555', '+1888', 'hello');
    assert.equal(req.url, '/v1/calls/initiate');
    const body = req.body as { tts: { model: string; voice: string } };
    assert.equal(body.tts.model, 'voxcpm-tts-1');
    assert.equal(body.tts.voice, 'nova');
});

test('buildVoiceRequest includes to/from numbers', () => {
    const req = buildVoiceRequest('+15551234567', '+15559876543', 'test', 'tts-turbo', 'echo');
    const body = req.body as { to: string; from: string; tts: { model: string; voice: string } };
    assert.equal(body.to, '+15551234567');
    assert.equal(body.from, '+15559876543');
    assert.equal(body.tts.model, 'tts-turbo');
    assert.equal(body.tts.voice, 'echo');
});

// ── sendVoice — happy path ────────────────────────────────────────────────────

test('sendVoice returns success with callSid from fetcher', async () => {
    const calls: Array<{ url: string; body: Record<string, unknown>; apiKey: string }> = [];
    const fetcher = async (url: string, body: Record<string, unknown>, apiKey: string) => {
        calls.push({ url, body, apiKey });
        return 'CALL-SID-001';
    };
    const result = await sendVoice(baseRecord, fullConfig, fetcher);
    assert.equal(result.success, true);
    assert.equal(result.platformMessageId, 'CALL-SID-001');
    assert.equal(result.channel, 'voice');
    assert.equal(calls.length, 1);
    assert.ok(calls[0].url.includes('/v1/calls/initiate'));
    assert.equal(calls[0].apiKey, 'sk-test-voice');
});

test('sendVoice body contains title + body concatenated as TTS input', async () => {
    let capturedBody: Record<string, unknown> = {};
    const fetcher = async (_url: string, body: Record<string, unknown>) => {
        capturedBody = body;
        return 'CALL-001';
    };
    await sendVoice(baseRecord, fullConfig, fetcher);
    const tts = (capturedBody as { tts: { input: string } }).tts;
    assert.ok(tts.input.includes('Approval needed'));
    assert.ok(tts.input.includes('high-risk action'));
});

// ── sendVoice — missing config ────────────────────────────────────────────────

test('sendVoice returns failure when voiceApiUrl missing', async () => {
    const cfg: NotificationChannelConfig = {
        ...fullConfig,
        config: { toNumber: '+1', fromNumber: '+2', apiKey: 'k' },
    };
    const result = await sendVoice(baseRecord, cfg, async () => undefined);
    assert.equal(result.success, false);
    assert.ok(result.errorMessage?.includes('voiceApiUrl'));
});

test('sendVoice returns failure when toNumber missing', async () => {
    const cfg: NotificationChannelConfig = {
        ...fullConfig,
        config: { voiceApiUrl: 'https://api', fromNumber: '+2', apiKey: 'k' },
    };
    const result = await sendVoice(baseRecord, cfg, async () => undefined);
    assert.equal(result.success, false);
});

test('sendVoice returns failure when apiKey missing', async () => {
    const cfg: NotificationChannelConfig = {
        ...fullConfig,
        config: { voiceApiUrl: 'https://api', toNumber: '+1', fromNumber: '+2' },
    };
    const result = await sendVoice(baseRecord, cfg, async () => undefined);
    assert.equal(result.success, false);
});

// ── sendVoice — fetcher throws ────────────────────────────────────────────────

test('sendVoice wraps fetcher error in dispatch result', async () => {
    const fetcher = async () => {
        throw new Error('connection refused');
    };
    const result = await sendVoice(baseRecord, fullConfig, fetcher);
    assert.equal(result.success, false);
    assert.ok(result.errorMessage?.includes('connection refused'));
});
