import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ policyId: string }> },
) {
    const { policyId } = await params;

    if (!policyId || policyId.trim().length === 0) {
        return NextResponse.json(
            { error: 'invalid_request', message: 'policyId is required.' },
            { status: 400 },
        );
    }

    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json(
            { error: 'forbidden', message: 'Internal session required.' },
            { status: 403 },
        );
    }

    const body = await request.json().catch(() => ({}));

    const response = await fetch(
        `${getApiBaseUrl()}/v1/retention-policies/${encodeURIComponent(policyId)}`,
        {
            method: 'PATCH',
            headers: {
                'content-type': 'application/json',
                Authorization: authHeader,
            },
            body: JSON.stringify(body),
            cache: 'no-store',
        },
    );

    const data = await response.json().catch(() => ({
        error: 'upstream_error',
        message: 'Unable to parse response.',
    }));

    return NextResponse.json(data, { status: response.status });
}

export async function DELETE(
    _request: Request,
    { params }: { params: Promise<{ policyId: string }> },
) {
    const { policyId } = await params;

    if (!policyId || policyId.trim().length === 0) {
        return NextResponse.json(
            { error: 'invalid_request', message: 'policyId is required.' },
            { status: 400 },
        );
    }

    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json(
            { error: 'forbidden', message: 'Internal session required.' },
            { status: 403 },
        );
    }

    try {
        const response = await fetch(
            `${getApiBaseUrl()}/v1/retention-policies/${encodeURIComponent(policyId)}`,
            {
                method: 'DELETE',
                headers: { Authorization: authHeader },
                cache: 'no-store',
            },
        );

        const data = await response.json().catch(() => ({
            error: 'upstream_error',
            message: 'Unable to parse response.',
        }));

        return NextResponse.json(data, { status: response.status });
    } catch {
        return NextResponse.json(
            { error: 'upstream_unavailable', message: 'Gateway request failed.' },
            { status: 502 },
        );
    }
}
