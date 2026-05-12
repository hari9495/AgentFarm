'use client';

import { useCallback, useEffect, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

type DesktopAction = {
    id: string;
    tenantId: string;
    workspaceId: string;
    actionType: string;
    target: string | null;
    inputPayload: unknown | null;
    result: string;
    riskLevel: string;
    retryClass: string;
    retryCount: number;
    screenshotRef: string | null;
    approvalId: string | null;
    errorMessage: string | null;
    completedAt: string | null;
    correlationId: string;
    createdAt: string;
};

type DesktopProfile = {
    workspaceId: string;
    profileId: string | null;
    browser: string;
    storageRef: string | null;
    tabState: Record<string, unknown>;
    tokenVersion: number;
    updatedAt: string | null;
    source: string;
};

type RotateResult = {
    workspaceId: string;
    previousProfileId: string;
    newProfileId: string;
    tokenVersion: number;
    rotatedAt: string;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const RESULT_BADGE: Record<string, { bg: string; color: string }> = {
    success: { bg: '#dcfce7', color: '#166534' },
    failed: { bg: '#fee2e2', color: '#991b1b' },
    retrying: { bg: '#fef9c3', color: '#854d0e' },
    approval_pending: { bg: '#dbeafe', color: '#1d4ed8' },
    blocked: { bg: '#f1f5f9', color: '#475569' },
};

const RISK_BADGE: Record<string, { bg: string; color: string }> = {
    low: { bg: '#dcfce7', color: '#166534' },
    medium: { bg: '#fef9c3', color: '#854d0e' },
    high: { bg: '#fee2e2', color: '#991b1b' },
};

const SOURCE_BADGE: Record<string, { bg: string; color: string }> = {
    persisted: { bg: '#dcfce7', color: '#166534' },
    default: { bg: '#f1f5f9', color: '#475569' },
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

// ── Component ─────────────────────────────────────────────────────────────────

type DesktopPanelProps = {
    tenantId: string;
    workspaceId: string;
};

export default function DesktopPanel({ tenantId, workspaceId }: DesktopPanelProps) {
    // Profile state
    const [profile, setProfile] = useState<DesktopProfile | null>(null);
    const [profileLoading, setProfileLoading] = useState(false);
    const [profileError, setProfileError] = useState<string | null>(null);
    const [rotating, setRotating] = useState(false);
    const [rotateResult, setRotateResult] = useState<RotateResult | null>(null);

    // Profile edit form
    const [editingProfile, setEditingProfile] = useState(false);
    const [editBrowser, setEditBrowser] = useState('chromium');
    const [editStorageRef, setEditStorageRef] = useState('');
    const [savingProfile, setSavingProfile] = useState(false);
    const [profileSaveError, setProfileSaveError] = useState<string | null>(null);

    // Actions state
    const [actions, setActions] = useState<DesktopAction[]>([]);
    const [actionsLoading, setActionsLoading] = useState(false);
    const [actionsError, setActionsError] = useState<string | null>(null);

    // Create action form
    const [formActionType, setFormActionType] = useState('click');
    const [formTarget, setFormTarget] = useState('');
    const [formRiskLevel, setFormRiskLevel] = useState('low');
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [submitResult, setSubmitResult] = useState<DesktopAction | null>(null);

    const fetchActions = useCallback(async () => {
        setActionsLoading(true);
        setActionsError(null);

        const response = await fetch(
            `/api/workspaces/${encodeURIComponent(workspaceId)}/desktop-actions`,
            { cache: 'no-store' },
        );
        const data = (await response.json().catch(() => ({}))) as {
            actions?: DesktopAction[];
            message?: string;
        };

        if (!response.ok) {
            setActionsError(data.message ?? 'Unable to load desktop actions.');
            setActionsLoading(false);
            return;
        }

        setActions(data.actions ?? []);
        setActionsLoading(false);
    }, [workspaceId]);

    const fetchProfile = useCallback(async () => {
        setProfileLoading(true);
        setProfileError(null);

        const response = await fetch(
            `/api/workspaces/${encodeURIComponent(workspaceId)}/desktop-profile`,
            { cache: 'no-store' },
        );
        const data = (await response.json().catch(() => ({}))) as DesktopProfile & {
            message?: string;
        };

        if (!response.ok) {
            setProfileError(data.message ?? 'Unable to load desktop profile.');
            setProfileLoading(false);
            return;
        }

        setProfile(data);
        setEditBrowser(data.browser ?? 'chromium');
        setEditStorageRef(data.storageRef ?? '');
        setProfileLoading(false);
    }, [workspaceId]);

    useEffect(() => {
        void Promise.all([fetchActions(), fetchProfile()]);
    }, [fetchActions, fetchProfile]);

    const createAction = async () => {
        if (!formActionType.trim()) {
            setSubmitError('Action type is required.');
            return;
        }
        setSubmitting(true);
        setSubmitError(null);
        setSubmitResult(null);

        const response = await fetch(
            `/api/workspaces/${encodeURIComponent(workspaceId)}/desktop-actions`,
            {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    actionType: formActionType,
                    target: formTarget || undefined,
                    riskLevel: formRiskLevel,
                }),
            },
        );
        const data = (await response.json().catch(() => ({}))) as DesktopAction & {
            message?: string;
        };

        if (!response.ok) {
            setSubmitError(data.message ?? 'Failed to create action.');
            setSubmitting(false);
            return;
        }

        setActions((prev) => [data, ...prev]);
        setSubmitResult(data);
        setFormActionType('click');
        setFormTarget('');
        setFormRiskLevel('low');
        setSubmitting(false);
    };

    const saveProfile = async () => {
        setSavingProfile(true);
        setProfileSaveError(null);

        const response = await fetch(
            `/api/workspaces/${encodeURIComponent(workspaceId)}/desktop-profile`,
            {
                method: 'PUT',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    browser: editBrowser,
                    storageRef: editStorageRef || undefined,
                }),
            },
        );
        const data = (await response.json().catch(() => ({}))) as { message?: string };

        if (!response.ok) {
            setProfileSaveError(data.message ?? 'Failed to save profile.');
            setSavingProfile(false);
            return;
        }

        await fetchProfile();
        setEditingProfile(false);
        setSavingProfile(false);
    };

    const rotateSession = async () => {
        if (!window.confirm('Rotate browser session? This invalidates the current profile.')) return;
        setRotating(true);
        setRotateResult(null);

        const response = await fetch(
            `/api/workspaces/${encodeURIComponent(workspaceId)}/browser-sessions/rotate`,
            {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ reason: 'manual_rotation' }),
            },
        );
        const data = (await response.json().catch(() => ({}))) as RotateResult & {
            message?: string;
        };

        if (response.ok) {
            setRotateResult(data);
        }
        await fetchProfile();
        setRotating(false);
    };

    // Suppress unused — available for future server-side filtering
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

    const labelStyle: React.CSSProperties = {
        fontSize: '0.83rem',
        fontWeight: 600,
        display: 'grid',
        gap: '0.25rem',
    };

    return (
        <section className="card" style={{ display: 'grid', gap: '1.5rem' }}>

            {/* ── Section 1: Desktop Profile ───────────────────────────── */}
            <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
                    <h2 style={{ margin: 0 }}>Desktop Profile</h2>
                    {!editingProfile ? (
                        <button
                            type="button"
                            className="secondary-action"
                            onClick={() => { setEditingProfile(true); setProfileSaveError(null); }}
                        >
                            Edit
                        </button>
                    ) : (
                        <button
                            type="button"
                            className="secondary-action"
                            onClick={() => { setEditingProfile(false); setProfileSaveError(null); }}
                        >
                            Cancel
                        </button>
                    )}
                </div>

                {profileLoading && (
                    <p style={{ margin: 0, color: 'var(--ink-soft)' }}>Loading profile…</p>
                )}
                {profileError && <p className="message-inline">{profileError}</p>}

                {!profileLoading && !profileError && profile && !editingProfile && (
                    <div style={{ display: 'grid', gap: '0.55rem', fontSize: '0.86rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {inlineBadge(profile.source, SOURCE_BADGE)}
                            <span style={{ color: 'var(--ink-muted)', fontFamily: 'monospace' }}>
                                {profile.browser}
                            </span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem' }}>
                            <span>
                                <span style={{ color: 'var(--ink-muted)' }}>Profile ID: </span>
                                <code style={{ fontSize: '0.78rem' }}>{profile.profileId ?? '—'}</code>
                            </span>
                            <span>
                                <span style={{ color: 'var(--ink-muted)' }}>Token Version: </span>
                                <strong>v{profile.tokenVersion}</strong>
                            </span>
                            <span>
                                <span style={{ color: 'var(--ink-muted)' }}>Storage Ref: </span>
                                {profile.storageRef ?? '—'}
                            </span>
                            <span>
                                <span style={{ color: 'var(--ink-muted)' }}>Updated: </span>
                                {profile.updatedAt ?? 'Never'}
                            </span>
                        </div>

                        <div
                            style={{
                                padding: '0.5rem 0.75rem',
                                background: '#fef9c3',
                                border: '1px solid #fde68a',
                                borderRadius: '4px',
                                fontSize: '0.78rem',
                                color: '#854d0e',
                            }}
                        >
                            Rotation invalidates the current session and assigns a new profile ID.
                        </div>

                        <div>
                            <button
                                type="button"
                                className="secondary-action"
                                disabled={rotating}
                                onClick={() => void rotateSession()}
                            >
                                {rotating ? 'Rotating…' : 'Rotate Session'}
                            </button>
                        </div>

                        {rotateResult && (
                            <div
                                style={{
                                    padding: '0.55rem 0.75rem',
                                    background: '#dcfce7',
                                    border: '1px solid #86efac',
                                    borderRadius: '4px',
                                    fontSize: '0.83rem',
                                    color: '#166534',
                                }}
                            >
                                Session rotated. New profile ID:{' '}
                                <code style={{ fontSize: '0.78rem' }}>{rotateResult.newProfileId}</code>
                            </div>
                        )}
                    </div>
                )}

                {!profileLoading && !profileError && profile && editingProfile && (
                    <div style={{ display: 'grid', gap: '0.55rem', maxWidth: '360px' }}>
                        <label style={labelStyle}>
                            Browser
                            <select
                                value={editBrowser}
                                onChange={(e) => setEditBrowser(e.target.value)}
                                style={inputStyle}
                            >
                                <option value="chromium">chromium</option>
                                <option value="chrome">chrome</option>
                                <option value="edge">edge</option>
                                <option value="firefox">firefox</option>
                            </select>
                        </label>
                        <label style={labelStyle}>
                            Storage Ref
                            <input
                                type="text"
                                value={editStorageRef}
                                onChange={(e) => setEditStorageRef(e.target.value)}
                                placeholder="Optional storage reference"
                                style={inputStyle}
                            />
                        </label>
                        {profileSaveError && <p className="message-inline">{profileSaveError}</p>}
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button
                                type="button"
                                className="primary-action"
                                disabled={savingProfile}
                                onClick={() => void saveProfile()}
                            >
                                {savingProfile ? 'Saving…' : 'Save'}
                            </button>
                            <button
                                type="button"
                                className="secondary-action"
                                onClick={() => { setEditingProfile(false); setProfileSaveError(null); }}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Section 2: Create Action ─────────────────────────────── */}
            <div>
                <h2 style={{ margin: '0 0 0.6rem' }}>Log Desktop Action</h2>
                <div style={{ display: 'grid', gap: '0.55rem', maxWidth: '400px' }}>
                    <label style={labelStyle}>
                        Action Type
                        <select
                            value={formActionType}
                            onChange={(e) => setFormActionType(e.target.value)}
                            style={inputStyle}
                        >
                            <option value="launch">launch</option>
                            <option value="click">click</option>
                            <option value="type">type</option>
                            <option value="upload">upload</option>
                            <option value="screenshot">screenshot</option>
                            <option value="select_file">select_file</option>
                        </select>
                    </label>
                    <label style={labelStyle}>
                        Target
                        <input
                            type="text"
                            value={formTarget}
                            onChange={(e) => setFormTarget(e.target.value)}
                            placeholder="selector or URL (optional)"
                            style={inputStyle}
                        />
                    </label>
                    <label style={labelStyle}>
                        Risk Level
                        <select
                            value={formRiskLevel}
                            onChange={(e) => setFormRiskLevel(e.target.value)}
                            style={inputStyle}
                        >
                            <option value="low">low</option>
                            <option value="medium">medium</option>
                            <option value="high">high</option>
                        </select>
                    </label>
                    {submitError && <p className="message-inline">{submitError}</p>}
                    <div>
                        <button
                            type="button"
                            className="primary-action"
                            disabled={submitting}
                            onClick={() => void createAction()}
                        >
                            {submitting ? 'Logging…' : 'Log Action'}
                        </button>
                    </div>
                </div>

                {submitResult && (
                    <div
                        className="card"
                        style={{ margin: '0.75rem 0 0', padding: '0.75rem', display: 'grid', gap: '0.4rem', maxWidth: '400px' }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.83rem' }}>
                            <span style={{ fontWeight: 600 }}>Action created</span>
                            {inlineBadge(submitResult.result, RESULT_BADGE)}
                            {inlineBadge(submitResult.riskLevel, RISK_BADGE)}
                        </div>
                        <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--ink-muted)' }}>
                            Correlation: <code>{submitResult.correlationId}</code>
                        </p>
                        {submitResult.result === 'approval_pending' && (
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
                                High-risk action routed to approval queue.
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ── Section 3: Action History ────────────────────────────── */}
            <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
                    <h2 style={{ margin: 0 }}>Action History</h2>
                    <button
                        type="button"
                        className="secondary-action"
                        onClick={() => void fetchActions()}
                    >
                        Refresh
                    </button>
                </div>

                {actionsLoading && (
                    <p style={{ margin: 0, color: 'var(--ink-soft)' }}>Loading actions…</p>
                )}
                {actionsError && <p className="message-inline">{actionsError}</p>}

                {!actionsLoading && !actionsError && actions.length === 0 && (
                    <p style={{ margin: 0, color: 'var(--ink-soft)', fontStyle: 'italic' }}>
                        No desktop actions recorded.
                    </p>
                )}

                {!actionsLoading && !actionsError && actions.length > 0 && (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--line)', textAlign: 'left' }}>
                                    <th style={{ padding: '0.35rem 0.5rem', color: 'var(--ink-muted)', fontWeight: 600 }}>Type</th>
                                    <th style={{ padding: '0.35rem 0.5rem', color: 'var(--ink-muted)', fontWeight: 600 }}>Target</th>
                                    <th style={{ padding: '0.35rem 0.5rem', color: 'var(--ink-muted)', fontWeight: 600 }}>Result</th>
                                    <th style={{ padding: '0.35rem 0.5rem', color: 'var(--ink-muted)', fontWeight: 600 }}>Risk</th>
                                    <th style={{ padding: '0.35rem 0.5rem', color: 'var(--ink-muted)', fontWeight: 600 }}>Retries</th>
                                    <th style={{ padding: '0.35rem 0.5rem', color: 'var(--ink-muted)', fontWeight: 600 }}>Approval ID</th>
                                    <th style={{ padding: '0.35rem 0.5rem', color: 'var(--ink-muted)', fontWeight: 600 }}>Created At</th>
                                </tr>
                            </thead>
                            <tbody>
                                {actions.map((action) => (
                                    <tr
                                        key={action.id}
                                        style={{ borderBottom: '1px solid var(--line)' }}
                                    >
                                        <td style={{ padding: '0.35rem 0.5rem' }}>
                                            <code style={{ fontSize: '0.78rem' }}>{action.actionType}</code>
                                        </td>
                                        <td style={{ padding: '0.35rem 0.5rem' }}>
                                            <span title={action.target ?? undefined} style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>
                                                {truncate(action.target, 20)}
                                            </span>
                                        </td>
                                        <td style={{ padding: '0.35rem 0.5rem' }}>
                                            {inlineBadge(action.result, RESULT_BADGE)}
                                        </td>
                                        <td style={{ padding: '0.35rem 0.5rem' }}>
                                            {inlineBadge(action.riskLevel, RISK_BADGE)}
                                        </td>
                                        <td style={{ padding: '0.35rem 0.5rem', textAlign: 'center' }}>
                                            {action.retryCount}
                                        </td>
                                        <td style={{ padding: '0.35rem 0.5rem' }}>
                                            <code style={{ fontSize: '0.78rem' }}>
                                                {action.approvalId ? truncate(action.approvalId, 12) : '—'}
                                            </code>
                                        </td>
                                        <td style={{ padding: '0.35rem 0.5rem', color: 'var(--ink-soft)' }}>
                                            {action.createdAt}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </section>
    );
}
