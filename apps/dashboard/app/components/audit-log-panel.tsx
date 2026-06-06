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

const severityClass = (severity: string): string => {
    if (severity === 'critical' || severity === 'high') return 'badge high';
    if (severity === 'warn' || severity === 'warning') return 'badge warn';
    return 'badge ok';
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
        <section className="audit-log-standalone">
            <div className="audit-log-standalone-header">
                <h2 className="audit-log-standalone-title">Audit Log</h2>
                {!isLoading && events.length > 0 && (
                    <span className="panel-muted">
                        Rows {offset + 1}–{offset + events.length}
                    </span>
                )}
            </div>

            {error && <p className="panel-error">Failed to load audit log</p>}
            {isLoading && <p className="panel-muted">Loading…</p>}

            {!isLoading && !error && (
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                        <thead>
                            <tr className="audit-log-thead-row">
                                <th className="audit-log-th" style={{ whiteSpace: 'nowrap' }}>Timestamp</th>
                                <th className="audit-log-th">userId</th>
                                <th className="audit-log-th">action</th>
                                <th className="audit-log-th">resource</th>
                                <th className="audit-log-th">outcome</th>
                            </tr>
                        </thead>
                        <tbody>
                            {events.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="audit-log-empty">
                                        No audit events in this range.
                                    </td>
                                </tr>
                            ) : (
                                events.map((ev) => (
                                    <tr key={ev.event_id} className="audit-log-row">
                                        <td className="audit-log-td audit-log-td--muted" style={{ whiteSpace: 'nowrap' }}>
                                            {new Date(ev.created_at).toLocaleString()}
                                        </td>
                                        <td className="audit-log-td audit-log-td--mono" style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {ev.bot_id}
                                        </td>
                                        <td className="audit-log-td audit-log-td--mono audit-log-td--accent">
                                            {ev.event_type}
                                        </td>
                                        <td className="audit-log-td">
                                            {ev.source_system}
                                        </td>
                                        <td className="audit-log-td">
                                            <span className={severityClass(ev.severity)}>
                                                {ev.severity}
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {!isLoading && !error && (
                <div className="audit-log-pagination">
                    <button
                        type="button"
                        onClick={handlePrev}
                        disabled={offset === 0}
                        className="secondary-action"
                    >
                        Previous
                    </button>
                    <button
                        type="button"
                        onClick={handleNext}
                        disabled={!hasMore}
                        className="secondary-action"
                    >
                        Next
                    </button>
                </div>
            )}
        </section>
    );
}
