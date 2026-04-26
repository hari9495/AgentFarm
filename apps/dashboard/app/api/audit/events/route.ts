import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

const getAuthHeader = async (): Promise<string | null> => {
    const cookieStore = await cookies();
    const session = cookieStore.get('agentfarm_session');
    if (!session?.value) {
        return null;
    }

    return `Bearer ${decodeURIComponent(session.value)}`;
};

export async function GET(request: Request) {
    const authHeader = await getAuthHeader();
    if (!authHeader) {
        return NextResponse.json(
            { error: 'unauthorized', message: 'Missing session cookie.' },
            { status: 401 },
        );
    }

    const incomingUrl = new URL(request.url);
    const targetUrl = `${getApiBaseUrl()}/v1/audit/events?${incomingUrl.searchParams.toString()}`;

    const response = await fetch(targetUrl, {
        method: 'GET',
        headers: {
            Authorization: authHeader,
        },
        cache: 'no-store',
    });

    const body = await response.json().catch(() => ({
        error: 'upstream_error',
        message: 'Unable to parse audit events response.',
    }));

    return NextResponse.json(body, { status: response.status });
}
