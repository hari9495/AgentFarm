'use client';

type AuditEvent = {
    event_id: string;
    tenant_id: string;
    workspace_id: string;
    bot_id: string;
    event_type: string;
    severity: string;
    summary: string;
    source_system: string;
    created_at: string;
    correlation_id: string;
};

type Props = {
    workspaceId: string;
    initialEvents: AuditEvent[];
};

import { useMemo, useState } from 'react';

const FRESHNESS_WARNING_MINUTES = 120;

const formatAgeMinutes = (minutes: number): string => {
    if (minutes < 60) {
        return `${minutes}m`;
    }

    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    if (remainder === 0) {
        return `${hours}h`;
    }

    return `${hours}h ${remainder}m`;
};

export function EvidenceCompliancePanel({ workspaceId, initialEvents }: Props) {
    const [events, setEvents] = useState<AuditEvent[]>(initialEvents);
    const [severity, setSeverity] = useState('');
    const [eventType, setEventType] = useState('');
    const [botId, setBotId] = useState('');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [limit, setLimit] = useState('50');
    const [loading, setLoading] = useState(false);
    const [retentionDays, setRetentionDays] = useState('90');
    const [retentionBusy, setRetentionBusy] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    const freshness = useMemo(() => {
        if (events.length === 0) {
            return {
                latestAt: null as Date | null,
                ageMinutes: null as number | null,
                stale: true,
            };
        }

        const latest = events
            .map((event) => new Date(event.created_at))
            .filter((date) => Number.isFinite(date.getTime()))
            .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

        if (!latest) {
            return {
                latestAt: null,
                ageMinutes: null,
                stale: true,
            };
        }

        const ageMinutes = Math.max(0, Math.floor((Date.now() - latest.getTime()) / 60000));
        return {
            latestAt: latest,
            ageMinutes,
            stale: ageMinutes > FRESHNESS_WARNING_MINUTES,
        };
    }, [events]);

    const queryEvents = async () => {
        setLoading(true);
        setMessage(null);

        try {
            const params = new URLSearchParams();
            params.set('workspace_id', workspaceId);
            if (severity) {
                params.set('severity', severity);
            }
            if (eventType.trim()) {
                params.set('event_type', eventType.trim());
            }
            if (botId.trim()) {
                params.set('bot_id', botId.trim());
            }
            if (from) {
                params.set('from', new Date(from).toISOString());
            }
            if (to) {
                params.set('to', new Date(to).toISOString());
            }
            if (limit) {
                params.set('limit', limit);
            }

            const response = await fetch(`/api/audit/events?${params.toString()}`, {
                method: 'GET',
                cache: 'no-store',
            });

            const body = (await response.json().catch(() => ({}))) as {
                error?: string;
                message?: string;
                events?: AuditEvent[];
                count?: number;
            };

            if (!response.ok) {
                setMessage(body.message ?? body.error ?? 'Failed to query audit events.');
                return;
            }

            setEvents(body.events ?? []);
            setMessage(`Loaded ${body.count ?? body.events?.length ?? 0} audit events.`);
        } finally {
            setLoading(false);
        }
    };

    const runRetention = async (dryRun: boolean) => {
        const days = Number(retentionDays);
        if (!Number.isInteger(days) || days < 7) {
            setMessage('Retention days must be an integer >= 7.');
            return;
        }

        setRetentionBusy(true);
        setMessage(null);

        try {
            const response = await fetch('/api/audit/retention', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    workspace_id: workspaceId,
                    retention_days: days,
                    dry_run: dryRun,
                }),
            });

            const body = (await response.json().catch(() => ({}))) as {
                error?: string;
                message?: string;
                status?: string;
                candidate_count?: number;
                deleted_count?: number;
            };

            if (!response.ok) {
                setMessage(body.message ?? body.error ?? 'Retention request failed.');
                return;
            }

            if (body.status === 'dry_run') {
                setMessage(`Retention dry-run: ${body.candidate_count ?? 0} events eligible for cleanup.`);
            } else {
                setMessage(`Retention cleanup deleted ${body.deleted_count ?? 0} events.`);
                await queryEvents();
            }
        } finally {
            setRetentionBusy(false);
        }
    };

    const exportAudit = async (format: 'csv' | 'json') => {
        const params = new URLSearchParams();
        params.set('workspace_id', workspaceId);
        params.set('format', format);
        if (severity) {
            params.set('severity', severity);
        }
        if (eventType.trim()) {
            params.set('event_type', eventType.trim());
        }
        if (botId.trim()) {
            params.set('bot_id', botId.trim());
        }
        if (from) {
            params.set('from', new Date(from).toISOString());
        }
        if (to) {
            params.set('to', new Date(to).toISOString());
        }
        if (limit) {
            params.set('limit', limit);
        }

        const response = await fetch(`/api/audit/export?${params.toString()}`, {
            method: 'GET',
            cache: 'no-store',
        });

        if (!response.ok) {
            setMessage('Export failed.');
            return;
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit-export-${workspaceId}.${format}`;
        a.click();
        URL.revokeObjectURL(url);
        setMessage(`Exported ${format.toUpperCase()} compliance report.`);
    };

    return (
        <article className="card">
            <h2>Evidence and Compliance</h2>
            <p style={{ margin: '-0.5rem 0 0.8rem', fontSize: '0.82rem', color: '#57534e' }}>
                Evidence freshness: <strong>{freshness.latestAt ? new Date(freshness.latestAt).toLocaleString() : 'No evidence yet'}</strong>{' '}
                {freshness.ageMinutes !== null && (
                    <span className={`badge ${freshness.stale ? 'warn' : 'low'}`} style={{ marginLeft: '0.4rem' }}>
                        age {formatAgeMinutes(freshness.ageMinutes)}
                    </span>
                )}
            </p>

            <div style={{ display: 'grid', gap: '0.45rem', marginBottom: '0.7rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <select value={severity} onChange={(event) => setSeverity(event.target.value)}>
                        <option value="">all severity</option>
                        <option value="info">info</option>
                        <option value="warn">warn</option>
                        <option value="error">error</option>
                    </select>
                    <input
                        type="text"
                        placeholder="event type"
                        value={eventType}
                        onChange={(event) => setEventType(event.target.value)}
                        style={{ minWidth: 150 }}
                    />
                    <input
                        type="text"
                        placeholder="bot id"
                        value={botId}
                        onChange={(event) => setBotId(event.target.value)}
                        style={{ minWidth: 150 }}
                    />
                    <input type="datetime-local" value={from} onChange={(event) => setFrom(event.target.value)} />
                    <input type="datetime-local" value={to} onChange={(event) => setTo(event.target.value)} />
                    <input
                        type="number"
                        min={1}
                        max={200}
                        value={limit}
                        onChange={(event) => setLimit(event.target.value)}
                        style={{ width: 88 }}
                        title="result limit"
                    />
                </div>
                <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                    <button type="button" onClick={() => void queryEvents()} disabled={loading}>
                        {loading ? 'Querying…' : 'Query Audit Events'}
                    </button>
                    <button type="button" onClick={() => void exportAudit('csv')}>Export CSV</button>
                    <button type="button" onClick={() => void exportAudit('json')}>Export JSON</button>
                </div>
            </div>

            <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.7rem' }}>
                <input
                    type="number"
                    min={7}
                    value={retentionDays}
                    onChange={(event) => setRetentionDays(event.target.value)}
                    style={{ width: 90 }}
                    title="retention days"
                />
                <span style={{ fontSize: '0.82rem', color: '#57534e' }}>retention days</span>
                <button type="button" onClick={() => void runRetention(true)} disabled={retentionBusy}>
                    Dry-Run Cleanup
                </button>
                <button type="button" onClick={() => void runRetention(false)} disabled={retentionBusy}>
                    Execute Cleanup
                </button>
            </div>

            {message && (
                <p style={{ margin: '0 0 0.7rem', fontSize: '0.82rem', color: '#155e75' }}>{message}</p>
            )}

            <table>
                <thead>
                    <tr>
                        <th>Timestamp</th>
                        <th>Severity</th>
                        <th>Event</th>
                        <th>Summary</th>
                    </tr>
                </thead>
                <tbody>
                    {events.length === 0 ? (
                        <tr>
                            <td colSpan={4}>No events found</td>
                        </tr>
                    ) : (
                        events.map((event) => (
                            <tr key={event.event_id}>
                                <td>{new Date(event.created_at).toLocaleString()}</td>
                                <td>{event.severity}</td>
                                <td>{event.event_type}</td>
                                <td>{event.summary}</td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </article>
    );
}
