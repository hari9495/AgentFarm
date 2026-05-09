/**
 * VoxCPM2Client — typed HTTP client for the VoxCPM2 voice synthesis service.
 *
 * VoxCPM2 provides high-quality, multilingual voice synthesis and voice cloning.
 * Connects to the service at VOXCPM2_URL (default: http://localhost:8765).
 */

const resolveBase = (): string =>
    (process.env['VOXCPM2_URL'] ?? 'http://localhost:8765').replace(/\/+$/, '');

export interface VoxVoiceInfo {
    id: string;
    name: string;
    language: string;
}

export interface SynthesizeOptions {
    voiceId?: string;
    sampleRate?: number;
}

export class VoxCPM2Client {
    /**
     * Synthesize speech from text.
     *
     * POSTs JSON { text, language, voice_id?, sample_rate? } to /v1/synthesize
     * and returns the raw WAV bytes as a Buffer.
     */
    async synthesize(
        text: string,
        language?: string,
        options?: SynthesizeOptions,
    ): Promise<Buffer> {
        const body: {
            text: string;
            language: string;
            voice_id?: string;
            sample_rate?: number;
        } = { text, language: language ?? 'en' };

        if (options?.voiceId !== undefined) {
            body.voice_id = options.voiceId;
        }
        if (options?.sampleRate !== undefined) {
            body.sample_rate = options.sampleRate;
        }

        const response = await fetch(`${resolveBase()}/v1/synthesize`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(30_000),
        });

        if (!response.ok) {
            const errText = await response.text().catch(() => '');
            throw new Error(`[voxcpm2] synthesize failed with HTTP ${response.status}: ${errText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
    }

    /**
     * Clone a voice from an audio sample.
     *
     * Sends a multipart/form-data POST to /v1/clone-voice containing the raw
     * audio buffer and JSON metadata ({ name, language }).  Returns the
     * assigned voice_id string for use with synthesize().
     */
    async cloneVoice(audioBuffer: Buffer, name: string, language: string): Promise<string> {
        const form = new FormData();

        // Copy into a plain ArrayBuffer to satisfy the Blob type constraint
        const plain = audioBuffer.buffer instanceof ArrayBuffer
            ? audioBuffer.buffer.slice(
                audioBuffer.byteOffset,
                audioBuffer.byteOffset + audioBuffer.byteLength,
            ) as ArrayBuffer
            : audioBuffer.buffer.slice(
                audioBuffer.byteOffset,
                audioBuffer.byteOffset + audioBuffer.byteLength,
            );
        const blob = new Blob([plain as ArrayBuffer], { type: 'audio/wav' });
        form.append('audio_file', blob, 'sample.wav');
        form.append('metadata', JSON.stringify({ name, language }));

        const response = await fetch(`${resolveBase()}/v1/clone-voice`, {
            method: 'POST',
            body: form,
            signal: AbortSignal.timeout(60_000),
        });

        if (!response.ok) {
            const errText = await response.text().catch(() => '');
            throw new Error(`[voxcpm2] cloneVoice failed with HTTP ${response.status}: ${errText}`);
        }

        const json = await response.json() as { voice_id: string };
        return json.voice_id;
    }

    /**
     * List all available voices.
     */
    async listVoices(): Promise<VoxVoiceInfo[]> {
        const response = await fetch(`${resolveBase()}/v1/voices`, {
            method: 'GET',
            signal: AbortSignal.timeout(10_000),
        });

        if (!response.ok) {
            const errText = await response.text().catch(() => '');
            throw new Error(`[voxcpm2] listVoices failed with HTTP ${response.status}: ${errText}`);
        }

        return response.json() as Promise<VoxVoiceInfo[]>;
    }

    /**
     * Health-check the VoxCPM2 service.
     * Returns true if the service responds with HTTP 200, false otherwise.
     */
    async healthCheck(): Promise<boolean> {
        try {
            const response = await fetch(`${resolveBase()}/health`, {
                method: 'GET',
                signal: AbortSignal.timeout(5_000),
            });
            return response.status === 200;
        } catch {
            return false;
        }
    }
}
