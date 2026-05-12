'use client';

import { useCallback, useEffect, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

type Snapshot = {
    id: string;
    bot_id: string;
    tenant_id: string;
    workspace_id: string;
    role_key: string;
    role_version: string;
    policy_pack_version: string;
    allowed_connector_tools: string[];
    allowed_actions: string[];
    brain_config: unknown;
    language_tier: string;
    speech_provider: string;
    translation_provider: string;
    tts_provider: string;
    avatar_enabled: boolean;
    avatar_provider: string | null;
    snapshot_version: number;
    snapshot_checksum: string | null;
    source: string;
    frozen_at: string | null;
    created_at: string;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const SOURCE_BADGE: Record<string, { bg: string; color: string }> = {
    runtime_freeze: { bg: '#dbeafe', color: '#1d4ed8' },
    manual: { bg: '#dcfce7', color: '#166534' },
    migration: { bg: '#f3e8ff', color: '#7c3aed' },
};

function inlineBadge(label: string, map: Record<string, { bg: string; color: string }>) {
    const style = map[label] ?? { bg: 'var(--line)', color: 'var(--ink-muted)' };
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
            {label}
        </span>
    );
}

function truncate(value: string | null, maxLen: number): string {
    if (!value) return '—';
    return value.length > maxLen ? `${value.slice(0, maxLen)}…` : value;
}

// ── Collapsible list helper ───────────────────────────────────────────────────

function CollapsibleList({ label, items }: { label: string; items: string[] }) {
    const [open, setOpen] = useState(false);
    return (
        <div>
            <button
                type="button"
                style={{
                    all: 'unset',
                    cursor: 'pointer',
                    fontSize: '0.78rem',
                    color: 'var(--ink-muted)',
                    fontWeight: 600,
                    textDecoration: 'underline',
                }}
                onClick={() => setOpen((v) => !v)}
            >
                {open ? 'Hide' : `Show ${items.length}`} {label}
            </button>
            {open && (
                <ul style={{ margin: '0.35rem 0 0', padding: '0 0 0 1rem', fontSize: '0.8rem', display: 'grid', gap: '0.2rem' }}>
                    {items.map((item, i) => (
                        <li key={i}><code style={{ fontSize: '0.77rem' }}>{item}</code></li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function CollapsibleJson({ label, value }: { label: string; value: unknown }) {
    const [open, setOpen] = useState(false);
    return (
        <div>
            <button
                type="button"
                style={{
                    all: 'unset',
                    cursor: 'pointer',
                    fontSize: '0.78rem',
                    color: 'var(--ink-muted)',
                    fontWeight: 600,
                    textDecoration: 'underline',
                }}
                onClick={() => setOpen((v) => !v)}
            >
                {open ? 'Hide' : 'Show'} {label}
            </button>
            {open && (
                <pre
                    style={{
                        margin: '0.35rem 0 0',
                        padding: '0.6rem',
                        background: '#1e1e2e',
                        color: '#cdd6f4',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        overflow: 'auto',
                        maxHeight: '200px',
                    }}
                >
                    {JSON.stringify(value, null, 2)}
                </pre>
            )}
        </div>
    );
}

// ── Snapshot detail view ──────────────────────────────────────────────────────

function SnapshotDetail({ snapshot, isHistorical, onBack }: { snapshot: Snapshot; isHistorical: boolean; onBack?: () => void }) {
    return (
        <div style={{ display: 'grid', gap: '0.55rem', fontSize: '0.86rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <strong>v{snapshot.snapshot_version}</strong>
                {inlineBadge(snapshot.source, SOURCE_BADGE)}
                {isHistorical && (
                    <span
                        style={{
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 700,
                            background: '#fef9c3',
                            color: '#854d0e',
                        }}
                    >
                        HISTORICAL
                    </span>
                )}
                {isHistorical && onBack && (
                    <button
                        type="button"
                        className="secondary-action"
                        style={{ fontSize: '0.78rem' }}
                        onClick={onBack}
                    >
                        ← Back to latest
                    </button>
                )}
            </div>
            <div style={{ display: 'grid', gap: '0.25rem', color: 'var(--ink-muted)', fontSize: '0.8rem' }}>
                <span>Frozen: {snapshot.frozen_at ?? '—'}</span>
                <span>Checksum: <code style={{ fontSize: '0.77rem' }}>{truncate(snapshot.snapshot_checksum, 12)}</code></span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem' }}>
                <span><span style={{ color: 'var(--ink-muted)' }}>Role Key: </span>{snapshot.role_key}</span>
                <span><span style={{ color: 'var(--ink-muted)' }}>Role Version: </span>{snapshot.role_version}</span>
                <span><span style={{ color: 'var(--ink-muted)' }}>Policy Pack: </span>{snapshot.policy_pack_version}</span>
                <span><span style={{ color: 'var(--ink-muted)' }}>Language Tier: </span>{snapshot.language_tier}</span>
                <span><span style={{ color: 'var(--ink-muted)' }}>Speech Provider: </span>{snapshot.speech_provider}</span>
                <span><span style={{ color: 'var(--ink-muted)' }}>TTS Provider: </span>{snapshot.tts_provider}</span>
                <span>
                    <span style={{ color: 'var(--ink-muted)' }}>Avatar Enabled: </span>
                    {snapshot.avatar_enabled ? '✓' : '✗'}
                </span>
                <span><span style={{ color: 'var(--ink-muted)' }}>Avatar Provider: </span>{snapshot.avatar_provider ?? '—'}</span>
            </div>
            <CollapsibleList label="actions" items={snapshot.allowed_actions} />
            <CollapsibleList label="tools" items={snapshot.allowed_connector_tools} />
            <CollapsibleJson label="brain config" value={snapshot.brain_config} />
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────

type CapabilitySnapshotPanelProps = {
    botId: string;
};

export default function CapabilitySnapshotPanel({ botId }: CapabilitySnapshotPanelProps) {
    const [latest, setLatest] = useState<Snapshot | null>(null);
    const [latestLoading, setLatestLoading] = useState(false);
    const [latestError, setLatestError] = useState<string | null>(null);

    const [history, setHistory] = useState<Snapshot[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState<string | null>(null);

    const [selectedSnapshot, setSelectedSnapshot] = useState<Snapshot | null>(null);
    const [showHistory, setShowHistory] = useState(false);

    const fetchLatest = useCallback(async () => {
        if (!botId) return;
        setLatestLoading(true);
        setLatestError(null);

        const response = await fetch(
            `/api/bots/${encodeURIComponent(botId)}/snapshots/latest`,
            { cache: 'no-store' },
        );

        if (response.status === 404) {
            setLatest(null);
            setLatestLoading(false);
            return;
        }

        const data = (await response.json().catch(() => ({}))) as { snapshot?: Snapshot; message?: string };

        if (!response.ok) {
            setLatestError(data.message ?? 'Unable to load snapshot.');
            setLatestLoading(false);
            return;
        }

        setLatest(data.snapshot ?? null);
        setLatestLoading(false);
    }, [botId]);

    const fetchHistory = useCallback(async () => {
        if (!botId) return;
        setHistoryLoading(true);
        setHistoryError(null);

        const response = await fetch(
            `/api/bots/${encodeURIComponent(botId)}/snapshots/history`,
            { cache: 'no-store' },
        );
        const data = (await response.json().catch(() => ({}))) as { snapshots?: Snapshot[]; message?: string };

        if (!response.ok) {
            setHistoryError(data.message ?? 'Unable to load snapshot history.');
            setHistoryLoading(false);
            return;
        }

        setHistory(data.snapshots ?? []);
        setHistoryLoading(false);
    }, [botId]);

    useEffect(() => {
        void fetchLatest();
    }, [fetchLatest]);

    useEffect(() => {
        if (showHistory) void fetchHistory();
    }, [showHistory, fetchHistory]);

    const displaySnapshot = selectedSnapshot ?? latest;

    return (
        <section className="card" style={{ display: 'grid', gap: '1.5rem' }}>

            {/* ── Section 1: Latest Snapshot ──────────────────────────── */}
            <div>
                <h2 style={{ margin: '0 0 0.6rem' }}>Latest Snapshot</h2>

                {!botId && (
                    <p style={{ margin: 0, color: 'var(--ink-soft)', fontStyle: 'italic' }}>
                        No bot ID provided. Pass <code>?botId=&lt;id&gt;</code> in the URL to view snapshots.
                    </p>
                )}

                {botId && latestLoading && (
                    <p style={{ margin: 0, color: 'var(--ink-soft)' }}>Loading snapshot…</p>
                )}
                {botId && latestError && <p className="message-inline">{latestError}</p>}

                {botId && !latestLoading && !latestError && latest === null && !selectedSnapshot && (
                    <p style={{ margin: 0, color: 'var(--ink-soft)', fontStyle: 'italic' }}>
                        No snapshot available for this bot.
                    </p>
                )}

                {botId && !latestLoading && !latestError && displaySnapshot && (
                    <SnapshotDetail
                        snapshot={displaySnapshot}
                        isHistorical={selectedSnapshot !== null}
                        onBack={() => setSelectedSnapshot(null)}
                    />
                )}
            </div>

            {/* ── Section 2: History ──────────────────────────────────── */}
            {botId && (
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: showHistory ? '0.6rem' : 0 }}>
                        <h2 style={{ margin: 0 }}>History</h2>
                        <button
                            type="button"
                            className="secondary-action"
                            onClick={() => setShowHistory((v) => !v)}
                        >
                            {showHistory ? 'Hide History' : 'Show History'}
                        </button>
                    </div>

                    {showHistory && (
                        <>
                            {historyLoading && (
                                <p style={{ margin: 0, color: 'var(--ink-soft)' }}>Loading history…</p>
                            )}
                            {historyError && <p className="message-inline">{historyError}</p>}

                            {!historyLoading && !historyError && history.length === 0 && (
                                <p style={{ margin: 0, color: 'var(--ink-soft)', fontStyle: 'italic' }}>
                                    No historical snapshots found.
                                </p>
                            )}

                            {!historyLoading && !historyError && history.length > 0 && (
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '1px solid var(--line)', textAlign: 'left' }}>
                                                <th style={{ padding: '0.35rem 0.5rem', color: 'var(--ink-muted)', fontWeight: 600 }}>Version</th>
                                                <th style={{ padding: '0.35rem 0.5rem', color: 'var(--ink-muted)', fontWeight: 600 }}>Source</th>
                                                <th style={{ padding: '0.35rem 0.5rem', color: 'var(--ink-muted)', fontWeight: 600 }}>Frozen At</th>
                                                <th style={{ padding: '0.35rem 0.5rem', color: 'var(--ink-muted)', fontWeight: 600 }}>Checksum</th>
                                                <th style={{ padding: '0.35rem 0.5rem', color: 'var(--ink-muted)', fontWeight: 600 }}></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {history.map((snap) => (
                                                <tr
                                                    key={snap.id}
                                                    style={{ borderBottom: '1px solid var(--line)' }}
                                                >
                                                    <td style={{ padding: '0.35rem 0.5rem' }}>
                                                        <strong>v{snap.snapshot_version}</strong>
                                                    </td>
                                                    <td style={{ padding: '0.35rem 0.5rem' }}>
                                                        {inlineBadge(snap.source, SOURCE_BADGE)}
                                                    </td>
                                                    <td style={{ padding: '0.35rem 0.5rem', color: 'var(--ink-soft)' }}>
                                                        {snap.frozen_at ?? '—'}
                                                    </td>
                                                    <td style={{ padding: '0.35rem 0.5rem' }}>
                                                        <code style={{ fontSize: '0.78rem' }}>
                                                            {truncate(snap.snapshot_checksum, 12)}
                                                        </code>
                                                    </td>
                                                    <td style={{ padding: '0.35rem 0.5rem' }}>
                                                        <button
                                                            type="button"
                                                            className="secondary-action"
                                                            style={{ fontSize: '0.78rem' }}
                                                            onClick={() => setSelectedSnapshot(snap)}
                                                        >
                                                            View
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </section>
    );
}
