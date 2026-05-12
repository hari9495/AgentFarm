'use client';

import { useEffect, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

type DiffLine = {
    type: 'added' | 'removed' | 'unchanged';
    key: string;
    oldValue?: unknown;
    newValue?: unknown;
};

export type BotConfigVersion = {
    id: string;
    botId: string;
    tenantId: string;
    versionNumber: number;
    role: string;
    status: string;
    roleVersion: string | null;
    policyPackVersion: string | null;
    brainConfig: unknown | null;
    changeNote: string | null;
    createdBy: string;
    createdAt: string;
};

export type AgentVersionHistoryProps = {
    botId: string;
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function AgentVersionHistory({ botId }: AgentVersionHistoryProps) {
    const [versions, setVersions] = useState<BotConfigVersion[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [snapshotLoading, setSnapshotLoading] = useState(false);
    const [snapshotNote, setSnapshotNote] = useState('');
    const [restoring, setRestoring] = useState<string | null>(null);

    // Diff state
    const [diffBase, setDiffBase] = useState<string | null>(null);
    const [diffTarget, setDiffTarget] = useState<string | null>(null);
    const [diffLines, setDiffLines] = useState<DiffLine[]>([]);
    const [diffLoading, setDiffLoading] = useState(false);
    const [diffError, setDiffError] = useState<string | null>(null);
    const [showDiff, setShowDiff] = useState(false);

    async function load() {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/agents/${botId}/versions`);
            if (!res.ok) {
                setError('Failed to load version history.');
                return;
            }
            const data = (await res.json()) as { versions?: BotConfigVersion[] };
            setVersions(data.versions ?? []);
        } catch {
            setError('Network error loading versions.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [botId]);

    async function takeSnapshot() {
        setSnapshotLoading(true);
        try {
            const res = await fetch(`/api/agents/${botId}/versions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ changeNote: snapshotNote || undefined }),
            });
            if (res.ok) {
                setSnapshotNote('');
                await load();
            }
        } finally {
            setSnapshotLoading(false);
        }
    }

    async function restoreVersion(versionId: string) {
        setRestoring(versionId);
        try {
            const res = await fetch(`/api/agents/${botId}/versions/${versionId}/restore`, {
                method: 'POST',
            });
            if (res.ok) {
                await load();
            }
        } finally {
            setRestoring(null);
        }
    }

    function computeDiff(
        baseConfig: Record<string, unknown> | null | undefined,
        targetConfig: Record<string, unknown> | null | undefined,
    ): DiffLine[] {
        if (!baseConfig && !targetConfig) return [];
        const base = baseConfig ?? {};
        const target = targetConfig ?? {};
        const allKeys = Array.from(new Set([...Object.keys(base), ...Object.keys(target)]));
        const lines: DiffLine[] = [];

        for (const key of allKeys) {
            const inBase = Object.prototype.hasOwnProperty.call(base, key);
            const inTarget = Object.prototype.hasOwnProperty.call(target, key);
            if (inBase && inTarget) {
                if (JSON.stringify(base[key]) === JSON.stringify(target[key])) {
                    lines.push({ type: 'unchanged', key });
                } else {
                    lines.push({ type: 'removed', key, oldValue: base[key] });
                    lines.push({ type: 'added', key, newValue: target[key] });
                }
            } else if (inBase) {
                lines.push({ type: 'removed', key, oldValue: base[key] });
            } else {
                lines.push({ type: 'added', key, newValue: target[key] });
            }
        }

        return lines;
    }

    async function loadAndDiff(baseId: string, targetId: string) {
        setDiffLoading(true);
        setDiffError(null);
        setDiffLines([]);
        try {
            const [baseRes, targetRes] = await Promise.all([
                fetch(`/api/agents/${botId}/versions/${baseId}`),
                fetch(`/api/agents/${botId}/versions/${targetId}`),
            ]);
            if (!baseRes.ok || !targetRes.ok) {
                setDiffError('Failed to fetch one or both versions for diff.');
                setDiffLoading(false);
                setShowDiff(true);
                return;
            }
            const [baseData, targetData] = await Promise.all([
                baseRes.json() as Promise<{ version?: BotConfigVersion }>,
                targetRes.json() as Promise<{ version?: BotConfigVersion }>,
            ]);
            const baseVer = baseData.version;
            const targetVer = targetData.version;
            const baseConfig = baseVer?.brainConfig != null
                ? (baseVer.brainConfig as Record<string, unknown>)
                : null;
            const targetConfig = targetVer?.brainConfig != null
                ? (targetVer.brainConfig as Record<string, unknown>)
                : null;
            setDiffLines(computeDiff(baseConfig, targetConfig));
        } catch {
            setDiffError('Network error computing diff.');
        } finally {
            setDiffLoading(false);
            setShowDiff(true);
        }
    }

    if (loading) {
        return <p style={{ color: '#475569', fontSize: '13px' }}>Loading versions…</p>;
    }
    if (error) {
        return (
            <p style={{ color: '#fca5a5', fontSize: '13px' }}>{error}</p>
        );
    }

    return (
        <div>
            {/* Take snapshot */}
            <div
                style={{
                    background: '#0f172a',
                    border: '1px solid #1e293b',
                    borderRadius: '8px',
                    padding: '14px',
                    marginBottom: '20px',
                }}
            >
                <div
                    style={{
                        fontSize: '12px',
                        fontWeight: 700,
                        color: '#475569',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        marginBottom: '10px',
                    }}
                >
                    Snapshot Config
                </div>
                <input
                    type="text"
                    placeholder="Change note (optional)"
                    value={snapshotNote}
                    onChange={(e) => setSnapshotNote(e.target.value)}
                    style={{
                        width: '100%',
                        padding: '7px 10px',
                        background: '#1e293b',
                        border: '1px solid #334155',
                        borderRadius: '6px',
                        color: '#e2e8f0',
                        fontSize: '12px',
                        marginBottom: '8px',
                        boxSizing: 'border-box',
                    }}
                />
                <button
                    onClick={takeSnapshot}
                    disabled={snapshotLoading}
                    style={{
                        padding: '6px 14px',
                        background: '#1e293b',
                        border: '1px solid #334155',
                        borderRadius: '6px',
                        color: '#94a3b8',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: snapshotLoading ? 'not-allowed' : 'pointer',
                    }}
                >
                    {snapshotLoading ? 'Saving…' : 'Take Snapshot'}
                </button>
            </div>

            {/* Version list */}
            {versions.length === 0 ? (
                <p style={{ color: '#475569', fontSize: '13px' }}>No versions yet.</p>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {versions.map((v) => (
                        <div
                            key={v.id}
                            style={{
                                padding: '12px 14px',
                                background: '#0f172a',
                                border: '1px solid #1e293b',
                                borderRadius: '8px',
                                display: 'flex',
                                alignItems: 'flex-start',
                                justifyContent: 'space-between',
                                gap: '12px',
                            }}
                        >
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                    <span
                                        style={{
                                            fontSize: '13px',
                                            fontWeight: 700,
                                            color: '#e2e8f0',
                                        }}
                                    >
                                        v{v.versionNumber}
                                    </span>
                                    <span
                                        style={{
                                            fontSize: '11px',
                                            color: '#475569',
                                            fontFamily: 'monospace',
                                        }}
                                    >
                                        {v.role}
                                    </span>
                                </div>
                                {v.changeNote && (
                                    <div
                                        style={{
                                            fontSize: '12px',
                                            color: '#94a3b8',
                                            marginBottom: '4px',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        {v.changeNote}
                                    </div>
                                )}
                                <div style={{ fontSize: '11px', color: '#334155' }}>
                                    {new Date(v.createdAt).toLocaleString()} · by {v.createdBy}
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '6px', flexShrink: 0, alignItems: 'flex-start' }}>
                                <button
                                    onClick={() => {
                                        if (diffBase === v.id) {
                                            setDiffBase(null);
                                            setShowDiff(false);
                                        } else {
                                            setDiffBase(v.id);
                                            setShowDiff(false);
                                        }
                                    }}
                                    style={{
                                        padding: '5px 10px',
                                        background: diffBase === v.id ? '#1e3a5f' : '#1e293b',
                                        border: diffBase === v.id ? '1px solid #3b82f6' : '1px solid #334155',
                                        borderRadius: '5px',
                                        color: diffBase === v.id ? '#93c5fd' : '#94a3b8',
                                        fontSize: '11px',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        flexShrink: 0,
                                    }}
                                >
                                    {diffBase === v.id ? 'Base ✓' : 'Set Base'}
                                </button>
                                {diffBase && diffBase !== v.id && (
                                    <button
                                        onClick={() => {
                                            setDiffTarget(v.id);
                                            void loadAndDiff(diffBase, v.id);
                                        }}
                                        disabled={diffLoading}
                                        style={{
                                            padding: '5px 10px',
                                            background: diffTarget === v.id ? '#1e3a5f' : '#1e293b',
                                            border: diffTarget === v.id ? '1px solid #3b82f6' : '1px solid #334155',
                                            borderRadius: '5px',
                                            color: diffTarget === v.id ? '#93c5fd' : '#94a3b8',
                                            fontSize: '11px',
                                            fontWeight: 600,
                                            cursor: diffLoading ? 'not-allowed' : 'pointer',
                                            flexShrink: 0,
                                        }}
                                    >
                                        {diffLoading && diffTarget === v.id ? '…' : 'Compare →'}
                                    </button>
                                )}
                                <button
                                    onClick={() => void restoreVersion(v.id)}
                                    disabled={restoring === v.id}
                                    style={{
                                        padding: '5px 10px',
                                        background: '#1e293b',
                                        border: '1px solid #334155',
                                        borderRadius: '5px',
                                        color: '#94a3b8',
                                        fontSize: '11px',
                                        fontWeight: 600,
                                        cursor: restoring === v.id ? 'not-allowed' : 'pointer',
                                        flexShrink: 0,
                                    }}
                                >
                                    {restoring === v.id ? '…' : 'Restore'}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Diff hint */}
            {versions.length > 1 && !diffBase && (
                <p style={{ fontSize: '11px', color: '#334155', marginTop: '12px' }}>
                    Tip: click <strong style={{ color: '#475569' }}>Set Base</strong> on one version, then <strong style={{ color: '#475569' }}>Compare →</strong> on another to diff their brainConfig.
                </p>
            )}
            {diffBase && !showDiff && (
                <p style={{ fontSize: '11px', color: '#475569', marginTop: '12px' }}>
                    Base set. Click <strong>Compare →</strong> on another version to see the diff.
                </p>
            )}

            {/* Diff panel */}
            {showDiff && (
                <div
                    style={{
                        marginTop: '20px',
                        background: '#0f172a',
                        border: '1px solid #1e293b',
                        borderRadius: '8px',
                        padding: '14px',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                        <div
                            style={{
                                fontSize: '12px',
                                fontWeight: 700,
                                color: '#475569',
                                textTransform: 'uppercase',
                                letterSpacing: '0.06em',
                            }}
                        >
                            brainConfig Diff
                        </div>
                        <button
                            onClick={() => { setShowDiff(false); setDiffBase(null); setDiffTarget(null); setDiffLines([]); }}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#475569',
                                fontSize: '12px',
                                cursor: 'pointer',
                            }}
                        >
                            ✕ Close
                        </button>
                    </div>

                    {diffLoading && (
                        <p style={{ color: '#475569', fontSize: '12px' }}>Computing diff…</p>
                    )}
                    {diffError && (
                        <p style={{ color: '#fca5a5', fontSize: '12px' }}>{diffError}</p>
                    )}
                    {!diffLoading && !diffError && diffLines.length === 0 && (
                        <p style={{ color: '#475569', fontSize: '12px' }}>No differences found in brainConfig.</p>
                    )}
                    {!diffLoading && !diffError && diffLines.length > 0 && (
                        <>
                            <div
                                style={{
                                    fontSize: '11px',
                                    color: '#475569',
                                    marginBottom: '8px',
                                }}
                            >
                                {diffLines.filter((l) => l.type !== 'unchanged').length} field(s) differ ·{' '}
                                {diffLines.filter((l) => l.type === 'added').length} added ·{' '}
                                {diffLines.filter((l) => l.type === 'removed').length} removed
                            </div>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                                <thead>
                                    <tr>
                                        <th style={{ textAlign: 'left', color: '#334155', padding: '4px 8px', fontWeight: 600, width: '30%' }}>Key</th>
                                        <th style={{ textAlign: 'left', color: '#334155', padding: '4px 8px', fontWeight: 600, width: '35%' }}>Old</th>
                                        <th style={{ textAlign: 'left', color: '#334155', padding: '4px 8px', fontWeight: 600, width: '35%' }}>New</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {diffLines
                                        .filter((l) => l.type !== 'unchanged')
                                        .map((line, idx) => {
                                            const isAdd = line.type === 'added';
                                            const bg = isAdd ? '#052e16' : '#450a0a';
                                            const prefix = isAdd ? '+' : '−';
                                            const prefixColor = isAdd ? '#4ade80' : '#f87171';
                                            const truncate = (v: unknown): string => {
                                                const s = JSON.stringify(v);
                                                return s.length > 120 ? s.slice(0, 120) + '…' : s;
                                            };
                                            return (
                                                <tr key={`${line.key}-${idx}`} style={{ background: bg }}>
                                                    <td style={{ padding: '4px 8px', color: prefixColor, fontFamily: 'monospace' }}>
                                                        {prefix} {line.key}
                                                    </td>
                                                    <td style={{ padding: '4px 8px', color: '#94a3b8', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                                                        {isAdd ? '' : truncate(line.oldValue)}
                                                    </td>
                                                    <td style={{ padding: '4px 8px', color: '#94a3b8', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                                                        {isAdd ? truncate(line.newValue) : ''}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                </tbody>
                            </table>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
