/**
 * POST /api/meeting-agent/sessions/:maSessionId/join
 * Instructs the meeting-agent to join a meeting URL using the best available
 * adapter (Teams Graph API → Zoom SDK → FreeSWITCH SIP → browser fallback).
 *
 * Body: { meetingUrl: string, displayName?: string, joinDelayMs?: number }
 */
import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../../../lib/internal-session';

const getMeetingAgentUrl = (): string =>
    (process.env.MEETING_AGENT_URL ?? 'http://meeting-agent:7799').replace(/\/+$/u, '');
const getMeetingAgentToken = (): string => process.env.MEETING_AGENT_TOKEN ?? '';

export async function POST(
    request: Request,
    { params }: { params: Promise<{ maSessionId: string }> },
) {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    const { maSessionId } = await params;
    if (!maSessionId?.trim()) {
        return NextResponse.json({ error: 'invalid_request', message: 'maSessionId is required.' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    if (!body.meetingUrl || typeof body.meetingUrl !== 'string') {
        return NextResponse.json({ error: 'invalid_request', message: 'meetingUrl is required.' }, { status: 400 });
    }

    const base = getMeetingAgentUrl();
    const token = getMeetingAgentToken();

    try {
        const response = await fetch(`${base}/v1/sessions/${encodeURIComponent(maSessionId)}/join`, {
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
        return NextResponse.json({ error: 'upstream_unavailable', message: 'Meeting-agent is unreachable.' }, { status: 502 });
    }
}
