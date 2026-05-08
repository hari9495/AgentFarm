'use client';

import { useEffect, useRef, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

type ActionAuditRecord = {
    actionId: string;
    agentId: string;
    workspaceId: string;
    taskId: string;
    sessionId: string;
    actionType: string;
    target: string;
    payload: unknown;
    screenshotBefore: string;
    screenshotAfter: string;
    domSnapshotBefore?: string;
    domSnapshotAfter?: string;
    domSnapshotHash?: string;
    riskLevel: string;
    success: boolean;
    errorMessage?: string;
    durationMs: number;
    startedAt: string;
    completedAt: string;
    verified: boolean;
};

function EvidenceDashboard() {
    const searchParams = useSearchParams();
    const sessionId = searchParams.get('sessionId')?.trim() ?? '';

    const [actions, setActions] = useState<ActionAuditRecord[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [live, setLive] = useState(false);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        if (!sessionId) {
            setActions([]);
            setLive(false);
            return;
        }

        const poll = async () => {
            try {
                const res = await fetch(`/api/audit/session-actions/${encodeURIComponent(sessionId)}`, {
                    cache: 'no-store',
                });
                if (!res.ok) {
                    const body = await res.json().catch(() => ({})) as { message?: string };
                    setError(body.message ?? `HTTP ${res.status}`);
                    return;
                }
                const data = await res.json() as { actions?: ActionAuditRecord[] };
                setActions(data.actions ?? []);
                setError(null);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Fetch failed');
            }
        };

        void poll();
        setLive(true);
        intervalRef.current = setInterval(() => { void poll(); }, 3000);

        return () => {
            if (intervalRef.current !== null) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
            setLive(false);
        };
    }, [sessionId]);

    const statusBadge = sessionId
        ? <span className="badge ok">Live</span>
        : <span className="badge neutral">Paused</span>;

    return (
        <main className="page-shell" style={{ maxWidth: 1200 }}>
            <header className="hero" style={{ marginBottom: '0.55rem' }}>
                <p className="eyebrow">Observability</p>
                <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    Evidence Viewer {statusBadge}
                </h1>
                <p className="muted">
                    {sessionId
                        ? <>Polling actions for session <code>{sessionId}</code></>
                        : 'Add ?sessionId=… to the URL to start live polling.'}
                </p>
            </header>

            {error && (
                <div className="card" style={{ borderColor: 'var(--danger-border)', background: 'var(--danger-bg)', marginBottom: '1rem' }}>
                    <p style={{ color: 'var(--danger)', margin: 0 }}>{error}</p>
                </div>
            )}

            {sessionId && (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--line-strong)' }}>
                                {(['Action ID', 'Type', 'Target', 'Status', 'Duration', 'Started At'] as const).map((h) => (
                                    <th key={h} style={{ padding: '0.6rem 1rem', textAlign: 'left', color: 'var(--ink-soft)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {actions.length === 0 ? (
                                <tr>
                                    <td colSpan={6} style={{ padding: '1.5rem 1rem', color: 'var(--ink-muted)', textAlign: 'center' }}>
                                        No actions recorded yet.
                                    </td>
                                </tr>
                            ) : (
                                actions.map((a) => (
                                    <tr key={a.actionId} style={{ borderBottom: '1px solid var(--line)' }}>
                                        <td style={{ padding: '0.5rem 1rem', fontFamily: 'var(--font-plex-mono)', fontSize: '0.78rem', color: 'var(--ink-soft)' }}>
                                            {a.actionId.slice(0, 12)}…
                                        </td>
                                        <td style={{ padding: '0.5rem 1rem' }}>{a.actionType}</td>
                                        <td style={{ padding: '0.5rem 1rem', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.target}>
                                            {a.target}
                                        </td>
                                        <td style={{ padding: '0.5rem 1rem' }}>
                                            <span className={`badge ${a.success ? 'ok' : 'high'}`}>
                                                {a.success ? 'success' : 'error'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '0.5rem 1rem', fontFamily: 'var(--font-plex-mono)', fontSize: '0.78rem' }}>
                                            {a.durationMs} ms
                                        </td>
                                        <td style={{ padding: '0.5rem 1rem', fontFamily: 'var(--font-plex-mono)', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                                            {new Date(a.startedAt).toLocaleTimeString()}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </main>
    );
}

export default function AuditPage() {
    return (
        <Suspense fallback={
            <main className="page-shell">
                <p className="muted">Loading…</p>
            </main>
        }>
            <EvidenceDashboard />
        </Suspense>
    );
}
