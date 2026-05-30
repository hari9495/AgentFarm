"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, RefreshCw, Copy, Check, ArrowDownToLine, Clock, CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type InboundSource = {
    id: string;
    name: string;
    inboundUrl: string;
    description?: string;
    eventCount?: number;
    lastReceivedAt?: string | null;
};

type InboundEvent = {
    id: string;
    sourceId: string;
    receivedAt: string;
    method: string;
    status: "processed" | "failed" | "pending";
    body?: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function CopyBtn({ text, label = "Copy" }: { text: string; label?: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <button onClick={() => { void navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
            className={`flex items-center gap-1.5 text-xs font-semibold rounded-lg px-3 py-1.5 border transition-colors ${copied ? "border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300" : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-400"}`}>
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            {copied ? "Copied!" : label}
        </button>
    );
}

function StatusBadge({ status }: { status: string }) {
    const cfg = status === "processed" ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/40"
              : status === "failed"    ? "bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800/40"
              : "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/40";
    return <span className={`text-[11px] font-bold rounded-full px-2.5 py-0.5 border ${cfg}`}>{status}</span>;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CustomerWebhooksPage() {
    const [activeTab, setActiveTab] = useState<"sources" | "events">("sources");
    const [sources, setSources]   = useState<InboundSource[]>([]);
    const [events, setEvents]     = useState<InboundEvent[]>([]);
    const [loading, setLoading]   = useState(true);
    const [error, setError]       = useState<string | null>(null);

    // Add form
    const [showForm, setShowForm] = useState(false);
    const [addName, setAddName]   = useState("");
    const [addDesc, setAddDesc]   = useState("");
    const [adding, setAdding]     = useState(false);
    const [addError, setAddError] = useState<string | null>(null);
    const [newSource, setNewSource] = useState<{ secret: string; url: string } | null>(null);

    // Event filters
    const [filterSource, setFilterSource] = useState("");
    const [filterLimit, setFilterLimit]   = useState("20");

    const loadSources = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const res = await fetch("/api/webhooks/inbound/sources");
            const data = await res.json() as { sources?: InboundSource[]; error?: string };
            if (!res.ok) { setError(data.error ?? "Failed to load webhook sources"); return; }
            setSources(data.sources ?? []);
        } catch { setError("Network error."); }
        finally { setLoading(false); }
    }, []);

    const loadEvents = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const params = new URLSearchParams({ limit: filterLimit });
            if (filterSource) params.set("source", filterSource);
            const res = await fetch(`/api/webhooks/inbound/events?${params.toString()}`);
            const data = await res.json() as { events?: InboundEvent[]; error?: string };
            if (!res.ok) { setError(data.error ?? "Failed to load events"); return; }
            setEvents(data.events ?? []);
        } catch { setError("Network error."); }
        finally { setLoading(false); }
    }, [filterSource, filterLimit]);

    useEffect(() => { void loadSources(); }, [loadSources]);
    useEffect(() => { if (activeTab === "events") void loadEvents(); }, [activeTab, loadEvents]);

    const createSource = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!addName.trim()) { setAddError("Name is required."); return; }
        setAdding(true); setAddError(null);
        try {
            const res = await fetch("/api/webhooks/inbound/sources", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: addName.trim(), description: addDesc.trim() || undefined }),
            });
            const data = await res.json() as { id?: string; secret?: string; inboundUrl?: string; error?: string; message?: string };
            if (!res.ok) { setAddError(data.message ?? data.error ?? "Failed to create."); return; }
            if (data.secret && data.inboundUrl) {
                setNewSource({ secret: data.secret, url: data.inboundUrl });
            }
            setAddName(""); setAddDesc(""); setShowForm(false);
            await loadSources();
        } catch { setAddError("Network error."); }
        finally { setAdding(false); }
    };

    const removeSource = async (id: string, name: string) => {
        if (!confirm(`Remove "${name}"? Events from this source will stop being received.`)) return;
        try {
            await fetch(`/api/webhooks/inbound/sources/${encodeURIComponent(id)}`, { method: "DELETE" });
            await loadSources();
        } catch { /* silent */ }
    };

    const inp = "w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 placeholder:text-slate-400";
    const lbl = "block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5";

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950">

            {/* ── Page header ──────────────────────────────────────────── */}
            <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-5 md:px-8">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                        <div className="h-10 w-10 rounded-xl bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center shrink-0 mt-0.5">
                            <ArrowDownToLine className="w-5 h-5 text-sky-600 dark:text-sky-400" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">Inbound Webhooks</h1>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 max-w-xl">
                                Register external services (GitHub, Jira, Slack) to push events into AgentFarm.
                                Each source gets a unique URL and secret — paste them into the service's webhook settings
                                and your agents start reacting to events automatically.
                            </p>
                        </div>
                    </div>
                    {activeTab === "sources" && (
                        <button onClick={() => setShowForm(v => !v)}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-sky-600 hover:bg-sky-700 text-white text-sm font-bold transition-colors shrink-0">
                            <Plus className="w-3.5 h-3.5" /> {showForm ? "Cancel" : "Add Source"}
                        </button>
                    )}
                </div>
            </div>

            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

                {/* ── New secret reveal ─────────────────────────────── */}
                {newSource && (
                    <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/20 p-5">
                        <div className="flex items-start gap-3 mb-4">
                            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm font-bold text-emerald-800 dark:text-emerald-200">Webhook source created — save these now</p>
                                <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">The secret will not be shown again. Paste both into your service's webhook settings.</p>
                            </div>
                            <button onClick={() => setNewSource(null)} className="ml-auto text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-200">✕</button>
                        </div>
                        <div className="space-y-3">
                            {[{ label: "Webhook URL", value: newSource.url }, { label: "Signing Secret", value: newSource.secret }].map(({ label, value }) => (
                                <div key={label}>
                                    <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider mb-1">{label}</p>
                                    <div className="flex items-center gap-2">
                                        <code className="flex-1 font-mono text-xs bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-900/50 rounded-lg px-3 py-2 overflow-hidden text-ellipsis whitespace-nowrap text-slate-800 dark:text-slate-200">
                                            {value}
                                        </code>
                                        <CopyBtn text={value} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ── Tab bar ──────────────────────────────────────────── */}
                <div className="flex gap-1 p-1 rounded-2xl bg-slate-100 dark:bg-slate-800/60 w-fit">
                    {(["sources", "events"] as const).map(tab => (
                        <button key={tab} onClick={() => setActiveTab(tab)}
                            className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeTab === tab ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"}`}>
                            {tab === "sources" ? `Sources (${sources.length})` : "Recent Events"}
                        </button>
                    ))}
                </div>

                {/* ── Error ───────────────────────────────────────────── */}
                {error && (
                    <div className="flex items-center gap-2 text-sm text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 rounded-xl px-4 py-3">
                        <AlertCircle className="w-4 h-4 shrink-0" /> {error}
                    </div>
                )}

                {/* ── SOURCES TAB ──────────────────────────────────────── */}
                {activeTab === "sources" && (
                    <div className="space-y-4">

                        {/* Add form */}
                        {showForm && (
                            <div className="rounded-2xl border-2 border-sky-200 dark:border-sky-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
                                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-sky-50/40 dark:bg-sky-950/10">
                                    <p className="text-xs font-bold text-sky-600 dark:text-sky-400 uppercase tracking-widest mb-0.5">Add Webhook Source</p>
                                    <p className="text-sm text-slate-500 dark:text-slate-400">
                                        You'll get a unique URL and secret to paste into your service's webhook settings.
                                    </p>
                                </div>
                                <form onSubmit={createSource} className="p-6 space-y-4">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <label className={lbl}>Source Name <span className="text-rose-500">*</span></label>
                                            <input value={addName} onChange={e => setAddName(e.target.value)} className={inp} placeholder="e.g. GitHub - Engineering" required />
                                            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">What service will send events here?</p>
                                        </div>
                                        <div>
                                            <label className={lbl}>Description <span className="font-normal text-slate-400 normal-case">(optional)</span></label>
                                            <input value={addDesc} onChange={e => setAddDesc(e.target.value)} className={inp} placeholder="e.g. PR and push events for the main repo" />
                                        </div>
                                    </div>

                                    {/* How it works */}
                                    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                                        <p className="font-semibold text-slate-900 dark:text-slate-100 mb-1">What happens next</p>
                                        <ol className="space-y-1 text-xs text-slate-500 dark:text-slate-400 list-decimal list-inside">
                                            <li>You get a unique webhook URL and a signing secret</li>
                                            <li>Paste both into your service (GitHub Settings → Webhooks, Jira Project → Automation, etc.)</li>
                                            <li>Every event from that service → your agents react automatically</li>
                                        </ol>
                                    </div>

                                    {addError && <div className="flex items-center gap-2 text-sm text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 rounded-xl px-4 py-2.5"><AlertCircle className="w-4 h-4 shrink-0" />{addError}</div>}

                                    <div className="flex gap-3">
                                        <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2.5 rounded-full border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Cancel</button>
                                        <button type="submit" disabled={adding} className="px-6 py-2.5 rounded-full bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-bold transition-colors">
                                            {adding ? "Creating…" : "Create Source"}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        )}

                        {/* Source list */}
                        {loading ? (
                            <div className="space-y-3">{[1,2].map(i => <div key={i} className="h-24 rounded-2xl bg-slate-200 dark:bg-slate-800 animate-pulse" />)}</div>
                        ) : sources.length === 0 && !showForm ? (
                            <div className="rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-12 text-center">
                                <div className="w-14 h-14 rounded-2xl bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center mx-auto mb-4">
                                    <ArrowDownToLine className="w-7 h-7 text-sky-500" />
                                </div>
                                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-1">No webhook sources yet</h3>
                                <p className="text-sm text-slate-400 dark:text-slate-500 max-w-sm mx-auto mb-5 leading-relaxed">
                                    Add a source to let GitHub, Jira, Slack, or any service push events directly to your agents.
                                </p>
                                <button onClick={() => setShowForm(true)} className="px-5 py-2.5 rounded-full bg-sky-600 hover:bg-sky-700 text-white text-sm font-bold transition-colors">
                                    Add your first source
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {sources.map(source => (
                                    <div key={source.id} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
                                        <div className="flex items-start gap-3">
                                            <div className="w-9 h-9 rounded-xl bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center shrink-0">
                                                <ArrowDownToLine className="w-4.5 h-4.5 text-sky-500" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                    <p className="font-bold text-slate-900 dark:text-slate-100">{source.name}</p>
                                                    <span className="text-[11px] font-semibold rounded-full px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40">Active</span>
                                                </div>
                                                {source.description && <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">{source.description}</p>}

                                                {/* Webhook URL */}
                                                <div className="flex items-center gap-2 mb-2">
                                                    <code className="flex-1 font-mono text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 overflow-hidden text-ellipsis whitespace-nowrap text-sky-600 dark:text-sky-400">
                                                        {source.inboundUrl}
                                                    </code>
                                                    <CopyBtn text={source.inboundUrl} label="Copy URL" />
                                                </div>

                                                <p className="text-xs text-slate-400 dark:text-slate-500">
                                                    {source.eventCount !== undefined ? `${source.eventCount} events received` : "No events yet"}
                                                    {source.lastReceivedAt && ` · Last: ${new Date(source.lastReceivedAt).toLocaleString()}`}
                                                </p>
                                            </div>

                                            <button onClick={() => void removeSource(source.id, source.name)}
                                                className="flex items-center gap-1.5 text-xs font-semibold border border-rose-200 dark:border-rose-900 text-rose-500 dark:text-rose-400 rounded-lg px-3 py-1.5 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors shrink-0">
                                                <Trash2 className="w-3 h-3" /> Remove
                                            </button>
                                        </div>

                                        {/* How to use */}
                                        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                                            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">Paste this URL into your service's webhook settings:</p>
                                            <div className="flex flex-wrap gap-2">
                                                {[
                                                    { label: "GitHub", href: "https://docs.github.com/en/webhooks/using-webhooks/creating-webhooks" },
                                                    { label: "Jira",   href: "https://developer.atlassian.com/server/jira/platform/webhooks/" },
                                                    { label: "Slack",  href: "https://api.slack.com/messaging/webhooks" },
                                                    { label: "Any service", href: "#" },
                                                ].map(({ label, href }) => (
                                                    <a key={label} href={href} target="_blank" rel="noopener noreferrer"
                                                        className="flex items-center gap-1 text-xs text-sky-600 dark:text-sky-400 hover:underline">
                                                        <ExternalLink className="w-3 h-3" /> {label} docs
                                                    </a>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ── EVENTS TAB ───────────────────────────────────────── */}
                {activeTab === "events" && (
                    <div className="space-y-4">
                        {/* Filters */}
                        <div className="flex gap-3 items-center flex-wrap">
                            <select value={filterSource} onChange={e => setFilterSource(e.target.value)}
                                className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500">
                                <option value="">All sources</option>
                                {sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                            <select value={filterLimit} onChange={e => setFilterLimit(e.target.value)}
                                className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500">
                                {["20","50","100"].map(v => <option key={v} value={v}>{v} events</option>)}
                            </select>
                            <button onClick={() => void loadEvents()} disabled={loading}
                                className="flex items-center gap-1.5 text-sm font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 rounded-xl px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors">
                                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
                            </button>
                        </div>

                        {loading ? (
                            <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-16 rounded-xl bg-slate-200 dark:bg-slate-800 animate-pulse" />)}</div>
                        ) : events.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 p-10 text-center">
                                <Clock className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                                <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">No events received yet</p>
                                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Events will appear here once your service starts sending webhooks.</p>
                            </div>
                        ) : (
                            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                                            {["Received", "Source", "Method", "Status"].map(h => (
                                                <th key={h} className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                                        {events.map(ev => (
                                            <tr key={ev.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                                                <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                                    {new Date(ev.receivedAt).toLocaleString()}
                                                </td>
                                                <td className="px-4 py-3 text-xs font-mono text-slate-500 dark:text-slate-400">
                                                    {sources.find(s => s.id === ev.sourceId)?.name ?? ev.sourceId.slice(0, 8)}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className="text-[11px] font-bold font-mono bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded px-2 py-0.5">{ev.method}</span>
                                                </td>
                                                <td className="px-4 py-3"><StatusBadge status={ev.status} /></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
