import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../../lib/internal-session';

const FALLBACK = { preferredLanguage: null };

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ workspaceId: string }> },
) {
    const { workspaceId } = await params;

    if (!workspaceId?.trim()) {
        return NextResponse.json(FALLBACK);
    }

    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json(FALLBACK);
    }

    try {
        const res = await fetch(
            `${getApiBaseUrl()}/v1/language/workspace/${encodeURIComponent(workspaceId)}`,
            {
                headers: { Authorization: authHeader },
                cache: 'no-store',
            },
        );

        const data = await res.json().catch(() => null);
        if (!res.ok || !data) {
            return NextResponse.json(FALLBACK);
        }

        return NextResponse.json(data, { status: res.status });
    } catch {
        return NextResponse.json(FALLBACK);
    }
}
