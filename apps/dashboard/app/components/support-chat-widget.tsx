'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { setSelectedIssueId } from './support-issue-feed';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ChatFrameType = 'step' | 'reply' | 'fix' | 'error' | 'connected';

type ChatFrame = {
    type: ChatFrameType;
    text?: string;
    status?: string;
    tier?: number;
    description?: string;
    issueId?: string;
};

type MessageEntry =
    | { kind: 'user'; text: string; id: string }
    | { kind: 'agent'; text: string; id: string }
    | { kind: 'step'; text: string; status?: string; id: string }
    | { kind: 'fix'; tier: number; description: string; id: string }
    | { kind: 'error'; text: string; id: string };

// ---------------------------------------------------------------------------
// Derive WebSocket URL from NEXT_PUBLIC_API_URL
// ---------------------------------------------------------------------------

function getWsUrl(): string {
    const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000')
        .replace(/\/$/, '');
    const wsBase = apiUrl
        .replace(/^https:\/\//, 'wss://')
        .replace(/^http:\/\//, 'ws://');
    return `${wsBase}/v1/support/chat-session`;
}

// ---------------------------------------------------------------------------
// Message bubble components
// ---------------------------------------------------------------------------

function UserBubble({ text }: { text: string }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.4rem' }}>
            <div style={{
                maxWidth: '75%', padding: '0.4rem 0.65rem',
                borderRadius: '10px 10px 2px 10px',
                background: 'var(--bg-deep)', color: 'var(--bg)',
                fontSize: '0.83rem', lineHeight: 1.5,
            }}>
                {text}
            </div>
        </div>
    );
}

function AgentBubble({ text }: { text: string }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '0.4rem' }}>
            <div style={{
                maxWidth: '75%', padding: '0.4rem 0.65rem',
                borderRadius: '10px 10px 10px 2px',
                background: 'var(--line)', color: 'var(--ink-soft)',
                fontSize: '0.83rem', lineHeight: 1.5, whiteSpace: 'pre-wrap',
            }}>
                {text}
            </div>
        </div>
    );
}

function StepBubble({ text, status }: { text: string; status?: string }) {
    const isRunning = status === 'running';
    return (
        <div style={{ marginBottom: '0.25rem' }}>
            <div style={{
                display: 'flex', alignItems: 'center', gap: '0.4rem',
                padding: '0.3rem 0.6rem', borderRadius: 6,
                background: 'var(--bg)', border: '1px solid var(--line)',
                fontSize: '0.75rem', color: 'var(--ink-muted)',
            }}>
                {isRunning ? (
                    <span style={{
                        width: 7, height: 7,
                        border: '1.5px solid #2C8A8A', borderTopColor: 'transparent',
                        borderRadius: '50%',
                        animation: 'spin 0.7s linear infinite',
                        display: 'inline-block', flexShrink: 0,
                    }} />
                ) : (
                    <span style={{ color: 'var(--ok)', flexShrink: 0 }}>✓</span>
                )}
                {text}
            </div>
        </div>
    );
}

function FixBubble({ tier, description }: { tier: number; description: string }) {
    return (
        <div style={{ marginBottom: '0.3rem' }}>
            <div style={{
                padding: '0.3rem 0.6rem', borderRadius: 6,
                background: 'var(--ok-bg)', border: '1px solid var(--ok-border)',
                fontSize: '0.75rem', color: 'var(--ok)',
            }}>
                <span style={{ fontWeight: 700 }}>Tier {tier} fix:</span>{' '}{description}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SupportChatWidget() {
    const [messages, setMessages] = useState<MessageEntry[]>([]);
    const [input, setInput] = useState('');
    const [connected, setConnected] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [issueId, setIssueId] = useState<string | null>(null);
    const [wsError, setWsError] = useState<string | null>(null);

    const wsRef = useRef<WebSocket | null>(null);
    const bottomRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    // Auto-scroll
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages.length]);

    // WebSocket lifecycle
    const connect = useCallback(() => {
        const ws = new WebSocket(getWsUrl());
        wsRef.current = ws;

        ws.onopen = () => { setConnected(true); setWsError(null); };

        ws.onclose = () => {
            setConnected(false);
            setProcessing(false);
            // Auto-reconnect after 4s
            setTimeout(() => { if (wsRef.current?.readyState !== WebSocket.OPEN) connect(); }, 4_000);
        };

        ws.onerror = () => { setWsError('Connection error — retrying…'); };

        ws.onmessage = (e: MessageEvent) => {
            let frame: ChatFrame;
            try { frame = JSON.parse(e.data as string) as ChatFrame; } catch { return; }

            if (frame.type === 'connected') {
                if (frame.issueId) {
                    setIssueId(frame.issueId);
                    setSelectedIssueId(frame.issueId);
                }
                return;
            }

            if (frame.type === 'step') {
                setMessages((prev) => [...prev, {
                    kind: 'step', text: frame.text ?? '', status: frame.status,
                    id: `${Date.now()}-${Math.random()}`,
                }]);
                return;
            }

            if (frame.type === 'fix') {
                setMessages((prev) => [...prev, {
                    kind: 'fix', tier: frame.tier ?? 1, description: frame.description ?? '',
                    id: `${Date.now()}-${Math.random()}`,
                }]);
                return;
            }

            if (frame.type === 'reply') {
                setProcessing(false);
                setMessages((prev) => [...prev, {
                    kind: 'agent', text: frame.text ?? '',
                    id: `${Date.now()}-${Math.random()}`,
                }]);
                return;
            }

            if (frame.type === 'error') {
                setProcessing(false);
                setMessages((prev) => [...prev, {
                    kind: 'error', text: frame.text ?? 'Unknown error',
                    id: `${Date.now()}-${Math.random()}`,
                }]);
            }
        };
    }, []);

    useEffect(() => {
        connect();
        return () => { wsRef.current?.close(); };
    }, [connect]);

    const sendMessage = () => {
        const text = input.trim();
        if (!text || !connected || processing) return;

        setMessages((prev) => [...prev, { kind: 'user', text, id: `${Date.now()}-u` }]);
        setInput('');
        setProcessing(true);

        const payload: { type: string; text: string; issueId?: string } = { type: 'message', text };
        if (issueId) payload.issueId = issueId;
        wsRef.current?.send(JSON.stringify(payload));
    };

    return (
        <section className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

            <header style={{
                padding: '0.8rem 1rem', borderBottom: '1px solid var(--line)',
                display: 'flex', alignItems: 'center', gap: '0.5rem',
            }}>
                <h2 style={{ margin: 0, fontSize: '0.95rem', flex: 1 }}>Support Chat</h2>
                <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: connected ? 'var(--ok)' : 'var(--danger)',
                    flexShrink: 0,
                }} title={connected ? 'Connected' : 'Disconnected'} />
            </header>

            {wsError && (
                <p style={{ margin: 0, padding: '0.4rem 1rem', fontSize: '0.76rem', color: 'var(--danger)' }}>
                    {wsError}
                </p>
            )}

            {issueId && (
                <div style={{
                    padding: '0.3rem 1rem',
                    background: 'rgba(45, 138, 138,0.05)',
                    borderBottom: '1px solid var(--line)',
                    fontSize: '0.72rem', color: 'var(--accent)',
                }}>
                    Issue: {issueId.slice(0, 18)}…
                </div>
            )}

            {/* Message thread */}
            <div style={{
                flex: 1, overflowY: 'auto', padding: '0.75rem 0.9rem',
                minHeight: '200px', maxHeight: '320px',
                display: 'flex', flexDirection: 'column',
            }}>
                {messages.length === 0 && (
                    <p style={{ color: 'var(--ink-soft)', fontStyle: 'italic', fontSize: '0.83rem', margin: 'auto' }}>
                        Describe your platform issue and the agent will diagnose it.
                    </p>
                )}
                {messages.map((msg) => {
                    if (msg.kind === 'user') return <UserBubble key={msg.id} text={msg.text} />;
                    if (msg.kind === 'agent') return <AgentBubble key={msg.id} text={msg.text} />;
                    if (msg.kind === 'step') return <StepBubble key={msg.id} text={msg.text} status={msg.status} />;
                    if (msg.kind === 'fix') return <FixBubble key={msg.id} tier={msg.tier} description={msg.description} />;
                    return (
                        <p key={msg.id} style={{ margin: '0.2rem 0', fontSize: '0.78rem', color: 'var(--danger)' }}>
                            {msg.text}
                        </p>
                    );
                })}
                {processing && (
                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', padding: '0.3rem 0' }}>
                        <span style={{
                            width: 7, height: 7,
                            border: '1.5px solid #2C8A8A', borderTopColor: 'transparent',
                            borderRadius: '50%',
                            animation: 'spin 0.7s linear infinite',
                            display: 'inline-block',
                        }} />
                        <span style={{ fontSize: '0.76rem', color: 'var(--ink-soft)' }}>
                            Agent is diagnosing…
                        </span>
                    </div>
                )}
                <div ref={bottomRef} />
            </div>

            {/* Input bar */}
            <div style={{
                borderTop: '1px solid var(--line)', padding: '0.55rem 0.75rem',
                display: 'flex', gap: '0.4rem', alignItems: 'flex-end',
            }}>
                <textarea
                    ref={inputRef}
                    rows={2}
                    placeholder={connected ? 'Describe the issue… (Enter to send)' : 'Connecting…'}
                    value={input}
                    disabled={!connected || processing}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            sendMessage();
                        }
                    }}
                    style={{
                        flex: 1, padding: '0.3rem 0.5rem',
                        fontSize: '0.82rem', border: '1px solid var(--line)',
                        borderRadius: 4, background: 'var(--bg)', color: 'var(--ink)',
                        resize: 'none', lineHeight: 1.45,
                    }}
                />
                <button
                    type="button"
                    className="primary-action"
                    disabled={!connected || processing || !input.trim()}
                    onClick={sendMessage}
                    style={{ flexShrink: 0 }}
                >
                    {processing ? '…' : 'Send'}
                </button>
            </div>
        </section>
    );
}
