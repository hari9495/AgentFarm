import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../lib/internal-session';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

type AuditEvent = {
    event_id: string;
    tenant_id: string;
    workspace_id: string;
    bot_id: string;
    event_type: string;
    severity: string;
    summary: string;
    source_system: string;
    correlation_id: string;
    created_at: string;
};

const csvEscape = (value: string): string => {
    const normalized = value.replace(/\r?\n/g, ' ');
    if (normalized.includes(',') || normalized.includes('"')) {
        return `"${normalized.replace(/"/g, '""')}"`;
    }
    return normalized;
};

export async function GET(request: Request) {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json(
            { error: 'forbidden', message: 'Internal session required.' },
            { status: 403 },
        );
    }

    const url = new URL(request.url);
    const workspaceId = url.searchParams.get('workspace_id')?.trim();
    if (!workspaceId) {
        return NextResponse.json(
            { error: 'invalid_request', message: 'workspace_id is required.' },
            { status: 400 },
        );
    }

    const format = (url.searchParams.get('format') ?? 'csv').toLowerCase();
    const params = new URLSearchParams();
    params.set('workspace_id', workspaceId);
    params.set('limit', url.searchParams.get('limit') ?? '200');

    const optional = ['severity', 'event_type', 'bot_id', 'from', 'to', 'cursor'];
    for (const key of optional) {
        const value = url.searchParams.get(key);
        if (value && value.trim()) {
            params.set(key, value.trim());
        }
    }

    const response = await fetch(`${getApiBaseUrl()}/v1/audit/events?${params.toString()}`, {
        method: 'GET',
        headers: {
            Authorization: authHeader,
        },
        cache: 'no-store',
    });

    const body = (await response.json().catch(() => null)) as
        | { events?: AuditEvent[] }
        | { error?: string; message?: string }
        | null;

    if (!response.ok) {
        return NextResponse.json(
            body ?? { error: 'upstream_error', message: 'Failed to fetch audit events for export.' },
            { status: response.status },
        );
    }

    const events = (body as { events?: AuditEvent[] } | null)?.events ?? [];

    if (format === 'json') {
        return new NextResponse(JSON.stringify(events, null, 2), {
            status: 200,
            headers: {
                'content-type': 'application/json; charset=utf-8',
                'content-disposition': `attachment; filename="audit-export-${workspaceId}.json"`,
            },
        });
    }

    const header = [
        'event_id',
        'tenant_id',
        'workspace_id',
        'bot_id',
        'event_type',
        'severity',
        'summary',
        'source_system',
        'correlation_id',
        'created_at',
    ].join(',');

    const lines = events.map((event) => [
        event.event_id,
        event.tenant_id,
        event.workspace_id,
        event.bot_id,
        event.event_type,
        event.severity,
        event.summary,
        event.source_system,
        event.correlation_id,
        event.created_at,
    ].map((item) => csvEscape(item ?? '')).join(','));

    const csv = [header, ...lines].join('\n');

    return new NextResponse(csv, {
        status: 200,
        headers: {
            'content-type': 'text/csv; charset=utf-8',
            'content-disposition': `attachment; filename="audit-export-${workspaceId}.csv"`,
        },
    });
}
