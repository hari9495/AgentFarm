import { randomUUID } from 'crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type {
    DesktopSessionRecord,
    DesktopVisionTaskRecord,
} from '@agentfarm/shared-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    scope?: 'customer' | 'internal';
    expiresAt: number;
};

type CreateSessionBody = { botId?: unknown };
type SessionIdParams = { sessionId: string };
type SubmitTaskBody = { goal?: unknown; botId?: unknown };

export type RegisterDesktopSessionsRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
    desktopAgentUrl?: string;
};

// ---------------------------------------------------------------------------
// Desktop-agent HTTP client
// ---------------------------------------------------------------------------

async function agentFetch(
    baseUrl: string,
    path: string,
    init?: RequestInit,
): Promise<{ status: number; body: unknown }> {
    const url = `${baseUrl.replace(/\/$/, '')}${path}`;
    const hasBody = init?.body !== undefined;
    const res = await fetch(url, {
        ...init,
        headers: {
            ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
            ...(init?.headers ?? {}),
        },
    });
    let body: unknown;
    try {
        body = await res.json();
    } catch {
        body = null;
    }
    return { status: res.status, body };
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export async function registerDesktopSessionsRoutes(
    app: FastifyInstance,
    options: RegisterDesktopSessionsRoutesOptions,
): Promise<void> {
    const desktopAgentUrl =
        options.desktopAgentUrl ??
        process.env.DESKTOP_AGENT_URL ??
        'http://localhost:5003';

    // POST /v1/desktop-sessions — create a new desktop VM session
    app.post('/v1/desktop-sessions', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.status(401).send({ error: 'Unauthorized' });
        }

        const body = (request.body ?? {}) as CreateSessionBody;
        const botId =
            typeof body.botId === 'string' && body.botId.trim()
                ? body.botId.trim()
                : randomUUID();

        const result = await agentFetch(desktopAgentUrl, '/v1/sessions', {
            method: 'POST',
            body: JSON.stringify({}),
        });

        if (result.status !== 201) {
            return reply.status(502).send({ error: 'desktop-agent unavailable', upstream: result.body });
        }

        const upstream = result.body as {
            sessionId: string;
            status: string;
            streamUrl: string;
            createdAt: string;
        };

        const record: DesktopSessionRecord = {
            sessionId: upstream.sessionId,
            tenantId: session.tenantId,
            botId,
            status: 'idle',
            streamUrl: upstream.streamUrl,
            createdAt: upstream.createdAt,
        };

        return reply.status(201).send(record);
    });

    // GET /v1/desktop-sessions/:sessionId — get session status
    app.get<{ Params: SessionIdParams }>(
        '/v1/desktop-sessions/:sessionId',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) {
                return reply.status(401).send({ error: 'Unauthorized' });
            }

            const { sessionId } = request.params;
            if (!sessionId || typeof sessionId !== 'string') {
                return reply.status(400).send({ error: 'sessionId is required' });
            }

            const result = await agentFetch(desktopAgentUrl, `/v1/sessions/${encodeURIComponent(sessionId)}`);
            if (result.status === 404) {
                return reply.status(404).send({ error: 'session not found' });
            }
            if (result.status !== 200) {
                return reply.status(502).send({ error: 'desktop-agent unavailable', upstream: result.body });
            }

            return reply.send(result.body);
        },
    );

    // DELETE /v1/desktop-sessions/:sessionId — terminate session
    app.delete<{ Params: SessionIdParams }>(
        '/v1/desktop-sessions/:sessionId',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) {
                return reply.status(401).send({ error: 'Unauthorized' });
            }

            const { sessionId } = request.params;
            if (!sessionId || typeof sessionId !== 'string') {
                return reply.status(400).send({ error: 'sessionId is required' });
            }

            const result = await agentFetch(
                desktopAgentUrl,
                `/v1/sessions/${encodeURIComponent(sessionId)}`,
                { method: 'DELETE' },
            );
            if (result.status === 404) {
                return reply.status(404).send({ error: 'session not found' });
            }
            if (result.status !== 200) {
                return reply.status(502).send({ error: 'desktop-agent unavailable', upstream: result.body });
            }

            return reply.send({ deleted: true });
        },
    );

    // POST /v1/desktop-sessions/:sessionId/task — submit a vision task
    app.post<{ Params: SessionIdParams }>(
        '/v1/desktop-sessions/:sessionId/task',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) {
                return reply.status(401).send({ error: 'Unauthorized' });
            }

            const { sessionId } = request.params;
            if (!sessionId || typeof sessionId !== 'string') {
                return reply.status(400).send({ error: 'sessionId is required' });
            }

            const body = (request.body ?? {}) as SubmitTaskBody;
            const goal =
                typeof body.goal === 'string' && body.goal.trim() ? body.goal.trim() : null;
            if (!goal) {
                return reply.status(400).send({ error: "'goal' is required" });
            }

            const result = await agentFetch(
                desktopAgentUrl,
                `/v1/sessions/${encodeURIComponent(sessionId)}/task`,
                { method: 'POST', body: JSON.stringify({ goal }) },
            );

            if (result.status === 404) {
                return reply.status(404).send({ error: 'session not found' });
            }
            if (result.status === 400) {
                return reply.status(400).send(result.body);
            }
            if (result.status !== 202) {
                return reply.status(502).send({ error: 'desktop-agent unavailable', upstream: result.body });
            }

            return reply.status(202).send(result.body);
        },
    );

    // GET /v1/desktop-sessions/:sessionId/task — poll task status
    app.get<{ Params: SessionIdParams }>(
        '/v1/desktop-sessions/:sessionId/task',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) {
                return reply.status(401).send({ error: 'Unauthorized' });
            }

            const { sessionId } = request.params;
            if (!sessionId || typeof sessionId !== 'string') {
                return reply.status(400).send({ error: 'sessionId is required' });
            }

            const result = await agentFetch(
                desktopAgentUrl,
                `/v1/sessions/${encodeURIComponent(sessionId)}/task`,
            );

            if (result.status === 404) {
                return reply.status(404).send({ error: result.body });
            }
            if (result.status !== 200) {
                return reply.status(502).send({ error: 'desktop-agent unavailable', upstream: result.body });
            }

            return reply.send(result.body as DesktopVisionTaskRecord);
        },
    );

    // -----------------------------------------------------------------------
    // POST /v1/desktop-sessions/:sessionId/join-meeting
    // Instructs the desktop agent to navigate to and join a video meeting.
    // Body: { meetingUrl, platform, contactName? }
    // -----------------------------------------------------------------------
    app.post<{ Params: SessionIdParams }>(
        '/v1/desktop-sessions/:sessionId/join-meeting',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) {
                return reply.status(401).send({ error: 'Unauthorized' });
            }

            const { sessionId } = request.params;
            if (!sessionId || typeof sessionId !== 'string') {
                return reply.status(400).send({ error: 'sessionId is required' });
            }

            const body = (request.body ?? {}) as Record<string, unknown>;
            if (!body['meetingUrl'] || !body['platform']) {
                return reply.status(400).send({ error: 'meetingUrl and platform are required' });
            }

            const result = await agentFetch(
                desktopAgentUrl,
                `/v1/sessions/${encodeURIComponent(sessionId)}/join-meeting`,
                { method: 'POST', body: JSON.stringify(body) },
            );

            if (result.status === 404) return reply.status(404).send({ error: 'session not found' });
            if (result.status === 400) return reply.status(400).send(result.body);
            if (result.status !== 202) {
                return reply.status(502).send({ error: 'desktop-agent unavailable', upstream: result.body });
            }
            return reply.status(202).send(result.body);
        },
    );

    // -----------------------------------------------------------------------
    // POST /v1/desktop-sessions/:sessionId/speak
    // Send a TTS audio buffer to the desktop agent for playback via PulseAudio.
    // Body: { audioBase64, format? }  — audioBase64 is a base64-encoded WAV/mp3
    // -----------------------------------------------------------------------
    app.post<{ Params: SessionIdParams }>(
        '/v1/desktop-sessions/:sessionId/speak',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) {
                return reply.status(401).send({ error: 'Unauthorized' });
            }

            const { sessionId } = request.params;
            if (!sessionId || typeof sessionId !== 'string') {
                return reply.status(400).send({ error: 'sessionId is required' });
            }

            const body = (request.body ?? {}) as Record<string, unknown>;
            if (!body['audioBase64']) {
                return reply.status(400).send({ error: 'audioBase64 is required' });
            }

            const result = await agentFetch(
                desktopAgentUrl,
                `/v1/sessions/${encodeURIComponent(sessionId)}/speak`,
                { method: 'POST', body: JSON.stringify(body) },
            );

            if (result.status === 404) return reply.status(404).send({ error: 'session not found' });
            if (result.status === 400) return reply.status(400).send(result.body);
            if (result.status !== 200) {
                return reply.status(502).send({ error: 'desktop-agent unavailable', upstream: result.body });
            }
            return reply.send(result.body);
        },
    );

    // -----------------------------------------------------------------------
    // POST /v1/desktop-sessions/:sessionId/capture-audio
    // Record N seconds of audio from the meeting via PulseAudio monitor sink.
    // Body: { durationSeconds? }  — default 5s
    // Returns: { audioBase64, format: 'wav' }
    // -----------------------------------------------------------------------
    app.post<{ Params: SessionIdParams }>(
        '/v1/desktop-sessions/:sessionId/capture-audio',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) {
                return reply.status(401).send({ error: 'Unauthorized' });
            }

            const { sessionId } = request.params;
            if (!sessionId || typeof sessionId !== 'string') {
                return reply.status(400).send({ error: 'sessionId is required' });
            }

            const body = (request.body ?? {}) as Record<string, unknown>;

            const result = await agentFetch(
                desktopAgentUrl,
                `/v1/sessions/${encodeURIComponent(sessionId)}/capture-audio`,
                { method: 'POST', body: JSON.stringify(body) },
            );

            if (result.status === 404) return reply.status(404).send({ error: 'session not found' });
            if (result.status === 400) return reply.status(400).send(result.body);
            if (result.status !== 200) {
                return reply.status(502).send({ error: 'desktop-agent unavailable', upstream: result.body });
            }
            return reply.send(result.body);
        },
    );

    // -----------------------------------------------------------------------
    // POST /v1/desktop-sessions/:sessionId/set-avatar-state
    // Switch the animated avatar between idle and talking states.
    // Body: { state: 'idle' | 'talking' }
    // -----------------------------------------------------------------------
    app.post<{ Params: SessionIdParams }>(
        '/v1/desktop-sessions/:sessionId/set-avatar-state',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) {
                return reply.status(401).send({ error: 'Unauthorized' });
            }

            const { sessionId } = request.params;
            if (!sessionId || typeof sessionId !== 'string') {
                return reply.status(400).send({ error: 'sessionId is required' });
            }

            const body = (request.body ?? {}) as { state?: string };
            if (!body.state || !['idle', 'talking'].includes(body.state)) {
                return reply.status(400).send({ error: "state must be 'idle' or 'talking'" });
            }

            const result = await agentFetch(
                desktopAgentUrl,
                `/v1/sessions/${encodeURIComponent(sessionId)}/set-avatar-state`,
                { method: 'POST', body: JSON.stringify(body) },
            );

            if (result.status === 404) return reply.status(404).send({ error: 'session not found' });
            if (result.status === 400) return reply.status(400).send(result.body);
            if (result.status !== 200) {
                return reply.status(502).send({ error: 'desktop-agent unavailable', upstream: result.body });
            }
            return reply.send(result.body);
        },
    );
}
