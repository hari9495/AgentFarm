/**
 * POST /api/meeting-agent/sessions/:maSessionId/chat
 * Sends a text message to the meeting's native chat (Teams / Zoom).
 *
 * Body: { text: string, handle: string }
 *   handle — platform-specific thread/channel ID:
 *     Teams: Graph API threadId (chatInfo.threadId)
 *     Zoom:  numeric meeting ID string
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
    if (!body.text || typeof body.text !== 'string' || !body.text.trim()) {
        return NextResponse.json({ error: 'invalid_request', message: 'text is required.' }, { status: 400 });
    }
    if (!body.handle || typeof body.handle !== 'string' || !body.handle.trim()) {
        return NextResponse.json(
            { error: 'invalid_request', message: 'handle is required (Teams: threadId, Zoom: meetingId).' },
            { status: 400 },
        );
    }

    const base = getMeetingAgentUrl();
    const token = getMeetingAgentToken();

    try {
        const response = await fetch(`${base}/v1/sessions/${encodeURIComponent(maSessionId)}/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ text: body.text.trim(), handle: body.handle.trim() }),
        });
        const data = await response.json().catch(() => ({ error: 'upstream_error' }));
        return NextResponse.json(data, { status: response.status });
    } catch {
        return NextResponse.json({ error: 'upstream_unavailable', message: 'Meeting-agent is unreachable.' }, { status: 502 });
    }
}
