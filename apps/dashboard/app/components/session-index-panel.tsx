'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';

type AgentSessionRow = {
    id: string;
    taskId: string;
    status: string;
    startedAt: string;
    createdAt: string;
};

const STATUS_BADGE: Record<string, { bg: string; color: string }> = {
    running: { bg: '#dbeafe', color: '#1d4ed8' },
    active: { bg: '#dbeafe', color: '#1d4ed8' },
    completed: { bg: '#dcfce7', color: '#166534' },
    failed: { bg: '#fee2e2', color: '#dc2626' },
};

const fallbackBadge = { bg: '#f1f5f9', color: '#475569' };

function truncate(value: string, max: number): string {
    return value.length > max ? `${value.slice(0, max)}…` : value;
}

export function SessionIndexPanel() {
    const [sessions, setSessions] = useState<AgentSessionRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchSessions = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/audit/sessions', { cache: 'no-store' });
            const body = (await res.json().catch(() => ({}))) as { sessions?: AgentSessionRow[]; message?: string };
            if (!res.ok) {
                setError(body.message ?? 'Failed to load sessions.');
            } else {
                setSessions(Array.isArray(body.sessions) ? body.sessions : []);
            }
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchSessions();
    }, [fetchSessions]);

    if (error) {
        return (
            <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, color: '#dc2626', fontSize: '0.875rem' }}>
                {error}
            </div>
        );
    }

    if (loading) {
        return (
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
                <thead>
                    <tr style={{ borderBottom: '1px solid var(--line)' }}>
                        <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', fontSize: '0.8rem', color: 'var(--ink-muted)' }}>Session ID</th>
                        <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', fontSize: '0.8rem', color: 'var(--ink-muted)' }}>Task ID</th>
                        <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', fontSize: '0.8rem', color: 'var(--ink-muted)' }}>Status</th>
                        <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', fontSize: '0.8rem', color: 'var(--ink-muted)' }}>Started</th>
                        <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', fontSize: '0.8rem', color: 'var(--ink-muted)' }}>Action</th>
                    </tr>
                </thead>
                <tbody>
                    {[0, 1, 2].map((i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--line)' }}>
                            {[0, 1, 2, 3, 4].map((j) => (
                                <td key={j} style={{ padding: '0.6rem 0.75rem' }}>
                                    <div style={{ height: '0.85rem', background: 'var(--line)', borderRadius: 4, width: j === 4 ? '4rem' : '80%', opacity: 0.5 }} />
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        );
    }

    if (sessions.length === 0) {
        return (
            <p style={{ marginTop: '1rem', color: 'var(--ink-muted)', fontSize: '0.875rem' }}>
                No sessions recorded yet.
            </p>
        );
    }

    return (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
            <thead>
                <tr style={{ borderBottom: '1px solid var(--line)' }}>
                    <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', fontSize: '0.8rem', color: 'var(--ink-muted)' }}>Session ID</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', fontSize: '0.8rem', color: 'var(--ink-muted)' }}>Task ID</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', fontSize: '0.8rem', color: 'var(--ink-muted)' }}>Status</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', fontSize: '0.8rem', color: 'var(--ink-muted)' }}>Started</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', fontSize: '0.8rem', color: 'var(--ink-muted)' }}>Action</th>
                </tr>
            </thead>
            <tbody>
                {sessions.map((session) => {
                    const badge = STATUS_BADGE[session.status.toLowerCase()] ?? fallbackBadge;
                    return (
                        <tr key={session.id} style={{ borderBottom: '1px solid var(--line)' }}>
                            <td style={{ padding: '0.6rem 0.75rem', fontSize: '0.83rem', color: 'var(--ink)', fontFamily: 'monospace' }}>
                                {truncate(session.id, 16)}
                            </td>
                            <td style={{ padding: '0.6rem 0.75rem', fontSize: '0.83rem', color: 'var(--ink-soft)', fontFamily: 'monospace' }}>
                                {truncate(session.taskId, 16)}
                            </td>
                            <td style={{ padding: '0.6rem 0.75rem' }}>
                                <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', borderRadius: 99, background: badge.bg, color: badge.color, fontWeight: 600 }}>
                                    {session.status}
                                </span>
                            </td>
                            <td style={{ padding: '0.6rem 0.75rem', fontSize: '0.8rem', color: 'var(--ink-muted)' }}>
                                {new Date(session.startedAt).toLocaleString()}
                            </td>
                            <td style={{ padding: '0.6rem 0.75rem' }}>
                                <Link
                                    href={`/audit/session-replay?sessionId=${encodeURIComponent(session.id)}`}
                                    style={{ fontSize: '0.82rem', color: '#6366f1', textDecoration: 'none', fontWeight: 600 }}
                                >
                                    Replay →
                                </Link>
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
}
