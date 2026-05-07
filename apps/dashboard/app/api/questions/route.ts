import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../lib/internal-session';
import { proxyQuestionsGet } from './proxy-core';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function GET(request: Request) {
    const authHeader = await getInternalSessionAuthHeader();
    const result = await proxyQuestionsGet({
        requestUrl: request.url,
        authHeader,
        apiBaseUrl: getApiBaseUrl(),
    });
    return NextResponse.json(result.body, { status: result.status });
}
