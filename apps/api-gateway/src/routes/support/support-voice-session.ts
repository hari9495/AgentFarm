/**
 * Support Voice Session — WebSocket Route
 *
 * GET /v1/support/voice-session — upgrades to WebSocket.
 *
 * Session lifecycle:
 *   1. Client connects (session cookie required)
 *   2. Server sends: { type: 'connected', issueId? }
 *   3. Client streams binary audio frames
 *   4. Server emits: { type: 'transcript_partial', text } on partial STT results
 *   5. Server emits: { type: 'transcript_final', text, languageCode } on final STT
 *   6. Server processes final transcript through agentfarm_support_voice_reply
 *   7. Server streams TTS audio back as binary frames
 *   8. Server emits: { type: 'tts_done' } when audio stream ends
 *
 * Auth: session cookie required. Missing/expired session → 401 before upgrade.
 */

import { WebSocketServer, type WebSocket } from 'ws';
import type { IncomingMessage } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { SarvamRealtimeSttClient, SarvamRealtimeTtsClient } from '@agentfarm/meeting-agent';
import { issueStore, pushIssueUpdate, type SupportIssueRecord } from './support-issue.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    expiresAt: number;
};

export type VoiceFrameType =
    | 'connected'
    | 'transcript_partial'
    | 'transcript_final'
    | 'voice_reply'
    | 'tts_done'
    | 'error';

export interface VoiceFrame {
    type: VoiceFrameType;
    text?: string;
    languageCode?: string;
    issueId?: string;
}

// ---------------------------------------------------------------------------
// In-process dispatch — same pattern as support-chat-session.ts
// ---------------------------------------------------------------------------

async function dispatchVoiceReply(
    tenantId: string,
    transcript: string,
    languageCode: string,
    issueId: string,
    gatewayBaseUrl: string,
    serviceToken: string,
): Promise<{ text: string; languageCode: string }> {
    try {
        const res = await fetch(
            `${gatewayBaseUrl.replace(/\/+$/, '')}/v1/runtime/actions/internal`,
            {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    Authorization: `Bearer ${serviceToken}`,
                },
                body: JSON.stringify({
                    actionType: 'agentfarm_support_voice_reply',
                    payload: { tenantId, transcript, languageCode, issueId },
                }),
                signal: AbortSignal.timeout(30_000),
            },
        );
        if (res.ok) {
            const data = await res.json() as { ok: boolean; output?: string };
            if (data.ok && data.output) {
                const parsed = JSON.parse(data.output) as { text?: string; languageCode?: string };
                return {
                    text: parsed.text ?? transcript,
                    languageCode: parsed.languageCode ?? languageCode,
                };
            }
        }
    } catch { /* fall through to default */ }

    // Fallback reply when action handler is unavailable
    return {
        text: `I heard you say: "${transcript}". I'm processing your request and will respond shortly.`,
        languageCode,
    };
}

function sendFrame(ws: WebSocket, frame: VoiceFrame): void {
    if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(frame));
    }
}

// ---------------------------------------------------------------------------
// Route options
// ---------------------------------------------------------------------------

export interface RegisterSupportVoiceSessionRoutesOptions {
    getSession: (req: FastifyRequest) => SessionContext | null;
    /** Optional async lookup for portal_session cookie — used when agentfarm_session is absent. */
    getPortalSession?: (cookies: string) => Promise<SessionContext | null>;
    gatewayBaseUrl?: string;
    serviceToken?: string;
    sarvamApiKey?: string;
    /** Milliseconds of inactivity before the session is terminated. Default: SUPPORT_SESSION_TIMEOUT_MS env var, then 10 minutes. */
    sessionTimeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export async function registerSupportVoiceSessionRoutes(
    app: FastifyInstance,
    opts: RegisterSupportVoiceSessionRoutesOptions,
): Promise<void> {
    const { getSession, getPortalSession } = opts;
    const gatewayBaseUrl =
        opts.gatewayBaseUrl ?? process.env['GATEWAY_BASE_URL'] ?? 'http://localhost:3000';
    const serviceToken =
        opts.serviceToken ?? process.env['RUNTIME_TASK_SHARED_TOKEN'] ?? '';
    const sarvamApiKey =
        opts.sarvamApiKey ?? process.env['SARVAM_API_KEY'] ?? '';
    const sessionTimeoutMs =
        opts.sessionTimeoutMs ?? Number(process.env['SUPPORT_SESSION_TIMEOUT_MS'] ?? 10 * 60_000);

    const wss = new WebSocketServer({ noServer: true });

    app.server.on('upgrade', (req, socket, head) => {
        void (async () => {
            const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
            if (url.pathname !== '/v1/support/voice-session') {
                return;
            }

            const rawCookie = req.headers['cookie'] ?? '';
            const mockReq = { headers: { cookie: rawCookie } } as unknown as FastifyRequest;
            let session: SessionContext | null = getSession(mockReq);

            // Fall back to portal_session if no agentfarm_session present
            if ((!session || session.expiresAt < Date.now()) && getPortalSession) {
                session = await getPortalSession(rawCookie);
            }

            if (!session || session.expiresAt < Date.now()) {
                socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
                socket.destroy();
                return;
            }

            wss.handleUpgrade(req, socket, head, (ws) => {
                wss.emit('connection', ws, req, session!);
            });
        })();
    });

    wss.on('connection', (ws: WebSocket, req: unknown, session: SessionContext) => {
        // Read optional ?issueId= from the upgrade request URL for session resume
        const httpReq = req as IncomingMessage;
        const upgradeUrl = new URL(httpReq.url ?? '/', 'http://localhost');
        const resumeIssueId = upgradeUrl.searchParams.get('issueId');

        let currentIssueId: string | null = null;
        let currentLanguageCode = 'hi-IN';

        // Forward-declared so the inactivity timer closure can reference it
        let stt: InstanceType<typeof SarvamRealtimeSttClient> | null = null;

        // Inactivity timer — resets on every audio chunk, fires if the client goes silent
        let inactivityTimer: NodeJS.Timeout | null = null;

        function resetInactivityTimer(): void {
            if (inactivityTimer) clearTimeout(inactivityTimer);
            inactivityTimer = setTimeout(() => {
                sendFrame(ws, { type: 'error', text: 'Session closed due to inactivity' });
                stt?.endSession();
                ws.close(1000, 'inactivity timeout');
            }, sessionTimeoutMs);
        }

        // Resume existing issue if ?issueId= was provided and belongs to this tenant;
        // otherwise create a fresh issue for this voice session.
        const resumable = resumeIssueId && issueStore.has(resumeIssueId)
            ? issueStore.get(resumeIssueId)!
            : null;

        if (resumable && resumable.tenantId === session.tenantId) {
            currentIssueId = resumable.id;
        } else {
            const issue: SupportIssueRecord = {
                id: randomUUID(),
                tenantId: session.tenantId,
                workspaceId: null,
                title: 'Voice support session',
                description: 'Voice support session initiated',
                status: 'open',
                severity: 'medium',
                tierReached: null,
                fixApplied: false,
                diagnosisReport: null,
                resolutionNotes: null,
                escalatedTo: null,
                createdAt: new Date().toISOString(),
                resolvedAt: null,
            };
            issueStore.set(issue.id, issue);
            pushIssueUpdate(issue);
            currentIssueId = issue.id;
        }

        sendFrame(ws, { type: 'connected', issueId: currentIssueId });

        // Sarvam STT client — only instantiate when API key is configured
        stt = sarvamApiKey ? new SarvamRealtimeSttClient({
            apiKey: sarvamApiKey,
            languageCode: 'hi-IN',
            callbacks: {
                onPartialTranscript: (text) => {
                    sendFrame(ws, { type: 'transcript_partial', text });
                },
                onFinalTranscript: (text, languageCode) => {
                    currentLanguageCode = languageCode;
                    sendFrame(ws, { type: 'transcript_final', text, languageCode });

                    void (async () => {
                        const reply = await dispatchVoiceReply(
                            session.tenantId,
                            text,
                            languageCode,
                            currentIssueId!,
                            gatewayBaseUrl,
                            serviceToken,
                        );

                        sendFrame(ws, { type: 'voice_reply', text: reply.text, languageCode: reply.languageCode });

                        const tts = new SarvamRealtimeTtsClient({ apiKey: sarvamApiKey });
                        try {
                            for await (const chunk of tts.synthesizeStream(reply.text, reply.languageCode)) {
                                if (ws.readyState === ws.OPEN) {
                                    ws.send(Buffer.from(chunk));
                                }
                            }
                        } catch (err) {
                            sendFrame(ws, {
                                type: 'error',
                                text: `TTS error: ${err instanceof Error ? err.message : String(err)}`,
                            });
                        }

                        sendFrame(ws, { type: 'tts_done' });
                    })();
                },
                onError: (err) => {
                    sendFrame(ws, { type: 'error', text: `STT error: ${err.message}` });
                },
            },
        }) : null;

        stt?.startSession();
        resetInactivityTimer();

        ws.on('message', (data, isBinary) => {
            resetInactivityTimer();
            if (isBinary) {
                const buf = data instanceof Buffer ? data : Buffer.from(data as ArrayBuffer);
                stt?.sendAudioChunk(buf);
            } else {
                sendFrame(ws, { type: 'error', text: 'Text frames not supported on voice session' });
            }
        });

        ws.on('close', () => {
            if (inactivityTimer) clearTimeout(inactivityTimer);
            stt?.endSession();
        });

        ws.on('error', (err) => {
            if (inactivityTimer) clearTimeout(inactivityTimer);
            console.warn('[support-voice-session] ws error:', err.message);
            stt?.endSession();
        });
    });
}
