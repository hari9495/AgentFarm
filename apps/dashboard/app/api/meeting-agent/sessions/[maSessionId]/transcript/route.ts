/**
 * GET /api/meeting-agent/sessions/:maSessionId/transcript
 * Returns the live transcript log from the meeting-agent session.
 * Each entry: { at, source: 'participant'|'agent'|'system', speaker?, text }
 *
 * Poll this every 3s for active sessions to get real-time transcript entries.
 */
import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../../../lib/internal-session';
import { proxyGetTranscript } from '../../meeting-proxy-core';

const getMeetingAgentUrl = (): string =>
    (process.env.MEETING_AGENT_URL ?? 'http://meeting-agent:7799').replace(/\/+$/u, '');
const getMeetingAgentToken = (): string => process.env.MEETING_AGENT_TOKEN ?? '';

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ maSessionId: string }> },
) {
    const authHeader = await getInternalSessionAuthHeader();
    const { maSessionId } = await params;
    const result = await proxyGetTranscript({
        authHeader,
        maSessionId,
        meetingAgentUrl: getMeetingAgentUrl(),
        meetingAgentToken: getMeetingAgentToken(),
    });
    return NextResponse.json(result.body, { status: result.status });
}
