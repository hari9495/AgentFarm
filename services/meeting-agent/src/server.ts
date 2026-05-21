/**
 * Meeting-agent HTTP control API.
 *
 * Exposes a minimal REST surface used by `apps/agent-runtime` and the
 * dashboard:
 *
 *   POST   /v1/sessions                  → create session (returns id + record)
 *   GET    /v1/sessions/:id              → fetch session record
 *   POST   /v1/sessions/:id/start        → mark session as listening
 *   POST   /v1/sessions/:id/say          → synthesise + record an agent line
 *   GET    /v1/sessions/:id/transcript   → fetch the transcript log
 *   POST   /v1/sessions/:id/stop         → mark session as completed
 *   GET    /health                       → liveness
 *
 * The audio capture / Pipecat pipeline runs in a sidecar container inside
 * the desktop-agent VM and is not represented in this control plane; this
 * server stores the lifecycle state, drives TTS via {@link SupertonicClient},
 * and persists the transcript log in memory.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { SessionManager } from './session-manager.js';
import type { ManagedSession } from './session-manager.js';
import { SupertonicClient } from './supertonic-client.js';
import type { VoiceInjector } from './voice-injector.js';
import type { CaptureController } from './capture-controller.js';
import type { MeetingMode, MeetingPlatform } from '@agentfarm/shared-types';
import { MeetingBrain } from './meeting-brain.js';
import type { BrainTurn } from './meeting-brain.js';
import { MeetingEpisodicMemory } from './meeting-episodic-memory.js';

const ALLOWED_PLATFORMS: ReadonlySet<MeetingPlatform> = new Set([
    'teams',
    'zoom',
    'meet',
    'webex',
]);
const ALLOWED_MODES: ReadonlySet<MeetingMode> = new Set([
    'standup',
    'interactive_qa',
    'interview_assistant',
]);

export interface MeetingAgentServerOptions {
    sessionManager?: SessionManager;
    tts?: SupertonicClient | null;
    /**
     * Optional voice injector. When set, the synthesised audio from `/say`
     * is forwarded to the desktop-agent voice sidecar so it lands on the
     * meeting client's microphone via PulseAudio. Failures are recorded on
     * the response but never abort the lifecycle transition.
     */
    voiceInjector?: VoiceInjector | null;
    /**
     * Optional capture controller. When set, `/v1/sessions/:id/start` will
     * instruct the desktop-agent voice sidecar to begin live capture and
     * `/v1/sessions/:id/stop` will halt it. The sidecar POSTs each finalised
     * utterance back to `/v1/sessions/:id/transcript/inbound` on this same
     * server using {@link publicBaseUrl}.
     */
    captureController?: CaptureController | null;
    /**
     * Public base URL clients (specifically the sidecar) can reach this
     * server on, e.g. `http://meeting-agent:7799`. Used to construct the
     * callback URL the sidecar posts inbound utterances to. Defaults to
     * `http://meeting-agent:7799` to match the in-cluster service name.
     */
    publicBaseUrl?: string;
    /**
     * Base URL of the desktop-agent HTTP API (port 5003), e.g.
     * `http://desktop-agent:5003`. When set, `POST /v1/sessions/:id/join`
     * will forward a `/v1/meeting/join` request to the desktop-agent so the
     * Chromium browser actually navigates to the meeting URL. When not set
     * the browser join step is skipped (useful in unit tests).
     */
    desktopAgentUrl?: string | null;
    /**
     * Text the agent automatically speaks (and marks as disclosed) on the
     * very first call to `/say` for each session, satisfying EU AI Act
     * Article 52 disclosure requirements without requiring callers to manage
     * the `disclosureAnnounced` flag manually.
     *
     * The disclosure phrase is prepended to the first utterance so it is
     * synthesised as a single TTS call. Set to `null` to disable auto-
     * disclosure (callers must then pass `disclosureAnnounced: true` in the
     * request body before speaking).
     *
     * @default "Just so everyone knows, I'm an AI assistant participating in this meeting."
     */
    disclosureText?: string | null;
    /**
     * Optional LLM brain. When set, every inbound participant utterance is
     * forwarded to the LLM and — if the LLM returns a non-empty reply — the
     * agent automatically speaks via the same TTS + voice-injection pipeline
     * used by `POST /v1/sessions/:id/say`. When not set the agent is mute
     * unless explicitly triggered via `/say`.
     */
    brain?: MeetingBrain | null;
    /**
     * Optional per-speaker episodic memory.  When provided, the last N
     * exchanges with the speaking participant are retrieved before every
     * `brain.think()` call and injected into the system prompt so the LLM
     * remembers past interactions.  Each successful agent reply is recorded
     * back into memory automatically.
     */
    memory?: MeetingEpisodicMemory | null;
    /** Bearer token clients must present in `Authorization`. */
    authToken?: string;
    /** Logger override (defaults to `console.error`). */
    logger?: (line: string) => void;
}

export interface MeetingAgentApp {
    server: Server;
    sessions: SessionManager;
    listen: (port: number, host?: string) => Promise<void>;
    close: () => Promise<void>;
}

const MAX_BODY_BYTES = 1024 * 64; // 64 KiB; we never accept audio over JSON

const DEFAULT_DISCLOSURE_TEXT = "Just so everyone knows, I'm an AI assistant participating in this meeting.";

export function createMeetingAgentServer(
    options: MeetingAgentServerOptions = {},
): MeetingAgentApp {
    const sessions = options.sessionManager ?? new SessionManager();
    const tts = options.tts ?? null;
    const voiceInjector = options.voiceInjector ?? null;
    const captureController = options.captureController ?? null;
    const publicBaseUrl = (options.publicBaseUrl ?? 'http://meeting-agent:7799').replace(/\/+$/u, '');
    const log = options.logger ?? ((line: string) => console.error(line));
    // null explicitly disables auto-disclosure; undefined uses the default text.
    const disclosureText = options.disclosureText === null ? null
        : (options.disclosureText?.trim() || DEFAULT_DISCLOSURE_TEXT);
    const desktopAgentUrl = options.desktopAgentUrl
        ? options.desktopAgentUrl.replace(/\/+$/u, '')
        : null;
    const brain = options.brain ?? null;
    const memory = options.memory ?? null;

    const server = createServer(async (req, res) => {
        try {
            await handle(req, res, {
                sessions,
                tts,
                voiceInjector,
                captureController,
                publicBaseUrl,
                authToken: options.authToken,
                disclosureText,
                desktopAgentUrl,
                brain,
                memory,
                log,
            });
        } catch (error) {
            log(`[meeting-agent] request error: ${(error as Error).message}`);
            if (!res.headersSent) {
                respond(res, 500, { error: 'internal_error' });
            } else {
                res.end();
            }
        }
    });

    return {
        server,
        sessions,
        listen: (port, host = '0.0.0.0') =>
            new Promise<void>((resolve, reject) => {
                server.once('error', reject);
                server.listen(port, host, () => resolve());
            }),
        close: () =>
            new Promise<void>((resolve, reject) => {
                server.close((err) => (err ? reject(err) : resolve()));
            }),
    };
}

interface HandleContext {
    sessions: SessionManager;
    tts: SupertonicClient | null;
    voiceInjector: VoiceInjector | null;
    captureController: CaptureController | null;
    publicBaseUrl: string;
    authToken: string | undefined;
    /** Auto-disclosure phrase prepended to the first agent utterance. null = disabled. */
    disclosureText: string | null;
    /** Base URL of the desktop-agent HTTP API (port 5003). null = browser join disabled. */
    desktopAgentUrl: string | null;
    /** LLM brain for autonomous meeting responses. null = brain disabled. */
    brain: MeetingBrain | null;
    /** Per-speaker episodic memory. null = memory disabled. */
    memory: MeetingEpisodicMemory | null;
    log: (line: string) => void;
}

/** Maps a meeting URL to its platform identifier. Returns null for unrecognised URLs. */
function detectPlatform(meetingUrl: string): MeetingPlatform | null {
    if (/^https:\/\/meet\.google\.com\//u.test(meetingUrl)) return 'meet';
    if (/^https:\/\/teams\.microsoft\.com\//u.test(meetingUrl)) return 'teams';
    if (/^https:\/\/teams\.live\.com\//u.test(meetingUrl)) return 'teams';
    if (/^https?:\/\/([a-z0-9-]+\.)?zoom\.us\//u.test(meetingUrl)) return 'zoom';
    return null;
}

async function handle(
    req: IncomingMessage,
    res: ServerResponse,
    ctx: HandleContext,
): Promise<void> {
    const method = req.method ?? 'GET';
    const url = new URL(req.url ?? '/', 'http://meeting-agent.local');
    const path = url.pathname;

    if (path === '/health' && method === 'GET') {
        respond(res, 200, { ok: true, sessions: ctx.sessions.size() });
        return;
    }

    if (!checkAuth(req, ctx.authToken)) {
        respond(res, 401, { error: 'unauthorized' });
        return;
    }

    if (path === '/v1/sessions' && method === 'POST') {
        const body = await readJson(req);
        const errors = validateCreate(body);
        if (errors.length > 0) {
            respond(res, 400, { error: 'invalid_request', details: errors });
            return;
        }
        const record = ctx.sessions.create({
            tenantId: body['tenantId'] as string,
            workspaceId: body['workspaceId'] as string,
            botId: body['botId'] as string,
            platform: body['platform'] as MeetingPlatform,
            mode: body['mode'] as MeetingMode,
            meetingId: body['meetingId'] as string,
            meetingUrl: typeof body['meetingUrl'] === 'string' ? (body['meetingUrl'] as string) : undefined,
            correlationId: typeof body['correlationId'] === 'string' ? (body['correlationId'] as string) : undefined,
        });
        respond(res, 201, { session: record });
        return;
    }

    const sessionMatch = path.match(/^\/v1\/sessions\/([A-Za-z0-9_-]+)(?:\/([A-Za-z0-9_-]+)(?:\/([A-Za-z0-9_-]+))?)?$/u);
    if (sessionMatch) {
        const id = sessionMatch[1]!;
        const action = sessionMatch[2];
        const subAction = sessionMatch[3];
        const session = ctx.sessions.get(id);
        if (!session) {
            respond(res, 404, { error: 'session_not_found' });
            return;
        }

        if (!action && method === 'GET') {
            respond(res, 200, { session: session.machine.getSession() });
            return;
        }

        if (action === 'start' && !subAction && method === 'POST') {
            try {
                session.machine.transition('join_requested');
                session.machine.transition('joining');
                session.machine.transition('joined');
                session.machine.transition('listening');
            } catch (error) {
                respond(res, 409, { error: 'invalid_transition', detail: (error as Error).message });
                return;
            }
            ctx.sessions.appendTranscript(id, { source: 'system', text: 'session started' });

            let capture: { ok: boolean; captureId?: string; error?: string } | undefined;
            if (ctx.captureController) {
                try {
                    capture = await ctx.captureController.start({
                        sessionId: id,
                        callbackUrl: `${ctx.publicBaseUrl}/v1/sessions/${id}/transcript/inbound`,
                        callbackToken: ctx.authToken,
                    });
                } catch (error) {
                    capture = { ok: false, error: (error as Error).message };
                }
                if (!capture.ok) {
                    ctx.log(
                        `[meeting-agent] capture start failed for session ${id}: ${capture.error ?? 'unknown'}`,
                    );
                }
            }

            respond(res, 200, {
                session: session.machine.getSession(),
                ...(capture ? { capture } : {}),
            });
            return;
        }

        // POST /v1/sessions/:id/join — unified browser-join + capture-start.
        //
        // Detects the meeting platform from the URL, asks the desktop-agent
        // container to launch the appropriate Playwright join script, then
        // advances the FSM to `joining` and schedules the `joined → listening`
        // + capture-start transition after `joinDelayMs` (default 8 s) so the
        // browser has time to complete the join flow before STT capture begins.
        //
        // Callers should poll GET /v1/sessions/:id until status === 'listening'.
        if (action === 'join' && !subAction && method === 'POST') {
            const body = await readJson(req);
            const meetingUrl = typeof body['meetingUrl'] === 'string' ? (body['meetingUrl'] as string).trim() : '';
            if (!meetingUrl) {
                respond(res, 400, { error: 'invalid_request', details: ['meetingUrl is required'] });
                return;
            }
            const platform = detectPlatform(meetingUrl);
            if (!platform) {
                respond(res, 400, {
                    error: 'invalid_request',
                    details: ['meetingUrl must be a Google Meet, Microsoft Teams, or Zoom URL'],
                });
                return;
            }
            const displayName = typeof body['displayName'] === 'string'
                ? (body['displayName'] as string).trim()
                : undefined;
            // joinDelayMs: how long to wait before advancing FSM to listening.
            // Caller can tune it; we clamp to [2s, 60s].
            const joinDelayMs = typeof body['joinDelayMs'] === 'number'
                ? Math.min(Math.max(body['joinDelayMs'], 2_000), 60_000)
                : 8_000;

            try {
                session.machine.transition('join_requested');
                session.machine.transition('joining');
            } catch (error) {
                respond(res, 409, { error: 'invalid_transition', detail: (error as Error).message });
                return;
            }

            // Best-effort: tell the desktop-agent to launch the browser join script.
            let joinPid: number | null = null;
            if (ctx.desktopAgentUrl) {
                try {
                    const joinResp = await fetch(`${ctx.desktopAgentUrl}/v1/meeting/join`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ platform, url: meetingUrl, displayName }),
                    });
                    if (joinResp.ok) {
                        const joinData = await joinResp.json() as { pid?: number };
                        joinPid = typeof joinData.pid === 'number' ? joinData.pid : null;
                    } else {
                        ctx.log(`[meeting-agent] desktop-agent /v1/meeting/join returned ${joinResp.status}`);
                    }
                } catch (error) {
                    ctx.log(`[meeting-agent] desktop-agent join call failed: ${(error as Error).message}`);
                }
            } else {
                ctx.log('[meeting-agent] DESKTOP_AGENT_URL not set — browser join skipped; FSM will still advance');
            }

            // Advance FSM to listening and start capture after the join delay.
            // This is fire-and-forget: errors are logged, never surfaced to caller.
            setTimeout(() => {
                void (async () => {
                    const s = ctx.sessions.get(id);
                    if (!s) return; // session deleted while waiting
                    try {
                        s.machine.transition('joined');
                        s.machine.transition('listening');
                    } catch {
                        // Session was stopped/failed in the meantime — nothing to do.
                        return;
                    }
                    ctx.sessions.appendTranscript(id, {
                        source: 'system',
                        text: `joined ${platform} meeting`,
                    });
                    if (ctx.captureController) {
                        try {
                            await ctx.captureController.start({
                                sessionId: id,
                                callbackUrl: `${ctx.publicBaseUrl}/v1/sessions/${id}/transcript/inbound`,
                                callbackToken: ctx.authToken,
                            });
                        } catch (error) {
                            ctx.log(
                                `[meeting-agent] capture start failed after join for session ${id}: ${(error as Error).message}`,
                            );
                        }
                    }
                })();
            }, joinDelayMs);

            respond(res, 202, {
                session: session.machine.getSession(),
                platform,
                joinPid,
                joinDelayMs,
                message: `browser join launched; session will advance to listening in ~${Math.round(joinDelayMs / 1000)}s — poll GET /v1/sessions/${id} for status`,
            });
            return;
        }

        if (action === 'stop' && !subAction && method === 'POST') {
            try {
                session.machine.transition('completed');
            } catch (error) {
                respond(res, 409, { error: 'invalid_transition', detail: (error as Error).message });
                return;
            }
            ctx.sessions.appendTranscript(id, { source: 'system', text: 'session completed' });

            let capture: { ok: boolean; error?: string } | undefined;
            if (ctx.captureController) {
                try {
                    capture = await ctx.captureController.stop({ sessionId: id });
                } catch (error) {
                    capture = { ok: false, error: (error as Error).message };
                }
                if (!capture.ok) {
                    ctx.log(
                        `[meeting-agent] capture stop failed for session ${id}: ${capture.error ?? 'unknown'}`,
                    );
                }
            }

            respond(res, 200, {
                session: session.machine.getSession(),
                ...(capture ? { capture } : {}),
            });
            return;
        }

        if (action === 'transcript' && !subAction && method === 'GET') {
            respond(res, 200, { transcript: ctx.sessions.getTranscript(id) });
            return;
        }

        // Inbound transcript ingestion from the desktop-agent voice sidecar.
        // The sidecar POSTs each finalised utterance using the callback URL
        // we register at `/start` time. Bearer auth was already enforced by
        // `checkAuth` above; the same `MEETING_AGENT_TOKEN` is passed to the
        // sidecar as `callback_token` so it can echo it back here.
        if (action === 'transcript' && subAction === 'inbound' && method === 'POST') {
            const body = await readJson(req);
            const text = typeof body['text'] === 'string' ? (body['text'] as string).trim() : '';
            if (!text) {
                respond(res, 400, { error: 'invalid_request', details: ['text is required'] });
                return;
            }
            const sourceRaw = typeof body['source'] === 'string' ? (body['source'] as string) : 'participant';
            const source: 'participant' | 'agent' | 'system' =
                sourceRaw === 'agent' || sourceRaw === 'system' ? sourceRaw : 'participant';
            const speaker = typeof body['speaker'] === 'string' ? (body['speaker'] as string) : undefined;
            const at = typeof body['at'] === 'string' ? (body['at'] as string) : undefined;
            ctx.sessions.appendTranscript(id, { source, speaker, text, at });

            // When the brain is configured, asynchronously decide whether to reply
            // to the new participant utterance. The HTTP response is returned
            // immediately (202) — the LLM call runs fire-and-forget.
            if (ctx.brain && source === 'participant') {
                const currentStatus = session.machine.getSession().status;
                if (currentStatus === 'listening' || currentStatus === 'joined') {
                    void (async () => {
                        const transcript = ctx.sessions.getTranscript(id);
                        const history: BrainTurn[] = transcript
                            .filter((e) => e.source === 'participant' || e.source === 'agent')
                            .map((e) => ({
                                role: (e.source === 'agent' ? 'assistant' : 'user') as 'assistant' | 'user',
                                text: e.text,
                                speaker: e.speaker,
                            }));

                        // Build past-exchange context for this speaker and inject
                        // into the brain system prompt (avoids polluting history).
                        let memoryContext: string | undefined;
                        if (ctx.memory && speaker) {
                            try {
                                const block = await ctx.memory.buildContextBlock(speaker);
                                if (block) memoryContext = block;
                            } catch {
                                // Best-effort — never block execution on memory failure
                            }
                        }

                        let reply: string | null;
                        try {
                            reply = await ctx.brain!.think(history, { memoryContext });
                        } catch (err) {
                            ctx.log(`[meeting-agent] brain.think failed: ${(err as Error).message}`);
                            return;
                        }
                        if (!reply) return;

                        // Handle first-utterance disclosure for brain-triggered replies.
                        let finalText = reply;
                        if (!session.machine.getSession().disclosureAnnounced) {
                            if (ctx.disclosureText) {
                                finalText = `${ctx.disclosureText} ${reply}`;
                            }
                            session.machine.announceDisclosure();
                        }

                        const result = await doAgentSay(ctx, session, id, finalText);
                        if (result.status !== 'ok') {
                            ctx.log(
                                `[meeting-agent] brain-triggered say failed (${result.status}): ${result.detail}`,
                            );
                        } else if (ctx.memory && speaker && text) {
                            // Record the exchange so future interactions with
                            // this speaker benefit from episodic context.
                            ctx.memory.record(speaker, text, reply);
                        }
                    })();
                }
            }

            respond(res, 202, {
                accepted: true,
                length: ctx.sessions.getTranscript(id).length,
            });
            return;
        }

        if (action === 'say' && method === 'POST') {
            const body = await readJson(req);
            let text = typeof body['text'] === 'string' ? (body['text'] as string).trim() : '';
            if (!text) {
                respond(res, 400, { error: 'invalid_request', details: ['text is required'] });
                return;
            }

            // Auto-disclose on the first agent utterance so EU AI Act Article 52
            // is satisfied without callers needing to manage disclosureAnnounced.
            // When ctx.disclosureText is set (the default), the disclosure phrase
            // is prepended to the first /say text so participants hear it as one
            // natural utterance. Callers may still pass disclosureAnnounced: true
            // explicitly; both paths converge on the same announceDisclosure() call.
            const isFirstUtterance = !session.machine.getSession().disclosureAnnounced;
            if (isFirstUtterance) {
                if (ctx.disclosureText) {
                    text = `${ctx.disclosureText} ${text}`;
                }
                // Honour explicit caller-side flag too (no double-prepend).
                session.machine.announceDisclosure();
            } else if (body['disclosureAnnounced'] === true && !session.machine.getSession().disclosureAnnounced) {
                // Legacy path: caller explicitly set the flag after we've already
                // announced — no-op (announceDisclosure is idempotent via the FSM).
                session.machine.announceDisclosure();
            }

            const voice = typeof body['voice'] === 'string' ? (body['voice'] as string) : undefined;
            const sink = typeof body['sink'] === 'string' ? (body['sink'] as string) : undefined;
            const result = await doAgentSay(ctx, session, id, text, { voice, sink });

            if (result.status === 'invalid_transition') {
                respond(res, 409, { error: 'invalid_transition', detail: result.detail });
                return;
            }
            if (result.status === 'tts_failure') {
                respond(res, 502, { error: 'tts_failure', detail: result.detail });
                return;
            }
            respond(res, 200, {
                session: session.machine.getSession(),
                audioBytes: result.audioBytes,
                ...(result.injection ? { injection: result.injection } : {}),
            });
            return;
        }
    }

    respond(res, 404, { error: 'not_found', path });
}

// ── doAgentSay ─────────────────────────────────────────────────────────────────

type InjectionRecord = { ok: boolean; bytesPlayed?: number; sink?: string; error?: string };

type SayOutcome =
    | { status: 'ok'; audioBytes: number; injection: InjectionRecord | undefined }
    | { status: 'invalid_transition'; detail: string }
    | { status: 'tts_failure'; detail: string };

/**
 * Drive the FSM through `speaking → listening`, synthesise TTS, inject audio,
 * and append the agent turn to the transcript. Shared by the `/say` HTTP route
 * and the brain's autonomous response path.
 *
 * Returns a discriminated union so callers can produce the right HTTP status
 * code (for `/say`) or just log the error (for the brain path).
 */
async function doAgentSay(
    ctx: HandleContext,
    session: ManagedSession,
    id: string,
    text: string,
    opts: { voice?: string; sink?: string } = {},
): Promise<SayOutcome> {
    try {
        session.machine.transition('speaking');
    } catch (error) {
        return { status: 'invalid_transition', detail: (error as Error).message };
    }

    let audioBytes = 0;
    let synthesisedAudio: ArrayBuffer | undefined;
    let audioContentType: string | undefined;

    if (ctx.tts) {
        try {
            const result = await ctx.tts.synthesize(text, { voice: opts.voice });
            audioBytes = result.audio.byteLength;
            synthesisedAudio = result.audio;
            audioContentType = result.contentType;
        } catch (error) {
            ctx.log(`[meeting-agent] tts failure: ${(error as Error).message}`);
            // Roll the FSM back so the session can recover.
            try { session.machine.transition('listening'); } catch { /* swallow */ }
            return { status: 'tts_failure', detail: (error as Error).message };
        }
    }

    // Best-effort fan-out to the desktop-agent voice sidecar. Failures are
    // recorded in the return value but never tear down the FSM.
    let injection: InjectionRecord | undefined;
    if (ctx.voiceInjector && synthesisedAudio && synthesisedAudio.byteLength > 0) {
        try {
            injection = await ctx.voiceInjector.inject({
                audio: synthesisedAudio,
                contentType: audioContentType ?? 'audio/mpeg',
                sessionId: id,
                sink: opts.sink,
            });
        } catch (error) {
            injection = { ok: false, error: (error as Error).message };
        }
        if (!injection.ok) {
            ctx.log(`[meeting-agent] voice injection failed for session ${id}: ${injection.error ?? 'unknown'}`);
        }
    }

    ctx.sessions.appendTranscript(id, { source: 'agent', text });
    try { session.machine.transition('listening'); } catch { /* terminal state */ }
    return { status: 'ok', audioBytes, injection };
}

function validateCreate(body: Record<string, unknown>): string[] {
    const errors: string[] = [];
    for (const field of ['tenantId', 'workspaceId', 'botId', 'meetingId']) {
        if (typeof body[field] !== 'string' || !(body[field] as string).trim()) {
            errors.push(`${field} is required`);
        }
    }
    if (typeof body['platform'] !== 'string' || !ALLOWED_PLATFORMS.has(body['platform'] as MeetingPlatform)) {
        errors.push(`platform must be one of ${[...ALLOWED_PLATFORMS].join(',')}`);
    }
    if (typeof body['mode'] !== 'string' || !ALLOWED_MODES.has(body['mode'] as MeetingMode)) {
        errors.push(`mode must be one of ${[...ALLOWED_MODES].join(',')}`);
    }
    return errors;
}

function checkAuth(req: IncomingMessage, token: string | undefined): boolean {
    if (!token) return true;
    const header = req.headers['authorization'];
    if (!header || Array.isArray(header)) return false;
    return header === `Bearer ${token}`;
}

function respond(res: ServerResponse, status: number, body: unknown): void {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(payload),
    });
    res.end(payload);
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
    return await new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        let total = 0;
        req.on('data', (chunk: Buffer) => {
            total += chunk.length;
            if (total > MAX_BODY_BYTES) {
                reject(new Error('request body too large'));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => {
            if (chunks.length === 0) {
                resolve({});
                return;
            }
            try {
                const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
                resolve(parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {});
            } catch (error) {
                reject(new Error(`invalid json: ${(error as Error).message}`));
            }
        });
        req.on('error', reject);
    });
}
