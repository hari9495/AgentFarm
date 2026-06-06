'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { setSelectedIssueId } from './support-issue-feed';

// ---------------------------------------------------------------------------
// WebSocket URL — same derivation as chat widget
// ---------------------------------------------------------------------------

function getVoiceWsUrl(): string {
    const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
    const wsBase = apiUrl
        .replace(/^https:\/\//, 'wss://')
        .replace(/^http:\/\//, 'ws://');
    return `${wsBase}/v1/support/voice-session`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type VoiceFrameType =
    | 'connected'
    | 'transcript_partial'
    | 'transcript_final'
    | 'voice_reply'
    | 'tts_done'
    | 'error';

type VoiceFrame = {
    type: VoiceFrameType;
    text?: string;
    languageCode?: string;
    issueId?: string;
};

type TranscriptEntry = {
    id: string;
    kind: 'partial' | 'final' | 'reply';
    text: string;
    languageCode?: string;
};

// ---------------------------------------------------------------------------
// Language badge
// ---------------------------------------------------------------------------

function LangBadge({ code }: { code: string }) {
    const label = code.split('-')[0]?.toUpperCase() ?? code;
    return (
        <span style={{
            display: 'inline-block', padding: '0.1rem 0.35rem',
            fontSize: '0.65rem', fontWeight: 700,
            background: 'var(--info-bg)', color: 'var(--info)',
            borderRadius: 4, letterSpacing: '0.04em',
        }}>
            {label}
        </span>
    );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SupportVoiceWidget() {
    const [callActive, setCallActive] = useState(false);
    const [connected, setConnected] = useState(false);
    const [muted, setMuted] = useState(false);
    const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
    const [detectedLang, setDetectedLang] = useState<string | null>(null);
    const [issueId, setIssueId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [playingAudio, setPlayingAudio] = useState(false);

    const wsRef = useRef<WebSocket | null>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);
    const bottomRef = useRef<HTMLDivElement>(null);
    const audioQueueRef = useRef<ArrayBuffer[]>([]);

    // Auto-scroll
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [transcripts.length]);

    // Play queued audio chunks via AudioContext
    const drainAudioQueue = useCallback(async () => {
        if (playingAudio) return;
        if (audioQueueRef.current.length === 0) return;
        if (!audioCtxRef.current) {
            audioCtxRef.current = new AudioContext();
        }
        setPlayingAudio(true);
        const ctx = audioCtxRef.current;
        while (audioQueueRef.current.length > 0) {
            const chunk = audioQueueRef.current.shift()!;
            try {
                const decoded = await ctx.decodeAudioData(chunk);
                const source = ctx.createBufferSource();
                source.buffer = decoded;
                source.connect(ctx.destination);
                await new Promise<void>((resolve) => {
                    source.onended = () => resolve();
                    source.start();
                });
            } catch {
                // skip undecodable chunk
            }
        }
        setPlayingAudio(false);
    }, [playingAudio]);

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

        const ws = new WebSocket(getVoiceWsUrl());
        wsRef.current = ws;
        ws.binaryType = 'arraybuffer';

        ws.onopen = () => setConnected(true);

        ws.onclose = () => {
            setConnected(false);
            setCallActive(false);
            stopMicCapture();
        };

        ws.onerror = () => setError('Voice connection error. Please try again.');

        ws.onmessage = (e: MessageEvent) => {
            // Binary frame — audio from agent
            if (e.data instanceof ArrayBuffer) {
                audioQueueRef.current.push(e.data);
                void drainAudioQueue();
                return;
            }

            let frame: VoiceFrame;
            try { frame = JSON.parse(e.data as string) as VoiceFrame; } catch { return; }

            if (frame.type === 'connected') {
                if (frame.issueId) {
                    setIssueId(frame.issueId);
                    setSelectedIssueId(frame.issueId);
                }
                startMicCapture(stream, ws);
                return;
            }

            if (frame.type === 'transcript_partial') {
                setTranscripts((prev) => {
                    const last = prev[prev.length - 1];
                    if (last?.kind === 'partial') {
                        return [...prev.slice(0, -1), { ...last, text: frame.text ?? '' }];
                    }
                    return [...prev, { id: `${Date.now()}-p`, kind: 'partial', text: frame.text ?? '' }];
                });
                return;
            }

            if (frame.type === 'transcript_final') {
                const lang = frame.languageCode ?? 'hi-IN';
                if (lang) setDetectedLang(lang);
                setTranscripts((prev) => {
                    const filtered = prev.filter((t) => t.kind !== 'partial');
                    return [...filtered, {
                        id: `${Date.now()}-f`,
                        kind: 'final',
                        text: frame.text ?? '',
                        languageCode: lang,
                    }];
                });
                return;
            }

            if (frame.type === 'voice_reply') {
                setTranscripts((prev) => [...prev, {
                    id: `${Date.now()}-r`,
                    kind: 'reply',
                    text: frame.text ?? '',
                    languageCode: frame.languageCode,
                }]);
                return;
            }

            if (frame.type === 'tts_done') {
                void drainAudioQueue();
                return;
            }

            if (frame.type === 'error') {
                setError(frame.text ?? 'Voice session error');
            }
        };

        setCallActive(true);
    }, [drainAudioQueue]);

    function startMicCapture(stream: MediaStream, ws: WebSocket): void {
        if (!audioCtxRef.current) {
            audioCtxRef.current = new AudioContext({ sampleRate: 16_000 });
        }
        const ctx = audioCtxRef.current;
        const source = ctx.createMediaStreamSource(stream);
        const processor = ctx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        processor.onaudioprocess = (event) => {
            if (muted || ws.readyState !== WebSocket.OPEN) return;
            const float32 = event.inputBuffer.getChannelData(0);
            // Convert float32 to int16 PCM
            const int16 = new Int16Array(float32.length);
            for (let i = 0; i < float32.length; i++) {
                int16[i] = Math.max(-32768, Math.min(32767, Math.round(float32[i]! * 32767)));
            }
            ws.send(int16.buffer);
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

    const endCall = useCallback(() => {
        stopMicCapture();
        wsRef.current?.close();
        wsRef.current = null;
        setCallActive(false);
        setConnected(false);
    }, []);

    const toggleMute = useCallback(() => setMuted((m) => !m), []);

    return (
        <section className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <header style={{
                padding: '0.8rem 1rem', borderBottom: '1px solid var(--line)',
                display: 'flex', alignItems: 'center', gap: '0.5rem',
            }}>
                <span style={{ fontSize: '1rem' }}>🎙️</span>
                <h2 style={{ margin: 0, fontSize: '0.95rem', flex: 1 }}>Sarvam Voice Assistant</h2>
                {callActive && (
                    <span style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: connected ? 'var(--ok)' : 'var(--warn)',
                        flexShrink: 0,
                        animation: connected ? 'pulse-green 2s ease infinite' : undefined,
                    }} title={connected ? 'Connected' : 'Connecting…'} />
                )}
                {detectedLang && <LangBadge code={detectedLang} />}
            </header>

            <style>{`
                @keyframes pulse-green {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.4; }
                }
            `}</style>

            {error && (
                <p style={{ margin: 0, padding: '0.4rem 1rem', fontSize: '0.76rem', color: 'var(--danger)', background: 'var(--danger-bg)' }}>
                    {error}
                </p>
            )}

            {issueId && (
                <div style={{
                    padding: '0.3rem 1rem',
                    background: 'rgba(0,102,204,0.05)',
                    borderBottom: '1px solid var(--line)',
                    fontSize: '0.72rem', color: 'var(--accent)',
                }}>
                    Issue: {issueId.slice(0, 18)}…
                </div>
            )}

            {/* Transcript area */}
            <div style={{
                flex: 1, overflowY: 'auto', padding: '0.75rem 0.9rem',
                minHeight: '120px', maxHeight: '200px',
                display: 'flex', flexDirection: 'column', gap: '0.3rem',
            }}>
                {transcripts.length === 0 && !callActive && (
                    <p style={{ color: 'var(--ink-soft)', fontStyle: 'italic', fontSize: '0.83rem', margin: 'auto', textAlign: 'center' }}>
                        Press "Begin Call" and speak in Hindi, Tamil, Telugu, or English.
                    </p>
                )}
                {transcripts.length === 0 && callActive && (
                    <p style={{ color: 'var(--ink-soft)', fontStyle: 'italic', fontSize: '0.83rem', margin: 'auto' }}>
                        Listening…
                    </p>
                )}
                {transcripts.map((t) => {
                    const isUser = t.kind !== 'reply';
                    return (
                        <div key={t.id} style={{
                            display: 'flex',
                            justifyContent: isUser ? 'flex-end' : 'flex-start',
                        }}>
                            <div style={{
                                maxWidth: '80%',
                                padding: '0.35rem 0.6rem',
                                borderRadius: isUser ? '10px 10px 2px 10px' : '10px 10px 10px 2px',
                                background: isUser
                                    ? (t.kind === 'partial' ? 'var(--bg)' : 'var(--bg-deep)')
                                    : '#f0fdf4',
                                color: isUser
                                    ? (t.kind === 'partial' ? '#64748b' : 'var(--bg)')
                                    : 'var(--ok)',
                                fontSize: '0.82rem',
                                lineHeight: 1.45,
                                fontStyle: t.kind === 'partial' ? 'italic' : undefined,
                                opacity: t.kind === 'partial' ? 0.75 : 1,
                            }}>
                                {t.text}
                                {t.languageCode && t.kind === 'final' && (
                                    <span style={{ marginLeft: '0.4rem' }}>
                                        <LangBadge code={t.languageCode} />
                                    </span>
                                )}
                            </div>
                        </div>
                    );
                })}
                {playingAudio && (
                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', padding: '0.2rem 0' }}>
                        <span style={{
                            width: 7, height: 7,
                            border: '1.5px solid #16a34a', borderTopColor: 'transparent',
                            borderRadius: '50%',
                            animation: 'spin 0.7s linear infinite',
                            display: 'inline-block',
                        }} />
                        <span style={{ fontSize: '0.74rem', color: 'var(--ok)' }}>Agent speaking…</span>
                    </div>
                )}
                <div ref={bottomRef} />
            </div>

            {/* Controls */}
            <div style={{
                borderTop: '1px solid var(--line)', padding: '0.55rem 0.75rem',
                display: 'flex', gap: '0.5rem', alignItems: 'center',
            }}>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

                {!callActive ? (
                    <button
                        type="button"
                        className="primary-action"
                        onClick={() => void beginCall()}
                        style={{ flex: 1 }}
                    >
                        📞 Begin Call
                    </button>
                ) : (
                    <>
                        <button
                            type="button"
                            onClick={toggleMute}
                            style={{
                                flex: 1,
                                padding: '0.35rem 0.75rem',
                                fontSize: '0.82rem',
                                border: '1px solid var(--line)',
                                borderRadius: 4,
                                background: muted ? '#fef2f2' : 'var(--bg)',
                                color: muted ? 'var(--danger)' : 'var(--ink)',
                                cursor: 'pointer',
                            }}
                        >
                            {muted ? '🔇 Unmute' : '🎤 Mute'}
                        </button>
                        <button
                            type="button"
                            onClick={endCall}
                            style={{
                                flex: 1,
                                padding: '0.35rem 0.75rem',
                                fontSize: '0.82rem',
                                border: '1px solid var(--danger-border)',
                                borderRadius: 4,
                                background: 'var(--danger-bg)',
                                color: 'var(--danger)',
                                cursor: 'pointer',
                                fontWeight: 600,
                            }}
                        >
                            ⛔ End Call
                        </button>
                    </>
                )}
            </div>
        </section>
    );
}
