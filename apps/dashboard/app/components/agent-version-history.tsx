'use client';

import { useEffect, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

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
                    ))}
                </div>
            )}
        </div>
    );
}
