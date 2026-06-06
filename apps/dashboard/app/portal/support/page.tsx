'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function getApiWsBase(): string {
    const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
    return apiUrl.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://');
}

// ---------------------------------------------------------------------------
// Portal Chat
// ---------------------------------------------------------------------------

type ChatFrameType = 'step' | 'reply' | 'fix' | 'error' | 'connected';
type ChatFrame = { type: ChatFrameType; text?: string; status?: string; tier?: number; description?: string; issueId?: string };
type ChatEntry =
    | { kind: 'user'; text: string; id: string }
    | { kind: 'agent'; text: string; id: string }
    | { kind: 'step'; text: string; status?: string; id: string }
    | { kind: 'fix'; tier: number; description: string; id: string }
    | { kind: 'error'; text: string; id: string };

function PortalChatPanel() {
    const [messages, setMessages] = useState<ChatEntry[]>([]);
    const [input, setInput] = useState('');
    const [connected, setConnected] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [issueId, setIssueId] = useState<string | null>(null);
    const [wsError, setWsError] = useState<string | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages.length]);

    const connect = useCallback(() => {
        const ws = new WebSocket(`${getApiWsBase()}/v1/support/chat-session`);
        wsRef.current = ws;

        ws.onopen = () => { setConnected(true); setWsError(null); };
        ws.onclose = () => {
            setConnected(false);
            setProcessing(false);
            setTimeout(() => { if (wsRef.current?.readyState !== WebSocket.OPEN) connect(); }, 4_000);
        };
        ws.onerror = () => setWsError('Connection error — retrying…');
        ws.onmessage = (e: MessageEvent) => {
            let frame: ChatFrame;
            try { frame = JSON.parse(e.data as string) as ChatFrame; } catch { return; }

            if (frame.type === 'connected') {
                if (frame.issueId) setIssueId(frame.issueId);
                return;
            }
            if (frame.type === 'step') {
                setMessages((p) => [...p, { kind: 'step', text: frame.text ?? '', status: frame.status, id: `${Date.now()}-${Math.random()}` }]);
                return;
            }
            if (frame.type === 'fix') {
                setMessages((p) => [...p, { kind: 'fix', tier: frame.tier ?? 1, description: frame.description ?? '', id: `${Date.now()}-${Math.random()}` }]);
                return;
            }
            if (frame.type === 'reply') {
                setProcessing(false);
                setMessages((p) => [...p, { kind: 'agent', text: frame.text ?? '', id: `${Date.now()}-${Math.random()}` }]);
                return;
            }
            if (frame.type === 'error') {
                setProcessing(false);
                setMessages((p) => [...p, { kind: 'error', text: frame.text ?? 'Unknown error', id: `${Date.now()}-${Math.random()}` }]);
            }
        };
    }, []);

    useEffect(() => {
        connect();
        return () => { wsRef.current?.close(); };
    }, [connect]);

    const send = () => {
        const text = input.trim();
        if (!text || !connected || processing) return;
        setMessages((p) => [...p, { kind: 'user', text, id: `${Date.now()}-u` }]);
        setInput('');
        setProcessing(true);
        const payload: Record<string, string> = { type: 'message', text };
        if (issueId) payload['issueId'] = issueId;
        wsRef.current?.send(JSON.stringify(payload));
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

            <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ flex: 1, fontWeight: 600, fontSize: '0.95rem' }}>Chat Support</span>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: connected ? '#16a34a' : '#dc2626', flexShrink: 0 }} title={connected ? 'Connected' : 'Disconnected'} />
            </div>

            {wsError && <p style={{ margin: 0, padding: '0.35rem 1rem', fontSize: '0.76rem', color: '#dc2626' }}>{wsError}</p>}
            {issueId && (
                <div style={{ padding: '0.25rem 1rem', background: 'rgba(0,102,204,0.05)', borderBottom: '1px solid var(--line)', fontSize: '0.72rem', color: '#0066cc' }}>
                    Ticket #{issueId.slice(0, 8)}
                </div>
            )}

            <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', minHeight: 0 }}>
                {messages.length === 0 && (
                    <p style={{ color: 'var(--ink-soft)', fontStyle: 'italic', fontSize: '0.84rem', margin: 'auto', textAlign: 'center' }}>
                        Describe your issue and our AI support agent will diagnose and help fix it.
                    </p>
                )}
                {messages.map((m) => {
                    if (m.kind === 'user') return (
                        <div key={m.id} style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <div style={{ maxWidth: '78%', padding: '0.4rem 0.65rem', borderRadius: '10px 10px 2px 10px', background: '#334155', color: '#f8fafc', fontSize: '0.84rem', lineHeight: 1.5 }}>{m.text}</div>
                        </div>
                    );
                    if (m.kind === 'agent') return (
                        <div key={m.id} style={{ display: 'flex', justifyContent: 'flex-start' }}>
                            <div style={{ maxWidth: '78%', padding: '0.4rem 0.65rem', borderRadius: '10px 10px 10px 2px', background: '#e2e8f0', color: '#1e293b', fontSize: '0.84rem', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{m.text}</div>
                        </div>
                    );
                    if (m.kind === 'step') return (
                        <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.28rem 0.55rem', borderRadius: 5, background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: '0.75rem', color: '#475569' }}>
                            {m.status === 'running'
                                ? <span style={{ width: 7, height: 7, border: '1.5px solid #2563eb', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block', flexShrink: 0 }} />
                                : <span style={{ color: '#16a34a', flexShrink: 0 }}>✓</span>}
                            {m.text}
                        </div>
                    );
                    if (m.kind === 'fix') return (
                        <div key={m.id} style={{ padding: '0.28rem 0.55rem', borderRadius: 5, background: '#f0fdf4', border: '1px solid #bbf7d0', fontSize: '0.75rem', color: '#15803d' }}>
                            <strong>Fix applied:</strong> {m.description}
                        </div>
                    );
                    return <p key={m.id} style={{ margin: 0, fontSize: '0.78rem', color: '#dc2626' }}>{m.text}</p>;
                })}
                {processing && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.2rem 0' }}>
                        <span style={{ width: 7, height: 7, border: '1.5px solid #2563eb', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />
                        <span style={{ fontSize: '0.76rem', color: 'var(--ink-soft)' }}>Diagnosing…</span>
                    </div>
                )}
                <div ref={bottomRef} />
            </div>

            <div style={{ borderTop: '1px solid var(--line)', padding: '0.5rem 0.65rem', display: 'flex', gap: '0.4rem', alignItems: 'flex-end' }}>
                <textarea
                    rows={2}
                    placeholder={connected ? 'Describe the issue… (Enter to send)' : 'Connecting…'}
                    value={input}
                    disabled={!connected || processing}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                    style={{ flex: 1, padding: '0.3rem 0.5rem', fontSize: '0.82rem', border: '1px solid var(--line)', borderRadius: 4, background: 'var(--bg)', color: 'var(--ink)', resize: 'none', lineHeight: 1.45 }}
                />
                <button type="button" className="primary-action" disabled={!connected || processing || !input.trim()} onClick={send} style={{ flexShrink: 0 }}>
                    {processing ? '…' : 'Send'}
                </button>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Portal Voice
// ---------------------------------------------------------------------------

type VoiceFrameType = 'connected' | 'transcript_partial' | 'transcript_final' | 'voice_reply' | 'tts_done' | 'error';
type VoiceFrame = { type: VoiceFrameType; text?: string; languageCode?: string; issueId?: string };
type TranscriptEntry = { id: string; kind: 'partial' | 'final' | 'reply'; text: string; languageCode?: string };

function PortalVoicePanel() {
    const [callActive, setCallActive] = useState(false);
    const [connected, setConnected] = useState(false);
    const [muted, setMuted] = useState(false);
    const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
    const [detectedLang, setDetectedLang] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [playingAudio, setPlayingAudio] = useState(false);

    const wsRef = useRef<WebSocket | null>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);
    const audioQueueRef = useRef<ArrayBuffer[]>([]);
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [transcripts.length]);

    const drainAudioQueue = useCallback(async () => {
        if (playingAudio || audioQueueRef.current.length === 0) return;
        if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
        setPlayingAudio(true);
        const ctx = audioCtxRef.current;
        while (audioQueueRef.current.length > 0) {
            const chunk = audioQueueRef.current.shift()!;
            try {
                const decoded = await ctx.decodeAudioData(chunk);
                const source = ctx.createBufferSource();
                source.buffer = decoded;
                source.connect(ctx.destination);
                await new Promise<void>((r) => { source.onended = () => r(); source.start(); });
            } catch { /* skip */ }
        }
        setPlayingAudio(false);
    }, [playingAudio]);

    function startMicCapture(stream: MediaStream, ws: WebSocket): void {
        if (!audioCtxRef.current) audioCtxRef.current = new AudioContext({ sampleRate: 16_000 });
        const ctx = audioCtxRef.current;
        const source = ctx.createMediaStreamSource(stream);
        const processor = ctx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;
        processor.onaudioprocess = (ev) => {
            if (muted || ws.readyState !== WebSocket.OPEN) return;
            const f32 = ev.inputBuffer.getChannelData(0);
            const i16 = new Int16Array(f32.length);
            for (let i = 0; i < f32.length; i++) i16[i] = Math.max(-32768, Math.min(32767, Math.round(f32[i]! * 32767)));
            ws.send(i16.buffer);
        };
        source.connect(processor);
        processor.connect(ctx.destination);
    }

    function stopMicCapture(): void {
        processorRef.current?.disconnect();
        processorRef.current = null;
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
    }

    const beginCall = useCallback(async () => {
        setError(null);
        setTranscripts([]);
        let stream: MediaStream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        } catch {
            setError('Microphone access denied. Please allow microphone access and try again.');
            return;
        }
        streamRef.current = stream;

        const ws = new WebSocket(`${getApiWsBase()}/v1/support/voice-session`);
        wsRef.current = ws;
        ws.binaryType = 'arraybuffer';

        ws.onopen = () => setConnected(true);
        ws.onclose = () => { setConnected(false); setCallActive(false); stopMicCapture(); };
        ws.onerror = () => setError('Voice connection error. Please try again.');
        ws.onmessage = (e: MessageEvent) => {
            if (e.data instanceof ArrayBuffer) { audioQueueRef.current.push(e.data); void drainAudioQueue(); return; }
            let frame: VoiceFrame;
            try { frame = JSON.parse(e.data as string) as VoiceFrame; } catch { return; }

            if (frame.type === 'connected') { startMicCapture(stream, ws); return; }
            if (frame.type === 'transcript_partial') {
                setTranscripts((p) => {
                    const last = p[p.length - 1];
                    return last?.kind === 'partial'
                        ? [...p.slice(0, -1), { ...last, text: frame.text ?? '' }]
                        : [...p, { id: `${Date.now()}-p`, kind: 'partial', text: frame.text ?? '' }];
                });
                return;
            }
            if (frame.type === 'transcript_final') {
                const lang = frame.languageCode ?? 'hi-IN';
                if (lang) setDetectedLang(lang);
                setTranscripts((p) => [...p.filter((t) => t.kind !== 'partial'), { id: `${Date.now()}-f`, kind: 'final', text: frame.text ?? '', languageCode: lang }]);
                return;
            }
            if (frame.type === 'voice_reply') {
                setTranscripts((p) => [...p, { id: `${Date.now()}-r`, kind: 'reply', text: frame.text ?? '', languageCode: frame.languageCode }]);
                return;
            }
            if (frame.type === 'tts_done') { void drainAudioQueue(); return; }
            if (frame.type === 'error') setError(frame.text ?? 'Voice session error');
        };
        setCallActive(true);
    }, [drainAudioQueue]);

    const endCall = useCallback(() => {
        stopMicCapture();
        wsRef.current?.close();
        wsRef.current = null;
        setCallActive(false);
        setConnected(false);
    }, []);

    const langLabel = detectedLang ? detectedLang.split('-')[0]?.toUpperCase() : null;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes pulse-g{0%,100%{opacity:1}50%{opacity:.4}}`}</style>

            <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1rem' }}>🎙</span>
                <span style={{ flex: 1, fontWeight: 600, fontSize: '0.95rem' }}>Voice / Call Support</span>
                {callActive && <span style={{ width: 8, height: 8, borderRadius: '50%', background: connected ? '#16a34a' : '#f59e0b', flexShrink: 0, animation: connected ? 'pulse-g 2s ease infinite' : undefined }} />}
                {langLabel && <span style={{ padding: '0.1rem 0.35rem', fontSize: '0.65rem', fontWeight: 700, background: '#eff6ff', color: '#1d4ed8', borderRadius: 4 }}>{langLabel}</span>}
            </div>

            {error && <p style={{ margin: 0, padding: '0.35rem 1rem', fontSize: '0.76rem', color: '#dc2626', background: '#fef2f2' }}>{error}</p>}

            <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.3rem', minHeight: 0 }}>
                {transcripts.length === 0 && !callActive && (
                    <p style={{ color: 'var(--ink-soft)', fontStyle: 'italic', fontSize: '0.84rem', margin: 'auto', textAlign: 'center' }}>
                        Press "Begin Call" and speak in Hindi, Tamil, Telugu, or English.
                    </p>
                )}
                {transcripts.length === 0 && callActive && (
                    <p style={{ color: 'var(--ink-soft)', fontStyle: 'italic', fontSize: '0.84rem', margin: 'auto' }}>Listening…</p>
                )}
                {transcripts.map((t) => {
                    const isUser = t.kind !== 'reply';
                    return (
                        <div key={t.id} style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
                            <div style={{
                                maxWidth: '80%', padding: '0.35rem 0.6rem', lineHeight: 1.45, fontSize: '0.83rem',
                                borderRadius: isUser ? '10px 10px 2px 10px' : '10px 10px 10px 2px',
                                background: isUser ? (t.kind === 'partial' ? '#e2e8f0' : '#334155') : '#f0fdf4',
                                color: isUser ? (t.kind === 'partial' ? '#64748b' : '#f8fafc') : '#15803d',
                                fontStyle: t.kind === 'partial' ? 'italic' : undefined,
                                opacity: t.kind === 'partial' ? 0.75 : 1,
                            }}>
                                {t.text}
                            </div>
                        </div>
                    );
                })}
                {playingAudio && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.2rem 0' }}>
                        <span style={{ width: 7, height: 7, border: '1.5px solid #16a34a', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />
                        <span style={{ fontSize: '0.74rem', color: '#15803d' }}>Agent speaking…</span>
                    </div>
                )}
                <div ref={bottomRef} />
            </div>

            <div style={{ borderTop: '1px solid var(--line)', padding: '0.5rem 0.65rem', display: 'flex', gap: '0.5rem' }}>
                {!callActive
                    ? <button type="button" className="primary-action" onClick={() => void beginCall()} style={{ flex: 1 }}>📞 Begin Call</button>
                    : <>
                        <button type="button" onClick={() => setMuted((m) => !m)} style={{ flex: 1, padding: '0.35rem', fontSize: '0.82rem', border: '1px solid var(--line)', borderRadius: 4, background: muted ? '#fef2f2' : 'var(--bg)', color: muted ? '#dc2626' : 'var(--ink)', cursor: 'pointer' }}>
                            {muted ? '🔇 Unmute' : '🎤 Mute'}
                        </button>
                        <button type="button" onClick={endCall} style={{ flex: 1, padding: '0.35rem', fontSize: '0.82rem', border: '1px solid #fca5a5', borderRadius: 4, background: '#fef2f2', color: '#dc2626', cursor: 'pointer', fontWeight: 600 }}>
                            ⛔ End Call
                        </button>
                    </>
                }
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type Tab = 'chat' | 'voice';

export default function PortalSupportPage() {
    const router = useRouter();
    const [sessionReady, setSessionReady] = useState(false);
    const [tab, setTab] = useState<Tab>('chat');

    // Guard: verify portal_session on mount — redirect to login if not authenticated
    useEffect(() => {
        fetch('/api/portal/auth/me', { credentials: 'same-origin' })
            .then((res) => {
                if (!res.ok) { router.replace('/portal/login'); return; }
                setSessionReady(true);
            })
            .catch(() => router.replace('/portal/login'));
    }, [router]);

    if (!sessionReady) {
        return (
            <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, system-ui, sans-serif' }}>
                <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>Loading…</p>
            </main>
        );
    }

    return (
        <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: '2rem 1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <style>{`
                :root { --bg: #fff; --ink: #0f172a; --ink-soft: #64748b; --line: #e2e8f0; }
                @media (prefers-color-scheme: dark) {
                    :root { --bg: #0f172a; --ink: #f1f5f9; --ink-soft: #94a3b8; --line: #1e293b; }
                }
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body { font-family: Inter, system-ui, sans-serif; background: var(--bg); color: var(--ink); }
                .primary-action {
                    padding: 0.35rem 0.85rem; font-size: 0.82rem; font-weight: 600;
                    background: #2563eb; color: #fff; border: none; border-radius: 4px; cursor: pointer;
                }
                .primary-action:disabled { opacity: 0.45; cursor: not-allowed; }
            `}</style>

            {/* Header */}
            <div style={{ width: '100%', maxWidth: 680, marginBottom: '1.5rem' }}>
                <h1 style={{ fontSize: '1.45rem', fontWeight: 700, marginBottom: '0.25rem' }}>Support</h1>
                <p style={{ fontSize: '0.88rem', color: 'var(--ink-soft)' }}>
                    Our AI support agent diagnoses platform issues and applies fixes automatically.
                </p>
            </div>

            {/* Tab bar */}
            <div style={{ width: '100%', maxWidth: 680, display: 'flex', gap: '0.25rem', marginBottom: '0.75rem' }}>
                {(['chat', 'voice'] as Tab[]).map((t) => (
                    <button
                        key={t}
                        type="button"
                        onClick={() => setTab(t)}
                        style={{
                            padding: '0.4rem 1.1rem', fontSize: '0.85rem', fontWeight: 600,
                            border: '1px solid var(--line)', borderRadius: 6,
                            background: tab === t ? '#2563eb' : 'var(--bg)',
                            color: tab === t ? '#fff' : 'var(--ink-soft)',
                            cursor: 'pointer',
                        }}
                    >
                        {t === 'chat' ? '💬 Chat' : '📞 Call'}
                    </button>
                ))}
            </div>

            {/* Panel */}
            <div style={{
                width: '100%', maxWidth: 680,
                border: '1px solid var(--line)', borderRadius: 10,
                background: 'var(--bg)',
                display: 'flex', flexDirection: 'column',
                minHeight: 520,
            }}>
                {tab === 'chat' ? <PortalChatPanel /> : <PortalVoicePanel />}
            </div>

            <p style={{ marginTop: '1.5rem', fontSize: '0.78rem', color: 'var(--ink-soft)' }}>
                AgentFarm Platform Support
            </p>
        </main>
    );
}
