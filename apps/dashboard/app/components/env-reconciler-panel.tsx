'use client';

import { useCallback, useEffect, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

type ToolchainEntry = {
    name: string;
    requiredVersion: string;
    actualVersion: string | null;
    status: string;
};

type EnvProfile = {
    tenantId: string;
    workspaceId: string;
    toolchain: ToolchainEntry[];
    reconcileStatus: string;
    lastReconcileAt: string | null;
    driftReport: string | null;
    updatedAt: string | null;
    createdAt: string;
    source?: string;
};

type ReconcileResult = {
    profile: EnvProfile;
    drifted: ToolchainEntry[];
    dryRun: boolean;
    correlationId: string;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, { bg: string; color: string }> = {
    clean: { bg: '#dcfce7', color: '#166534' },
    drifted: { bg: '#fee2e2', color: '#991b1b' },
    reconciling: { bg: '#dbeafe', color: '#1d4ed8' },
    failed: { bg: '#fef9c3', color: '#854d0e' },
};

const TOOL_STATUS_BADGE: Record<string, { bg: string; color: string }> = {
    ok: { bg: '#dcfce7', color: '#166534' },
    missing: { bg: '#fee2e2', color: '#991b1b' },
    version_mismatch: { bg: '#fef9c3', color: '#854d0e' },
    unknown: { bg: '#f1f5f9', color: '#475569' },
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

// ── Component ─────────────────────────────────────────────────────────────────

type EnvReconcilerPanelProps = {
    tenantId: string;
    workspaceId: string;
};

export default function EnvReconcilerPanel({ tenantId, workspaceId }: EnvReconcilerPanelProps) {
    const [profile, setProfile] = useState<EnvProfile | null>(null);
    const [profileLoading, setProfileLoading] = useState(false);
    const [profileError, setProfileError] = useState<string | null>(null);

    const [reconcileResult, setReconcileResult] = useState<ReconcileResult | null>(null);
    const [reconciling, setReconciling] = useState(false);
    const [reconcileError, setReconcileError] = useState<string | null>(null);
    const [dryRunMode, setDryRunMode] = useState(true);

    const [editingToolchain, setEditingToolchain] = useState(false);
    const [editToolchainRaw, setEditToolchainRaw] = useState('');
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    const fetchProfile = useCallback(async () => {
        setProfileLoading(true);
        setProfileError(null);

        const response = await fetch(
            `/api/workspaces/${encodeURIComponent(workspaceId)}/env-profile`,
            { cache: 'no-store' },
        );
        const data = (await response.json().catch(() => ({}))) as EnvProfile & {
            message?: string;
        };

        if (!response.ok) {
            setProfileError(data.message ?? 'Unable to load environment profile.');
            setProfileLoading(false);
            return;
        }

        setProfile(data);
        setEditToolchainRaw(JSON.stringify(data.toolchain ?? [], null, 2));
        setProfileLoading(false);
    }, [workspaceId]);

    useEffect(() => {
        void fetchProfile();
    }, [fetchProfile]);

    const runReconcile = async () => {
        setReconciling(true);
        setReconcileError(null);
        setReconcileResult(null);

        const response = await fetch(
            `/api/workspaces/${encodeURIComponent(workspaceId)}/env-reconcile`,
            {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ dryRun: dryRunMode }),
            },
        );
        const data = (await response.json().catch(() => ({}))) as ReconcileResult & {
            message?: string;
        };

        if (!response.ok) {
            setReconcileError(data.message ?? 'Reconcile failed.');
            setReconciling(false);
            return;
        }

        setReconcileResult(data);
        await fetchProfile();
        setReconciling(false);
    };

    const saveToolchain = async () => {
        let parsed: ToolchainEntry[];
        try {
            parsed = JSON.parse(editToolchainRaw) as ToolchainEntry[];
            if (!Array.isArray(parsed)) throw new Error('Expected an array.');
        } catch {
            setSaveError('Invalid JSON. Expected an array of toolchain entries.');
            return;
        }

        setSaving(true);
        setSaveError(null);

        const response = await fetch(
            `/api/workspaces/${encodeURIComponent(workspaceId)}/env-profile`,
            {
                method: 'PUT',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ toolchain: parsed }),
            },
        );
        const data = (await response.json().catch(() => ({}))) as { message?: string };

        if (!response.ok) {
            setSaveError(data.message ?? 'Failed to save toolchain.');
            setSaving(false);
            return;
        }

        await fetchProfile();
        setEditingToolchain(false);
        setSaving(false);
    };

    // Suppress unused — available for future tenant-scoped requests
    void tenantId;

    const inputStyle: React.CSSProperties = {
        padding: '0.35rem 0.55rem',
        fontSize: '0.83rem',
        border: '1px solid var(--line)',
        borderRadius: '4px',
        background: 'var(--bg)',
        color: 'var(--ink)',
        width: '100%',
        boxSizing: 'border-box',
    };

    return (
        <section className="card" style={{ display: 'grid', gap: '1.5rem' }}>

            {/* ── Section 1: Environment Profile ──────────────────────── */}
            <div>
                <h2 style={{ margin: '0 0 0.6rem' }}>Environment Profile</h2>

                {profileLoading && (
                    <p style={{ margin: 0, color: 'var(--ink-soft)' }}>Loading profile…</p>
                )}
                {profileError && <p className="message-inline">{profileError}</p>}

                {!profileLoading && !profileError && profile && (
                    <div style={{ display: 'grid', gap: '0.55rem', fontSize: '0.86rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            {profile.source && inlineBadge(profile.source, {
                                default: { bg: '#f1f5f9', color: '#475569' },
                                persisted: { bg: '#dcfce7', color: '#166534' },
                            })}
                            <span>Reconcile status: {inlineBadge(profile.reconcileStatus, STATUS_BADGE)}</span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem' }}>
                            <span>
                                <span style={{ color: 'var(--ink-muted)' }}>Last Reconcile: </span>
                                {profile.lastReconcileAt ?? 'Never'}
                            </span>
                            <span>
                                <span style={{ color: 'var(--ink-muted)' }}>Tools: </span>
                                {profile.toolchain?.length ?? 0}
                            </span>
                        </div>
                        {profile.source === 'default' && (
                            <div
                                style={{
                                    padding: '0.4rem 0.65rem',
                                    background: '#fef9c3',
                                    border: '1px solid #fde68a',
                                    borderRadius: '4px',
                                    fontSize: '0.78rem',
                                    color: '#854d0e',
                                }}
                            >
                                Using default profile. Edit and save toolchain to persist custom settings.
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ── Section 2: Toolchain ─────────────────────────────────── */}
            <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
                    <h2 style={{ margin: 0 }}>Toolchain</h2>
                    {!editingToolchain ? (
                        <button
                            type="button"
                            className="secondary-action"
                            onClick={() => { setEditingToolchain(true); setSaveError(null); }}
                        >
                            Edit JSON
                        </button>
                    ) : (
                        <button
                            type="button"
                            className="secondary-action"
                            onClick={() => { setEditingToolchain(false); setSaveError(null); }}
                        >
                            Cancel
                        </button>
                    )}
                </div>

                {!profileLoading && !profileError && profile && !editingToolchain && (
                    <>
                        {(!profile.toolchain || profile.toolchain.length === 0) ? (
                            <p style={{ margin: 0, color: 'var(--ink-soft)', fontStyle: 'italic' }}>
                                No toolchain entries defined.
                            </p>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--line)', textAlign: 'left' }}>
                                            <th style={{ padding: '0.35rem 0.5rem', color: 'var(--ink-muted)', fontWeight: 600 }}>Tool</th>
                                            <th style={{ padding: '0.35rem 0.5rem', color: 'var(--ink-muted)', fontWeight: 600 }}>Required</th>
                                            <th style={{ padding: '0.35rem 0.5rem', color: 'var(--ink-muted)', fontWeight: 600 }}>Actual</th>
                                            <th style={{ padding: '0.35rem 0.5rem', color: 'var(--ink-muted)', fontWeight: 600 }}>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {profile.toolchain.map((tool, idx) => (
                                            <tr key={idx} style={{ borderBottom: '1px solid var(--line)' }}>
                                                <td style={{ padding: '0.35rem 0.5rem' }}>
                                                    <code style={{ fontSize: '0.78rem' }}>{tool.name}</code>
                                                </td>
                                                <td style={{ padding: '0.35rem 0.5rem' }}>
                                                    <code style={{ fontSize: '0.78rem' }}>{tool.requiredVersion}</code>
                                                </td>
                                                <td style={{ padding: '0.35rem 0.5rem' }}>
                                                    <code style={{ fontSize: '0.78rem' }}>{tool.actualVersion ?? '—'}</code>
                                                </td>
                                                <td style={{ padding: '0.35rem 0.5rem' }}>
                                                    {inlineBadge(tool.status, TOOL_STATUS_BADGE)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </>
                )}

                {editingToolchain && (
                    <div style={{ display: 'grid', gap: '0.55rem' }}>
                        <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--ink-muted)' }}>
                            Template: <code>[{`{"name":"node","requiredVersion":"18","status":"ok"}`}]</code>
                        </p>
                        <textarea
                            value={editToolchainRaw}
                            onChange={(e) => setEditToolchainRaw(e.target.value)}
                            rows={10}
                            style={{ ...inputStyle, fontFamily: 'monospace', resize: 'vertical' }}
                        />
                        {saveError && <p className="message-inline">{saveError}</p>}
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button
                                type="button"
                                className="primary-action"
                                disabled={saving}
                                onClick={() => void saveToolchain()}
                            >
                                {saving ? 'Saving…' : 'Save Toolchain'}
                            </button>
                            <button
                                type="button"
                                className="secondary-action"
                                onClick={() => { setEditingToolchain(false); setSaveError(null); }}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Section 3: Reconcile ─────────────────────────────────── */}
            <div>
                <h2 style={{ margin: '0 0 0.6rem' }}>Reconcile</h2>
                <div style={{ display: 'grid', gap: '0.55rem', maxWidth: '400px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.86rem', cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={dryRunMode}
                            onChange={(e) => setDryRunMode(e.target.checked)}
                        />
                        Dry run (preview only — no changes applied)
                    </label>
                    {reconcileError && <p className="message-inline">{reconcileError}</p>}
                    <div>
                        <button
                            type="button"
                            className="primary-action"
                            disabled={reconciling}
                            onClick={() => void runReconcile()}
                        >
                            {reconciling ? 'Reconciling…' : 'Run Reconcile'}
                        </button>
                    </div>
                </div>

                {reconcileResult && (
                    <div className="card" style={{ margin: '0.75rem 0 0', padding: '0.75rem', display: 'grid', gap: '0.55rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.83rem' }}>
                            {reconcileResult.dryRun
                                ? <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, background: '#fef9c3', color: '#854d0e' }}>dry run</span>
                                : <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, background: '#dcfce7', color: '#166534' }}>applied</span>
                            }
                            <code style={{ fontSize: '0.78rem', color: 'var(--ink-muted)' }}>
                                {reconcileResult.correlationId}
                            </code>
                        </div>

                        {reconcileResult.drifted.length === 0 ? (
                            <p style={{ margin: 0, fontSize: '0.83rem', color: '#166534', fontWeight: 600 }}>
                                ✓ No drift detected
                            </p>
                        ) : (
                            <>
                                <p style={{ margin: 0, fontSize: '0.83rem', fontWeight: 600 }}>
                                    Drifted tools ({reconcileResult.drifted.length}):
                                </p>
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '1px solid var(--line)', textAlign: 'left' }}>
                                                <th style={{ padding: '0.35rem 0.5rem', color: 'var(--ink-muted)', fontWeight: 600 }}>Tool</th>
                                                <th style={{ padding: '0.35rem 0.5rem', color: 'var(--ink-muted)', fontWeight: 600 }}>Required</th>
                                                <th style={{ padding: '0.35rem 0.5rem', color: 'var(--ink-muted)', fontWeight: 600 }}>Actual</th>
                                                <th style={{ padding: '0.35rem 0.5rem', color: 'var(--ink-muted)', fontWeight: 600 }}>Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {reconcileResult.drifted.map((tool, idx) => (
                                                <tr key={idx} style={{ borderBottom: '1px solid var(--line)' }}>
                                                    <td style={{ padding: '0.35rem 0.5rem' }}>
                                                        <code style={{ fontSize: '0.78rem' }}>{tool.name}</code>
                                                    </td>
                                                    <td style={{ padding: '0.35rem 0.5rem' }}>
                                                        <code style={{ fontSize: '0.78rem' }}>{tool.requiredVersion}</code>
                                                    </td>
                                                    <td style={{ padding: '0.35rem 0.5rem' }}>
                                                        <code style={{ fontSize: '0.78rem' }}>{tool.actualVersion ?? '—'}</code>
                                                    </td>
                                                    <td style={{ padding: '0.35rem 0.5rem' }}>
                                                        {inlineBadge(tool.status, TOOL_STATUS_BADGE)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>
        </section>
    );
}
