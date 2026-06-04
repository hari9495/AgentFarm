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
import { proxyCreateSession } from './meeting-proxy-core';

const getMeetingAgentUrl = (): string =>
    (process.env.MEETING_AGENT_URL ?? 'http://meeting-agent:7799').replace(/\/+$/u, '');
const getMeetingAgentToken = (): string => process.env.MEETING_AGENT_TOKEN ?? '';

export async function POST(request: Request) {
    const authHeader = await getInternalSessionAuthHeader();
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const result = await proxyCreateSession({
        authHeader,
        body,
        meetingAgentUrl: getMeetingAgentUrl(),
        meetingAgentToken: getMeetingAgentToken(),
    });
    return NextResponse.json(result.body, { status: result.status });
}
