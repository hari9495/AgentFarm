export { MeetingLifecycleStateMachine, InvalidTransitionError } from './meeting-lifecycle.js';
export { VoicePipeline, buildVoxCpmRequest } from './voice-pipeline.js';
export type { SttAdapter, TtsAdapter, VoxCpmTtsRequest } from './voice-pipeline.js';
export { SessionManager } from './session-manager.js';
export type { CreateSessionInput, ManagedSession, TranscriptEntry } from './session-manager.js';
export { SupertonicClient } from './supertonic-client.js';
export type { SupertonicClientOptions, SynthesizeOptions, SynthesizeResult } from './supertonic-client.js';
export { HttpVoiceInjector } from './voice-injector.js';
export type { VoiceInjector, VoiceInjectInput, VoiceInjectResult, HttpVoiceInjectorOptions } from './voice-injector.js';
export { HttpCaptureController } from './capture-controller.js';
export type { CaptureController, CaptureStartInput, CaptureStopInput, CaptureResult, HttpCaptureControllerOptions } from './capture-controller.js';
export { MeetingBrain } from './meeting-brain.js';
export type { MeetingBrainOptions, BrainTurn, BrainLlmProvider } from './meeting-brain.js';
export { MeetingEpisodicMemory } from './meeting-episodic-memory.js';
export type { PastExchange, MemoryWriteFn, MemoryReadFn } from './meeting-episodic-memory.js';
export { createMeetingAgentServer } from './server.js';
export type { MeetingAgentApp, MeetingAgentServerOptions, MeetingTtsClient } from './server.js';
export { SarvamMeetingTtsClient } from './sarvam-tts-client.js';
export type { SarvamMeetingTtsOptions } from './sarvam-tts-client.js';
export { MeetingConnectorRouter, detectPlatform, createConnectorRouterFromEnv } from './meeting-connector-router.js';
export { routeTtsProvider, buildTtsOverride } from './multilingual-tts-router.js';
export type { TtsRoutingDecision } from './multilingual-tts-router.js';
export { TeamsChatSender, ZoomChatSender, NullChatSender, PlatformChatSender } from './chat-sender.js';
export type { ChatSender, ChatSendResult } from './chat-sender.js';
export { BrowserJoinAdapter } from './adapters/browser-join-adapter.js';
export { TeamsJoinAdapter, createTeamsAdapterFromEnv } from './adapters/teams-join-adapter.js';
export { ZoomJoinAdapter, createZoomAdapterFromEnv } from './adapters/zoom-join-adapter.js';
export { SipJoinAdapter, createSipAdapterFromEnv } from './adapters/sip-join-adapter.js';
export type { MeetingJoinAdapter, MeetingJoinResult, MeetingLeaveResult, MeetingAdapterCapabilities, JoinMethod } from './adapters/meeting-join-adapter.js';

import { createMeetingAgentServer } from './server.js';
import { SupertonicClient } from './supertonic-client.js';
import { SarvamMeetingTtsClient } from './sarvam-tts-client.js';
import { HttpVoiceInjector } from './voice-injector.js';
import { HttpCaptureController } from './capture-controller.js';
import { MeetingBrain } from './meeting-brain.js';
import { MeetingEpisodicMemory } from './meeting-episodic-memory.js';
import { createConnectorRouterFromEnv } from './meeting-connector-router.js';
import { createTeamsAdapterFromEnv } from './adapters/teams-join-adapter.js';
import { createZoomAdapterFromEnv } from './adapters/zoom-join-adapter.js';
import { PlatformChatSender, TeamsChatSender, ZoomChatSender } from './chat-sender.js';

/**
 * Boot the meeting-agent service from the environment.
 *
 * Recognised environment variables:
 *   MEETING_AGENT_PORT   — TCP port to bind (default 7799)
 *   MEETING_AGENT_HOST   — bind host (default 0.0.0.0)
 *   MEETING_AGENT_TOKEN  — optional bearer token enforced on /v1 routes
 *   SUPERTONIC_URL       — base URL of the Supertonic-compatible TTS server
 *   SUPERTONIC_API_KEY   — optional bearer token sent to the TTS server
 *   SUPERTONIC_MODEL     — TTS model identifier (default `supertonic`)
 *   SARVAM_API_KEY       — Sarvam AI subscription key; used as TTS fallback
 *                          when SUPERTONIC_URL is not set
 *   SARVAM_LANGUAGE_CODE — BCP-47 code for Sarvam TTS (default `hi-IN`)
 *   DESKTOP_AGENT_VOICE_URL    — base URL of the pipecat voice sidecar
 *                                (e.g. `http://desktop-agent:7800`). When
 *                                set, /say also injects audio into the
 *                                meeting microphone via the sidecar, AND
 *                                /start auto-engages live capture so the
 *                                sidecar posts inbound utterances back to
 *                                /v1/sessions/:id/transcript/inbound.
 *   DESKTOP_AGENT_VOICE_TOKEN  — bearer token for the sidecar (matches
 *                                its `PIPECAT_TOKEN`).
 *   MEETING_AGENT_PUBLIC_URL   — externally-reachable base URL the sidecar
 *                                should POST inbound transcripts to.
 *                                Defaults to `http://meeting-agent:<port>`.
 *   MEETING_DISCLOSURE_TEXT   — phrase automatically prepended to the first
 *                                /say utterance for EU AI Act Article 52
 *                                compliance. Set to empty string to disable.
 *   DESKTOP_AGENT_URL          — base URL of the desktop-agent HTTP control
 *                                plane (port 5003, e.g.
 *                                `http://desktop-agent:5003`). When set,
 *                                POST /v1/sessions/:id/join will forward a
 *                                join request to the desktop-agent so the
 *                                Chromium browser navigates to the meeting
 *                                URL automatically.
 *   MEETING_BRAIN_PROVIDER     — LLM provider for the autonomous response
 *                                brain: `openai` or `anthropic`. When not
 *                                set (or empty) the brain is disabled and
 *                                the agent only speaks when /say is called
 *                                explicitly.
 *   MEETING_BRAIN_API_KEY      — API key for the brain LLM provider.
 *   MEETING_BRAIN_BASE_URL     — Optional base URL override (e.g. for
 *                                Azure OpenAI, GitHub Models, Groq).
 *   MEETING_BRAIN_MODEL        — Model identifier (defaults: gpt-4o-mini
 *                                for openai, claude-3-5-sonnet-latest for
 *                                anthropic).
 *   MEETING_BRAIN_SYSTEM_PROMPT — Custom system prompt injected at the
 *                                start of every LLM conversation.
 *   MEETING_BRAIN_MAX_TOKENS   — Max tokens in the LLM reply (default 512).
 *   MEETING_BRAIN_TIMEOUT_MS   — LLM request timeout in ms (default 30000).
 */
export async function bootFromEnv(): Promise<void> {
    const port = Number(process.env['MEETING_AGENT_PORT'] ?? '7799');
    const host = process.env['MEETING_AGENT_HOST'] ?? '0.0.0.0';
    const authToken = process.env['MEETING_AGENT_TOKEN'] || undefined;

    const ttsEndpoint = process.env['SUPERTONIC_URL'];
    const sarvamApiKey = process.env['SARVAM_API_KEY'];
    const tts = ttsEndpoint
        ? new SupertonicClient({
            endpoint: ttsEndpoint,
            apiKey: process.env['SUPERTONIC_API_KEY'] || undefined,
            model: process.env['SUPERTONIC_MODEL'] || undefined,
        })
        : sarvamApiKey
            ? new SarvamMeetingTtsClient({
                apiKey: sarvamApiKey,
                languageCode: process.env['SARVAM_LANGUAGE_CODE'] ?? 'hi-IN',
            })
            : null;

    if (!tts) {
        console.error('[meeting-agent] Neither SUPERTONIC_URL nor SARVAM_API_KEY set; /say will record transcript only.');
    } else if (!ttsEndpoint && sarvamApiKey) {
        console.error(`[meeting-agent] TTS: Sarvam AI (lang=${process.env['SARVAM_LANGUAGE_CODE'] ?? 'hi-IN'})`);
    }

    const voiceEndpoint = process.env['DESKTOP_AGENT_VOICE_URL'];
    const voiceInjector = voiceEndpoint
        ? new HttpVoiceInjector({
            endpoint: voiceEndpoint,
            authToken: process.env['DESKTOP_AGENT_VOICE_TOKEN'] || undefined,
        })
        : null;

    if (!voiceInjector) {
        console.error('[meeting-agent] DESKTOP_AGENT_VOICE_URL not set; /say will not inject audio into the meeting microphone.');
    }

    const captureController = voiceEndpoint
        ? new HttpCaptureController({
            endpoint: voiceEndpoint,
            authToken: process.env['DESKTOP_AGENT_VOICE_TOKEN'] || undefined,
        })
        : null;

    if (!captureController) {
        console.error('[meeting-agent] capture controller disabled (DESKTOP_AGENT_VOICE_URL unset); /start will not auto-engage live transcription.');
    }

    const publicBaseUrl = process.env['MEETING_AGENT_PUBLIC_URL'] || `http://meeting-agent:${port}`;

    // MEETING_DISCLOSURE_TEXT='' disables auto-disclosure (null); any other
    // value (or absent) uses the server default or the provided string.
    const rawDisclosure = process.env['MEETING_DISCLOSURE_TEXT'];
    const disclosureText = rawDisclosure === '' ? null : rawDisclosure ?? undefined;

    // DESKTOP_AGENT_URL points at the desktop-agent control plane (port 5003).
    // Used by /v1/sessions/:id/join to launch the browser join script.
    const desktopAgentUrl = process.env['DESKTOP_AGENT_URL'] || undefined;

    // MeetingConnectorRouter — selects best join adapter per platform.
    // Reads TEAMS_*, ZOOM_*, FREESWITCH_* env vars automatically.
    const meetingConnectorRouter = createConnectorRouterFromEnv(desktopAgentUrl ?? null);
    console.error(`[meeting-agent] connector router ready`);

    // ChatSender — register Teams and Zoom senders if credentials are available.
    const chatSender = new PlatformChatSender();
    const teamsAdapter = createTeamsAdapterFromEnv();
    if (teamsAdapter) {
        chatSender.register('teams', new TeamsChatSender(teamsAdapter));
        console.error('[meeting-agent] Teams chat sender registered');
    }
    const zoomAdapter = createZoomAdapterFromEnv();
    if (zoomAdapter) {
        chatSender.register('zoom', new ZoomChatSender(zoomAdapter));
        console.error('[meeting-agent] Zoom chat sender registered');
    }

    // MEETING_BRAIN_PROVIDER enables the autonomous LLM response brain.
    // When unset or empty the brain is disabled (manual /say only).
    const brainProvider = process.env['MEETING_BRAIN_PROVIDER'];
    let brain: MeetingBrain | null = null;
    if (brainProvider === 'openai' || brainProvider === 'anthropic') {
        const brainApiKey = process.env['MEETING_BRAIN_API_KEY'] || '';
        if (!brainApiKey) {
            console.error('[meeting-agent] MEETING_BRAIN_PROVIDER is set but MEETING_BRAIN_API_KEY is empty; brain disabled.');
        } else {
            brain = new MeetingBrain({
                provider: brainProvider,
                apiKey: brainApiKey,
                baseUrl: process.env['MEETING_BRAIN_BASE_URL'] || undefined,
                model: process.env['MEETING_BRAIN_MODEL'] || undefined,
                systemPrompt: process.env['MEETING_BRAIN_SYSTEM_PROMPT'] || undefined,
                maxTokens: process.env['MEETING_BRAIN_MAX_TOKENS']
                    ? Number(process.env['MEETING_BRAIN_MAX_TOKENS'])
                    : undefined,
                timeoutMs: process.env['MEETING_BRAIN_TIMEOUT_MS']
                    ? Number(process.env['MEETING_BRAIN_TIMEOUT_MS'])
                    : undefined,
            });
            console.error(`[meeting-agent] brain enabled (provider=${brainProvider}, model=${process.env['MEETING_BRAIN_MODEL'] ?? 'default'})`);
        }
    } else if (brainProvider) {
        console.error(`[meeting-agent] unknown MEETING_BRAIN_PROVIDER "${brainProvider}"; must be openai or anthropic. Brain disabled.`);
    }

    // Episodic memory — always enabled; keyed by participant display name.
    // Stores last N exchanges per speaker so the brain can recall past interactions.
    const memory = new MeetingEpisodicMemory();

    // RAG + lesson-pipeline flywheel.
    // API_GATEWAY_URL — base URL of the api-gateway (default http://localhost:3000).
    // MEETING_SERVICE_TOKEN — service token for authenticated knowledge-base calls.
    // Both must be set to enable RAG context fetching and summary ingestion.
    const gatewayBaseUrl = process.env['API_GATEWAY_URL'] ?? null;
    const serviceToken = process.env['MEETING_SERVICE_TOKEN'] ?? null;
    if (gatewayBaseUrl && serviceToken) {
        console.error(`[meeting-agent] RAG flywheel enabled (gateway=${gatewayBaseUrl})`);
    } else {
        console.error('[meeting-agent] RAG flywheel disabled — set API_GATEWAY_URL and MEETING_SERVICE_TOKEN to enable');
    }

    const app = createMeetingAgentServer({
        authToken,
        tts,
        voiceInjector,
        captureController,
        publicBaseUrl,
        disclosureText,
        desktopAgentUrl,
        brain,
        memory,
        meetingConnectorRouter,
        chatSender,
        gatewayBaseUrl,
        serviceToken,
    });
    await app.listen(port, host);
    console.error(`[meeting-agent] listening on ${host}:${port}`);

    const shutdown = async (signal: string) => {
        console.error(`[meeting-agent] received ${signal}, shutting down`);
        try { await app.close(); } catch { /* ignore */ }
        process.exit(0);
    };
    process.on('SIGTERM', () => void shutdown('SIGTERM'));
    process.on('SIGINT', () => void shutdown('SIGINT'));
}

if (process.env['MEETING_AGENT_AUTOSTART'] === '1') {
    void bootFromEnv().catch((error) => {
        console.error(`[meeting-agent] fatal: ${(error as Error).message}`);
        process.exit(1);
    });
}
