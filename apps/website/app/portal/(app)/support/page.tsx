"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { History, MessageSquare, Phone, Mic, MicOff, PhoneOff, Send, Loader2 } from "lucide-react";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function getApiWsBase(): string {
    const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/$/, "");
    return apiUrl.replace(/^https:\/\//, "wss://").replace(/^http:\/\//, "ws://");
}

// ---------------------------------------------------------------------------
// Chat panel
// ---------------------------------------------------------------------------

type ChatFrameType = "step" | "reply" | "fix" | "error" | "connected";
type ChatFrame = { type: ChatFrameType; text?: string; status?: string; tier?: number; description?: string; issueId?: string };
type ChatEntry =
    | { kind: "user"; text: string; id: string }
    | { kind: "agent"; text: string; id: string }
    | { kind: "step"; text: string; status?: string; id: string }
    | { kind: "fix"; tier: number; description: string; id: string }
    | { kind: "error"; text: string; id: string };

function ChatPanel() {
    const [messages, setMessages] = useState<ChatEntry[]>([]);
    const [input, setInput] = useState("");
    const [connected, setConnected] = useState(false);
    const [reconnecting, setReconnecting] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [issueId, setIssueId] = useState<string | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const issueIdRef = useRef<string | null>(null);
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages.length]);

    const connect = useCallback(() => {
        const base = `${getApiWsBase()}/v1/support/chat-session`;
        const url = issueIdRef.current ? `${base}?issueId=${encodeURIComponent(issueIdRef.current)}` : base;
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => { setConnected(true); setReconnecting(false); };
        ws.onclose = () => {
            setConnected(false);
            setProcessing(false);
            setReconnecting(true);
            setTimeout(() => { if (wsRef.current?.readyState !== WebSocket.OPEN) connect(); }, 4_000);
        };
        ws.onerror = () => { /* close handler fires next and sets reconnecting */ };
        ws.onmessage = (e: MessageEvent) => {
            let frame: ChatFrame;
            try { frame = JSON.parse(e.data as string) as ChatFrame; } catch { return; }

            if (frame.type === "connected") {
                if (frame.issueId) {
                    setIssueId(frame.issueId);
                    issueIdRef.current = frame.issueId;
                }
                return;
            }
            if (frame.type === "step") {
                setMessages((p) => [...p, { kind: "step", text: frame.text ?? "", status: frame.status, id: `${Date.now()}-${Math.random()}` }]);
                return;
            }
            if (frame.type === "fix") {
                setMessages((p) => [...p, { kind: "fix", tier: frame.tier ?? 1, description: frame.description ?? "", id: `${Date.now()}-${Math.random()}` }]);
                return;
            }
            if (frame.type === "reply") {
                setProcessing(false);
                setMessages((p) => [...p, { kind: "agent", text: frame.text ?? "", id: `${Date.now()}-${Math.random()}` }]);
                return;
            }
            if (frame.type === "error") {
                setProcessing(false);
                setMessages((p) => [...p, { kind: "error", text: frame.text ?? "Unknown error", id: `${Date.now()}-${Math.random()}` }]);
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
        setMessages((p) => [...p, { kind: "user", text, id: `${Date.now()}-u` }]);
        setInput("");
        setProcessing(true);
        const payload: Record<string, string> = { type: "message", text };
        if (issueId) payload["issueId"] = issueId;
        wsRef.current?.send(JSON.stringify(payload));
    };

    return (
        <div className="flex flex-col h-full">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
                <span className="flex-1 font-semibold text-sm text-slate-900 dark:text-slate-100">Chat support</span>
                <span
                    className={`h-2 w-2 rounded-full shrink-0 ${connected ? "bg-emerald-500" : "bg-rose-500"}`}
                    title={connected ? "Connected" : "Disconnected"}
                />
            </div>

            {reconnecting && !connected && (
                <div className="px-4 py-1.5 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800 flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
                    <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                    Reconnecting… your session will resume automatically
                </div>
            )}
            {issueId && (
                <div className="px-4 py-1 bg-sky-50 dark:bg-sky-950/20 border-b border-slate-200 dark:border-slate-800 text-xs text-sky-700 dark:text-sky-400">
                    Ticket #{issueId.slice(0, 8)}
                </div>
            )}

            <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-1.5 min-h-0">
                {messages.length === 0 && (
                    <p className="m-auto text-center text-sm italic text-slate-400 dark:text-slate-500">
                        Describe your issue and our AI support agent will diagnose and help fix it.
                    </p>
                )}
                {messages.map((m) => {
                    if (m.kind === "user") return (
                        <div key={m.id} className="flex justify-end">
                            <div className="max-w-[78%] px-3 py-1.5 rounded-2xl rounded-br-sm bg-slate-900 dark:bg-sky-600 text-white text-sm leading-relaxed">{m.text}</div>
                        </div>
                    );
                    if (m.kind === "agent") return (
                        <div key={m.id} className="flex justify-start">
                            <div className="max-w-[78%] px-3 py-1.5 rounded-2xl rounded-bl-sm bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">{m.text}</div>
                        </div>
                    );
                    if (m.kind === "step") return (
                        <div key={m.id} className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
                            {m.status === "running"
                                ? <Loader2 className="h-3 w-3 animate-spin text-sky-600 shrink-0" />
                                : <span className="text-emerald-500 shrink-0">✓</span>}
                            {m.text}
                        </div>
                    );
                    if (m.kind === "fix") return (
                        <div key={m.id} className="px-2.5 py-1 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-400">
                            <strong>Fix applied:</strong> {m.description}
                        </div>
                    );
                    return <p key={m.id} className="text-xs text-rose-600 dark:text-rose-400">{m.text}</p>;
                })}
                {processing && (
                    <div className="flex items-center gap-1.5 py-1">
                        <Loader2 className="h-3 w-3 animate-spin text-sky-600" />
                        <span className="text-xs text-slate-400 dark:text-slate-500">Diagnosing…</span>
                    </div>
                )}
                <div ref={bottomRef} />
            </div>

            <div className="border-t border-slate-200 dark:border-slate-800 p-2.5 flex gap-2 items-end">
                <textarea
                    rows={2}
                    placeholder={connected ? "Describe the issue… (Enter to send)" : "Connecting…"}
                    value={input}
                    disabled={!connected || processing}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                    className="flex-1 px-3 py-1.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none leading-snug"
                />
                <button
                    type="button"
                    disabled={!connected || processing || !input.trim()}
                    onClick={send}
                    className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:bg-sky-300 dark:disabled:bg-sky-900 text-white text-sm font-semibold transition-colors"
                >
                    {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Voice panel
// ---------------------------------------------------------------------------

type VoiceFrameType = "connected" | "transcript_partial" | "transcript_final" | "voice_reply" | "tts_done" | "error";
type VoiceFrame = { type: VoiceFrameType; text?: string; languageCode?: string; issueId?: string };
type TranscriptEntry = { id: string; kind: "partial" | "final" | "reply"; text: string; languageCode?: string };

const LANG_OPTIONS = [
    { code: "", label: "Auto-detect" },
    { code: "hi-IN", label: "Hindi" },
    { code: "en-IN", label: "English" },
    { code: "ta-IN", label: "Tamil" },
    { code: "te-IN", label: "Telugu" },
];

function VoicePanel() {
    const [callActive, setCallActive] = useState(false);
    const [connected, setConnected] = useState(false);
    const [reconnecting, setReconnecting] = useState(false);
    const [muted, setMuted] = useState(false);
    const [langPref, setLangPref] = useState("");
    const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
    const [detectedLang, setDetectedLang] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [playingAudio, setPlayingAudio] = useState(false);

    const [issueId, setIssueId] = useState<string | null>(null);
    const issueIdRef = useRef<string | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);
    const audioQueueRef = useRef<ArrayBuffer[]>([]);
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [transcripts.length]);

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
            setError("Microphone access denied. Please allow microphone access and try again.");
            return;
        }
        streamRef.current = stream;

        const voiceBase = `${getApiWsBase()}/v1/support/voice-session`;
        const params = new URLSearchParams();
        if (issueIdRef.current) params.set("issueId", issueIdRef.current);
        if (langPref) params.set("lang", langPref);
        const voiceUrl = params.toString() ? `${voiceBase}?${params.toString()}` : voiceBase;
        const ws = new WebSocket(voiceUrl);
        wsRef.current = ws;
        ws.binaryType = "arraybuffer";

        ws.onopen = () => { setConnected(true); setReconnecting(false); };
        ws.onclose = () => { setConnected(false); setCallActive(false); setReconnecting(true); stopMicCapture(); };
        ws.onerror = () => { /* close handler fires next */ };
        ws.onmessage = (e: MessageEvent) => {
            if (e.data instanceof ArrayBuffer) { audioQueueRef.current.push(e.data); void drainAudioQueue(); return; }
            let frame: VoiceFrame;
            try { frame = JSON.parse(e.data as string) as VoiceFrame; } catch { return; }

            if (frame.type === "connected") {
                if (frame.issueId) { setIssueId(frame.issueId); issueIdRef.current = frame.issueId; }
                startMicCapture(stream, ws); return;
            }
            if (frame.type === "transcript_partial") {
                setTranscripts((p) => {
                    const last = p[p.length - 1];
                    return last?.kind === "partial"
                        ? [...p.slice(0, -1), { ...last, text: frame.text ?? "" }]
                        : [...p, { id: `${Date.now()}-p`, kind: "partial", text: frame.text ?? "" }];
                });
                return;
            }
            if (frame.type === "transcript_final") {
                const lang = frame.languageCode ?? "hi-IN";
                if (lang) setDetectedLang(lang);
                setTranscripts((p) => [...p.filter((t) => t.kind !== "partial"), { id: `${Date.now()}-f`, kind: "final", text: frame.text ?? "", languageCode: lang }]);
                return;
            }
            if (frame.type === "voice_reply") {
                setTranscripts((p) => [...p, { id: `${Date.now()}-r`, kind: "reply", text: frame.text ?? "", languageCode: frame.languageCode }]);
                return;
            }
            if (frame.type === "tts_done") { void drainAudioQueue(); return; }
            if (frame.type === "error") setError(frame.text ?? "Voice session error");
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

    const langLabel = detectedLang ? detectedLang.split("-")[0]?.toUpperCase() : null;

    return (
        <div className="flex flex-col h-full">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
                <Phone className="h-4 w-4 text-slate-400" />
                <span className="flex-1 font-semibold text-sm text-slate-900 dark:text-slate-100">Voice / call support</span>
                {callActive && (
                    <span className={`h-2 w-2 rounded-full shrink-0 ${connected ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
                )}
                {langLabel && (
                    <span className="px-1.5 py-0.5 text-[0.65rem] font-bold bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-400 rounded">
                        {langLabel}
                    </span>
                )}
            </div>

            {error && (
                <p className="m-0 px-4 py-1.5 text-xs text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30">{error}</p>
            )}
            {reconnecting && !callActive && (
                <div className="px-4 py-1.5 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800 flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
                    <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                    Disconnected — start a new call when ready
                </div>
            )}

            <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-1.5 min-h-0">
                {transcripts.length === 0 && !callActive && (
                    <p className="m-auto text-center text-sm italic text-slate-400 dark:text-slate-500">
                        Press &ldquo;Begin call&rdquo; and speak in Hindi, Tamil, Telugu, or English.
                    </p>
                )}
                {transcripts.length === 0 && callActive && (
                    <p className="m-auto text-sm italic text-slate-400 dark:text-slate-500">Listening…</p>
                )}
                {transcripts.map((t) => {
                    const isUser = t.kind !== "reply";
                    return (
                        <div key={t.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                            <div
                                className={`max-w-[80%] px-3 py-1.5 text-sm leading-relaxed ${
                                    isUser ? "rounded-2xl rounded-br-sm" : "rounded-2xl rounded-bl-sm"
                                } ${
                                    isUser
                                        ? t.kind === "partial"
                                            ? "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 italic opacity-75"
                                            : "bg-slate-900 dark:bg-sky-600 text-white"
                                        : "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400"
                                }`}
                            >
                                {t.text}
                            </div>
                        </div>
                    );
                })}
                {playingAudio && (
                    <div className="flex items-center gap-1.5 py-1">
                        <Loader2 className="h-3 w-3 animate-spin text-emerald-600" />
                        <span className="text-xs text-emerald-600 dark:text-emerald-400">Agent speaking…</span>
                    </div>
                )}
                <div ref={bottomRef} />
            </div>

            <div className="border-t border-slate-200 dark:border-slate-800 p-2.5 flex flex-col gap-2">
                {!callActive && (
                    <div className="flex items-center gap-2">
                        <label htmlFor="voice-lang" className="text-xs text-slate-500 dark:text-slate-400 shrink-0">Language:</label>
                        <select
                            id="voice-lang"
                            value={langPref}
                            onChange={(e) => setLangPref(e.target.value)}
                            className="flex-1 px-2.5 py-1.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 cursor-pointer focus:outline-none focus:ring-2 focus:ring-sky-500"
                        >
                            {LANG_OPTIONS.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
                        </select>
                    </div>
                )}
                <div className="flex gap-2">
                    {!callActive ? (
                        <button
                            type="button"
                            onClick={() => void beginCall()}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold transition-colors"
                        >
                            <Phone className="h-4 w-4" /> Begin call
                        </button>
                    ) : (
                        <>
                            <button
                                type="button"
                                onClick={() => setMuted((m) => !m)}
                                className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-xl border text-sm font-medium transition-colors ${
                                    muted
                                        ? "border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400"
                                        : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300"
                                }`}
                            >
                                {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                                {muted ? "Unmute" : "Mute"}
                            </button>
                            <button
                                type="button"
                                onClick={endCall}
                                className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 text-sm font-semibold transition-colors"
                            >
                                <PhoneOff className="h-4 w-4" /> End call
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type Tab = "chat" | "voice";

export default function PortalSupportPage() {
    const [tab, setTab] = useState<Tab>("chat");

    return (
        <div className="flex flex-col items-center">
            <div className="w-full max-w-2xl mb-4 flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                        <MessageSquare className="h-5 w-5 text-sky-600" /> Support
                    </h1>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        Our AI support agent diagnoses platform issues and applies fixes automatically.
                    </p>
                </div>
                <Link
                    href="/portal/support/history"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shrink-0"
                >
                    <History className="h-4 w-4" /> Ticket history
                </Link>
            </div>

            <div className="w-full max-w-2xl flex gap-1.5 mb-3">
                {(["chat", "voice"] as Tab[]).map((t) => (
                    <button
                        key={t}
                        type="button"
                        onClick={() => setTab(t)}
                        className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold rounded-xl border transition-colors ${
                            tab === t
                                ? "bg-sky-600 border-sky-600 text-white"
                                : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400"
                        }`}
                    >
                        {t === "chat" ? <MessageSquare className="h-3.5 w-3.5" /> : <Phone className="h-3.5 w-3.5" />}
                        {t === "chat" ? "Chat" : "Call"}
                    </button>
                ))}
            </div>

            <div className="w-full max-w-2xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex flex-col" style={{ minHeight: 520 }}>
                {tab === "chat" ? <ChatPanel /> : <VoicePanel />}
            </div>

            <p className="mt-5 text-xs text-slate-400 dark:text-slate-500">AgentFarms Platform Support</p>
        </div>
    );
}
