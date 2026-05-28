/**
 * Voice Call Handler — Sarvam AI STT/TTS with Deepgram fallback
 *
 * Supports two modes:
 *   workspace_cse_voice_call_handle  — live call: audio → STT → classify → KB → compose → TTS → audio
 *   workspace_cse_voice_transcribe   — post-call: audio/text → transcript → summary → ticket note
 *
 * STT priority order:
 *   1. Sarvam AI Saarika v2 — best for Indian languages + Indian-accented English
 *   2. Deepgram Nova-3 — fallback for global English
 *
 * TTS priority order:
 *   1. Sarvam AI Bulbul v1 — Indian languages + Indian-accented English
 *   2. VoxCPM2 — OpenAI-compatible fallback
 *
 * Required env vars:
 *   SARVAM_API_KEY        — Sarvam AI subscription key
 *   DEEPGRAM_API_KEY      — Deepgram API key (fallback STT)
 *   MCP_VOXCPM_URL        — VoxCPM base URL (fallback TTS)
 *
 * Optional env vars:
 *   SARVAM_STT_MODEL      — override STT model (default: saarika:v2)
 *   SARVAM_TTS_MODEL      — override TTS model (default: bulbul:v1)
 *   SARVAM_TTS_SPEAKER    — override speaker (default: auto-selected by language)
 */

import { classifyIssueCategory, composeReply } from './response-composer.js';
import { searchKnowledgeBase } from './knowledge-base-searcher.js';
import { openTicket, updateTicket } from './ticket-manager.js';
import type { IssueCategory, Industry } from './response-composer.js';
import {
    normalizeInboundWebhook, buildWebhookResponse, fetchRecordingBytes,
    type TelephonyConnectorConfig, type TelephonyProviderFormat, type InboundCallEvent,
} from './telephony-normalizer.js';

export type { TelephonyProviderFormat, InboundCallEvent };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VoiceSttProvider = 'sarvam_ai' | 'deepgram';
export type VoiceTtsProvider = 'sarvam_ai' | 'voxcpm';

export interface VoiceCallParams {
    tenantId: string;
    botId: string;
    audioRef?: string; // URL or base64-encoded audio bytes (optional when webhookPayload is provided)
    webhookPayload?: Record<string, unknown>; // raw inbound webhook body from telephony provider
    telephonyConnector?: TelephonyConnectorConfig; // dashboard-configured telephony connector
    callId?: string;
    customerId?: string;
    customerEmail?: string;
    customerName?: string;
    language?: string; // BCP-47: 'hi-IN', 'ta-IN', 'en-IN', 'en-US', etc.
    industry?: Industry;
    agentName?: string;
    companyName?: string;
    ticketId?: string; // if continuing an existing ticket
    sttProvider?: VoiceSttProvider;
    ttsProvider?: VoiceTtsProvider;
    connector?: string;
}

export interface VoiceCallResult {
    callId: string;
    transcript: string;
    languageDetected: string;
    issueCategory: IssueCategory;
    replyText: string;
    replyAudioRef: string | null; // base64-encoded audio
    webhookResponse: { contentType: string; body: string } | null; // provider-native response for webhook reply
    ticketId: string | null;
    sttProvider: string;
    ttsProvider: string;
    processedAt: string;
}

export interface VoiceTranscribeParams {
    tenantId: string;
    botId: string;
    audioRef?: string; // URL or base64 — optional if transcript is provided
    transcript?: string; // pre-existing text (skip STT step)
    callId?: string;
    ticketId?: string;
    customerId?: string;
    language?: string;
    sttProvider?: VoiceSttProvider;
    connector?: string;
}

export interface VoiceTranscribeResult {
    callId: string;
    transcript: string;
    languageDetected: string;
    summary: string;
    issueCategory: IssueCategory;
    ticketUpdated: boolean;
    sttProvider: string;
    processedAt: string;
}

// ---------------------------------------------------------------------------
// Audio fetch helper
// ---------------------------------------------------------------------------

async function fetchAudioBytes(audioRef: string): Promise<ArrayBuffer> {
    if (audioRef.startsWith('http://') || audioRef.startsWith('https://')) {
        const res = await fetch(audioRef);
        if (!res.ok) throw new Error(`Failed to download audio from ${audioRef}: HTTP ${res.status}`);
        return res.arrayBuffer();
    }
    const buf = Buffer.from(audioRef, 'base64');
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

// ---------------------------------------------------------------------------
// Sarvam AI STT  (POST https://api.sarvam.ai/speech-to-text)
// ---------------------------------------------------------------------------

async function sarvamStt(
    audioRef: string,
    language?: string,
): Promise<{ transcript: string; languageDetected: string }> {
    const apiKey = process.env['SARVAM_API_KEY'];
    if (!apiKey) throw new Error('SARVAM_API_KEY not configured.');

    const audioBytes = await fetchAudioBytes(audioRef);
    const form = new FormData();
    form.append('file', new Blob([audioBytes], { type: 'audio/wav' }), 'audio.wav');
    form.append('model', process.env['SARVAM_STT_MODEL'] ?? 'saarika:v2');
    if (language) form.append('language_code', language);

    const res = await fetch('https://api.sarvam.ai/speech-to-text', {
        method: 'POST',
        headers: { 'api-subscription-key': apiKey },
        body: form,
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Sarvam AI STT error (${res.status}): ${errText}`);
    }

    const data = (await res.json()) as { transcript?: string; language_code?: string };
    return {
        transcript: data.transcript ?? '',
        languageDetected: data.language_code ?? language ?? 'en-IN',
    };
}

// ---------------------------------------------------------------------------
// Deepgram STT fallback  (POST https://api.deepgram.com/v1/listen)
// ---------------------------------------------------------------------------

async function deepgramStt(
    audioRef: string,
): Promise<{ transcript: string; languageDetected: string }> {
    const apiKey = process.env['DEEPGRAM_API_KEY'];
    if (!apiKey) throw new Error('DEEPGRAM_API_KEY not configured.');

    const audioBytes = await fetchAudioBytes(audioRef);

    const res = await fetch(
        'https://api.deepgram.com/v1/listen?smart_format=true&detect_language=true',
        {
            method: 'POST',
            headers: { Authorization: `Token ${apiKey}`, 'Content-Type': 'audio/wav' },
            body: audioBytes,
        },
    );

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Deepgram STT error (${res.status}): ${errText}`);
    }

    type DeepgramResponse = {
        results?: {
            channels?: Array<{
                alternatives?: Array<{ transcript?: string }>;
                detected_language?: string;
            }>;
        };
    };
    const data = (await res.json()) as DeepgramResponse;
    const channel = data.results?.channels?.[0];
    return {
        transcript: channel?.alternatives?.[0]?.transcript ?? '',
        languageDetected: channel?.detected_language ?? 'en',
    };
}

// ---------------------------------------------------------------------------
// STT dispatcher — Sarvam primary, Deepgram fallback
// ---------------------------------------------------------------------------

async function runStt(
    audioRef: string,
    provider: VoiceSttProvider,
    language?: string,
): Promise<{ transcript: string; languageDetected: string; providerUsed: VoiceSttProvider }> {
    if (provider === 'sarvam_ai') {
        try {
            const result = await sarvamStt(audioRef, language);
            return { ...result, providerUsed: 'sarvam_ai' };
        } catch {
            // fall through to Deepgram
        }
    }
    const result = await deepgramStt(audioRef);
    return { ...result, providerUsed: 'deepgram' };
}

// ---------------------------------------------------------------------------
// Sarvam AI TTS  (POST https://api.sarvam.ai/text-to-speech)
// ---------------------------------------------------------------------------

// Language code → default speaker name
const SARVAM_SPEAKER_MAP: Record<string, string> = {
    'hi-IN': 'meera',
    'ta-IN': 'pavithra',
    'te-IN': 'arvind',
    'kn-IN': 'amol',
    'ml-IN': 'amol',
    'bn-IN': 'meera',
    'gu-IN': 'meera',
    'mr-IN': 'amol',
    'pa-IN': 'meera',
    'or-IN': 'meera',
    'en-IN': 'meera',
    'en-US': 'meera',
};

async function sarvamTts(text: string, language: string): Promise<string | null> {
    const apiKey = process.env['SARVAM_API_KEY'];
    if (!apiKey) return null;

    const speaker = process.env['SARVAM_TTS_SPEAKER'] ?? SARVAM_SPEAKER_MAP[language] ?? 'meera';
    const model = process.env['SARVAM_TTS_MODEL'] ?? 'bulbul:v1';

    const res = await fetch('https://api.sarvam.ai/text-to-speech', {
        method: 'POST',
        headers: { 'api-subscription-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs: [text], target_language_code: language, speaker, model }),
    });

    if (!res.ok) return null;
    const data = (await res.json()) as { audios?: string[] };
    return data.audios?.[0] ?? null; // base64 MP3
}

// ---------------------------------------------------------------------------
// VoxCPM TTS fallback  (OpenAI-compatible /v1/audio/speech)
// ---------------------------------------------------------------------------

async function voxcpmTts(text: string): Promise<string | null> {
    const endpoint = process.env['MCP_VOXCPM_URL'] ?? process.env['VOXCPM_URL'];
    if (!endpoint) return null;

    const res = await fetch(`${endpoint}/v1/audio/speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'openbmb/VoxCPM2', input: text, response_format: 'mp3' }),
    });

    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer()).toString('base64');
}

// ---------------------------------------------------------------------------
// TTS dispatcher — Sarvam primary, VoxCPM fallback
// ---------------------------------------------------------------------------

async function runTts(
    text: string,
    language: string,
    provider: VoiceTtsProvider,
): Promise<{ audioRef: string | null; providerUsed: string }> {
    if (provider === 'sarvam_ai') {
        try {
            const audio = await sarvamTts(text, language);
            if (audio) return { audioRef: audio, providerUsed: 'sarvam_ai' };
        } catch {
            // fall through to VoxCPM
        }
    }
    const audio = await voxcpmTts(text);
    return { audioRef: audio, providerUsed: 'voxcpm' };
}

// ---------------------------------------------------------------------------
// handleVoiceCall — live call pipeline
// ---------------------------------------------------------------------------

export async function handleVoiceCall(params: VoiceCallParams): Promise<VoiceCallResult> {
    const {
        tenantId, botId, customerId, customerEmail, customerName,
        language, industry, agentName, companyName, connector,
        telephonyConnector, webhookPayload,
    } = params;

    const sttProv: VoiceSttProvider = params.sttProvider ?? 'sarvam_ai';
    const ttsProv: VoiceTtsProvider = params.ttsProvider ?? 'sarvam_ai';

    // ── Resolve audio source ─────────────────────────────────────────────────
    // Path A: customer's telephony connector sent a webhook — normalize it and
    //         fetch the recording via the connector's configured API.
    // Path B: caller passed a direct audioRef (URL or base64).

    let audioRef = params.audioRef;
    let callId = params.callId ?? `call-${Date.now()}`;
    let ticketId = params.ticketId;
    let providerFormat: TelephonyProviderFormat | undefined;

    if (webhookPayload && telephonyConnector) {
        providerFormat = telephonyConnector.providerFormat;
        const event = normalizeInboundWebhook(webhookPayload, providerFormat);
        callId = event.callId || callId;

        if (event.transcriptText) {
            // Provider already transcribed — skip STT entirely
            const issueCategory = classifyIssueCategory('', event.transcriptText);
            let resolutionSteps: string[] = [];
            try {
                const kb = await searchKnowledgeBase({
                    tenantId, botId,
                    query: event.transcriptText.slice(0, 300),
                    issueCategory, industry, maxResults: 3, connector,
                });
                resolutionSteps = kb.articles[0]?.resolutionSteps ?? kb.fallbackPlaybook.slice(0, 3);
            } catch { /* KB unavailable */ }

            const reply = composeReply({
                issueDescription: event.transcriptText,
                issueCategory, customerName, industry,
                tone: 'empathetic', resolutionSteps, agentName, companyName,
            });
            const { audioRef: replyAudioRef, providerUsed: ttsProviderUsed } =
                await runTts(reply.body, language ?? 'en-IN', ttsProv);
            const webhookResponse = buildWebhookResponse(providerFormat, reply.body, replyAudioRef);

            let resolvedTicketId: string | null = ticketId ?? null;
            try {
                const ticket = await openTicket({
                    tenantId, botId,
                    subject: `Voice call — ${issueCategory.replace(/_/g, ' ')}`,
                    description: event.transcriptText,
                    priority: 'medium', channel: 'phone',
                    customerId: customerId ?? event.from, customerEmail,
                    connector,
                });
                resolvedTicketId = ticket.ticketId;
            } catch { /* non-fatal */ }

            return {
                callId, transcript: event.transcriptText,
                languageDetected: language ?? 'en-IN', issueCategory,
                replyText: reply.body, replyAudioRef, webhookResponse,
                ticketId: resolvedTicketId, sttProvider: 'provider_native',
                ttsProvider: ttsProviderUsed, processedAt: new Date().toISOString(),
            };
        }

        // No pre-transcribed text — fetch recording bytes from connector API
        if (event.recordingUrl || event.callId) {
            const audioBytes = await fetchRecordingBytes(event.callId, telephonyConnector, event.recordingUrl);
            if (audioBytes) {
                audioRef = Buffer.from(audioBytes).toString('base64');
            }
        }
    }

    if (!audioRef) throw new Error('payload.audioRef or payload.webhookPayload with a recording is required.');

    // ── STT ──────────────────────────────────────────────────────────────────
    const { transcript, languageDetected, providerUsed: sttProviderUsed } =
        await runStt(audioRef, sttProv, language);

    // ── Classify + KB ────────────────────────────────────────────────────────
    const issueCategory = classifyIssueCategory('', transcript);
    let resolutionSteps: string[] = [];
    try {
        const kb = await searchKnowledgeBase({
            tenantId, botId,
            query: transcript.slice(0, 300),
            issueCategory, industry, maxResults: 3, connector,
        });
        resolutionSteps = kb.articles[0]?.resolutionSteps ?? kb.fallbackPlaybook.slice(0, 3);
    } catch { /* KB unavailable */ }

    // ── Compose + TTS ────────────────────────────────────────────────────────
    const reply = composeReply({
        issueDescription: transcript, issueCategory, customerName, industry,
        tone: 'empathetic', resolutionSteps, agentName, companyName,
    });
    const { audioRef: replyAudioRef, providerUsed: ttsProviderUsed } =
        await runTts(reply.body, languageDetected, ttsProv);

    // Build provider-native webhook response when we have a format
    const webhookResponse = providerFormat
        ? buildWebhookResponse(providerFormat, reply.body, replyAudioRef)
        : null;

    // ── Ticket ───────────────────────────────────────────────────────────────
    let resolvedTicketId: string | null = ticketId ?? null;
    try {
        if (ticketId) {
            await updateTicket({
                tenantId, botId, ticketId,
                internalNote: `Voice call transcribed (${sttProviderUsed}): ${transcript.slice(0, 500)}`,
                connector,
            });
        } else {
            const ticket = await openTicket({
                tenantId, botId,
                subject: `Voice call — ${issueCategory.replace(/_/g, ' ')}`,
                description: transcript, priority: 'medium', channel: 'phone',
                customerId, customerEmail, connector,
            });
            resolvedTicketId = ticket.ticketId;
        }
    } catch { /* non-fatal */ }

    return {
        callId, transcript, languageDetected, issueCategory,
        replyText: reply.body, replyAudioRef, webhookResponse,
        ticketId: resolvedTicketId, sttProvider: sttProviderUsed,
        ttsProvider: ttsProviderUsed, processedAt: new Date().toISOString(),
    };
}

// ---------------------------------------------------------------------------
// handleVoiceTranscribe — post-call transcription and ticket note
// ---------------------------------------------------------------------------

export async function handleVoiceTranscribe(params: VoiceTranscribeParams): Promise<VoiceTranscribeResult> {
    const {
        tenantId, botId, audioRef, customerId, ticketId, language, connector,
    } = params;

    const sttProv: VoiceSttProvider = params.sttProvider ?? 'sarvam_ai';
    const callId = params.callId ?? `transcribe-${Date.now()}`;

    let transcript = params.transcript ?? '';
    let languageDetected = language ?? 'en-IN';
    let sttProviderUsed = 'none';

    if (!transcript && audioRef) {
        const result = await runStt(audioRef, sttProv, language);
        transcript = result.transcript;
        languageDetected = result.languageDetected;
        sttProviderUsed = result.providerUsed;
    }

    const issueCategory = classifyIssueCategory('', transcript);

    const summary = [
        `Call ID: ${callId}`,
        `Issue Category: ${issueCategory.replace(/_/g, ' ')}`,
        `Language Detected: ${languageDetected}`,
        ...(customerId ? [`Customer ID: ${customerId}`] : []),
        '',
        'Transcript:',
        transcript.slice(0, 2000),
    ].join('\n');

    // Append transcript as internal note on existing ticket
    let ticketUpdated = false;
    if (ticketId) {
        try {
            await updateTicket({
                tenantId, botId, ticketId,
                internalNote: summary,
                connector,
            });
            ticketUpdated = true;
        } catch {
            // non-fatal
        }
    }

    return {
        callId,
        transcript,
        languageDetected,
        summary,
        issueCategory,
        ticketUpdated,
        sttProvider: sttProviderUsed,
        processedAt: new Date().toISOString(),
    };
}
