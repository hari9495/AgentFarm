/**
 * Support Chat Session — WebSocket Route
 *
 * GET /v1/support/chat-session — upgrades to WebSocket.
 *
 * Session lifecycle:
 *   1. Client connects with ?issueId=<id> (optional — creates new issue if absent)
 *   2. Client sends JSON: { type: 'message', text: string }
 *   3. Server forwards to support agent action handler
 *   4. Agent steps stream back as:  { type: 'step',  text, status }
 *   5. Agent reply streams back as: { type: 'reply', text }
 *   6. Config fix applied:          { type: 'fix',   tier, description }
 *
 * Auth: session cookie required. Missing/expired session → 401 before upgrade.
 *
 * The WebSocket upgrade is handled via the raw Node.js HTTP server `upgrade`
 * event, using the `ws` library. Fastify injects the handler via
 * registerSupportChatSessionRoutes which attaches to app.server.
 */

import { WebSocketServer, type WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { issueStore, addDiagnosisStep, updateIssueStatus, pushIssueUpdate, type SupportIssueRecord } from './support-issue.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    expiresAt: number;
};

export type ChatFrameType = 'step' | 'reply' | 'fix' | 'error' | 'connected';

export interface ChatFrame {
    type: ChatFrameType;
    text?: string;
    status?: string;
    tier?: number;
    description?: string;
    issueId?: string;
}

export interface ChatMessage {
    type: 'message';
    text: string;
    issueId?: string;
}

// ---------------------------------------------------------------------------
// In-process dispatch — calls agentfarm_support_* actions in agent-runtime
// ---------------------------------------------------------------------------

async function dispatchToSupportAgent(
    actionType: string,
    payload: Record<string, unknown>,
    gatewayBaseUrl: string,
    serviceToken: string,
): Promise<{ ok: boolean; output: string; errorOutput?: string }> {
    try {
        const res = await fetch(`${gatewayBaseUrl.replace(/\/+$/, '')}/v1/runtime/actions/internal`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                Authorization: `Bearer ${serviceToken}`,
            },
            body: JSON.stringify({ actionType, payload }),
            signal: AbortSignal.timeout(30_000),
        });
        if (!res.ok) {
            return { ok: false, output: '', errorOutput: `HTTP ${res.status}` };
        }
        return res.json() as Promise<{ ok: boolean; output: string; errorOutput?: string }>;
    } catch (err) {
        return { ok: false, output: '', errorOutput: err instanceof Error ? err.message : String(err) };
    }
}

function sendFrame(ws: WebSocket, frame: ChatFrame): void {
    if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(frame));
    }
}

// ---------------------------------------------------------------------------
// Handle a single chat message from a connected client
// ---------------------------------------------------------------------------

async function handleChatMessage(
    ws: WebSocket,
    tenantId: string,
    text: string,
    issueId: string,
    gatewayBaseUrl: string,
    serviceToken: string,
): Promise<void> {
    // Step 1: run diagnosis
    addDiagnosisStep(issueId, {
        issueId,
        stepType: 'reading',
        description: 'Reading platform state for your workspace...',
        status: 'running',
        metadata: {},
    });
    sendFrame(ws, { type: 'step', text: 'Reading platform state for your workspace...', status: 'running' });
    updateIssueStatus(issueId, { status: 'diagnosing' });

    const diagResult = await dispatchToSupportAgent(
        'agentfarm_support_diagnose',
        { tenantId, timeWindowHours: 4 },
        gatewayBaseUrl,
        serviceToken,
    );

    let diagnosisReport: Record<string, unknown> | null = null;
    if (diagResult.ok && diagResult.output) {
        try {
            diagnosisReport = JSON.parse(diagResult.output) as Record<string, unknown>;
            addDiagnosisStep(issueId, {
                issueId,
                stepType: 'found',
                description: 'Diagnosis complete',
                status: 'done',
                metadata: { summary: (diagnosisReport['summary'] as string[]) ?? [] },
            });
            sendFrame(ws, { type: 'step', text: 'Diagnosis complete', status: 'done' });

            // Update issue with report
            updateIssueStatus(issueId, { diagnosisReport });
        } catch {
            sendFrame(ws, { type: 'step', text: 'Partial diagnosis (report parse error)', status: 'done' });
        }
    } else {
        addDiagnosisStep(issueId, {
            issueId,
            stepType: 'found',
            description: 'Diagnosis degraded — proceeding with available data',
            status: 'done',
            metadata: {},
        });
        sendFrame(ws, { type: 'step', text: 'Proceeding with available data', status: 'done' });
    }

    // Step 2: attempt Tier 1 fix
    if (diagnosisReport) {
        addDiagnosisStep(issueId, {
            issueId,
            stepType: 'applying',
            description: 'Applying Tier 1 config fixes...',
            status: 'running',
            metadata: {},
        });
        sendFrame(ws, { type: 'step', text: 'Applying Tier 1 config fixes...', status: 'running' });
        updateIssueStatus(issueId, { status: 'fixing', tierReached: 1 });

        const fixResult = await dispatchToSupportAgent(
            'agentfarm_support_config_fix',
            { tenantId, diagnosisReport },
            gatewayBaseUrl,
            serviceToken,
        );

        if (fixResult.ok && fixResult.output) {
            try {
                const fix = JSON.parse(fixResult.output) as { applied?: boolean; fixes?: Array<{ description?: string; type?: string; ok?: boolean }> };
                for (const f of fix.fixes ?? []) {
                    if (f.type !== 'no_fix_needed') {
                        addDiagnosisStep(issueId, {
                            issueId,
                            stepType: f.ok ? 'fixed' : 'failed',
                            description: f.description ?? '',
                            status: f.ok ? 'done' : 'failed',
                            metadata: { fixType: f.type },
                        });
                        sendFrame(ws, { type: 'fix', tier: 1, description: f.description ?? '' });
                    }
                }
                if (fix.applied) {
                    updateIssueStatus(issueId, { fixApplied: true, tierReached: 1 });
                }
            } catch { /* ignore parse errors */ }
        }
    }

    // Step 3: compose chat reply
    const replyResult = await dispatchToSupportAgent(
        'agentfarm_support_chat_reply',
        {
            tenantId,
            issueId,
            customerMessage: text,
            diagnosisReport,
        },
        gatewayBaseUrl,
        serviceToken,
    );

    if (replyResult.ok && replyResult.output) {
        try {
            const parsed = JSON.parse(replyResult.output) as { text?: string };
            sendFrame(ws, { type: 'reply', text: parsed.text ?? replyResult.output });
        } catch {
            sendFrame(ws, { type: 'reply', text: replyResult.output });
        }
    } else {
        // Fallback: compose a basic reply from diagnosis summary
        const summary = diagnosisReport
            ? ((diagnosisReport['summary'] as string[]) ?? []).join('; ') || 'Diagnosis completed.'
            : 'I was unable to fully diagnose the issue right now.';
        sendFrame(ws, { type: 'reply', text: `I've analysed your platform. ${summary} I've applied available automatic fixes. Please let me know if the issue persists.` });
    }
}

// ---------------------------------------------------------------------------
// Route options
// ---------------------------------------------------------------------------

export interface RegisterSupportChatSessionRoutesOptions {
    getSession: (req: FastifyRequest) => SessionContext | null;
    /** Optional async lookup for portal_session cookie — used when agentfarm_session is absent. */
    getPortalSession?: (cookies: string) => Promise<SessionContext | null>;
    gatewayBaseUrl?: string;
    serviceToken?: string;
    /** Milliseconds of inactivity before the session is terminated. Default: SUPPORT_SESSION_TIMEOUT_MS env var, then 10 minutes. */
    sessionTimeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export async function registerSupportChatSessionRoutes(
    app: FastifyInstance,
    opts: RegisterSupportChatSessionRoutesOptions,
): Promise<void> {
    const { getSession, getPortalSession } = opts;
    const gatewayBaseUrl = opts.gatewayBaseUrl ?? process.env['GATEWAY_BASE_URL'] ?? 'http://localhost:3000';
    const serviceToken = opts.serviceToken ?? process.env['RUNTIME_TASK_SHARED_TOKEN'] ?? '';
    const sessionTimeoutMs =
        opts.sessionTimeoutMs ?? Number(process.env['SUPPORT_SESSION_TIMEOUT_MS'] ?? 10 * 60_000);

    // Create a WebSocket server that piggybacks on the existing HTTP server
    // (noServer:true means it does NOT create its own HTTP server)
    const wss = new WebSocketServer({ noServer: true });

    // Attach to Fastify's underlying HTTP server after it is ready
    app.server.on('upgrade', (req, socket, head) => {
        void (async () => {
            const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
            if (url.pathname !== '/v1/support/chat-session') {
                socket.destroy();
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

    wss.on('connection', (ws: WebSocket, _req: unknown, session: SessionContext) => {
        let currentIssueId: string | null = null;

        // Inactivity timer — resets on every message, fires if the client goes silent
        let inactivityTimer: NodeJS.Timeout | null = null;

        function resetInactivityTimer(): void {
            if (inactivityTimer) clearTimeout(inactivityTimer);
            inactivityTimer = setTimeout(() => {
                sendFrame(ws, { type: 'error', text: 'Session closed due to inactivity' });
                ws.close(1000, 'inactivity timeout');
            }, sessionTimeoutMs);
        }

        resetInactivityTimer();

        // Send connected frame with session info
        sendFrame(ws, { type: 'connected', issueId: currentIssueId ?? undefined });

        ws.on('message', (data) => {
            resetInactivityTimer();
            void (async () => {
                let msg: Partial<ChatMessage>;
                try {
                    msg = JSON.parse(data.toString()) as Partial<ChatMessage>;
                } catch {
                    sendFrame(ws, { type: 'error', text: 'Invalid JSON message' });
                    return;
                }

                if (msg.type !== 'message' || typeof msg.text !== 'string' || !msg.text.trim()) {
                    sendFrame(ws, { type: 'error', text: 'Expected { type: "message", text: "..." }' });
                    return;
                }

                // Resolve issue: use provided issueId or create a new one
                if (msg.issueId && issueStore.has(msg.issueId)) {
                    const existing = issueStore.get(msg.issueId)!;
                    if (existing.tenantId !== session.tenantId) {
                        sendFrame(ws, { type: 'error', text: 'Forbidden' });
                        return;
                    }
                    currentIssueId = msg.issueId;
                } else {
                    const issue: SupportIssueRecord = {
                        id: randomUUID(),
                        tenantId: session.tenantId,
                        workspaceId: null,
                        title: msg.text.slice(0, 100),
                        description: msg.text,
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
                    sendFrame(ws, { type: 'connected', issueId: currentIssueId });
                }

                await handleChatMessage(
                    ws,
                    session.tenantId,
                    msg.text,
                    currentIssueId,
                    gatewayBaseUrl,
                    serviceToken,
                );
            })();
        });

        ws.on('close', () => {
            if (inactivityTimer) clearTimeout(inactivityTimer);
        });

        ws.on('error', (err) => {
            if (inactivityTimer) clearTimeout(inactivityTimer);
            console.warn('[support-chat-session] ws error:', err.message);
        });
    });
}
