'use client';

import { useCallback, useEffect, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

type MeetingSession = {
    id: string;
    tenantId: string;
    workspaceId: string;
    agentId: string;
    meetingUrl: string;
    platform: string;
    status: string;
    language: string | null;
    transcriptRaw: string | null;
    summaryText: string | null;
    actionItems: string | null;
    agentVoiceId: string | null;
    speakingEnabled: boolean;
    resolvedLanguage: string | null;
    startedAt: string;
    endedAt: string | null;
    updatedAt: string;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, { bg: string; color: string }> = {
    joining: { bg: '#fef9c3', color: '#854d0e' },
    active: { bg: '#dcfce7', color: '#166534' },
    ended: { bg: '#f1f5f9', color: '#475569' },
    deleted: { bg: '#fee2e2', color: '#991b1b' },
};

const PLATFORM_BADGE: Record<string, { bg: string; color: string }> = {
    teams: { bg: '#1a3a6b', color: '#a5c8ff' },
    zoom: { bg: '#1e3a5f', color: '#bfdbfe' },
    google_meet: { bg: '#1c2d1e', color: '#bbf7d0' },
    webex: { bg: '#1e1b4b', color: '#c7d2fe' },
};

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

function platformBadge(platform: string) {
    const style = PLATFORM_BADGE[platform.toLowerCase()] ?? { bg: '#27272a', color: '#a1a1aa' };
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
            {platform}
        </span>
    );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MeetingSessionsPanel({ tenantId }: { tenantId: string }) {
    const [sessions, setSessions] = useState<MeetingSession[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    // Create form state
    const [showCreate, setShowCreate] = useState(false);
    const [createBusy, setCreateBusy] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);
    const [newSession, setNewSession] = useState({
        workspaceId: '',
        agentId: '',
        meetingUrl: '',
        platform: 'teams',
        language: '',
    });

    // Detail drawer state
    const [detailId, setDetailId] = useState<string | null>(null);
    const [detail, setDetail] = useState<MeetingSession | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);

    // Sessions are maintained locally (no list endpoint on gateway)
    const loadDetail = useCallback(async (id: string) => {
        setDetailLoading(true);
        setDetailId(id);

        const response = await fetch(`/api/meetings/${encodeURIComponent(id)}`, { cache: 'no-store' });
        const data = (await response.json().catch(() => ({}))) as { session?: MeetingSession; message?: string };

        if (!response.ok) {
            setError(data.message ?? 'Unable to load session detail.');
            setDetailLoading(false);
            return;
        }

        setDetail(data.session ?? null);
        setDetailLoading(false);

        // Refresh in local list
        if (data.session) {
            setSessions((prev) =>
                prev.map((s) => (s.id === id ? (data.session as MeetingSession) : s)),
            );
        }
    }, []);

    const createSession = async () => {
        if (!newSession.workspaceId.trim() || !newSession.agentId.trim() || !newSession.meetingUrl.trim()) {
            setCreateError('workspaceId, agentId, and meetingUrl are required.');
            return;
        }

        setCreateBusy(true);
        setCreateError(null);

        const response = await fetch('/api/meetings', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                workspaceId: newSession.workspaceId.trim(),
                agentId: newSession.agentId.trim(),
                meetingUrl: newSession.meetingUrl.trim(),
                platform: newSession.platform,
                language: newSession.language.trim() || undefined,
            }),
        });

        const data = (await response.json().catch(() => ({}))) as { session?: MeetingSession; message?: string };

        if (!response.ok) {
            setCreateError(data.message ?? 'Failed to create session.');
            setCreateBusy(false);
            return;
        }

        if (data.session) {
            setSessions((prev) => [data.session as MeetingSession, ...prev]);
        }

        setNewSession({ workspaceId: '', agentId: '', meetingUrl: '', platform: 'teams', language: '' });
        setShowCreate(false);
        setCreateBusy(false);
        setMessage('Meeting session created.');
    };

    const endSession = async (id: string) => {
        setBusyId(id);
        setError(null);
        setMessage(null);

        const response = await fetch(`/api/meetings/${encodeURIComponent(id)}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ status: 'ended', endedAt: new Date().toISOString() }),
        });

        const data = (await response.json().catch(() => ({}))) as { session?: MeetingSession; message?: string };

        if (!response.ok) {
            setError(data.message ?? 'Unable to end session.');
            setBusyId(null);
            return;
        }

        if (data.session) {
            setSessions((prev) => prev.map((s) => (s.id === id ? (data.session as MeetingSession) : s)));
            if (detailId === id) {
                setDetail(data.session);
            }
        }

        setMessage('Session ended.');
        setBusyId(null);
    };

    const deleteSession = async (id: string) => {
        setBusyId(id);
        setError(null);
        setMessage(null);

        const response = await fetch(`/api/meetings/${encodeURIComponent(id)}`, {
            method: 'DELETE',
        });

        const data = (await response.json().catch(() => ({}))) as { message?: string };

        if (!response.ok) {
            setError(data.message ?? 'Unable to delete session.');
            setBusyId(null);
            return;
        }

        setSessions((prev) => prev.filter((s) => s.id !== id));
        if (detailId === id) {
            setDetailId(null);
            setDetail(null);
        }

        setMessage('Session deleted.');
        setBusyId(null);
    };

    // Load effect is no-op since there's no list endpoint; sessions populate via create
    useEffect(() => {
        // Tenant context confirmed — sessions populate via create actions
        setLoading(false);
    }, [tenantId]);

    return (
        <section className="card" style={{ display: 'grid', gap: '0.85rem' }}>
            <header>
                <h2 style={{ marginBottom: '0.4rem' }}>Meeting Sessions</h2>
                <p style={{ margin: 0, color: 'var(--ink-soft)', fontSize: '0.86rem' }}>
                    Create and manage agent-attended meeting sessions. Sessions are tracked per workspace and agent.
                </p>
            </header>

            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <span className="badge neutral">Tenant {tenantId}</span>
                <span className="badge low">{sessions.length} sessions</span>
                <button
                    type="button"
                    className="primary-action"
                    style={{ marginLeft: 'auto' }}
                    onClick={() => { setShowCreate((v) => !v); setCreateError(null); }}
                >
                    {showCreate ? 'Cancel' : '+ New session'}
                </button>
            </div>

            {showCreate && (
                <div className="card" style={{ margin: 0, padding: '0.9rem', display: 'grid', gap: '0.55rem' }}>
                    <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Create meeting session</h3>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <input
                            type="text"
                            placeholder="Workspace ID *"
                            value={newSession.workspaceId}
                            onChange={(e) => setNewSession((v) => ({ ...v, workspaceId: e.target.value }))}
                            style={{ flex: '1 1 160px', padding: '0.35rem 0.55rem', fontSize: '0.83rem', border: '1px solid var(--line)', borderRadius: '4px', background: 'var(--bg)', color: 'var(--ink)' }}
                        />
                        <input
                            type="text"
                            placeholder="Agent ID *"
                            value={newSession.agentId}
                            onChange={(e) => setNewSession((v) => ({ ...v, agentId: e.target.value }))}
                            style={{ flex: '1 1 160px', padding: '0.35rem 0.55rem', fontSize: '0.83rem', border: '1px solid var(--line)', borderRadius: '4px', background: 'var(--bg)', color: 'var(--ink)' }}
                        />
                        <select
                            value={newSession.platform}
                            onChange={(e) => setNewSession((v) => ({ ...v, platform: e.target.value }))}
                            style={{ flex: '1 1 120px', padding: '0.35rem 0.55rem', fontSize: '0.83rem', border: '1px solid var(--line)', borderRadius: '4px', background: 'var(--bg)', color: 'var(--ink)' }}
                        >
                            <option value="teams">Teams</option>
                            <option value="zoom">Zoom</option>
                            <option value="google_meet">Google Meet</option>
                            <option value="webex">Webex</option>
                        </select>
                    </div>
                    <input
                        type="text"
                        placeholder="Meeting URL *"
                        value={newSession.meetingUrl}
                        onChange={(e) => setNewSession((v) => ({ ...v, meetingUrl: e.target.value }))}
                        style={{ padding: '0.35rem 0.55rem', fontSize: '0.83rem', border: '1px solid var(--line)', borderRadius: '4px', background: 'var(--bg)', color: 'var(--ink)' }}
                    />
                    <input
                        type="text"
                        placeholder="Language (e.g. en-US)"
                        value={newSession.language}
                        onChange={(e) => setNewSession((v) => ({ ...v, language: e.target.value }))}
                        style={{ padding: '0.35rem 0.55rem', fontSize: '0.83rem', border: '1px solid var(--line)', borderRadius: '4px', background: 'var(--bg)', color: 'var(--ink)' }}
                    />
                    {createError && <p className="message-inline">{createError}</p>}
                    <div>
                        <button type="button" className="primary-action" disabled={createBusy} onClick={() => void createSession()}>
                            {createBusy ? 'Creating...' : 'Create session'}
                        </button>
                    </div>
                </div>
            )}

            {error && <p className="message-inline">{error}</p>}
            {message && (
                <p
                    className="message-inline"
                    style={{ borderColor: 'var(--ok-border)', background: 'var(--ok-bg)', color: 'var(--ok)' }}
                >
                    {message}
                </p>
            )}

            {loading ? (
                <p style={{ margin: 0, color: 'var(--ink-soft)' }}>Loading...</p>
            ) : sessions.length === 0 ? (
                <p style={{ margin: 0, color: 'var(--ink-soft)' }}>
                    No sessions yet. Create a meeting session above to get started.
                </p>
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--line)', color: 'var(--ink-muted)' }}>
                                <th style={{ textAlign: 'left', padding: '0.45rem 0.6rem', fontWeight: 600 }}>Session</th>
                                <th style={{ textAlign: 'left', padding: '0.45rem 0.6rem', fontWeight: 600 }}>Platform</th>
                                <th style={{ textAlign: 'left', padding: '0.45rem 0.6rem', fontWeight: 600 }}>Status</th>
                                <th style={{ textAlign: 'left', padding: '0.45rem 0.6rem', fontWeight: 600 }}>Started</th>
                                <th style={{ textAlign: 'left', padding: '0.45rem 0.6rem', fontWeight: 600 }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sessions.map((session) => {
                                const isBusy = busyId === session.id;
                                return (
                                    <tr key={session.id} style={{ borderBottom: '1px solid var(--line)' }}>
                                        <td style={{ padding: '0.5rem 0.6rem', color: 'var(--ink)' }}>
                                            <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--ink-muted)' }}>
                                                {session.id.slice(0, 12)}…
                                            </div>
                                            <div style={{ fontSize: '0.78rem', color: 'var(--ink-soft)', marginTop: '0.15rem' }}>
                                                ws:{session.workspaceId} · agent:{session.agentId}
                                            </div>
                                        </td>
                                        <td style={{ padding: '0.5rem 0.6rem' }}>{platformBadge(session.platform)}</td>
                                        <td style={{ padding: '0.5rem 0.6rem' }}>{statusBadge(session.status)}</td>
                                        <td style={{ padding: '0.5rem 0.6rem', color: 'var(--ink-muted)', fontSize: '0.78rem' }}>
                                            {new Date(session.startedAt).toLocaleString()}
                                        </td>
                                        <td style={{ padding: '0.5rem 0.6rem' }}>
                                            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                                <button
                                                    type="button"
                                                    className="secondary-action"
                                                    disabled={isBusy}
                                                    onClick={() => void loadDetail(session.id)}
                                                >
                                                    Detail
                                                </button>
                                                {session.status === 'active' || session.status === 'joining' ? (
                                                    <button
                                                        type="button"
                                                        className="secondary-action"
                                                        disabled={isBusy}
                                                        onClick={() => void endSession(session.id)}
                                                    >
                                                        {isBusy ? '...' : 'End'}
                                                    </button>
                                                ) : null}
                                                <button
                                                    type="button"
                                                    className="secondary-action"
                                                    disabled={isBusy}
                                                    onClick={() => void deleteSession(session.id)}
                                                >
                                                    {isBusy ? '...' : 'Delete'}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {detailId && (
                <div className="card" style={{ margin: 0, padding: '0.9rem', display: 'grid', gap: '0.6rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Session detail</h3>
                        <button
                            type="button"
                            className="secondary-action"
                            onClick={() => { setDetailId(null); setDetail(null); }}
                        >
                            Close
                        </button>
                    </div>

                    {detailLoading ? (
                        <p style={{ margin: 0, color: 'var(--ink-soft)' }}>Loading detail...</p>
                    ) : detail ? (
                        <div style={{ display: 'grid', gap: '0.5rem', fontSize: '0.83rem' }}>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                {statusBadge(detail.status)}
                                {platformBadge(detail.platform)}
                                {detail.speakingEnabled && (
                                    <span className="badge low">Speaking enabled</span>
                                )}
                                {detail.resolvedLanguage && (
                                    <span className="badge neutral">{detail.resolvedLanguage}</span>
                                )}
                            </div>

                            <div style={{ color: 'var(--ink-soft)' }}>
                                <strong style={{ color: 'var(--ink-muted)' }}>Meeting URL:</strong>{' '}
                                <a
                                    href={detail.meetingUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ color: 'var(--ink)', wordBreak: 'break-all' }}
                                >
                                    {detail.meetingUrl}
                                </a>
                            </div>

                            {detail.summaryText && (
                                <div>
                                    <p style={{ margin: '0 0 0.25rem', fontWeight: 600, color: 'var(--ink-muted)' }}>Summary</p>
                                    <p style={{ margin: 0, color: 'var(--ink-soft)', whiteSpace: 'pre-wrap' }}>{detail.summaryText}</p>
                                </div>
                            )}

                            {detail.actionItems && (
                                <div>
                                    <p style={{ margin: '0 0 0.25rem', fontWeight: 600, color: 'var(--ink-muted)' }}>Action items</p>
                                    <p style={{ margin: 0, color: 'var(--ink-soft)', whiteSpace: 'pre-wrap' }}>{detail.actionItems}</p>
                                </div>
                            )}

                            {detail.transcriptRaw && (
                                <div>
                                    <p style={{ margin: '0 0 0.25rem', fontWeight: 600, color: 'var(--ink-muted)' }}>Transcript</p>
                                    <pre
                                        style={{
                                            margin: 0,
                                            padding: '0.6rem',
                                            background: 'var(--bg)',
                                            border: '1px solid var(--line)',
                                            borderRadius: '4px',
                                            fontSize: '0.75rem',
                                            color: 'var(--ink-soft)',
                                            overflowX: 'auto',
                                            maxHeight: '200px',
                                            overflowY: 'auto',
                                            whiteSpace: 'pre-wrap',
                                        }}
                                    >
                                        {detail.transcriptRaw}
                                    </pre>
                                </div>
                            )}

                            <p style={{ margin: 0, color: 'var(--ink-muted)', fontSize: '0.75rem' }}>
                                Started: {new Date(detail.startedAt).toLocaleString()}
                                {detail.endedAt ? ` · Ended: ${new Date(detail.endedAt).toLocaleString()}` : ''}
                            </p>
                        </div>
                    ) : (
                        <p style={{ margin: 0, color: 'var(--ink-soft)' }}>Unable to load session detail.</p>
                    )}
                </div>
            )}
        </section>
    );
}
