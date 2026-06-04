/**
 * POST /api/meeting-agent/sessions/:maSessionId/join
 * Instructs the meeting-agent to join a meeting URL using the best available
 * adapter (Teams Graph API → Zoom SDK → FreeSWITCH SIP → browser fallback).
 *
 * Body: { meetingUrl: string, displayName?: string, joinDelayMs?: number }
 */
import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../../../lib/internal-session';
import { proxyJoinSession } from '../../meeting-proxy-core';

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
    const result = await proxyJoinSession({
        authHeader,
        maSessionId,
        body,
        meetingAgentUrl: getMeetingAgentUrl(),
        meetingAgentToken: getMeetingAgentToken(),
    });
    return NextResponse.json(result.body, { status: result.status });
}
