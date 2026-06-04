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
import { proxySendChat } from '../../meeting-proxy-core';

const getMeetingAgentUrl = (): string =>
    (process.env.MEETING_AGENT_URL ?? 'http://meeting-agent:7799').replace(/\/+$/u, '');
const getMeetingAgentToken = (): string => process.env.MEETING_AGENT_TOKEN ?? '';

export async function POST(
    request: Request,
    { params }: { params: Promise<{ maSessionId: string }> },
) {
    const authHeader = await getInternalSessionAuthHeader();
    const { maSessionId } = await params;
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const result = await proxySendChat({
        authHeader,
        maSessionId,
        body,
        meetingAgentUrl: getMeetingAgentUrl(),
        meetingAgentToken: getMeetingAgentToken(),
    });
    return NextResponse.json(result.body, { status: result.status });
}
