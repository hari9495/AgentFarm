import type {
    SttProvider,
    TtsProvider,
    VoicePipelineConfig,
    VoiceSpeechRecord,
    VoiceTranscriptRecord,
} from '@agentfarm/shared-types';
import { CONTRACT_VERSIONS } from '@agentfarm/shared-types';
import { randomUUID } from 'node:crypto';

// ── Provider endpoints ────────────────────────────────────────────────────────

const SARVAM_STT_URL = 'https://api.sarvam.ai/speech-to-text';
const SARVAM_TTS_URL = 'https://api.sarvam.ai/text-to-speech';
const DEEPGRAM_STT_URL = 'https://api.deepgram.com/v1/listen?smart_format=true&detect_language=true';

const SARVAM_SPEAKER_MAP: Record<string, string> = {
    'hi-IN': 'meera', 'ta-IN': 'pavithra', 'te-IN': 'arvind',
    'kn-IN': 'arvind', 'ml-IN': 'arvind', 'mr-IN': 'amol',
    'bn-IN': 'meera', 'gu-IN': 'meera', 'pa-IN': 'meera',
};

// ── Audio download helper ─────────────────────────────────────────────────────

async function resolveAudioBytes(audioRef: string): Promise<ArrayBuffer> {
    if (audioRef.startsWith('data:')) {
        const comma = audioRef.indexOf(',');
        const b64 = comma === -1 ? audioRef : audioRef.slice(comma + 1);
        const buf = Buffer.from(b64, 'base64');
        return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    }
    const res = await fetch(audioRef);
    if (!res.ok) throw new Error(`resolveAudioBytes: fetch ${res.status} for ${audioRef}`);
    return res.arrayBuffer();
}

// ── Sarvam AI STT ─────────────────────────────────────────────────────────────

async function sarvamSttImpl(
    audioRef: string,
    config: VoicePipelineConfig,
): Promise<{ transcript: string; confidence?: number; durationMs?: number; languageDetected?: string }> {
    const apiKey = process.env['SARVAM_API_KEY'] ?? '';
    if (!apiKey) throw new Error('SARVAM_API_KEY not set');
    const audioBytes = await resolveAudioBytes(audioRef);
    const form = new FormData();
    form.append('file', new Blob([audioBytes]), 'audio.wav');
    form.append('model', config.sttModel ?? 'saarika:v2');
    if (config.languageCode) form.append('language_code', config.languageCode);
    const started = Date.now();
    const res = await fetch(SARVAM_STT_URL, {
        method: 'POST',
        headers: { 'api-subscription-key': apiKey },
        body: form,
    });
    if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`Sarvam STT ${res.status}: ${detail.slice(0, 256)}`);
    }
    const data = await res.json() as { transcript?: string; language_code?: string };
    return {
        transcript: data.transcript ?? '',
        languageDetected: data.language_code,
        durationMs: Date.now() - started,
    };
}

// ── Deepgram STT ─────────────────────────────────────────────────────────────

async function deepgramSttImpl(
    audioRef: string,
    _config: VoicePipelineConfig,
): Promise<{ transcript: string; confidence?: number; durationMs?: number; languageDetected?: string }> {
    const apiKey = process.env['DEEPGRAM_API_KEY'] ?? '';
    if (!apiKey) throw new Error('DEEPGRAM_API_KEY not set');
    const audioBytes = await resolveAudioBytes(audioRef);
    const started = Date.now();
    const res = await fetch(DEEPGRAM_STT_URL, {
        method: 'POST',
        headers: { Authorization: `Token ${apiKey}`, 'Content-Type': 'audio/*' },
        body: audioBytes,
    });
    if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`Deepgram STT ${res.status}: ${detail.slice(0, 256)}`);
    }
    type DeepgramResponse = {
        results?: { channels?: Array<{ alternatives?: Array<{ transcript?: string; confidence?: number }> }> };
        metadata?: { detected_language?: string };
    };
    const data = await res.json() as DeepgramResponse;
    const alt = data.results?.channels?.[0]?.alternatives?.[0];
    return {
        transcript: alt?.transcript ?? '',
        confidence: alt?.confidence,
        languageDetected: data.metadata?.detected_language,
        durationMs: Date.now() - started,
    };
}

// ── Sarvam AI TTS ─────────────────────────────────────────────────────────────

async function sarvamTtsImpl(
    text: string,
    config: VoicePipelineConfig,
): Promise<{ audioRef?: string; durationMs?: number }> {
    const apiKey = process.env['SARVAM_API_KEY'] ?? '';
    if (!apiKey) throw new Error('SARVAM_API_KEY not set');
    const langCode = config.languageCode ?? 'hi-IN';
    const speaker = config.voiceProfileId ?? SARVAM_SPEAKER_MAP[langCode] ?? 'meera';
    const started = Date.now();
    const res = await fetch(SARVAM_TTS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-subscription-key': apiKey },
        body: JSON.stringify({
            inputs: [text],
            target_language_code: langCode,
            speaker,
            model: config.ttsModel ?? 'bulbul:v1',
        }),
    });
    if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`Sarvam TTS ${res.status}: ${detail.slice(0, 256)}`);
    }
    const data = await res.json() as { audios?: string[] };
    const b64 = data.audios?.[0];
    if (!b64) throw new Error('Sarvam TTS: no audio in response');
    return { audioRef: `data:audio/wav;base64,${b64}`, durationMs: Date.now() - started };
}

// ── VoxCPM TTS ────────────────────────────────────────────────────────────────

async function voxcpmTtsImpl(
    text: string,
    config: VoicePipelineConfig,
): Promise<{ audioRef?: string; durationMs?: number }> {
    const endpoint = config.ttsEndpoint;
    if (!endpoint) throw new Error('VoicePipelineConfig.ttsEndpoint not set for voxcpm TTS');
    const body = buildVoxCpmRequest(text, config.ttsModel, config.voiceProfileId);
    const started = Date.now();
    const res = await fetch(`${endpoint.replace(/\/+$/u, '')}/v1/audio/speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'audio/*' },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`VoxCPM TTS ${res.status}: ${detail.slice(0, 256)}`);
    }
    const bytes = await res.arrayBuffer();
    const b64 = Buffer.from(bytes).toString('base64');
    return { audioRef: `data:audio/mpeg;base64,${b64}`, durationMs: Date.now() - started };
}

// ── Adapters for STT / TTS (injectable for testing) ──────────────────────────

export type SttAdapter = (
    audioRef: string,
    config: VoicePipelineConfig,
) => Promise<{ transcript: string; confidence?: number; durationMs?: number; languageDetected?: string }>;

export type TtsAdapter = (
    text: string,
    config: VoicePipelineConfig,
) => Promise<{ audioRef?: string; durationMs?: number }>;

const defaultSttAdapter: SttAdapter = async (audioRef, config) => {
    if (config.sttProvider === 'sarvam_ai') return sarvamSttImpl(audioRef, config);
    if (config.sttProvider === 'deepgram') return deepgramSttImpl(audioRef, config);
    console.error(
        `[voice-pipeline] no built-in STT adapter for provider "${config.sttProvider}". Inject a custom SttAdapter.`,
    );
    return { transcript: '' };
};

const defaultTtsAdapter: TtsAdapter = async (text, config) => {
    if (config.ttsProvider === 'sarvam_ai') return sarvamTtsImpl(text, config);
    if (config.ttsProvider === 'voxcpm') return voxcpmTtsImpl(text, config);
    console.error(
        `[voice-pipeline] no built-in TTS adapter for provider "${config.ttsProvider}". Inject a custom TtsAdapter.`,
    );
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
