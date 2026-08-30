'use client';

import { useState, useCallback, useEffect } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

type AgentMessageStatus = 'PENDING' | 'DELIVERED' | 'READ' | 'REPLIED' | 'EXPIRED';
type AgentMessageType =
    | 'QUESTION'
    | 'ANSWER'
    | 'RESULT'
    | 'STATUS_UPDATE'
    | 'HANDOFF_REQUEST'
    | 'HANDOFF_ACCEPT'
    | 'HANDOFF_REJECT'
    | 'BROADCAST';

interface AgentMessage {
    id: string;
    fromBotId: string;
    toBotId: string;
    threadId: string | null;
    messageType: AgentMessageType;
    subject: string | null;
    body: string;
    metadata: unknown;
    status: AgentMessageStatus;
    readAt: string | null;
    repliedAt: string | null;
    replyToId: string | null;
    createdAt: string;
    expiresAt: string | null;
}

// ── Badge helpers ─────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<AgentMessageStatus, { bg: string; text: string }> = {
    PENDING: { bg: 'color-mix(in srgb, var(--ink-muted) 10%, transparent)', text: 'var(--ink-muted)' },
    DELIVERED: { bg: 'var(--ok-bg)', text: 'var(--ok)' },
    READ: { bg: 'var(--info-bg)', text: 'var(--info)' },
    REPLIED: { bg: 'color-mix(in srgb, var(--accent) 10%, transparent)', text: 'var(--accent)' },
    EXPIRED: { bg: 'var(--bg-deep)', text: 'var(--ink-muted)' },
};

const TYPE_LABEL: Record<AgentMessageType, string> = {
    QUESTION: 'Question',
    ANSWER: 'Answer',
    RESULT: 'Result',
    STATUS_UPDATE: 'Status',
    HANDOFF_REQUEST: 'Handoff Req',
    HANDOFF_ACCEPT: 'Handoff OK',
    HANDOFF_REJECT: 'Handoff Rejected',
    BROADCAST: 'Broadcast',
};

function StatusBadge({ status }: { status: AgentMessageStatus }) {
    const c = STATUS_COLORS[status] ?? STATUS_COLORS.PENDING;
    return (
        <span
            style={{
                padding: '2px 8px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 600,
                background: c.bg,
                color: c.text,
                letterSpacing: '0.04em',
                whiteSpace: 'nowrap',
            }}
        >
            {status}
        </span>
    );
}

function TypeBadge({ type }: { type: AgentMessageType }) {
    return (
        <span
            style={{
                padding: '2px 7px',
                borderRadius: '4px',
                fontSize: '11px',
                background: 'var(--bg-deep)',
                color: 'var(--ink-muted)',
                border: '1px solid var(--line)',
                whiteSpace: 'nowrap',
            }}
        >
            {TYPE_LABEL[type] ?? type}
        </span>
    );
}

// ── Message row ───────────────────────────────────────────────────────────────

function MessageRow({
    message,
    isInbox,
    onSelect,
}: {
    message: AgentMessage;
    isInbox: boolean;
    onSelect: (m: AgentMessage) => void;
}) {
    const counterpart = isInbox ? message.fromBotId : message.toBotId;
    const ts = message.createdAt
        ? new Date(message.createdAt).toLocaleString(undefined, { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })
        : '—';

    return (
        <div
            onClick={() => onSelect(message)}
            style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto auto auto',
                gap: '12px',
                alignItems: 'center',
                padding: '10px 12px',
                borderBottom: '1px solid var(--line)',
                cursor: 'pointer',
                background: message.status === 'PENDING' && isInbox ? 'var(--info-bg)' : 'transparent',
                transition: 'background 0.1s ease',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-deep)'; }}
            onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.background =
                    message.status === 'PENDING' && isInbox ? 'var(--info-bg)' : 'transparent';
            }}
        >
            <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '12px', color: 'var(--ink-muted)', fontFamily: 'monospace', marginBottom: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {isInbox ? `from: ${counterpart}` : `to: ${counterpart}`}
                </div>
                <div style={{ fontSize: '13px', color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {message.subject ?? message.body.slice(0, 80)}
                </div>
            </div>
            <TypeBadge type={message.messageType} />
            <StatusBadge status={message.status} />
            <div style={{ fontSize: '11px', color: 'var(--ink-muted)', whiteSpace: 'nowrap' }}>{ts}</div>
        </div>
    );
}

// ── Message detail drawer ─────────────────────────────────────────────────────

function MessageDetail({
    message,
    botId,
    isInbox,
    onClose,
    onStatusChange,
}: {
    message: AgentMessage;
    botId: string;
    isInbox: boolean;
    onClose: () => void;
    onStatusChange: (id: string, status: AgentMessageStatus) => void;
}) {
    const [replyBody, setReplyBody] = useState('');
    const [replying, setReplying] = useState(false);
    const [replyError, setReplyError] = useState<string | null>(null);
    const [replyDone, setReplyDone] = useState(false);

    async function handleMarkRead() {
        try {
            const res = await fetch(`/api/agents/${botId}/messages/${message.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'READ' }),
            });
            if (res.ok) onStatusChange(message.id, 'READ');
        } catch {
            // non-critical
        }
    }

    async function handleReply() {
        if (!replyBody.trim()) return;
        setReplying(true);
        setReplyError(null);
        try {
            const res = await fetch(`/api/agents/${botId}/messages/${message.id}/reply`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ body: replyBody.trim(), messageType: 'ANSWER' }),
            });
            if (res.ok) {
                setReplyDone(true);
                setReplyBody('');
                onStatusChange(message.id, 'REPLIED');
            } else {
                const err = await res.json().catch(() => ({})) as { message?: string };
                setReplyError(err.message ?? 'Reply failed.');
            }
        } catch {
            setReplyError('Network error while sending reply.');
        } finally {
            setReplying(false);
        }
    }

    const ts = message.createdAt
        ? new Date(message.createdAt).toLocaleString()
        : '—';

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000,
            }}
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div
                style={{
                    background: 'var(--card)',
                    border: '1px solid var(--line)',
                    borderRadius: '12px',
                    padding: '24px',
                    width: '560px',
                    maxWidth: '90vw',
                    maxHeight: '80vh',
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '16px',
                }}
            >
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--ink)', marginBottom: '4px' }}>
                            {message.subject ?? 'Message'}
                        </div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <TypeBadge type={message.messageType} />
                            <StatusBadge status={message.status} />
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{ background: 'none', border: 'none', color: 'var(--ink-muted)', cursor: 'pointer', fontSize: '18px', lineHeight: 1 }}
                    >
                        ×
                    </button>
                </div>

                {/* Meta */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px', color: 'var(--ink-muted)' }}>
                    <div><span style={{ color: 'var(--ink-muted)' }}>From:</span> <span style={{ fontFamily: 'monospace', color: 'var(--ink-muted)' }}>{message.fromBotId}</span></div>
                    <div><span style={{ color: 'var(--ink-muted)' }}>To:</span> <span style={{ fontFamily: 'monospace', color: 'var(--ink-muted)' }}>{message.toBotId}</span></div>
                    <div><span style={{ color: 'var(--ink-muted)' }}>Sent:</span> {ts}</div>
                    {message.threadId && <div><span style={{ color: 'var(--ink-muted)' }}>Thread:</span> <span style={{ fontFamily: 'monospace', color: 'var(--ink-muted)', fontSize: '11px' }}>{message.threadId}</span></div>}
                </div>

                {/* Body */}
                <div
                    style={{
                        background: 'var(--bg)',
                        borderRadius: '8px',
                        padding: '14px',
                        fontSize: '13px',
                        color: 'var(--ink)',
                        lineHeight: 1.6,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                    }}
                >
                    {message.body}
                </div>

                {/* Actions */}
                {isInbox && message.status !== 'READ' && message.status !== 'REPLIED' && (
                    <button
                        onClick={() => void handleMarkRead()}
                        style={{
                            padding: '7px 14px',
                            background: 'var(--info-bg)',
                            border: '1px solid var(--info-border)',
                            borderRadius: '6px',
                            color: 'var(--info)',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            alignSelf: 'flex-start',
                        }}
                    >
                        Mark as Read
                    </button>
                )}

                {/* Reply form */}
                {isInbox && message.status !== 'EXPIRED' && (
                    <div>
                        <div style={{ fontSize: '12px', color: 'var(--ink-muted)', marginBottom: '8px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                            Reply
                        </div>
                        {replyDone ? (
                            <div style={{ fontSize: '13px', color: 'var(--ok)', padding: '10px 12px', background: 'var(--ok-bg)', borderRadius: '6px' }}>
                                Reply sent.
                            </div>
                        ) : (
                            <>
                                <textarea
                                    value={replyBody}
                                    onChange={(e) => setReplyBody(e.target.value)}
                                    placeholder="Write your reply…"
                                    rows={3}
                                    style={{
                                        width: '100%',
                                        background: 'var(--bg-deep)',
                                        border: '1px solid var(--line)',
                                        borderRadius: '6px',
                                        color: 'var(--ink)',
                                        fontSize: '13px',
                                        padding: '10px 12px',
                                        resize: 'vertical',
                                        boxSizing: 'border-box',
                                        fontFamily: 'inherit',
                                    }}
                                />
                                {replyError && (
                                    <div style={{ fontSize: '12px', color: 'var(--danger)', marginTop: '6px' }}>{replyError}</div>
                                )}
                                <button
                                    onClick={() => void handleReply()}
                                    disabled={replying || !replyBody.trim()}
                                    style={{
                                        marginTop: '8px',
                                        padding: '7px 16px',
                                        background: 'var(--ok-bg)',
                                        border: '1px solid var(--ok-border)',
                                        borderRadius: '6px',
                                        color: 'var(--ok)',
                                        fontSize: '12px',
                                        fontWeight: 600,
                                        cursor: replying || !replyBody.trim() ? 'not-allowed' : 'pointer',
                                        opacity: replying || !replyBody.trim() ? 0.5 : 1,
                                    }}
                                >
                                    {replying ? 'Sending…' : 'Send Reply'}
                                </button>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Compose form ──────────────────────────────────────────────────────────────

const MESSAGE_TYPES: AgentMessageType[] = [
    'QUESTION', 'ANSWER', 'RESULT', 'STATUS_UPDATE',
    'HANDOFF_REQUEST', 'HANDOFF_ACCEPT', 'HANDOFF_REJECT', 'BROADCAST',
];

function ComposeForm({
    botId,
    onSent,
    onCancel,
}: {
    botId: string;
    onSent: () => void;
    onCancel: () => void;
}) {
    const [toBotId, setToBotId] = useState('');
    const [messageType, setMessageType] = useState<AgentMessageType>('QUESTION');
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSend() {
        if (!toBotId.trim() || !body.trim()) return;
        setSending(true);
        setError(null);
        try {
            const res = await fetch(`/api/agents/${botId}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    toBotId: toBotId.trim(),
                    messageType,
                    subject: subject.trim() || undefined,
                    body: body.trim(),
                }),
            });
            if (res.ok) {
                onSent();
            } else {
                const err = await res.json().catch(() => ({})) as { message?: string };
                setError(err.message ?? 'Failed to send message.');
            }
        } catch {
            setError('Network error while sending.');
        } finally {
            setSending(false);
        }
    }

    return (
        <div
            style={{
                background: 'var(--bg-deep)',
                borderRadius: '8px',
                padding: '16px',
                marginBottom: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
            }}
        >
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                New Message
            </div>
            <input
                value={toBotId}
                onChange={(e) => setToBotId(e.target.value)}
                placeholder="Recipient Bot ID"
                style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: '6px', color: 'var(--ink)', fontSize: '13px', padding: '8px 10px', fontFamily: 'monospace' }}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <select
                    value={messageType}
                    onChange={(e) => setMessageType(e.target.value as AgentMessageType)}
                    style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: '6px', color: 'var(--ink)', fontSize: '13px', padding: '8px 10px' }}
                >
                    {MESSAGE_TYPES.map((t) => (
                        <option key={t} value={t}>{TYPE_LABEL[t]}</option>
                    ))}
                </select>
                <input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Subject (optional)"
                    style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: '6px', color: 'var(--ink)', fontSize: '13px', padding: '8px 10px' }}
                />
            </div>
            <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Message body…"
                rows={3}
                style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: '6px', color: 'var(--ink)', fontSize: '13px', padding: '8px 10px', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box', width: '100%' }}
            />
            {error && <div style={{ fontSize: '12px', color: 'var(--danger)' }}>{error}</div>}
            <div style={{ display: 'flex', gap: '8px' }}>
                <button
                    onClick={() => void handleSend()}
                    disabled={sending || !toBotId.trim() || !body.trim()}
                    style={{ padding: '7px 16px', background: 'var(--ok-bg)', border: '1px solid var(--ok-border)', borderRadius: '6px', color: 'var(--ok)', fontSize: '12px', fontWeight: 600, cursor: sending || !toBotId.trim() || !body.trim() ? 'not-allowed' : 'pointer', opacity: sending || !toBotId.trim() || !body.trim() ? 0.5 : 1 }}
                >
                    {sending ? 'Sending…' : 'Send'}
                </button>
                <button
                    onClick={onCancel}
                    style={{ padding: '7px 14px', background: 'transparent', border: '1px solid var(--line)', borderRadius: '6px', color: 'var(--ink-muted)', fontSize: '12px', cursor: 'pointer' }}
                >
                    Cancel
                </button>
            </div>
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AgentMessagesPanel({ botId }: { botId: string }) {
    const [activeTab, setActiveTab] = useState<'inbox' | 'sent'>('inbox');
    const [inbox, setInbox] = useState<AgentMessage[]>([]);
    const [sent, setSent] = useState<AgentMessage[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selected, setSelected] = useState<AgentMessage | null>(null);
    const [composing, setComposing] = useState(false);

    const fetchInbox = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/agents/${botId}/messages`);
            if (res.ok) {
                const data = (await res.json()) as { messages: AgentMessage[] };
                setInbox(data.messages ?? []);
            } else {
                setError('Failed to load inbox.');
            }
        } catch {
            setError('Network error loading inbox.');
        } finally {
            setLoading(false);
        }
    }, [botId]);

    const fetchSent = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/agents/${botId}/messages/sent`);
            if (res.ok) {
                const data = (await res.json()) as { messages: AgentMessage[] };
                setSent(data.messages ?? []);
            } else {
                setError('Failed to load sent messages.');
            }
        } catch {
            setError('Network error loading sent messages.');
        } finally {
            setLoading(false);
        }
    }, [botId]);

    useEffect(() => {
        if (activeTab === 'inbox') {
            void fetchInbox();
        } else {
            void fetchSent();
        }
    }, [activeTab, fetchInbox, fetchSent]);

    function handleStatusChange(id: string, status: AgentMessageStatus) {
        setInbox((prev) => prev.map((m) => m.id === id ? { ...m, status } : m));
        if (selected?.id === id) {
            setSelected((prev) => prev ? { ...prev, status } : null);
        }
    }

    const messages = activeTab === 'inbox' ? inbox : sent;
    const pendingCount = inbox.filter((m) => m.status === 'PENDING').length;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Toolbar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                {/* Tabs */}
                <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid var(--line)', paddingBottom: '0' }}>
                    {(['inbox', 'sent'] as const).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            style={{
                                padding: '7px 14px',
                                background: 'transparent',
                                border: 'none',
                                borderBottom: activeTab === tab ? '2px solid #2563EB' : '2px solid transparent',
                                color: activeTab === tab ? 'var(--info)' : 'var(--ink-muted)',
                                fontSize: '13px',
                                fontWeight: activeTab === tab ? 600 : 400,
                                cursor: 'pointer',
                                marginBottom: '-1px',
                                position: 'relative',
                            }}
                        >
                            {tab === 'inbox' ? 'Inbox' : 'Sent'}
                            {tab === 'inbox' && pendingCount > 0 && (
                                <span
                                    style={{
                                        marginLeft: '6px',
                                        background: 'var(--info)',
                                        color: 'var(--card)',
                                        borderRadius: '10px',
                                        padding: '1px 6px',
                                        fontSize: '10px',
                                        fontWeight: 700,
                                    }}
                                >
                                    {pendingCount}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Compose + Refresh */}
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        onClick={() => activeTab === 'inbox' ? void fetchInbox() : void fetchSent()}
                        style={{ padding: '6px 12px', background: 'var(--bg-deep)', border: '1px solid var(--line)', borderRadius: '6px', color: 'var(--ink-muted)', fontSize: '12px', cursor: 'pointer' }}
                    >
                        ↻
                    </button>
                    <button
                        onClick={() => setComposing(true)}
                        style={{ padding: '6px 12px', background: 'var(--ok-bg)', border: '1px solid var(--ok-border)', borderRadius: '6px', color: 'var(--ok)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                    >
                        + Compose
                    </button>
                </div>
            </div>

            {/* Compose form */}
            {composing && (
                <ComposeForm
                    botId={botId}
                    onSent={() => {
                        setComposing(false);
                        void fetchSent();
                        setActiveTab('sent');
                    }}
                    onCancel={() => setComposing(false)}
                />
            )}

            {/* Error */}
            {error && (
                <div style={{ padding: '10px 12px', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: '6px', color: 'var(--danger)', fontSize: '13px', marginBottom: '12px' }}>
                    {error}
                </div>
            )}

            {/* Message list */}
            <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: '8px' }}>
                {loading ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--ink-muted)', fontSize: '13px' }}>Loading…</div>
                ) : messages.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--ink-soft)', fontSize: '13px' }}>
                        No {activeTab === 'inbox' ? 'inbox' : 'sent'} messages.
                    </div>
                ) : (
                    messages.map((m) => (
                        <MessageRow
                            key={m.id}
                            message={m}
                            isInbox={activeTab === 'inbox'}
                            onSelect={setSelected}
                        />
                    ))
                )}
            </div>

            {/* Detail drawer */}
            {selected && (
                <MessageDetail
                    message={selected}
                    botId={botId}
                    isInbox={activeTab === 'inbox'}
                    onClose={() => setSelected(null)}
                    onStatusChange={handleStatusChange}
                />
            )}
        </div>
    );
}
