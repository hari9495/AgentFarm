/**
 * GET /api/meeting-agent/sessions/:maSessionId
 * Fetch the current state of a live meeting-agent session (FSM status, disclosureAnnounced, etc.)
 */
import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../../lib/internal-session';
import { proxyGetSession } from '../meeting-proxy-core';

const getMeetingAgentUrl = (): string =>
    (process.env.MEETING_AGENT_URL ?? 'http://meeting-agent:7799').replace(/\/+$/u, '');
const getMeetingAgentToken = (): string => process.env.MEETING_AGENT_TOKEN ?? '';

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ maSessionId: string }> },
) {
    const authHeader = await getInternalSessionAuthHeader();
    const { maSessionId } = await params;
    const result = await proxyGetSession({
        authHeader,
        maSessionId,
        meetingAgentUrl: getMeetingAgentUrl(),
        meetingAgentToken: getMeetingAgentToken(),
    });
    return NextResponse.json(result.body, { status: result.status });
}
