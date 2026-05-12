'use client';

import { useCallback, useEffect, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

type NotificationRow = {
    id: string;
    tenantId: string;
    workspaceId: string | null;
    channel: string;
    eventTrigger: string;
    status: string;
    error: string | null;
    sentAt: string;
};

type SummaryEntry = {
    channel: string;
    status: string;
    count: number;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const CHANNEL_COLORS: Record<string, { bg: string; color: string }> = {
    slack: { bg: '#4a154b', color: '#e8d5ff' },
    email: { bg: '#1e3a5f', color: '#bfdbfe' },
    teams: { bg: '#1a3a6b', color: '#a5c8ff' },
    discord: { bg: '#1e1b4b', color: '#c7d2fe' },
    sms: { bg: '#1c2d1e', color: '#bbf7d0' },
};

const STATUS_BADGE: Record<string, { bg: string; color: string }> = {
    sent: { bg: '#dcfce7', color: '#166534' },
    failed: { bg: '#fee2e2', color: '#991b1b' },
    retrying: { bg: '#fef9c3', color: '#854d0e' },
    suppressed: { bg: '#f1f5f9', color: '#475569' },
};

function channelStyle(channel: string): { bg: string; color: string } {
    return CHANNEL_COLORS[channel.toLowerCase()] ?? { bg: '#27272a', color: '#a1a1aa' };
}

function statusBadge(status: string) {
    const style = STATUS_BADGE[status] ?? { bg: 'var(--line)', color: 'var(--ink-muted)' };
    return (
        <span
            style={{
                padding: '2px 8px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 700,
                background: style.bg,
                color: style.color,
            }}
        >
            {status}
        </span>
    );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function NotificationsPanel() {
    const [notifications, setNotifications] = useState<NotificationRow[]>([]);
    const [summary, setSummary] = useState<SummaryEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [channelFilter, setChannelFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [limitInput, setLimitInput] = useState('50');

    const fetchAll = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams();
            params.set('limit', limitInput || '50');
            if (channelFilter) params.set('channel', channelFilter);
            if (statusFilter) params.set('status', statusFilter);

            const [notifRes, summaryRes] = await Promise.all([
                fetch(`/api/notifications?${params.toString()}`, { cache: 'no-store' }),
                fetch('/api/notifications/summary', { cache: 'no-store' }),
            ]);

            const notifData = (await notifRes.json().catch(() => ({}))) as {
                notifications?: NotificationRow[];
                message?: string;
            };
            const summaryData = (await summaryRes.json().catch(() => ({}))) as {
                summary?: SummaryEntry[];
            };

            if (!notifRes.ok) {
                setError(notifData.message ?? 'Failed to load notifications.');
                return;
            }

            setNotifications(notifData.notifications ?? []);
            setSummary(summaryData.summary ?? []);
        } catch {
            setError('Failed to load notifications.');
        } finally {
            setLoading(false);
        }
    }, [channelFilter, statusFilter, limitInput]);

    useEffect(() => {
        void fetchAll();
    }, [fetchAll]);

    // Aggregate summary by channel
    const channelTotals = summary.reduce<Record<string, number>>((acc, entry) => {
        acc[entry.channel] = (acc[entry.channel] ?? 0) + entry.count;
        return acc;
    }, {});

    const thStyle: React.CSSProperties = {
        padding: '0.4rem 0.5rem',
        color: 'var(--ink-muted)',
        fontWeight: 600,
        textAlign: 'left',
        borderBottom: '1px solid var(--line)',
    };

    const inputStyle: React.CSSProperties = {
        fontSize: '0.85rem',
        padding: '0.3rem 0.5rem',
        borderRadius: '4px',
        border: '1px solid var(--line)',
        background: 'var(--bg)',
        color: 'var(--ink)',
    };

    return (
        <section className="card" style={{ marginTop: '1rem' }}>
            <h2 style={{ marginBottom: '0.25rem' }}>Notification Log</h2>
            <p style={{ margin: '-0.25rem 0 0.75rem', fontSize: '0.84rem', color: 'var(--ink-muted)' }}>
                Live notification delivery status across all channels.
            </p>

            {/* Error banner */}
            {error && (
                <p
                    style={{
                        padding: '0.6rem 0.8rem',
                        background: '#450a0a',
                        border: '1px solid #991b1b',
                        borderRadius: '6px',
                        color: '#fca5a5',
                        fontSize: '0.84rem',
                        marginBottom: '0.75rem',
                    }}
                >
                    {error}
                </p>
            )}

            {/* Channel summary cards */}
            {Object.keys(channelTotals).length > 0 && (
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                    {Object.entries(channelTotals).map(([ch, count]) => {
                        const cs = channelStyle(ch);
                        return (
                            <div
                                key={ch}
                                style={{
                                    padding: '0.4rem 0.75rem',
                                    borderRadius: '6px',
                                    background: cs.bg,
                                    color: cs.color,
                                    fontSize: '0.82rem',
                                }}
                            >
                                <strong>{ch}</strong>
                                <span style={{ marginLeft: '0.4rem' }}>{count}</span>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Filter bar */}
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                <select
                    value={channelFilter}
                    onChange={e => setChannelFilter(e.target.value)}
                    style={inputStyle}
                >
                    <option value="">All channels</option>
                    <option value="slack">slack</option>
                    <option value="email">email</option>
                    <option value="teams">teams</option>
                    <option value="discord">discord</option>
                    <option value="sms">sms</option>
                </select>
                <select
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                    style={inputStyle}
                >
                    <option value="">All statuses</option>
                    <option value="sent">sent</option>
                    <option value="failed">failed</option>
                    <option value="retrying">retrying</option>
                    <option value="suppressed">suppressed</option>
                </select>
                <input
                    type="number"
                    value={limitInput}
                    min={10}
                    max={200}
                    onChange={e => setLimitInput(e.target.value)}
                    placeholder="Limit"
                    style={{ ...inputStyle, width: '5rem' }}
                />
                <button
                    onClick={() => void fetchAll()}
                    disabled={loading}
                    style={{ fontSize: '0.85rem', padding: '0.3rem 0.75rem', borderRadius: '4px', cursor: 'pointer' }}
                >
                    {loading ? 'Loading…' : 'Refresh'}
                </button>
            </div>

            {/* Loading skeleton */}
            {loading && (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                        <tr>
                            {['Channel', 'Trigger', 'Status', 'Workspace', 'Error', 'Sent At'].map(h => (
                                <th key={h} style={thStyle}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {[0, 1, 2, 3, 4].map(i => (
                            <tr key={i} style={{ borderBottom: '1px solid var(--line)', opacity: 0.4 }}>
                                {[0, 1, 2, 3, 4, 5].map(j => (
                                    <td key={j} style={{ padding: '0.5rem' }}>
                                        <div style={{ height: '0.8rem', background: 'var(--line)', borderRadius: '3px', width: '75%' }} />
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            {/* Empty state */}
            {!loading && notifications.length === 0 && !error && (
                <p style={{ color: 'var(--ink-muted)', fontSize: '0.86rem', textAlign: 'center', padding: '1.5rem 0' }}>
                    No notifications found.
                </p>
            )}

            {/* Notifications table */}
            {!loading && notifications.length > 0 && (
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead>
                            <tr>
                                {['Channel', 'Trigger', 'Status', 'Workspace', 'Error', 'Sent At'].map(h => (
                                    <th key={h} style={thStyle}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {notifications.map(n => {
                                const cs = channelStyle(n.channel);
                                const errDisplay = n.error
                                    ? (n.error.length > 40 ? n.error.slice(0, 39) + '\u2026' : n.error)
                                    : '\u2014';
                                const sentDate = new Date(n.sentAt);
                                return (
                                    <tr key={n.id} style={{ borderBottom: '1px solid var(--line)' }}>
                                        <td style={{ padding: '0.5rem' }}>
                                            <span
                                                style={{
                                                    padding: '2px 8px',
                                                    borderRadius: '4px',
                                                    fontSize: '11px',
                                                    fontWeight: 700,
                                                    background: cs.bg,
                                                    color: cs.color,
                                                }}
                                            >
                                                {n.channel}
                                            </span>
                                        </td>
                                        <td style={{ padding: '0.5rem', fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--ink)' }}>
                                            {n.eventTrigger}
                                        </td>
                                        <td style={{ padding: '0.5rem' }}>{statusBadge(n.status)}</td>
                                        <td style={{ padding: '0.5rem', color: 'var(--ink-soft)', fontSize: '0.82rem' }}>
                                            {n.workspaceId ?? '\u2014'}
                                        </td>
                                        <td
                                            style={{ padding: '0.5rem', color: 'var(--ink-muted)', fontSize: '0.8rem' }}
                                            title={n.error ?? ''}
                                        >
                                            {errDisplay}
                                        </td>
                                        <td style={{ padding: '0.5rem', color: 'var(--ink-soft)', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                                            {sentDate.toLocaleDateString()} {sentDate.toLocaleTimeString()}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}
