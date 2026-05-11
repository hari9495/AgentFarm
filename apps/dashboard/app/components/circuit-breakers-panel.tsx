'use client';

import { useEffect, useState } from 'react';

type CircuitBreakersPanelProps = { tenantId: string };

type CircuitEntry = {
    key: string;
    state: 'closed' | 'open' | 'half-open';
    failureCount: number;
    successCount: number;
    openedAt: number | null;
    nextRetryAt: number | null;
};

const STATE_BADGE: Record<CircuitEntry['state'], { bg: string; color: string; label: string }> = {
    closed: { bg: '#dcfce7', color: '#166534', label: 'Closed' },
    open: { bg: '#fee2e2', color: '#991b1b', label: 'Open' },
    'half-open': { bg: '#fef9c3', color: '#854d0e', label: 'Half-Open' },
};

export default function CircuitBreakersPanel({ tenantId: _tenantId }: CircuitBreakersPanelProps) {
    const [circuits, setCircuits] = useState<CircuitEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [resetting, setResetting] = useState<string | null>(null);

    async function fetchCircuits() {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/settings/circuit-breakers', { cache: 'no-store' });
            const data = (await res.json()) as { circuits?: CircuitEntry[]; error?: string };
            if (!res.ok) {
                setError(data.error ?? 'Failed to load circuit breakers.');
            } else {
                setCircuits(data.circuits ?? []);
            }
        } catch {
            setError('Network error loading circuit breakers.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        void fetchCircuits();
    }, []);

    async function handleReset(key: string) {
        setResetting(key);
        try {
            const res = await fetch(
                `/api/settings/circuit-breakers/${encodeURIComponent(key)}/reset`,
                { method: 'POST' },
            );
            const data = (await res.json()) as { reset?: boolean; error?: string };
            if (!res.ok) {
                window.alert(data.error ?? 'Failed to reset circuit breaker.');
                return;
            }
            await fetchCircuits();
        } catch {
            window.alert('Network error resetting circuit breaker.');
        } finally {
            setResetting(null);
        }
    }

    return (
        <section className="card" style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--ink)' }}>
                Circuit Breakers
            </h2>

            {/* In-memory warning */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.5rem',
                    background: '#fffbeb',
                    border: '1px solid #fde68a',
                    borderRadius: '6px',
                    padding: '0.6rem 0.85rem',
                    marginBottom: '1rem',
                    fontSize: '0.8rem',
                    color: '#92400e',
                }}
            >
                <span>⚠</span>
                <span>Circuit breaker state is in-memory and resets on server restart.</span>
            </div>

            {/* Error banner */}
            {error && (
                <div
                    style={{
                        background: '#fef2f2',
                        border: '1px solid #fecaca',
                        borderRadius: '6px',
                        padding: '0.65rem 0.9rem',
                        color: '#dc2626',
                        fontSize: '0.85rem',
                        marginBottom: '0.75rem',
                    }}
                >
                    {error}
                </div>
            )}

            {/* Table */}
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--line)', textAlign: 'left' }}>
                            <th style={{ padding: '0.5rem 0.75rem', color: 'var(--ink-muted)', fontWeight: 500 }}>Key</th>
                            <th style={{ padding: '0.5rem 0.75rem', color: 'var(--ink-muted)', fontWeight: 500 }}>State</th>
                            <th style={{ padding: '0.5rem 0.75rem', color: 'var(--ink-muted)', fontWeight: 500 }}>Failures</th>
                            <th style={{ padding: '0.5rem 0.75rem', color: 'var(--ink-muted)', fontWeight: 500 }}>Opened At</th>
                            <th style={{ padding: '0.5rem 0.75rem', color: 'var(--ink-muted)', fontWeight: 500 }}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && (
                            <tr>
                                <td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: 'var(--ink-muted)' }}>
                                    Loading…
                                </td>
                            </tr>
                        )}
                        {!loading && circuits.length === 0 && (
                            <tr>
                                <td
                                    colSpan={5}
                                    style={{ padding: '2rem', textAlign: 'center', color: 'var(--ink-muted)', fontStyle: 'italic' }}
                                >
                                    No circuit breaker state recorded yet.
                                </td>
                            </tr>
                        )}
                        {!loading &&
                            circuits.map((c) => {
                                const badge = STATE_BADGE[c.state];
                                const canReset = c.state === 'open' || c.state === 'half-open';
                                return (
                                    <tr key={c.key} style={{ borderBottom: '1px solid var(--line)' }}>
                                        <td style={{ padding: '0.65rem 0.75rem' }}>
                                            <code style={{ fontSize: '0.8rem', color: 'var(--ink)' }}>{c.key}</code>
                                        </td>
                                        <td style={{ padding: '0.65rem 0.75rem' }}>
                                            <span
                                                style={{
                                                    display: 'inline-block',
                                                    padding: '0.15rem 0.5rem',
                                                    borderRadius: '4px',
                                                    fontSize: '0.75rem',
                                                    fontWeight: 600,
                                                    background: badge.bg,
                                                    color: badge.color,
                                                }}
                                            >
                                                {badge.label}
                                            </span>
                                        </td>
                                        <td style={{ padding: '0.65rem 0.75rem', color: 'var(--ink-soft)' }}>
                                            {c.failureCount}
                                        </td>
                                        <td style={{ padding: '0.65rem 0.75rem', color: 'var(--ink-muted)', fontSize: '0.8rem' }}>
                                            {c.openedAt ? new Date(c.openedAt).toLocaleString() : '—'}
                                        </td>
                                        <td style={{ padding: '0.65rem 0.75rem' }}>
                                            {canReset && (
                                                <button
                                                    onClick={() => void handleReset(c.key)}
                                                    disabled={resetting === c.key}
                                                    style={{
                                                        padding: '0.25rem 0.6rem',
                                                        fontSize: '0.75rem',
                                                        border: '1px solid var(--line)',
                                                        borderRadius: '4px',
                                                        background: 'var(--bg)',
                                                        color: 'var(--ink)',
                                                        cursor: resetting === c.key ? 'not-allowed' : 'pointer',
                                                        opacity: resetting === c.key ? 0.6 : 1,
                                                    }}
                                                >
                                                    {resetting === c.key ? 'Resetting…' : 'Reset'}
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                    </tbody>
                </table>
            </div>
        </section>
    );
}
