'use client';

/**
 * MeetingLivePanel
 *
 * Live-control panel for an operator-attended meeting session.
 * Talks directly to the meeting-agent service via the /api/meeting-agent/* routes.
 *
 * Features:
 *  - Create a meeting-agent session linked to the gateway DB session
 *  - Join the meeting via the best available adapter (Teams SDK → Zoom SDK → SIP → browser)
 *  - Live transcript with auto-scroll — polls every 3 s while session is active
 *  - Send in-meeting chat messages (Teams threadId / Zoom meetingId)
 *  - Stop the live session
 *
 * Usage:
 *   <MeetingLivePanel
 *     gw={{ tenantId, workspaceId, agentId, platform, meetingUrl, meetingId }}
 *   />
 */

import { useCallback, useEffect, useRef, useState } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────────

type MaSession = {
    id: string;
    platform: string;
    mode: string;
    meetingId: string;
    meetingUrl?: string;
    status: string;
    disclosureAnnounced: boolean;
    joinedAt?: string;
    completedAt?: string;
    createdAt: string;
    updatedAt: string;
};

type TranscriptEntry = {
    at: string;
    source: 'participant' | 'agent' | 'system';
    speaker?: string;
    text: string;
};

// Map gateway platform values → meeting-agent platform values
const PLATFORM_MAP: Record<string, string> = {
    google_meet: 'meet',
    teams: 'teams',
    zoom: 'zoom',
    webex: 'webex',
};

const STATUS_COLOR: Record<string, string> = {
    scheduled: '#64748b',
    join_requested: 'var(--warn)',
    joining: 'var(--warn)',
    joined: 'var(--ok)',
    listening: 'var(--info)',
    speaking: '#8b5cf6',
    paused: 'var(--warn)',
    escalation_required: 'var(--danger)',
    completed: '#64748b',
    failed: 'var(--danger)',
};

const SOURCE_STYLE: Record<string, { color: string; label: string }> = {
    participant: { color: 'var(--info)', label: 'Participant' },
    agent: { color: '#8b5cf6', label: 'Agent' },
    system: { color: '#64748b', label: 'System' },
};

// ── Props ──────────────────────────────────────────────────────────────────────

export interface MeetingLivePanelProps {
    /** Values from the gateway DB session */
    gw: {
        tenantId: string;
        workspaceId: string;
        agentId: string;
        platform: string;
        meetingUrl: string;
    };
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function MeetingLivePanel({ gw }: MeetingLivePanelProps) {
    const [maSession, setMaSession] = useState<MaSession | null>(null);
    const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);

    // Chat state
    const [chatText, setChatText] = useState('');
    const [chatHandle, setChatHandle] = useState('');
    const [chatResult, setChatResult] = useState<{ ok: boolean; error?: string } | null>(null);

    // Auto-scroll transcript
    const transcriptRef = useRef<HTMLDivElement>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const maPlatform = PLATFORM_MAP[gw.platform] ?? gw.platform;
    // Extract a meetingId from the URL (last path segment or full URL as fallback)
    const meetingId = gw.meetingUrl.split('/').filter(Boolean).pop() ?? gw.meetingUrl.slice(0, 32);

    const isActive = maSession &&
        ['joining', 'join_requested', 'joined', 'listening', 'speaking', 'paused'].includes(maSession.status);

    // ── Polling ────────────────────────────────────────────────────────────────

    const loadTranscript = useCallback(async (sessionId: string) => {
        const res = await fetch(`/api/meeting-agent/sessions/${encodeURIComponent(sessionId)}/transcript`, {
            cache: 'no-store',
        });
        if (!res.ok) return;
        const data = await res.json().catch(() => ({})) as { transcript?: TranscriptEntry[] };
        if (data.transcript) {
            setTranscript(data.transcript);
        }
    }, []);

    const loadSession = useCallback(async (sessionId: string) => {
        const res = await fetch(`/api/meeting-agent/sessions/${encodeURIComponent(sessionId)}`, {
            cache: 'no-store',
        });
        if (!res.ok) return;
        const data = await res.json().catch(() => ({})) as { session?: MaSession };
        if (data.session) {
            setMaSession(data.session);
        }
    }, []);

    useEffect(() => {
        if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
        if (maSession?.id && isActive) {
            pollRef.current = setInterval(() => {
                void loadSession(maSession.id);
                void loadTranscript(maSession.id);
            }, 3_000);
        }
        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, [maSession?.id, maSession?.status, isActive, loadSession, loadTranscript]);

    // Auto-scroll transcript
    useEffect(() => {
        if (transcriptRef.current) {
            transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
        }
    }, [transcript.length]);

    // ── Actions ────────────────────────────────────────────────────────────────

    const startSession = async () => {
        setBusy('start');
        setError(null);
        setMessage(null);

        const body = {
            tenantId: gw.tenantId,
            workspaceId: gw.workspaceId,
            botId: gw.agentId,
            platform: maPlatform,
            mode: 'interactive_qa',
            meetingId,
            meetingUrl: gw.meetingUrl,
        };

        const res = await fetch('/api/meeting-agent/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        const data = await res.json().catch(() => ({})) as { session?: MaSession; message?: string; error?: string };

        if (!res.ok) {
            setError(data.message ?? data.error ?? 'Failed to start live session.');
            setBusy(null);
            return;
        }

        if (data.session) {
            setMaSession(data.session);
            setMessage('Live session started.');
        }
        setBusy(null);
    };

    const joinMeeting = async () => {
        if (!maSession) return;
        setBusy('join');
        setError(null);
        setMessage(null);

        const res = await fetch(`/api/meeting-agent/sessions/${encodeURIComponent(maSession.id)}/join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ meetingUrl: gw.meetingUrl, displayName: 'AgentFarm Bot' }),
        });

        const data = await res.json().catch(() => ({})) as { session?: MaSession; joinMethod?: string; message?: string; error?: string };

        if (!res.ok) {
            setError(data.message ?? data.error ?? 'Join failed.');
        } else {
            if (data.session) setMaSession(data.session);
            setMessage(`Joining via ${data.joinMethod ?? 'adapter'}…`);
        }
        setBusy(null);
    };

    const stopSession = async () => {
        if (!maSession) return;
        setBusy('stop');
        setError(null);
        setMessage(null);

        const res = await fetch(`/api/meeting-agent/sessions/${encodeURIComponent(maSession.id)}/stop`, {
            method: 'POST',
        });

        const data = await res.json().catch(() => ({})) as { session?: MaSession; message?: string; error?: string };

        if (!res.ok) {
            setError(data.message ?? data.error ?? 'Stop failed.');
        } else {
            if (data.session) setMaSession(data.session);
            setMessage('Session stopped.');
        }
        setBusy(null);
    };

    const sendChat = async () => {
        if (!maSession || !chatText.trim() || !chatHandle.trim()) return;
        setChatResult(null);
        setBusy('chat');

        const res = await fetch(`/api/meeting-agent/sessions/${encodeURIComponent(maSession.id)}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: chatText.trim(), handle: chatHandle.trim() }),
        });

        const data = await res.json().catch(() => ({})) as { sent?: boolean; message?: string; error?: string };

        setChatResult({
            ok: res.ok && (data.sent ?? false),
            error: res.ok ? undefined : (data.message ?? data.error ?? 'Send failed.'),
        });

        if (res.ok) setChatText('');
        setBusy(null);
    };

    // ── Render ─────────────────────────────────────────────────────────────────

    return (
        <section className="card" style={{ display: 'grid', gap: '0.85rem' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div>
                    <h3 style={{ margin: 0, fontSize: '0.97rem' }}>
                        Live Control
                        {isActive && (
                            <span style={{ marginLeft: '0.5rem', fontSize: '0.72rem', color: 'var(--ok)', fontWeight: 500 }}>
                                ● polling every 3s
                            </span>
                        )}
                    </h3>
                    <p style={{ margin: '0.15rem 0 0', fontSize: '0.78rem', color: 'var(--ink-soft)' }}>
                        Real-time join, transcript, and chat via meeting-agent
                    </p>
                </div>
                {!maSession ? (
                    <button
                        type="button"
                        className="primary-action"
                        disabled={busy === 'start'}
                        onClick={() => void startSession()}
                    >
                        {busy === 'start' ? 'Starting…' : '⚡ Start live session'}
                    </button>
                ) : (
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                        {maSession.status === 'scheduled' && (
                            <button
                                type="button"
                                className="primary-action"
                                disabled={busy === 'join'}
                                onClick={() => void joinMeeting()}
                            >
                                {busy === 'join' ? 'Joining…' : '▶ Join meeting'}
                            </button>
                        )}
                        {isActive && (
                            <button
                                type="button"
                                className="secondary-action"
                                disabled={busy === 'stop'}
                                onClick={() => void stopSession()}
                            >
                                {busy === 'stop' ? 'Stopping…' : '■ Stop'}
                            </button>
                        )}
                        <button
                            type="button"
                            className="secondary-action"
                            onClick={() => { setMaSession(null); setTranscript([]); setMessage(null); setError(null); }}
                        >
                            Disconnect
                        </button>
                    </div>
                )}
            </div>

            {/* Status bar */}
            {maSession && (
                <div style={{
                    display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap',
                    padding: '0.45rem 0.7rem', borderRadius: '6px',
                    background: `${STATUS_COLOR[maSession.status] ?? '#64748b'}18`,
                    border: `1px solid ${STATUS_COLOR[maSession.status] ?? '#64748b'}44`,
                }}>
                    <span style={{
                        fontWeight: 700, fontSize: '0.77rem', textTransform: 'uppercase',
                        letterSpacing: '0.05em', color: STATUS_COLOR[maSession.status] ?? '#64748b',
                    }}>
                        {maSession.status.replace(/_/g, ' ')}
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--ink-muted)', fontFamily: 'monospace' }}>
                        {maSession.id.slice(0, 12)}…
                    </span>
                    {maSession.disclosureAnnounced && (
                        <span className="badge low" style={{ fontSize: '0.7rem' }}>AI disclosed</span>
                    )}
                    {maSession.joinedAt && (
                        <span style={{ fontSize: '0.72rem', color: 'var(--ink-muted)', marginLeft: 'auto' }}>
                            Joined {new Date(maSession.joinedAt).toLocaleTimeString()}
                        </span>
                    )}
                </div>
            )}

            {/* Messages */}
            {error && <p className="message-inline">{error}</p>}
            {message && (
                <p className="message-inline" style={{ borderColor: 'var(--ok-border)', background: 'var(--ok-bg)', color: 'var(--ok)' }}>
                    {message}
                </p>
            )}

            {maSession && (
                <>
                    {/* Live transcript */}
                    <div style={{ display: 'grid', gap: '0.4rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <p style={{ margin: 0, fontWeight: 600, fontSize: '0.83rem', color: 'var(--ink-muted)' }}>
                                Live transcript ({transcript.length} entries)
                            </p>
                            {isActive && (
                                <button
                                    type="button"
                                    className="secondary-action"
                                    style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                                    onClick={() => void loadTranscript(maSession.id)}
                                >
                                    Refresh
                                </button>
                            )}
                        </div>
                        <div
                            ref={transcriptRef}
                            style={{
                                height: '220px', overflowY: 'auto',
                                border: '1px solid var(--line)', borderRadius: '6px',
                                padding: '0.5rem', background: 'var(--bg)',
                                display: 'flex', flexDirection: 'column', gap: '0.35rem',
                            }}
                        >
                            {transcript.length === 0 ? (
                                <p style={{ margin: 'auto', color: 'var(--ink-soft)', fontSize: '0.8rem', textAlign: 'center' }}>
                                    {isActive ? 'Waiting for audio…' : 'No transcript entries yet.'}
                                </p>
                            ) : (
                                transcript.map((entry, idx) => {
                                    const src = SOURCE_STYLE[entry.source] ?? SOURCE_STYLE.system;
                                    return (
                                        <div key={idx} style={{ display: 'flex', gap: '0.5rem', fontSize: '0.78rem' }}>
                                            <span style={{
                                                fontSize: '0.68rem', fontWeight: 700,
                                                color: src.color, minWidth: '68px', flexShrink: 0,
                                                paddingTop: '1px',
                                                textTransform: 'uppercase', letterSpacing: '0.03em',
                                            }}>
                                                {entry.speaker ?? src.label}
                                            </span>
                                            <span style={{ color: 'var(--ink-soft)', flex: 1, lineHeight: 1.4 }}>
                                                {entry.text}
                                            </span>
                                            <span style={{ color: 'var(--ink-muted)', fontSize: '0.68rem', flexShrink: 0 }}>
                                                {new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                            </span>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* Chat sender */}
                    <div style={{ borderTop: '1px solid var(--line)', paddingTop: '0.7rem', display: 'grid', gap: '0.45rem' }}>
                        <p style={{ margin: 0, fontWeight: 600, fontSize: '0.83rem', color: 'var(--ink-muted)' }}>
                            Send in-meeting chat
                            <span style={{ marginLeft: '0.4rem', fontWeight: 400, fontSize: '0.74rem', color: 'var(--ink-soft)' }}>
                                (requires Teams / Zoom SDK adapter)
                            </span>
                        </p>
                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                            <input
                                type="text"
                                placeholder="Thread ID (Teams) or Meeting ID (Zoom)"
                                value={chatHandle}
                                onChange={(e) => setChatHandle(e.target.value)}
                                style={{ flex: '1 1 180px', padding: '0.35rem 0.55rem', fontSize: '0.8rem', border: '1px solid var(--line)', borderRadius: '4px', background: 'var(--bg)', color: 'var(--ink)' }}
                            />
                            <input
                                type="text"
                                placeholder="Message text…"
                                value={chatText}
                                onChange={(e) => setChatText(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter' && !busy) void sendChat(); }}
                                style={{ flex: '2 1 220px', padding: '0.35rem 0.55rem', fontSize: '0.8rem', border: '1px solid var(--line)', borderRadius: '4px', background: 'var(--bg)', color: 'var(--ink)' }}
                            />
                            <button
                                type="button"
                                className="primary-action"
                                disabled={busy === 'chat' || !chatText.trim() || !chatHandle.trim()}
                                onClick={() => void sendChat()}
                            >
                                {busy === 'chat' ? 'Sending…' : 'Send'}
                            </button>
                        </div>
                        {chatResult && (
                            <p className="message-inline" style={chatResult.ok
                                ? { borderColor: 'var(--ok-border)', background: 'var(--ok-bg)', color: 'var(--ok)' }
                                : undefined}
                            >
                                {chatResult.ok ? '✓ Message sent to meeting chat' : `✗ ${chatResult.error}`}
                            </p>
                        )}
                    </div>
                </>
            )}

            {/* Help text when not started */}
            {!maSession && (
                <div style={{ padding: '0.6rem', border: '1px dashed var(--line)', borderRadius: '6px', fontSize: '0.8rem', color: 'var(--ink-soft)' }}>
                    <p style={{ margin: 0 }}>
                        Click <strong>⚡ Start live session</strong> to create a meeting-agent session for this gateway record.
                        Then click <strong>▶ Join meeting</strong> to join via the best available adapter
                        (Teams Graph API → Zoom SDK → FreeSWITCH SIP → browser fallback).
                    </p>
                    <p style={{ margin: '0.4rem 0 0', fontSize: '0.74rem', color: 'var(--ink-muted)' }}>
                        Meeting URL: <span style={{ fontFamily: 'monospace' }}>{gw.meetingUrl.slice(0, 60)}{gw.meetingUrl.length > 60 ? '…' : ''}</span>
                    </p>
                </div>
            )}
        </section>
    );
}
