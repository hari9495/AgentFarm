/**
 * Dashboard proxy → meeting-agent /v1/sessions
 *
 * GET  /api/meeting-agent/sessions           — not needed (meeting-agent has no list endpoint)
 * POST /api/meeting-agent/sessions           — create a new live session on the meeting-agent
 *
 * The meeting-agent session is a separate live-control session from the
 * database-backed gateway session. The caller passes the gateway sessionId
 * so the Live Control panel can link them together in the UI.
 */

import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../lib/internal-session';

const getMeetingAgentUrl = (): string =>
    (process.env.MEETING_AGENT_URL ?? 'http://meeting-agent:7799').replace(/\/+$/u, '');

const getMeetingAgentToken = (): string =>
    process.env.MEETING_AGENT_TOKEN ?? '';

export async function POST(request: Request) {
    // Verify dashboard session — operator must be authenticated.
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json({ error: 'forbidden', message: 'Dashboard session required.' }, { status: 403 });
    }

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) {
        return NextResponse.json({ error: 'invalid_request', message: 'Invalid JSON body.' }, { status: 400 });
    }

    // Required by meeting-agent /v1/sessions
    const required = ['tenantId', 'workspaceId', 'botId', 'platform', 'mode', 'meetingId'];
    for (const field of required) {
        if (typeof body[field] !== 'string' || !(body[field] as string).trim()) {
            return NextResponse.json(
                { error: 'invalid_request', message: `${field} is required.` },
                { status: 400 },
            );
        }
    }

    const base = getMeetingAgentUrl();
    const token = getMeetingAgentToken();

    try {
        const response = await fetch(`${base}/v1/sessions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify(body),
        });

        const data = await response.json().catch(() => ({ error: 'upstream_error' }));
        return NextResponse.json(data, { status: response.status });
    } catch {
        return NextResponse.json(
            { error: 'upstream_unavailable', message: 'Meeting-agent is unreachable.' },
            { status: 502 },
        );
    }
}
