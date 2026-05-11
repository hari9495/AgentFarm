'use client';

import { useEffect, useState } from 'react';

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

type AuditLogPanelProps = {
    from?: string;
    to?: string;
    workspaceId?: string;
};

const PAGE_SIZE = 50;

const severityStyle = (severity: string): { background: string; color: string } => {
    if (severity === 'critical' || severity === 'high') {
        return { background: '#fee2e2', color: '#b91c1c' };
    }
    if (severity === 'warn' || severity === 'warning') {
        return { background: '#fef3c7', color: '#92400e' };
    }
    return { background: '#dcfce7', color: '#166534' };
};

export default function AuditLogPanel({ from, to, workspaceId }: AuditLogPanelProps) {
    const [events, setEvents] = useState<AuditEvent[]>([]);
    const [offset, setOffset] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState(false);

    useEffect(() => {
        setIsLoading(true);
        setError(null);

        const params = new URLSearchParams({
            limit: String(PAGE_SIZE),
            offset: String(offset),
        });
        if (from) params.set('from', from);
        if (to) params.set('to', to);
        if (workspaceId) params.set('workspace_id', workspaceId);

        void fetch(`/api/audit/events?${params.toString()}`, { cache: 'no-store' })
            .then(async (res) => {
                if (!res.ok) {
                    setError('Failed to load audit log');
                    return;
                }
                const body = (await res.json()) as { events?: AuditEvent[] };
                const items = body.events ?? [];
                setEvents(items);
                setHasMore(items.length === PAGE_SIZE);
            })
            .catch(() => {
                setError('Failed to load audit log');
            })
            .finally(() => {
                setIsLoading(false);
            });
    }, [from, to, workspaceId, offset]);

    const handlePrev = () => setOffset((o) => Math.max(0, o - PAGE_SIZE));
    const handleNext = () => setOffset((o) => o + PAGE_SIZE);

    return (
        <section style={{
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 12,
            padding: '1.25rem 1.5rem',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#111827', margin: 0 }}>Audit Log</h2>
                {!isLoading && events.length > 0 && (
                    <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>
                        Rows {offset + 1}–{offset + events.length}
                    </span>
                )}
            </div>

            {error && (
                <p style={{ color: '#ef4444', fontSize: '0.875rem' }}>Failed to load audit log</p>
            )}

            {isLoading && (
                <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>Loading…</p>
            )}

            {!isLoading && !error && (
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
                                <th style={{ padding: '0.5rem 0.75rem', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>Timestamp</th>
                                <th style={{ padding: '0.5rem 0.75rem', fontWeight: 600, color: '#374151' }}>userId</th>
                                <th style={{ padding: '0.5rem 0.75rem', fontWeight: 600, color: '#374151' }}>action</th>
                                <th style={{ padding: '0.5rem 0.75rem', fontWeight: 600, color: '#374151' }}>resource</th>
                                <th style={{ padding: '0.5rem 0.75rem', fontWeight: 600, color: '#374151' }}>outcome</th>
                            </tr>
                        </thead>
                        <tbody>
                            {events.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={5}
                                        style={{ padding: '1.5rem', textAlign: 'center', color: '#6b7280' }}
                                    >
                                        No audit events in this range.
                                    </td>
                                </tr>
                            ) : (
                                events.map((ev) => {
                                    const sev = severityStyle(ev.severity);
                                    return (
                                        <tr key={ev.event_id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                            <td style={{ padding: '0.5rem 0.75rem', whiteSpace: 'nowrap', color: '#6b7280' }}>
                                                {new Date(ev.created_at).toLocaleString()}
                                            </td>
                                            <td style={{
                                                padding: '0.5rem 0.75rem',
                                                maxWidth: 160,
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                                fontFamily: 'monospace',
                                                color: '#374151',
                                            }}>
                                                {ev.bot_id}
                                            </td>
                                            <td style={{ padding: '0.5rem 0.75rem', fontFamily: 'monospace', color: '#6366f1' }}>
                                                {ev.event_type}
                                            </td>
                                            <td style={{ padding: '0.5rem 0.75rem', color: '#374151' }}>
                                                {ev.source_system}
                                            </td>
                                            <td style={{ padding: '0.5rem 0.75rem' }}>
                                                <span style={{
                                                    padding: '2px 8px',
                                                    borderRadius: 4,
                                                    fontSize: '0.75rem',
                                                    fontWeight: 600,
                                                    background: sev.background,
                                                    color: sev.color,
                                                }}>
                                                    {ev.severity}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {!isLoading && !error && (
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
                    <button
                        type="button"
                        onClick={handlePrev}
                        disabled={offset === 0}
                        style={{
                            padding: '4px 12px',
                            borderRadius: 6,
                            border: '1px solid #e5e7eb',
                            background: offset === 0 ? '#f9fafb' : '#fff',
                            color: offset === 0 ? '#9ca3af' : '#374151',
                            fontSize: '0.78rem',
                            cursor: offset === 0 ? 'default' : 'pointer',
                        }}
                    >
                        Previous
                    </button>
                    <button
                        type="button"
                        onClick={handleNext}
                        disabled={!hasMore}
                        style={{
                            padding: '4px 12px',
                            borderRadius: 6,
                            border: '1px solid #e5e7eb',
                            background: !hasMore ? '#f9fafb' : '#fff',
                            color: !hasMore ? '#9ca3af' : '#374151',
                            fontSize: '0.78rem',
                            cursor: !hasMore ? 'default' : 'pointer',
                        }}
                    >
                        Next
                    </button>
                </div>
            )}
        </section>
    );
}
