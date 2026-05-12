'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

type ChatSession = {
    id: string;
    tenantId: string;
    agentId: string | null;
    title: string | null;
    createdAt: string;
    updatedAt: string;
};

type ChatMessage = {
    id: string;
    sessionId: string;
    role: string;
    content: string;
    createdAt: string;
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function ChatSessionsPanel({ tenantId }: { tenantId: string }) {
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [sessionsLoading, setSessionsLoading] = useState(false);
    const [sessionsError, setSessionsError] = useState<string | null>(null);

    const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [messagesLoading, setMessagesLoading] = useState(false);
    const [messagesError, setMessagesError] = useState<string | null>(null);

    const [sending, setSending] = useState(false);
    const [sendError, setSendError] = useState<string | null>(null);
    const [messageInput, setMessageInput] = useState('');

    const [showCreate, setShowCreate] = useState(false);
    const [newAgentId, setNewAgentId] = useState('');
    const [newTitle, setNewTitle] = useState('');
    const [creating, setCreating] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);

    const [deleting, setDeleting] = useState<string | null>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Suppress unused variable warning — tenantId available for future filter
    void tenantId;

    // ── Data fetching ──────────────────────────────────────────────────────────

    const fetchSessions = useCallback(async () => {
        setSessionsLoading(true);
        setSessionsError(null);

        const response = await fetch('/api/chat', { cache: 'no-store' });
        const data = (await response.json().catch(() => ({}))) as {
            sessions?: ChatSession[];
            message?: string;
        };

        if (!response.ok) {
            setSessionsError(data.message ?? 'Unable to load chat sessions.');
            setSessionsLoading(false);
            return;
        }

        setSessions(Array.isArray(data.sessions) ? data.sessions : []);
        setSessionsLoading(false);
    }, []);

    const fetchMessages = useCallback(async (sessionId: string) => {
        setMessagesLoading(true);
        setMessagesError(null);

        const response = await fetch(
            `/api/chat/${encodeURIComponent(sessionId)}/messages`,
            { cache: 'no-store' },
        );
        const data = (await response.json().catch(() => ({}))) as {
            messages?: ChatMessage[];
            message?: string;
        };

        if (!response.ok) {
            setMessagesError(data.message ?? 'Unable to load messages.');
            setMessagesLoading(false);
            return;
        }

        setMessages(Array.isArray(data.messages) ? data.messages : []);
        setMessagesLoading(false);
    }, []);

    useEffect(() => {
        void fetchSessions();
    }, [fetchSessions]);

    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    // ── Actions ────────────────────────────────────────────────────────────────

    const selectSession = async (sessionId: string) => {
        setSelectedSessionId(sessionId);
        setMessages([]);
        setSendError(null);
        await fetchMessages(sessionId);
    };

    const sendMessage = async () => {
        if (!messageInput.trim() || !selectedSessionId) return;

        setSending(true);
        setSendError(null);

        const content = messageInput.trim();
        setMessageInput('');

        const response = await fetch(
            `/api/chat/${encodeURIComponent(selectedSessionId)}/messages`,
            {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ content }),
            },
        );

        const data = (await response.json().catch(() => ({}))) as { message?: string };

        if (!response.ok) {
            setSendError(data.message ?? 'Failed to send message.');
            setSending(false);
            return;
        }

        setSending(false);
        await fetchMessages(selectedSessionId);
    };

    const createSession = async () => {
        setCreating(true);
        setCreateError(null);

        const body: { agentId?: string; title?: string } = {};
        if (newAgentId.trim()) body.agentId = newAgentId.trim();
        if (newTitle.trim()) body.title = newTitle.trim();

        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
        });

        const data = (await response.json().catch(() => ({}))) as {
            id?: string;
            session?: ChatSession;
            message?: string;
        };

        if (!response.ok) {
            setCreateError(data.message ?? 'Failed to create session.');
            setCreating(false);
            return;
        }

        setNewAgentId('');
        setNewTitle('');
        setShowCreate(false);
        setCreating(false);

        await fetchSessions();

        const newId = data.id ?? (data.session?.id ?? null);
        if (newId) {
            await selectSession(newId);
        }
    };

    const deleteSession = async (sessionId: string) => {
        if (!window.confirm('Delete this chat session?')) return;
        setDeleting(sessionId);

        await fetch(`/api/chat/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });

        if (selectedSessionId === sessionId) {
            setSelectedSessionId(null);
            setMessages([]);
        }

        setDeleting(null);
        await fetchSessions();
    };

    // ── Render ─────────────────────────────────────────────────────────────────

    const selectedSession = sessions.find((s) => s.id === selectedSessionId) ?? null;

    return (
        <section
            className="card"
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0',
                padding: '0',
                overflow: 'hidden',
            }}
        >
            {/* Header */}
            <header style={{ padding: '0.9rem 1rem', borderBottom: '1px solid var(--line)' }}>
                <h2 style={{ margin: '0 0 0.2rem' }}>Agent Chat</h2>
                <p style={{ margin: 0, color: 'var(--ink-soft)', fontSize: '0.86rem' }}>
                    Create and manage direct chat sessions with agents.
                </p>
            </header>

            {/* Two-column body */}
            <div
                style={{
                    display: 'flex',
                    minHeight: '520px',
                }}
            >
                {/* ── Left column: session list ──────────────────────────────── */}
                <div
                    style={{
                        width: '280px',
                        flexShrink: 0,
                        borderRight: '1px solid var(--line)',
                        display: 'flex',
                        flexDirection: 'column',
                    }}
                >
                    {/* New session toggle */}
                    <div style={{ padding: '0.65rem 0.8rem', borderBottom: '1px solid var(--line)' }}>
                        <button
                            type="button"
                            className="primary-action"
                            style={{ width: '100%' }}
                            onClick={() => {
                                setShowCreate((v) => !v);
                                setCreateError(null);
                            }}
                        >
                            {showCreate ? 'Cancel' : '+ New session'}
                        </button>
                    </div>

                    {/* Create form (collapsible) */}
                    {showCreate && (
                        <div
                            style={{
                                padding: '0.6rem 0.8rem',
                                borderBottom: '1px solid var(--line)',
                                display: 'grid',
                                gap: '0.4rem',
                            }}
                        >
                            <input
                                type="text"
                                placeholder="Agent ID (optional)"
                                value={newAgentId}
                                onChange={(e) => setNewAgentId(e.target.value)}
                                style={{
                                    padding: '0.3rem 0.5rem',
                                    fontSize: '0.8rem',
                                    border: '1px solid var(--line)',
                                    borderRadius: '4px',
                                    background: 'var(--bg)',
                                    color: 'var(--ink)',
                                }}
                            />
                            <input
                                type="text"
                                placeholder="Title (optional)"
                                value={newTitle}
                                onChange={(e) => setNewTitle(e.target.value)}
                                style={{
                                    padding: '0.3rem 0.5rem',
                                    fontSize: '0.8rem',
                                    border: '1px solid var(--line)',
                                    borderRadius: '4px',
                                    background: 'var(--bg)',
                                    color: 'var(--ink)',
                                }}
                            />
                            {createError && (
                                <p
                                    style={{
                                        margin: 0,
                                        color: '#991b1b',
                                        fontSize: '0.75rem',
                                    }}
                                >
                                    {createError}
                                </p>
                            )}
                            <button
                                type="button"
                                className="primary-action"
                                disabled={creating}
                                onClick={() => void createSession()}
                            >
                                {creating ? 'Creating...' : 'Create'}
                            </button>
                        </div>
                    )}

                    {/* Sessions list */}
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        {sessionsLoading && (
                            <p
                                style={{
                                    margin: 0,
                                    padding: '0.8rem',
                                    color: 'var(--ink-soft)',
                                    fontSize: '0.82rem',
                                }}
                            >
                                Loading sessions...
                            </p>
                        )}
                        {sessionsError && (
                            <p
                                style={{
                                    margin: 0,
                                    padding: '0.8rem',
                                    color: '#991b1b',
                                    fontSize: '0.82rem',
                                }}
                            >
                                {sessionsError}
                            </p>
                        )}
                        {!sessionsLoading && !sessionsError && sessions.length === 0 && (
                            <p
                                style={{
                                    margin: 0,
                                    padding: '0.8rem',
                                    color: 'var(--ink-soft)',
                                    fontSize: '0.82rem',
                                }}
                            >
                                No sessions. Create one above.
                            </p>
                        )}
                        {sessions.map((s) => {
                            const isSelected = s.id === selectedSessionId;
                            const isDeleting = deleting === s.id;
                            return (
                                <div
                                    key={s.id}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.35rem',
                                        padding: '0.55rem 0.8rem',
                                        borderBottom: '1px solid var(--line)',
                                        cursor: 'pointer',
                                        background: isSelected ? 'transparent' : undefined,
                                        borderLeft: isSelected
                                            ? '2px solid var(--ink)'
                                            : '2px solid transparent',
                                    }}
                                    onClick={() => void selectSession(s.id)}
                                >
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <p
                                            style={{
                                                margin: 0,
                                                fontSize: '0.83rem',
                                                fontWeight: isSelected ? 600 : 400,
                                                color: 'var(--ink)',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                            }}
                                        >
                                            {s.title ?? s.id.slice(0, 16) + '…'}
                                        </p>
                                        {s.agentId && (
                                            <p
                                                style={{
                                                    margin: '0.1rem 0 0',
                                                    fontSize: '0.72rem',
                                                    color: 'var(--ink-muted)',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap',
                                                }}
                                            >
                                                {s.agentId}
                                            </p>
                                        )}
                                        <p
                                            style={{
                                                margin: '0.1rem 0 0',
                                                fontSize: '0.7rem',
                                                color: 'var(--ink-soft)',
                                            }}
                                        >
                                            {new Date(s.createdAt).toLocaleDateString(undefined, {
                                                month: 'short',
                                                day: 'numeric',
                                            })}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        disabled={isDeleting}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            void deleteSession(s.id);
                                        }}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            cursor: 'pointer',
                                            color: 'var(--ink-soft)',
                                            fontSize: '0.85rem',
                                            padding: '0.1rem 0.25rem',
                                            lineHeight: 1,
                                            flexShrink: 0,
                                        }}
                                        title="Delete session"
                                    >
                                        {isDeleting ? '…' : '✕'}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* ── Right column: chat area ────────────────────────────────── */}
                <div
                    style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        minWidth: 0,
                    }}
                >
                    {!selectedSessionId ? (
                        <div
                            style={{
                                flex: 1,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            <p
                                style={{
                                    color: 'var(--ink-soft)',
                                    fontStyle: 'italic',
                                    fontSize: '0.9rem',
                                }}
                            >
                                Select a session to view messages.
                            </p>
                        </div>
                    ) : (
                        <>
                            {/* Session header */}
                            <div
                                style={{
                                    padding: '0.6rem 0.9rem',
                                    borderBottom: '1px solid var(--line)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.6rem',
                                }}
                            >
                                <span
                                    style={{
                                        fontSize: '0.85rem',
                                        fontWeight: 600,
                                        color: 'var(--ink)',
                                    }}
                                >
                                    {selectedSession?.title ?? selectedSessionId.slice(0, 20) + '…'}
                                </span>
                                {selectedSession?.agentId && (
                                    <span
                                        style={{
                                            padding: '2px 8px',
                                            borderRadius: '4px',
                                            fontSize: '11px',
                                            fontWeight: 700,
                                            background: '#dbeafe',
                                            color: '#1d4ed8',
                                        }}
                                    >
                                        {selectedSession.agentId}
                                    </span>
                                )}
                            </div>

                            {/* Messages */}
                            <div
                                style={{
                                    flex: 1,
                                    overflowY: 'auto',
                                    padding: '0.75rem 0.9rem',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '0.55rem',
                                    maxHeight: '400px',
                                }}
                            >
                                {messagesLoading && (
                                    <p
                                        style={{
                                            margin: 0,
                                            color: 'var(--ink-soft)',
                                            fontSize: '0.82rem',
                                        }}
                                    >
                                        Loading messages...
                                    </p>
                                )}
                                {messagesError && (
                                    <p
                                        style={{
                                            margin: 0,
                                            color: '#991b1b',
                                            fontSize: '0.82rem',
                                        }}
                                    >
                                        {messagesError}
                                    </p>
                                )}
                                {!messagesLoading && !messagesError && messages.length === 0 && (
                                    <p
                                        style={{
                                            margin: 0,
                                            color: 'var(--ink-soft)',
                                            fontStyle: 'italic',
                                            fontSize: '0.82rem',
                                        }}
                                    >
                                        No messages yet. Send one below.
                                    </p>
                                )}
                                {messages.map((msg) => {
                                    const isUser = msg.role === 'user';
                                    const isAssistant = msg.role === 'assistant';

                                    if (isUser) {
                                        return (
                                            <div
                                                key={msg.id}
                                                style={{
                                                    display: 'flex',
                                                    justifyContent: 'flex-end',
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        maxWidth: '72%',
                                                        padding: '0.45rem 0.7rem',
                                                        borderRadius: '10px 10px 2px 10px',
                                                        background: '#334155',
                                                        color: '#f8fafc',
                                                        fontSize: '0.83rem',
                                                        lineHeight: 1.5,
                                                    }}
                                                >
                                                    {msg.content}
                                                </div>
                                            </div>
                                        );
                                    }

                                    if (isAssistant) {
                                        return (
                                            <div
                                                key={msg.id}
                                                style={{
                                                    display: 'flex',
                                                    justifyContent: 'flex-start',
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        maxWidth: '72%',
                                                        padding: '0.45rem 0.7rem',
                                                        borderRadius: '10px 10px 10px 2px',
                                                        background: '#e2e8f0',
                                                        color: '#1e293b',
                                                        fontSize: '0.83rem',
                                                        lineHeight: 1.5,
                                                    }}
                                                >
                                                    {msg.content}
                                                </div>
                                            </div>
                                        );
                                    }

                                    return (
                                        <p
                                            key={msg.id}
                                            style={{
                                                margin: 0,
                                                fontStyle: 'italic',
                                                color: 'var(--ink-muted)',
                                                fontSize: '0.78rem',
                                                textAlign: 'center',
                                            }}
                                        >
                                            [{msg.role}] {msg.content}
                                        </p>
                                    );
                                })}
                                <div ref={messagesEndRef} />
                            </div>

                            {/* Input bar */}
                            <div
                                style={{
                                    borderTop: '1px solid var(--line)',
                                    padding: '0.6rem 0.9rem',
                                    display: 'flex',
                                    gap: '0.5rem',
                                    alignItems: 'flex-end',
                                }}
                            >
                                <textarea
                                    rows={2}
                                    placeholder="Type a message… (Ctrl+Enter to send)"
                                    value={messageInput}
                                    onChange={(e) => setMessageInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && e.ctrlKey) {
                                            e.preventDefault();
                                            void sendMessage();
                                        }
                                    }}
                                    style={{
                                        flex: 1,
                                        padding: '0.35rem 0.55rem',
                                        fontSize: '0.83rem',
                                        border: '1px solid var(--line)',
                                        borderRadius: '4px',
                                        background: 'var(--bg)',
                                        color: 'var(--ink)',
                                        resize: 'none',
                                        lineHeight: 1.45,
                                    }}
                                    disabled={sending}
                                />
                                <button
                                    type="button"
                                    className="primary-action"
                                    disabled={sending || !messageInput.trim()}
                                    onClick={() => void sendMessage()}
                                >
                                    {sending ? '...' : 'Send'}
                                </button>
                            </div>

                            {sendError && (
                                <p
                                    style={{
                                        margin: 0,
                                        padding: '0.3rem 0.9rem',
                                        color: '#991b1b',
                                        fontSize: '0.78rem',
                                    }}
                                >
                                    {sendError}
                                </p>
                            )}
                        </>
                    )}
                </div>
            </div>
        </section>
    );
}
