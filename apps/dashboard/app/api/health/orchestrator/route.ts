import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../lib/internal-session';

const getOrchestratorUrl = (): string =>
    process.env.ORCHESTRATOR_API_BASE_URL ?? 'http://localhost:3011';

export async function GET(): Promise<Response> {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    try {
        const res = await fetch(`${getOrchestratorUrl()}/health`, {
            cache: 'no-store',
            signal: AbortSignal.timeout(5000),
        });
        const data = await res.json().catch(() => ({ error: 'parse_error' }));
        return NextResponse.json({ ...data, reachable: true }, { status: res.status });
    } catch {
        return NextResponse.json({ reachable: false, error: 'unreachable', status: 'down' }, { status: 502 });
    }
}
