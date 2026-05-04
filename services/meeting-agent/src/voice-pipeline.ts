import type {
    SttProvider,
    TtsProvider,
    VoicePipelineConfig,
    VoiceSpeechRecord,
    VoiceTranscriptRecord,
} from '@agentfarm/shared-types';
import { CONTRACT_VERSIONS } from '@agentfarm/shared-types';
import { randomUUID } from 'node:crypto';

// ── Adapters for STT / TTS (injectable for testing) ──────────────────────────

export type SttAdapter = (
    audioRef: string,
    config: VoicePipelineConfig,
) => Promise<{ transcript: string; confidence?: number; durationMs?: number; languageDetected?: string }>;

export type TtsAdapter = (
    text: string,
    config: VoicePipelineConfig,
) => Promise<{ audioRef?: string; durationMs?: number }>;

/** Default STT stub — in production replace with a Whisper API call. */
const defaultSttAdapter: SttAdapter = async (_audioRef, _config) => {
    // Production: POST audio to Whisper endpoint
    return { transcript: '', confidence: undefined };
};

/** Default TTS stub — in production replace with VoxCPM /v1/audio/speech call. */
const defaultTtsAdapter: TtsAdapter = async (_text, _config) => {
    // Production: POST to config.ttsEndpoint (OpenAI-compatible /v1/audio/speech)
    return { audioRef: undefined };
};

// ── VoicePipeline ─────────────────────────────────────────────────────────────

/**
 * Orchestrates the STT → (LLM response text) → TTS pipeline for the meeting
 * agent.
 *
 * Adapters are injected so callers can substitute mock implementations in
 * tests without requiring real network access.
 */
export class VoicePipeline {
    private readonly config: VoicePipelineConfig;
    private readonly sttAdapter: SttAdapter;
    private readonly ttsAdapter: TtsAdapter;

    constructor(
        config: VoicePipelineConfig,
        adapters: { stt?: SttAdapter; tts?: TtsAdapter } = {},
    ) {
        this.config = config;
        this.sttAdapter = adapters.stt ?? defaultSttAdapter;
        this.ttsAdapter = adapters.tts ?? defaultTtsAdapter;
    }

    get sttProvider(): SttProvider {
        return this.config.sttProvider;
    }

    get ttsProvider(): TtsProvider {
        return this.config.ttsProvider;
    }

    /**
     * Transcribes an audio reference using the configured STT provider.
     * Returns a VoiceTranscriptRecord (not yet persisted).
     */
    async transcribe(
        sessionId: string,
        tenantId: string,
        workspaceId: string,
        audioRef: string,
    ): Promise<VoiceTranscriptRecord> {
        const result = await this.sttAdapter(audioRef, this.config);
        return {
            id: randomUUID(),
            contractVersion: CONTRACT_VERSIONS.VOICE_TRANSCRIPT,
            sessionId,
            tenantId,
            workspaceId,
            audioRef,
            transcript: result.transcript,
            confidence: result.confidence,
            sttProvider: this.config.sttProvider,
            sttModel: this.config.sttModel,
            languageDetected: result.languageDetected,
            durationMs: result.durationMs,
            correlationId: randomUUID(),
            createdAt: new Date().toISOString(),
        };
    }

    /**
     * Synthesises speech from text using the configured TTS provider.
     * Returns a VoiceSpeechRecord (not yet persisted).
     */
    async synthesize(
        sessionId: string,
        tenantId: string,
        workspaceId: string,
        text: string,
    ): Promise<VoiceSpeechRecord> {
        const result = await this.ttsAdapter(text, this.config);
        return {
            id: randomUUID(),
            sessionId,
            tenantId,
            workspaceId,
            text,
            audioRef: result.audioRef,
            ttsProvider: this.config.ttsProvider,
            ttsModel: this.config.ttsModel,
            voiceProfileId: this.config.voiceProfileId,
            durationMs: result.durationMs,
            streamingUsed: this.config.streamingEnabled ?? false,
            correlationId: randomUUID(),
            createdAt: new Date().toISOString(),
        };
    }
}

// ── Helper: build a VoxCPM-compatible TTS request payload ────────────────────

export interface VoxCpmTtsRequest {
    model: string;
    input: string;
    voice?: string;
    response_format?: 'mp3' | 'wav' | 'opus' | 'flac';
    speed?: number;
}

/**
 * Builds an OpenAI-compatible /v1/audio/speech request body for VoxCPM.
 * Exported for unit testing the payload shape without real HTTP calls.
 */
export function buildVoxCpmRequest(
    text: string,
    model = 'openbmb/VoxCPM2',
    voiceId?: string,
): VoxCpmTtsRequest {
    return {
        model,
        input: text,
        ...(voiceId ? { voice: voiceId } : {}),
        response_format: 'mp3',
    };
}
