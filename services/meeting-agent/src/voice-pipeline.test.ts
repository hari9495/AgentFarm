import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { VoicePipelineConfig } from '@agentfarm/shared-types';
import { CONTRACT_VERSIONS } from '@agentfarm/shared-types';
import { VoicePipeline, buildVoxCpmRequest } from './voice-pipeline.js';

const BASE_CONFIG: VoicePipelineConfig = {
    sttProvider: 'whisper_local',
    sttModel: 'whisper-turbo',
    ttsProvider: 'voxcpm',
    ttsModel: 'openbmb/VoxCPM2',
    ttsEndpoint: 'http://localhost:8000/v1/audio/speech',
    streamingEnabled: false,
};

const CTX = { sessionId: 'sess-1', tenantId: 't1', workspaceId: 'ws1' };

// ── buildVoxCpmRequest ────────────────────────────────────────────────────────

describe('buildVoxCpmRequest', () => {
    it('sets model and input', () => {
        const req = buildVoxCpmRequest('Hello world');
        assert.equal(req.input, 'Hello world');
        assert.equal(req.model, 'openbmb/VoxCPM2');
        assert.equal(req.response_format, 'mp3');
        assert.equal(req.voice, undefined);
    });

    it('includes voice when provided', () => {
        const req = buildVoxCpmRequest('Hi', 'openbmb/VoxCPM2', 'emma');
        assert.equal(req.voice, 'emma');
    });
});

// ── VoicePipeline.transcribe ──────────────────────────────────────────────────

describe('VoicePipeline.transcribe', () => {
    it('calls the STT adapter and returns a VoiceTranscriptRecord', async () => {
        const fakeStt = async (_ref: string, _cfg: VoicePipelineConfig) => ({
            transcript: 'What is the project status?',
            confidence: 0.97,
            durationMs: 1200,
            languageDetected: 'en',
        });

        const pipeline = new VoicePipeline(BASE_CONFIG, { stt: fakeStt });
        const record = await pipeline.transcribe(CTX.sessionId, CTX.tenantId, CTX.workspaceId, 'audio.wav');

        assert.equal(record.contractVersion, CONTRACT_VERSIONS.VOICE_TRANSCRIPT);
        assert.equal(record.transcript, 'What is the project status?');
        assert.equal(record.confidence, 0.97);
        assert.equal(record.durationMs, 1200);
        assert.equal(record.languageDetected, 'en');
        assert.equal(record.sttProvider, 'whisper_local');
        assert.equal(record.sttModel, 'whisper-turbo');
        assert.equal(record.sessionId, 'sess-1');
        assert.equal(record.audioRef, 'audio.wav');
    });

    it('propagates STT adapter errors', async () => {
        const failingStt = async () => { throw new Error('STT service unavailable'); };
        const pipeline = new VoicePipeline(BASE_CONFIG, { stt: failingStt });
        await assert.rejects(
            () => pipeline.transcribe(CTX.sessionId, CTX.tenantId, CTX.workspaceId, 'audio.wav'),
            /STT service unavailable/,
        );
    });
});

// ── VoicePipeline.synthesize ──────────────────────────────────────────────────

describe('VoicePipeline.synthesize', () => {
    it('calls the TTS adapter and returns a VoiceSpeechRecord', async () => {
        const fakeTts = async (_text: string, _cfg: VoicePipelineConfig) => ({
            audioRef: 'gs://bucket/out.mp3',
            durationMs: 3000,
        });

        const pipeline = new VoicePipeline(BASE_CONFIG, { tts: fakeTts });
        const record = await pipeline.synthesize(CTX.sessionId, CTX.tenantId, CTX.workspaceId, 'Understood.');

        assert.equal(record.text, 'Understood.');
        assert.equal(record.audioRef, 'gs://bucket/out.mp3');
        assert.equal(record.durationMs, 3000);
        assert.equal(record.ttsProvider, 'voxcpm');
        assert.equal(record.ttsModel, 'openbmb/VoxCPM2');
        assert.equal(record.streamingUsed, false);
        assert.equal(record.sessionId, 'sess-1');
    });

    it('marks streamingUsed true when config enables streaming', async () => {
        const fakeTts = async () => ({});
        const config: VoicePipelineConfig = { ...BASE_CONFIG, streamingEnabled: true };
        const pipeline = new VoicePipeline(config, { tts: fakeTts });
        const record = await pipeline.synthesize(CTX.sessionId, CTX.tenantId, CTX.workspaceId, 'Streaming test');
        assert.equal(record.streamingUsed, true);
    });

    it('propagates TTS adapter errors', async () => {
        const failingTts = async () => { throw new Error('TTS endpoint unreachable'); };
        const pipeline = new VoicePipeline(BASE_CONFIG, { tts: failingTts });
        await assert.rejects(
            () => pipeline.synthesize(CTX.sessionId, CTX.tenantId, CTX.workspaceId, 'Hello'),
            /TTS endpoint unreachable/,
        );
    });
});

// ── Provider accessors ────────────────────────────────────────────────────────

describe('VoicePipeline — provider accessors', () => {
    it('exposes sttProvider and ttsProvider from config', () => {
        const pipeline = new VoicePipeline(BASE_CONFIG);
        assert.equal(pipeline.sttProvider, 'whisper_local');
        assert.equal(pipeline.ttsProvider, 'voxcpm');
    });
});
