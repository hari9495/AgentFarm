type RouteResult = { status: number; body: unknown };

const FORBIDDEN: RouteResult = {
    status: 403,
    body: { error: 'forbidden', message: 'Dashboard session required.' },
};

const UNAVAILABLE: RouteResult = {
    status: 502,
    body: { error: 'upstream_unavailable', message: 'Meeting-agent is unreachable.' },
};

function tokenHeaders(token: string): Record<string, string> {
    return token ? { Authorization: `Bearer ${token}` } : {};
}

// ---- POST /sessions ----

const CREATE_REQUIRED = ['tenantId', 'workspaceId', 'botId', 'platform', 'mode', 'meetingId'] as const;

export type CreateSessionInput = {
    authHeader: string | null;
    body: Record<string, unknown> | null;
    meetingAgentUrl: string;
    meetingAgentToken: string;
    fetchImpl?: typeof fetch;
};

export async function proxyCreateSession(input: CreateSessionInput): Promise<RouteResult> {
    const { authHeader, body, meetingAgentUrl, meetingAgentToken, fetchImpl = fetch } = input;

    if (!authHeader) return FORBIDDEN;
    if (!body) return { status: 400, body: { error: 'invalid_request', message: 'Invalid JSON body.' } };

    for (const field of CREATE_REQUIRED) {
        if (typeof body[field] !== 'string' || !(body[field] as string).trim()) {
            return { status: 400, body: { error: 'invalid_request', message: `${field} is required.` } };
        }
    }

    try {
        const response = await fetchImpl(`${meetingAgentUrl}/v1/sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...tokenHeaders(meetingAgentToken) },
            body: JSON.stringify(body),
        });
        const data = await response.json().catch(() => ({ error: 'upstream_error' }));
        return { status: response.status, body: data };
    } catch {
        return UNAVAILABLE;
    }
}

// ---- GET /sessions/:id ----

export type GetSessionInput = {
    authHeader: string | null;
    maSessionId: string;
    meetingAgentUrl: string;
    meetingAgentToken: string;
    fetchImpl?: typeof fetch;
};

export async function proxyGetSession(input: GetSessionInput): Promise<RouteResult> {
    const { authHeader, maSessionId, meetingAgentUrl, meetingAgentToken, fetchImpl = fetch } = input;

    if (!authHeader) return FORBIDDEN;
    if (!maSessionId?.trim()) {
        return { status: 400, body: { error: 'invalid_request', message: 'maSessionId is required.' } };
    }

    try {
        const response = await fetchImpl(
            `${meetingAgentUrl}/v1/sessions/${encodeURIComponent(maSessionId)}`,
            { headers: tokenHeaders(meetingAgentToken), cache: 'no-store' },
        );
        const data = await response.json().catch(() => ({ error: 'upstream_error' }));
        return { status: response.status, body: data };
    } catch {
        return UNAVAILABLE;
    }
}

// ---- POST /sessions/:id/join ----

export type JoinSessionInput = {
    authHeader: string | null;
    maSessionId: string;
    body: Record<string, unknown>;
    meetingAgentUrl: string;
    meetingAgentToken: string;
    fetchImpl?: typeof fetch;
};

export async function proxyJoinSession(input: JoinSessionInput): Promise<RouteResult> {
    const { authHeader, maSessionId, body, meetingAgentUrl, meetingAgentToken, fetchImpl = fetch } = input;

    if (!authHeader) return FORBIDDEN;
    if (!maSessionId?.trim()) {
        return { status: 400, body: { error: 'invalid_request', message: 'maSessionId is required.' } };
    }
    if (!body.meetingUrl || typeof body.meetingUrl !== 'string') {
        return { status: 400, body: { error: 'invalid_request', message: 'meetingUrl is required.' } };
    }

    try {
        const response = await fetchImpl(
            `${meetingAgentUrl}/v1/sessions/${encodeURIComponent(maSessionId)}/join`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...tokenHeaders(meetingAgentToken) },
                body: JSON.stringify(body),
            },
        );
        const data = await response.json().catch(() => ({ error: 'upstream_error' }));
        return { status: response.status, body: data };
    } catch {
        return UNAVAILABLE;
    }
}

// ---- POST /sessions/:id/stop ----

export type StopSessionInput = {
    authHeader: string | null;
    maSessionId: string;
    meetingAgentUrl: string;
    meetingAgentToken: string;
    fetchImpl?: typeof fetch;
};

export async function proxyStopSession(input: StopSessionInput): Promise<RouteResult> {
    const { authHeader, maSessionId, meetingAgentUrl, meetingAgentToken, fetchImpl = fetch } = input;

    if (!authHeader) return FORBIDDEN;
    if (!maSessionId?.trim()) {
        return { status: 400, body: { error: 'invalid_request', message: 'maSessionId is required.' } };
    }

    try {
        const response = await fetchImpl(
            `${meetingAgentUrl}/v1/sessions/${encodeURIComponent(maSessionId)}/stop`,
            { method: 'POST', headers: tokenHeaders(meetingAgentToken) },
        );
        const data = await response.json().catch(() => ({ error: 'upstream_error' }));
        return { status: response.status, body: data };
    } catch {
        return UNAVAILABLE;
    }
}

// ---- GET /sessions/:id/transcript ----

export type GetTranscriptInput = {
    authHeader: string | null;
    maSessionId: string;
    meetingAgentUrl: string;
    meetingAgentToken: string;
    fetchImpl?: typeof fetch;
};

export async function proxyGetTranscript(input: GetTranscriptInput): Promise<RouteResult> {
    const { authHeader, maSessionId, meetingAgentUrl, meetingAgentToken, fetchImpl = fetch } = input;

    if (!authHeader) return FORBIDDEN;
    if (!maSessionId?.trim()) {
        return { status: 400, body: { error: 'invalid_request', message: 'maSessionId is required.' } };
    }

    try {
        const response = await fetchImpl(
            `${meetingAgentUrl}/v1/sessions/${encodeURIComponent(maSessionId)}/transcript`,
            { headers: tokenHeaders(meetingAgentToken), cache: 'no-store' },
        );
        const data = await response.json().catch(() => ({ error: 'upstream_error' }));
        return { status: response.status, body: data };
    } catch {
        return UNAVAILABLE;
    }
}

// ---- POST /sessions/:id/chat ----

export type SendChatInput = {
    authHeader: string | null;
    maSessionId: string;
    body: Record<string, unknown>;
    meetingAgentUrl: string;
    meetingAgentToken: string;
    fetchImpl?: typeof fetch;
};

export async function proxySendChat(input: SendChatInput): Promise<RouteResult> {
    const { authHeader, maSessionId, body, meetingAgentUrl, meetingAgentToken, fetchImpl = fetch } = input;

    if (!authHeader) return FORBIDDEN;
    if (!maSessionId?.trim()) {
        return { status: 400, body: { error: 'invalid_request', message: 'maSessionId is required.' } };
    }
    if (!body.text || typeof body.text !== 'string' || !(body.text as string).trim()) {
        return { status: 400, body: { error: 'invalid_request', message: 'text is required.' } };
    }
    if (!body.handle || typeof body.handle !== 'string' || !(body.handle as string).trim()) {
        return {
            status: 400,
            body: { error: 'invalid_request', message: 'handle is required (Teams: threadId, Zoom: meetingId).' },
        };
    }

    try {
        const response = await fetchImpl(
            `${meetingAgentUrl}/v1/sessions/${encodeURIComponent(maSessionId)}/chat`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...tokenHeaders(meetingAgentToken) },
                body: JSON.stringify({ text: (body.text as string).trim(), handle: (body.handle as string).trim() }),
            },
        );
        const data = await response.json().catch(() => ({ error: 'upstream_error' }));
        return { status: response.status, body: data };
    } catch {
        return UNAVAILABLE;
    }
}
