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

export interface VoiceProfile {
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
     * Clone a voice from an audio sample.
     *
     * Sends a multipart/form-data POST to /v1/clone-voice containing the raw
     * audio buffer and JSON metadata.  Returns the assigned voice_id string
     * for use with synthesizeSpeech().
     */
    async cloneVoice(audioBuffer: Buffer, name: string, language: string): Promise<string> {
        const form = new FormData();
        const plain = audioBuffer.buffer instanceof ArrayBuffer
            ? audioBuffer.buffer.slice(audioBuffer.byteOffset, audioBuffer.byteOffset + audioBuffer.byteLength) as ArrayBuffer
            : audioBuffer.buffer.slice(audioBuffer.byteOffset, audioBuffer.byteOffset + audioBuffer.byteLength);
        const blob = new Blob([plain as ArrayBuffer], { type: 'audio/wav' });
        form.append('audio_file', blob, 'sample.wav');
        form.append('metadata', JSON.stringify({ name, language }));

        const response = await fetch(`${VOICEBOX_BASE}/v1/clone-voice`, {
            method: 'POST',
            body: form,
            signal: AbortSignal.timeout(60_000),
        });

        if (!response.ok) {
            const errText = await response.text().catch(() => '');
            throw new Error(`[voicebox] cloneVoice failed with HTTP ${response.status}: ${errText}`);
        }

        const json = await response.json() as { voice_id: string };
        return json.voice_id;
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

    /**
     * Create a voice profile from an audio sample.
     *
     * Sends a multipart/form-data POST to /v1/profiles containing the raw
     * audio buffer plus name and language metadata.  Returns the created
     * VoiceProfile record.
     */
    async createVoiceProfile(
        audioBuffer: Buffer,
        name: string,
        language: string,
    ): Promise<VoiceProfile> {
        const form = new FormData();
        const plain = audioBuffer.buffer instanceof ArrayBuffer
            ? audioBuffer.buffer.slice(audioBuffer.byteOffset, audioBuffer.byteOffset + audioBuffer.byteLength) as ArrayBuffer
            : audioBuffer.buffer.slice(audioBuffer.byteOffset, audioBuffer.byteOffset + audioBuffer.byteLength);
        const blob = new Blob([plain as ArrayBuffer], { type: 'audio/wav' });
        form.append('audio_file', blob, 'sample.wav');
        form.append('name', name);
        form.append('language', language);

        const response = await fetch(`${VOICEBOX_BASE}/v1/profiles`, {
            method: 'POST',
            body: form,
            signal: AbortSignal.timeout(60_000),
        });

        if (!response.ok) {
            const errText = await response.text().catch(() => '');
            throw new Error(`[voicebox] createVoiceProfile failed with HTTP ${response.status}: ${errText}`);
        }

        return response.json() as Promise<VoiceProfile>;
    }

    /**
     * Create a voice profile from a text description (design mode).
     *
     * POSTs JSON { name, description, language, mode: 'design' } to /v1/profiles.
     * Voicebox synthesises a profile without requiring an audio sample.
     * Returns the created VoiceProfile record.
     */
    async createVoiceProfileFromDescription(
        name: string,
        description: string,
        language: string,
    ): Promise<VoiceProfile> {
        const response = await fetch(`${VOICEBOX_BASE}/v1/profiles`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name, description, language, mode: 'design' }),
            signal: AbortSignal.timeout(30_000),
        });

        if (!response.ok) {
            const errText = await response.text().catch(() => '');
            throw new Error(`[voicebox] createVoiceProfileFromDescription failed with HTTP ${response.status}: ${errText}`);
        }

        return response.json() as Promise<VoiceProfile>;
    }
}
