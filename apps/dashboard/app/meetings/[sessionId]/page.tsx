'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { PageHeader } from '../../components/page-header';
import MeetingLivePanel from '../../components/meeting-live-panel';

// ── Types ──────────────────────────────────────────────────────────────────────

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

type MeetingAuditEvent = {
    id: string;
    meetingSessionId: string;
    eventType: string;
    platform: string;
    severity: string;
    summary: string;
    payload: Record<string, unknown> | null;
    durationMs: number | null;
    createdAt: string;
};

type MeetingAuditResponse = {
    sessionId: string;
    meetingUrl: string;
    platform: string;
    events: MeetingAuditEvent[];
};

// ── Badges ─────────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, { bg: string; color: string }> = {
    joining: { bg: '#fef9c3', color: 'var(--warn)' },
    active: { bg: '#dcfce7', color: 'var(--ok)' },
    ended: { bg: '#f1f5f9', color: '#475569' },
    deleted: { bg: '#fee2e2', color: 'var(--danger)' },
};

const PLATFORM_BADGE: Record<string, { bg: string; color: string }> = {
    teams: { bg: '#1a3a6b', color: '#a5c8ff' },
    zoom: { bg: '#1e3a5f', color: '#bfdbfe' },
    google_meet: { bg: '#1c2d1e', color: '#bbf7d0' },
    webex: { bg: '#1e1b4b', color: '#c7d2fe' },
};

function StatusBadge({ status }: { status: string }) {
    const style = STATUS_BADGE[status] ?? { bg: 'var(--line)', color: 'var(--ink-muted)' };
    return (
        <span style={{ padding: '3px 10px', borderRadius: '5px', fontSize: '12px', fontWeight: 700, background: style.bg, color: style.color }}>
            {status}
        </span>
    );
}

function PlatformBadge({ platform }: { platform: string }) {
    const style = PLATFORM_BADGE[platform.toLowerCase()] ?? { bg: '#27272a', color: '#a1a1aa' };
    return (
        <span style={{ padding: '3px 10px', borderRadius: '5px', fontSize: '12px', fontWeight: 700, background: style.bg, color: style.color }}>
            {platform}
        </span>
    );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function MeetingDetailPage() {
    const params = useParams<{ sessionId: string }>();
    const sessionId = params.sessionId;

    const [session, setSession] = useState<MeetingSession | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [busyAction, setBusyAction] = useState<string | null>(null);

    // Audit events
    const [auditData, setAuditData] = useState<MeetingAuditResponse | null>(null);
    const [auditLoading, setAuditLoading] = useState(false);
    const [auditError, setAuditError] = useState<string | null>(null);

    // Speaking agent
    const [speakText, setSpeakText] = useState('');
    const [speakBusy, setSpeakBusy] = useState(false);
    const [speakResult, setSpeakResult] = useState<{ ok: boolean; durationMs?: number; error?: string } | null>(null);

    // Speaking agent config edit
    const [editSpeak, setEditSpeak] = useState(false);
    const [voiceId, setVoiceId] = useState('');
    const [resolvedLang, setResolvedLang] = useState('');
    const [speakEnabled, setSpeakEnabled] = useState(false);

    // Polling ref for active/joining sessions
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const loadSession = useCallback(async () => {
        const response = await fetch(`/api/meetings/${encodeURIComponent(sessionId)}`, { cache: 'no-store' });
        const data = (await response.json().catch(() => ({}))) as MeetingSession & { message?: string };
        if (!response.ok) {
            setError((data as { message?: string }).message ?? 'Unable to load session.');
            setLoading(false);
            return;
        }
        setSession(data);
        setLoading(false);
    }, [sessionId]);

    const loadAuditEvents = useCallback(async () => {
        setAuditLoading(true);
        setAuditError(null);
        const response = await fetch(`/api/meetings/${encodeURIComponent(sessionId)}/audit-events`, { cache: 'no-store' });
        const data = (await response.json().catch(() => ({}))) as MeetingAuditResponse | { message?: string };
        if (!response.ok) {
            setAuditError((data as { message?: string }).message ?? 'Unable to load audit events.');
        } else {
            setAuditData(data as MeetingAuditResponse);
        }
        setAuditLoading(false);
    }, [sessionId]);

    useEffect(() => {
        void loadSession();
        void loadAuditEvents();
    }, [loadSession, loadAuditEvents]);

    // Poll every 4s while session is active or joining
    useEffect(() => {
        if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
        if (session && (session.status === 'active' || session.status === 'joining')) {
            pollRef.current = setInterval(() => {
                void loadSession();
                void loadAuditEvents();
            }, 4_000);
        }
        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, [session?.status, loadSession, loadAuditEvents]);

    // Sync edit fields when session loads
    useEffect(() => {
        if (session) {
            setVoiceId(session.agentVoiceId ?? '');
            setResolvedLang(session.resolvedLanguage ?? '');
            setSpeakEnabled(session.speakingEnabled);
        }
    }, [session?.id]);

    const endSession = async () => {
        setBusyAction('end');
        setError(null);
        setMessage(null);
        const response = await fetch(`/api/meetings/${encodeURIComponent(sessionId)}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ status: 'ended', endedAt: new Date().toISOString() }),
        });
        const data = (await response.json().catch(() => ({}))) as MeetingSession & { message?: string };
        if (!response.ok) {
            setError((data as { message?: string }).message ?? 'Failed to end session.');
        } else {
            setSession(data);
            setMessage('Session ended.');
        }
        setBusyAction(null);
    };

    const saveSpeakingAgentConfig = async () => {
        setBusyAction('speak-config');
        setError(null);
        const body: Record<string, unknown> = { speakingEnabled: speakEnabled };
        if (voiceId.trim()) body['agentVoiceId'] = voiceId.trim();
        if (resolvedLang.trim()) body['resolvedLanguage'] = resolvedLang.trim();

        const response = await fetch(`/api/meetings/${encodeURIComponent(sessionId)}/speaking-agent`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = (await response.json().catch(() => ({}))) as MeetingSession & { message?: string };
        if (!response.ok) {
            setError((data as { message?: string }).message ?? 'Failed to update speaking agent config.');
        } else {
            setSession(data);
            setMessage('Speaking agent config updated.');
            setEditSpeak(false);
        }
        setBusyAction(null);
    };

    const sendSpeakRequest = async () => {
        if (!speakText.trim()) return;
        setSpeakBusy(true);
        setSpeakResult(null);
        const response = await fetch(`/api/meetings/${encodeURIComponent(sessionId)}/speaking-agent`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ text: speakText.trim() }),
        });
        const data = (await response.json().catch(() => ({}))) as { ok?: boolean; durationMs?: number; error?: string; message?: string };
        setSpeakResult({ ok: data.ok ?? false, durationMs: data.durationMs, error: data.error ?? data.message });
        setSpeakBusy(false);
    };

    if (loading) {
        return (
            <main className="page-shell">
                <PageHeader eyebrow="Meetings" title="Meeting Detail" description="Loading session…" />
                <section className="card"><p style={{ margin: 0, color: 'var(--ink-soft)' }}>Loading…</p></section>
            </main>
        );
    }

    if (!session) {
        return (
            <main className="page-shell">
                <PageHeader eyebrow="Meetings" title="Meeting Detail" description="Session not found." />
                <section className="card">
                    <p style={{ margin: 0, color: 'var(--ink-soft)' }}>{error ?? 'Session not found.'}</p>
                    <div style={{ marginTop: '0.8rem' }}>
                        <Link href="/meetings" className="secondary-action" style={{ textDecoration: 'none' }}>← Back to Meetings</Link>
                    </div>
                </section>
            </main>
        );
    }

    const isLive = session.status === 'active' || session.status === 'joining';

    return (
        <main className="page-shell">
            <PageHeader
                eyebrow="Meetings"
                title="Meeting Detail"
                description={`Session ${session.id.slice(0, 12)}… · ${session.platform}`}
            />

            {/* ── Back + live indicator ─────────────────────────────── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                <Link href="/meetings" style={{ fontSize: '0.82rem', color: 'var(--ink-soft)', textDecoration: 'none' }}>
                    ← All sessions
                </Link>
                {isLive && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--ok)', fontWeight: 600 }}>
                        ● Live — polling every 4s
                    </span>
                )}
            </div>

            {error && <p className="message-inline" style={{ marginBottom: '0.6rem' }}>{error}</p>}
            {message && (
                <p className="message-inline" style={{ borderColor: 'var(--ok-border)', background: 'var(--ok-bg)', color: 'var(--ok)', marginBottom: '0.6rem' }}>
                    {message}
                </p>
            )}

            {/* ── Session overview ──────────────────────────────────── */}
            <section className="card" style={{ display: 'grid', gap: '0.75rem', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.6rem' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        <StatusBadge status={session.status} />
                        <PlatformBadge platform={session.platform} />
                        {session.speakingEnabled && <span className="badge low">Speaking enabled</span>}
                        {session.resolvedLanguage && <span className="badge neutral">{session.resolvedLanguage}</span>}
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {isLive && (
                            <button type="button" className="secondary-action" disabled={busyAction === 'end'} onClick={() => void endSession()}>
                                {busyAction === 'end' ? 'Ending…' : 'End session'}
                            </button>
                        )}
                    </div>
                </div>

                <div style={{ display: 'grid', gap: '0.3rem', fontSize: '0.83rem' }}>
                    <Row label="Session ID" value={<span style={{ fontFamily: 'monospace', fontSize: '0.77rem' }}>{session.id}</span>} />
                    <Row label="Workspace" value={session.workspaceId} />
                    <Row label="Agent" value={session.agentId} />
                    <Row label="Platform" value={session.platform} />
                    <Row label="Meeting URL" value={
                        <a href={session.meetingUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--ink)', wordBreak: 'break-all' }}>
                            {session.meetingUrl}
                        </a>
                    } />
                    <Row label="Started" value={new Date(session.startedAt).toLocaleString()} />
                    {session.endedAt && <Row label="Ended" value={new Date(session.endedAt).toLocaleString()} />}
                    {session.language && <Row label="Language" value={session.language} />}
                </div>
            </section>

            {/* ── Transcript ────────────────────────────────────────── */}
            <section className="card" style={{ display: 'grid', gap: '0.6rem', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Transcript</h3>
                {session.summaryText && (
                    <div>
                        <p style={{ margin: '0 0 0.25rem', fontWeight: 600, fontSize: '0.82rem', color: 'var(--ink-muted)' }}>Summary</p>
                        <p style={{ margin: 0, color: 'var(--ink-soft)', fontSize: '0.83rem', whiteSpace: 'pre-wrap' }}>{session.summaryText}</p>
                    </div>
                )}
                {session.actionItems && (
                    <div>
                        <p style={{ margin: '0 0 0.25rem', fontWeight: 600, fontSize: '0.82rem', color: 'var(--ink-muted)' }}>Action items</p>
                        <p style={{ margin: 0, color: 'var(--ink-soft)', fontSize: '0.83rem', whiteSpace: 'pre-wrap' }}>{session.actionItems}</p>
                    </div>
                )}
                {session.transcriptRaw ? (
                    <div>
                        <p style={{ margin: '0 0 0.25rem', fontWeight: 600, fontSize: '0.82rem', color: 'var(--ink-muted)' }}>Raw transcript</p>
                        <pre style={{
                            margin: 0, padding: '0.7rem', background: 'var(--bg)', border: '1px solid var(--line)',
                            borderRadius: '5px', fontSize: '0.75rem', color: 'var(--ink-soft)',
                            overflowX: 'auto', maxHeight: '320px', overflowY: 'auto', whiteSpace: 'pre-wrap',
                        }}>
                            {session.transcriptRaw}
                        </pre>
                    </div>
                ) : (
                    <p style={{ margin: 0, color: 'var(--ink-soft)', fontSize: '0.83rem' }}>
                        {isLive ? 'Transcript will appear here as the meeting progresses.' : 'No transcript recorded.'}
                    </p>
                )}
            </section>

            {/* ── Live Control (meeting-agent: join, live transcript, chat) ─── */}
            <MeetingLivePanel
                gw={{
                    tenantId: session.tenantId,
                    workspaceId: session.workspaceId,
                    agentId: session.agentId,
                    platform: session.platform,
                    meetingUrl: session.meetingUrl,
                }}
            />

            {/* ── Speaking agent ────────────────────────────────────── */}
            <section className="card" style={{ display: 'grid', gap: '0.75rem', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <h3 style={{ margin: 0, fontSize: '0.95rem' }}>
                        Speaking agent
                        {isLive && <span style={{ marginLeft: '0.5rem', fontSize: '0.72rem', color: 'var(--ok)', fontWeight: 400 }}>● live</span>}
                    </h3>
                    <button type="button" className="secondary-action" onClick={() => setEditSpeak((v) => !v)}>
                        {editSpeak ? 'Cancel' : 'Configure'}
                    </button>
                </div>

                {/* ── Current speaker indicator ── */}
                <CurrentSpeakerBadge events={auditData?.events ?? []} isLive={isLive} sessionStatus={session.status} />

                <div style={{ display: 'grid', gap: '0.3rem', fontSize: '0.83rem' }}>
                    <Row label="Speaking enabled" value={session.speakingEnabled ? 'Yes' : 'No'} />
                    {session.agentVoiceId && <Row label="Voice ID" value={session.agentVoiceId} />}
                    {session.resolvedLanguage && <Row label="Language" value={session.resolvedLanguage} />}
                </div>

                {editSpeak && (
                    <div style={{ display: 'grid', gap: '0.45rem', padding: '0.7rem', border: '1px solid var(--line)', borderRadius: '6px' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                            <label style={{ fontSize: '0.82rem', color: 'var(--ink-muted)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <input type="checkbox" checked={speakEnabled} onChange={(e) => setSpeakEnabled(e.target.checked)} />
                                Speaking enabled
                            </label>
                        </div>
                        <input
                            type="text"
                            placeholder="Voice ID (optional)"
                            value={voiceId}
                            onChange={(e) => setVoiceId(e.target.value)}
                            style={{ padding: '0.35rem 0.55rem', fontSize: '0.83rem', border: '1px solid var(--line)', borderRadius: '4px', background: 'var(--bg)', color: 'var(--ink)' }}
                        />
                        <input
                            type="text"
                            placeholder="Language (e.g. en-US)"
                            value={resolvedLang}
                            onChange={(e) => setResolvedLang(e.target.value)}
                            style={{ padding: '0.35rem 0.55rem', fontSize: '0.83rem', border: '1px solid var(--line)', borderRadius: '4px', background: 'var(--bg)', color: 'var(--ink)' }}
                        />
                        <button type="button" className="primary-action" disabled={busyAction === 'speak-config'} onClick={() => void saveSpeakingAgentConfig()}>
                            {busyAction === 'speak-config' ? 'Saving…' : 'Save config'}
                        </button>
                    </div>
                )}

                {/* TTS trigger */}
                <div style={{ borderTop: '1px solid var(--line)', paddingTop: '0.6rem', display: 'grid', gap: '0.4rem' }}>
                    <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 600, color: 'var(--ink-muted)' }}>Trigger speech</p>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <input
                            type="text"
                            placeholder="Enter text for agent to speak…"
                            value={speakText}
                            onChange={(e) => setSpeakText(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter' && !speakBusy) void sendSpeakRequest(); }}
                            style={{ flex: '1 1 220px', padding: '0.35rem 0.55rem', fontSize: '0.83rem', border: '1px solid var(--line)', borderRadius: '4px', background: 'var(--bg)', color: 'var(--ink)' }}
                        />
                        <button type="button" className="primary-action" disabled={speakBusy || !speakText.trim()} onClick={() => void sendSpeakRequest()}>
                            {speakBusy ? 'Speaking…' : 'Speak'}
                        </button>
                    </div>
                    {speakResult && (
                        <p className="message-inline" style={speakResult.ok
                            ? { borderColor: 'var(--ok-border)', background: 'var(--ok-bg)', color: 'var(--ok)' }
                            : undefined}
                        >
                            {speakResult.ok
                                ? `Spoken — ${speakResult.durationMs ?? 0} ms audio`
                                : `Speaking failed: ${speakResult.error ?? 'unknown error'}`}
                        </p>
                    )}
                </div>
            </section>

            {/* ── Audit events ──────────────────────────────────────── */}
            <section className="card" style={{ display: 'grid', gap: '0.75rem', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Audit events</h3>
                    <button type="button" className="secondary-action" disabled={auditLoading} onClick={() => void loadAuditEvents()}>
                        {auditLoading ? 'Loading…' : 'Refresh'}
                    </button>
                </div>

                {auditError && <p className="message-inline">{auditError}</p>}

                {auditData && auditData.events.length === 0 && (
                    <p style={{ margin: 0, color: 'var(--ink-soft)', fontSize: '0.83rem' }}>No audit events yet.</p>
                )}

                {auditData && auditData.events.length > 0 && (
                    <div style={{ position: 'relative', paddingLeft: '1.5rem' }}>
                        <div style={{
                            position: 'absolute', left: '0.6rem', top: '0.6rem', bottom: '0.6rem',
                            width: '2px', background: 'var(--line)',
                        }} />
                        {auditData.events.map((ev, idx) => {
                            const dotColor =
                                ev.severity === 'error' ? '#ef4444' :
                                    ev.severity === 'warn' ? '#f59e0b' :
                                        ev.eventType === 'joined' ? '#22c55e' :
                                            ev.eventType === 'left' ? '#6366f1' :
                                                '#64748b';

                            const iconMap: Record<string, string> = {
                                joined: '▶', left: '■', spoke: '🔊', listened: '🎧',
                                transcribed: '📝', summarised: '✨', summary_distributed: '📤',
                                avatar_state_changed: '🎭', error: '✕',
                            };

                            return (
                                <div key={ev.id ?? idx} style={{ position: 'relative', marginBottom: '1rem' }}>
                                    <div style={{
                                        position: 'absolute', left: '-1.2rem', top: '0.25rem',
                                        width: '11px', height: '11px', borderRadius: '50%',
                                        background: dotColor, zIndex: 1,
                                    }} />
                                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: '0.82rem' }}>{iconMap[ev.eventType] ?? '•'}</span>
                                        <span style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--ink)', textTransform: 'capitalize' }}>
                                            {ev.eventType.replace(/_/g, ' ')}
                                        </span>
                                        <span style={{ fontSize: '0.73rem', color: 'var(--ink-muted)', marginLeft: 'auto' }}>
                                            {new Date(ev.createdAt).toLocaleTimeString()}
                                            {ev.durationMs != null ? ` · ${ev.durationMs}ms` : ''}
                                        </span>
                                    </div>
                                    <p style={{ margin: '0.15rem 0 0', fontSize: '0.79rem', color: 'var(--ink-soft)' }}>
                                        {ev.summary}
                                    </p>
                                    {ev.payload && Object.keys(ev.payload).length > 0 && (
                                        <pre style={{
                                            margin: '0.25rem 0 0', padding: '0.35rem 0.5rem',
                                            background: 'var(--bg)', border: '1px solid var(--line)',
                                            borderRadius: '3px', fontSize: '0.7rem', color: 'var(--ink-muted)',
                                            overflowX: 'auto',
                                        }}>
                                            {JSON.stringify(ev.payload, null, 2)}
                                        </pre>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {!auditData && !auditLoading && !auditError && (
                    <p style={{ margin: 0, color: 'var(--ink-soft)', fontSize: '0.83rem' }}>Loading audit events…</p>
                )}
            </section>

            {/* ── Operator Guide ────────────────────────────────────── */}
            <section className="card" style={{ display: 'grid', gap: '0.5rem' }}>
                <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Operator Guide</h3>
                <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.82rem', color: 'var(--ink-soft)', display: 'grid', gap: '0.35rem' }}>
                    <li><strong>Speaking enabled:</strong> When on, the agent can synthesise voice via VoxCPM2 and speak in the meeting.</li>
                    <li><strong>Trigger speech:</strong> Type any text and click Speak to have the agent say it in the live meeting (requires speaking enabled).</li>
                    <li><strong>Voice ID:</strong> Optional VoxCPM2 voice identifier — leave blank to use the platform default.</li>
                    <li><strong>Audit events:</strong> Every join, speak, transcribe, summarise, and error event is logged in the timeline above. Refresh to see latest.</li>
                    <li><strong>End session:</strong> Marks the session ended and stops polling. The transcript and summary remain accessible.</li>
                </ul>
            </section>
        </main>
    );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div style={{ display: 'flex', gap: '0.6rem', fontSize: '0.83rem' }}>
            <span style={{ color: 'var(--ink-muted)', fontWeight: 600, minWidth: '110px', flexShrink: 0 }}>{label}</span>
            <span style={{ color: 'var(--ink-soft)', wordBreak: 'break-all' }}>{value}</span>
        </div>
    );
}

// ── Current speaker derived from latest relevant audit event ───────────────────
type SpeakerState = 'idle' | 'agent-speaking' | 'agent-listening' | 'participant-speaking' | 'transcribing' | 'ended';

const SPEAKER_EVENTS = new Set(['spoke', 'listened', 'transcribed', 'joined', 'left']);

function deriveSpeakerState(
    events: MeetingAuditEvent[],
    sessionStatus: string,
): SpeakerState {
    if (sessionStatus === 'ended' || sessionStatus === 'deleted') return 'ended';
    const relevant = [...events].reverse().find((e) => SPEAKER_EVENTS.has(e.eventType));
    if (!relevant) return 'idle';
    switch (relevant.eventType) {
        case 'spoke':        return 'agent-speaking';
        case 'listened':     return 'agent-listening';
        case 'transcribed':  return 'participant-speaking';
        case 'joined':       return 'idle';
        case 'left':         return 'ended';
        default:             return 'idle';
    }
}

const SPEAKER_STATE_UI: Record<SpeakerState, { label: string; dot: string; bg: string; color: string }> = {
    'idle':                 { label: 'Idle',                   dot: '○', bg: '#f1f5f9', color: '#64748b' },
    'agent-speaking':       { label: 'Agent speaking',         dot: '●', bg: '#dcfce7', color: 'var(--ok)' },
    'agent-listening':      { label: 'Agent listening',        dot: '◉', bg: '#eff6ff', color: 'var(--info)' },
    'participant-speaking': { label: 'Participant speaking',   dot: '●', bg: '#fef9c3', color: 'var(--warn)' },
    'transcribing':         { label: 'Transcribing',           dot: '◌', bg: '#f0fdf4', color: 'var(--ok)' },
    'ended':                { label: 'Session ended',          dot: '■', bg: '#f1f5f9', color: '#475569' },
};

function CurrentSpeakerBadge({
    events,
    isLive,
    sessionStatus,
}: {
    events: MeetingAuditEvent[];
    isLive: boolean;
    sessionStatus: string;
}) {
    const state = deriveSpeakerState(events, sessionStatus);
    const ui = SPEAKER_STATE_UI[state];

    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: '0.65rem',
            padding: '0.55rem 0.75rem', borderRadius: '7px',
            background: ui.bg, border: `1px solid ${ui.color}22`,
        }}>
            <span style={{ fontSize: '1rem', color: ui.color, lineHeight: 1 }}>{ui.dot}</span>
            <div style={{ flex: 1 }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: ui.color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Currently speaking
                </span>
                <p style={{ margin: 0, fontSize: '0.86rem', fontWeight: 600, color: ui.color }}>
                    {ui.label}
                </p>
            </div>
            {isLive && (
                <span style={{ fontSize: '0.68rem', color: ui.color, opacity: 0.7, fontWeight: 500 }}>
                    updates every 4s
                </span>
            )}
        </div>
    );
}
