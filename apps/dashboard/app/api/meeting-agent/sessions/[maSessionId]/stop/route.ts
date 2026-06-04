/**
 * POST /api/meeting-agent/sessions/:maSessionId/stop
 * Stops the live meeting-agent session — transitions FSM to completed.
 */
import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../../../lib/internal-session';

const getMeetingAgentUrl = (): string =>
    (process.env.MEETING_AGENT_URL ?? 'http://meeting-agent:7799').replace(/\/+$/u, '');
const getMeetingAgentToken = (): string => process.env.MEETING_AGENT_TOKEN ?? '';

export async function POST(
    _request: Request,
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

    const base = getMeetingAgentUrl();
    const token = getMeetingAgentToken();

    try {
        const response = await fetch(`${base}/v1/sessions/${encodeURIComponent(maSessionId)}/stop`, {
            method: 'POST',
            headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        });
        const data = await response.json().catch(() => ({ error: 'upstream_error' }));
        return NextResponse.json(data, { status: response.status });
    } catch {
        return NextResponse.json({ error: 'upstream_unavailable', message: 'Meeting-agent is unreachable.' }, { status: 502 });
    }
}
