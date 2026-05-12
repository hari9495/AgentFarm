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
    PENDING: { bg: '#1e293b', text: '#94a3b8' },
    DELIVERED: { bg: '#1e3a2f', text: '#6ee7b7' },
    READ: { bg: '#172554', text: '#93c5fd' },
    REPLIED: { bg: '#2d1b69', text: '#c4b5fd' },
    EXPIRED: { bg: '#1c1917', text: '#78716c' },
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
                background: '#0f172a',
                color: '#64748b',
                border: '1px solid #1e293b',
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
                borderBottom: '1px solid #1e293b',
                cursor: 'pointer',
                background: message.status === 'PENDING' && isInbox ? '#0c1628' : 'transparent',
                transition: 'background 0.1s ease',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = '#111827'; }}
            onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.background =
                    message.status === 'PENDING' && isInbox ? '#0c1628' : 'transparent';
            }}
        >
            <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '12px', color: '#94a3b8', fontFamily: 'monospace', marginBottom: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {isInbox ? `from: ${counterpart}` : `to: ${counterpart}`}
                </div>
                <div style={{ fontSize: '13px', color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {message.subject ?? message.body.slice(0, 80)}
                </div>
            </div>
            <TypeBadge type={message.messageType} />
            <StatusBadge status={message.status} />
            <div style={{ fontSize: '11px', color: '#475569', whiteSpace: 'nowrap' }}>{ts}</div>
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
                    background: '#0f172a',
                    border: '1px solid #1e293b',
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
                        <div style={{ fontSize: '15px', fontWeight: 600, color: '#f1f5f9', marginBottom: '4px' }}>
                            {message.subject ?? 'Message'}
                        </div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <TypeBadge type={message.messageType} />
                            <StatusBadge status={message.status} />
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '18px', lineHeight: 1 }}
                    >
                        ×
                    </button>
                </div>

                {/* Meta */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px', color: '#64748b' }}>
                    <div><span style={{ color: '#475569' }}>From:</span> <span style={{ fontFamily: 'monospace', color: '#94a3b8' }}>{message.fromBotId}</span></div>
                    <div><span style={{ color: '#475569' }}>To:</span> <span style={{ fontFamily: 'monospace', color: '#94a3b8' }}>{message.toBotId}</span></div>
                    <div><span style={{ color: '#475569' }}>Sent:</span> {ts}</div>
                    {message.threadId && <div><span style={{ color: '#475569' }}>Thread:</span> <span style={{ fontFamily: 'monospace', color: '#94a3b8', fontSize: '11px' }}>{message.threadId}</span></div>}
                </div>

                {/* Body */}
                <div
                    style={{
                        background: '#1e293b',
                        borderRadius: '8px',
                        padding: '14px',
                        fontSize: '13px',
                        color: '#e2e8f0',
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
                            background: '#172554',
                            border: '1px solid #1e3a8a',
                            borderRadius: '6px',
                            color: '#93c5fd',
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
                        <div style={{ fontSize: '12px', color: '#475569', marginBottom: '8px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                            Reply
                        </div>
                        {replyDone ? (
                            <div style={{ fontSize: '13px', color: '#6ee7b7', padding: '10px 12px', background: '#1e3a2f', borderRadius: '6px' }}>
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
                                        background: '#1e293b',
                                        border: '1px solid #334155',
                                        borderRadius: '6px',
                                        color: '#e2e8f0',
                                        fontSize: '13px',
                                        padding: '10px 12px',
                                        resize: 'vertical',
                                        boxSizing: 'border-box',
                                        fontFamily: 'inherit',
                                    }}
                                />
                                {replyError && (
                                    <div style={{ fontSize: '12px', color: '#fca5a5', marginTop: '6px' }}>{replyError}</div>
                                )}
                                <button
                                    onClick={() => void handleReply()}
                                    disabled={replying || !replyBody.trim()}
                                    style={{
                                        marginTop: '8px',
                                        padding: '7px 16px',
                                        background: '#1e3a2f',
                                        border: '1px solid #166534',
                                        borderRadius: '6px',
                                        color: '#86efac',
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
                background: '#1e293b',
                borderRadius: '8px',
                padding: '16px',
                marginBottom: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
            }}
        >
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                New Message
            </div>
            <input
                value={toBotId}
                onChange={(e) => setToBotId(e.target.value)}
                placeholder="Recipient Bot ID"
                style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#e2e8f0', fontSize: '13px', padding: '8px 10px', fontFamily: 'monospace' }}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <select
                    value={messageType}
                    onChange={(e) => setMessageType(e.target.value as AgentMessageType)}
                    style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#e2e8f0', fontSize: '13px', padding: '8px 10px' }}
                >
                    {MESSAGE_TYPES.map((t) => (
                        <option key={t} value={t}>{TYPE_LABEL[t]}</option>
                    ))}
                </select>
                <input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Subject (optional)"
                    style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#e2e8f0', fontSize: '13px', padding: '8px 10px' }}
                />
            </div>
            <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Message body…"
                rows={3}
                style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#e2e8f0', fontSize: '13px', padding: '8px 10px', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box', width: '100%' }}
            />
            {error && <div style={{ fontSize: '12px', color: '#fca5a5' }}>{error}</div>}
            <div style={{ display: 'flex', gap: '8px' }}>
                <button
                    onClick={() => void handleSend()}
                    disabled={sending || !toBotId.trim() || !body.trim()}
                    style={{ padding: '7px 16px', background: '#1e3a2f', border: '1px solid #166534', borderRadius: '6px', color: '#86efac', fontSize: '12px', fontWeight: 600, cursor: sending || !toBotId.trim() || !body.trim() ? 'not-allowed' : 'pointer', opacity: sending || !toBotId.trim() || !body.trim() ? 0.5 : 1 }}
                >
                    {sending ? 'Sending…' : 'Send'}
                </button>
                <button
                    onClick={onCancel}
                    style={{ padding: '7px 14px', background: 'transparent', border: '1px solid #334155', borderRadius: '6px', color: '#64748b', fontSize: '12px', cursor: 'pointer' }}
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
                <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid #1e293b', paddingBottom: '0' }}>
                    {(['inbox', 'sent'] as const).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            style={{
                                padding: '7px 14px',
                                background: 'transparent',
                                border: 'none',
                                borderBottom: activeTab === tab ? '2px solid #3b82f6' : '2px solid transparent',
                                color: activeTab === tab ? '#3b82f6' : '#64748b',
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
                                        background: '#3b82f6',
                                        color: '#fff',
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
                        style={{ padding: '6px 12px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: '#64748b', fontSize: '12px', cursor: 'pointer' }}
                    >
                        ↻
                    </button>
                    <button
                        onClick={() => setComposing(true)}
                        style={{ padding: '6px 12px', background: '#1e3a2f', border: '1px solid #166534', borderRadius: '6px', color: '#86efac', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
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
                <div style={{ padding: '10px 12px', background: '#3b0d0d', border: '1px solid #7f1d1d', borderRadius: '6px', color: '#fca5a5', fontSize: '13px', marginBottom: '12px' }}>
                    {error}
                </div>
            )}

            {/* Message list */}
            <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #1e293b', borderRadius: '8px' }}>
                {loading ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: '#475569', fontSize: '13px' }}>Loading…</div>
                ) : messages.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: '#334155', fontSize: '13px' }}>
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
