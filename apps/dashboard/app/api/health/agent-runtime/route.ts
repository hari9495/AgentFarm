import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../lib/internal-session';

const getAgentRuntimeUrl = (): string =>
    process.env.AGENT_RUNTIME_BASE_URL ?? process.env.AGENT_RUNTIME_URL ?? 'http://localhost:4000';

export async function GET(): Promise<Response> {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    try {
        const res = await fetch(`${getAgentRuntimeUrl()}/health/live`, {
            headers: { Authorization: `Bearer ${process.env.AGENT_RUNTIME_TOKEN ?? ''}` },
            cache: 'no-store',
            signal: AbortSignal.timeout(5000),
        });
        const data = await res.json().catch(() => ({ error: 'parse_error' }));
        return NextResponse.json({ ...data, reachable: true }, { status: res.status });
    } catch {
        return NextResponse.json({ reachable: false, error: 'unreachable', state: 'unknown' }, { status: 502 });
    }
}
