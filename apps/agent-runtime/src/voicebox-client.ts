/**
 * VoiceboxClient — typed HTTP client for the local Voicebox service.
 *
 * Voicebox provides voice I/O (transcription + speech synthesis) running on
 * localhost:17493. All methods throw on network/parse failures so callers can
 * decide whether to swallow or surface the error.
 */

const VOICEBOX_BASE = process.env['VOICEBOX_URL'] ?? 'http://localhost:17493';

export interface TranscribeResult {
    text: string;
    language: string;
    confidence: number;
}

export interface VoiceInfo {
    id: string;
    name: string;
    language: string;
}

export class VoiceboxClient {
    /**
     * Transcribe audio bytes to text.
     *
     * Sends a multipart/form-data POST to /v1/transcribe containing the audio
     * blob and MIME type.  Returns the recognised text, detected language, and
     * confidence score.
     */
    async transcribeAudio(audioBuffer: Buffer, mimeType: string): Promise<TranscribeResult> {
        const form = new FormData();
        // Copy into a plain ArrayBuffer to satisfy the Blob constructor type constraint
        const plain = audioBuffer.buffer instanceof ArrayBuffer
            ? audioBuffer.buffer.slice(audioBuffer.byteOffset, audioBuffer.byteOffset + audioBuffer.byteLength) as ArrayBuffer
            : audioBuffer.buffer.slice(audioBuffer.byteOffset, audioBuffer.byteOffset + audioBuffer.byteLength);
        const blob = new Blob([plain as ArrayBuffer], { type: mimeType });
        form.append('audio', blob, 'audio');
        form.append('mime_type', mimeType);

        const response = await fetch(`${VOICEBOX_BASE}/v1/transcribe`, {
            method: 'POST',
            body: form,
            signal: AbortSignal.timeout(30_000),
        });

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(`[voicebox] transcribeAudio failed with HTTP ${response.status}: ${text}`);
        }

        return response.json() as Promise<TranscribeResult>;
    }

    /**
     * Synthesize speech from text.
     *
     * POSTs JSON { text, language, voice_id } to /v1/synthesize and returns
     * the raw audio bytes as a Buffer.
     */
    async synthesizeSpeech(text: string, language: string, voiceId?: string): Promise<Buffer> {
        const body: { text: string; language: string; voice_id?: string } = { text, language };
        if (voiceId !== undefined) {
            body.voice_id = voiceId;
        }

        const response = await fetch(`${VOICEBOX_BASE}/v1/synthesize`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(30_000),
        });

        if (!response.ok) {
            const errText = await response.text().catch(() => '');
            throw new Error(`[voicebox] synthesizeSpeech failed with HTTP ${response.status}: ${errText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
    }

    /**
     * List available voices, optionally filtered by language.
     */
    async listVoices(language?: string): Promise<VoiceInfo[]> {
        const url = new URL(`${VOICEBOX_BASE}/v1/voices`);
        if (language) {
            url.searchParams.set('language', language);
        }

        const response = await fetch(url.toString(), {
            method: 'GET',
            signal: AbortSignal.timeout(10_000),
        });

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(`[voicebox] listVoices failed with HTTP ${response.status}: ${text}`);
        }

        return response.json() as Promise<VoiceInfo[]>;
    }

    /**
     * Check whether the Voicebox service is reachable.
     * Returns true if the health endpoint responds with HTTP 200.
     */
    async healthCheck(): Promise<boolean> {
        try {
            const response = await fetch(`${VOICEBOX_BASE}/health`, {
                method: 'GET',
                signal: AbortSignal.timeout(5_000),
            });
            return response.status === 200;
        } catch {
            return false;
        }
    }
}
