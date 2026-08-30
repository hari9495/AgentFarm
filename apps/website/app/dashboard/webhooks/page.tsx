"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, RefreshCw, Copy, Check, ArrowDownToLine, ChevronRight, Clock, CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";

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
            className={`flex items-center gap-1.5 text-xs font-semibold rounded-[3px] px-3 py-1.5 border transition-colors ${copied ? "border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/30 text-[color:var(--ok)] dark:text-[color:var(--ok)]" : "border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)] hover:border-[color:var(--line)]"}`}>
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            {copied ? "Copied!" : label}
        </button>
    );
}

function StatusBadge({ status }: { status: string }) {
    const cfg = status === "processed" ? "bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/40 text-[color:var(--ok)] dark:text-[color:var(--ok)] border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)]/40"
              : status === "failed"    ? "bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/40 text-[color:var(--danger)] dark:text-[color:var(--danger)] border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)]/40"
              : "bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--warn)_22%,transparent)]/40 text-[color:var(--warn)] dark:text-[color:var(--warn)] border-[color:color-mix(in_srgb,var(--warn)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--warn)_40%,transparent)]/40";
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

    const inp = "w-full border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] text-[color:var(--ink)] dark:text-[color:var(--ink)] rounded-[3px] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] placeholder:text-[color:var(--ink-muted)]";
    const lbl = "block text-xs font-bold text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] uppercase tracking-wider mb-1.5";

    return (
        <div className="min-h-screen bg-[var(--bg-deep)]">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-6 space-y-6">

                {/* Dark hero */}
                <section className="relative overflow-hidden rounded-[4px] border border-[color:var(--line)] bg-gradient-to-br from-[color-mix(in_srgb,var(--accent)_8%,transparent)] via-[var(--card)] to-[var(--card)]">
                    <div className="absolute inset-0 pointer-events-none">
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_80%_at_0%_0%,rgba(37,99,235,0.10)_0%,transparent_60%)]" />
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_70%_at_100%_100%,rgba(16,185,129,0.07)_0%,transparent_60%)]" />
                        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "radial-gradient(circle, rgba(37,99,235,1) 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
                    </div>
                    <div className="relative px-6 sm:px-8 py-6 sm:py-8">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="flex items-center gap-2 rounded-[3px] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-[color:var(--accent)]">
                                <ArrowDownToLine className="w-3.5 h-3.5" />
                                Webhooks
                            </div>
                            <ChevronRight className="w-3.5 h-3.5 text-[color:var(--ink-soft)]" />
                            <span className="text-xs text-[color:var(--ink-muted)]">Inbound</span>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5">
                            <div>
                                <h1 className="text-3xl sm:text-4xl font-extrabold text-[color:var(--ink)] tracking-tight leading-tight">Inbound Webhooks</h1>
                                <p className="mt-2 text-[color:var(--ink-soft)] text-base max-w-lg">Register external services to push events into AgentFarms.</p>
                            </div>
                            {activeTab === "sources" && (
                                <button onClick={() => setShowForm(v => !v)}
                                    className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-[var(--accent)] hover:bg-[var(--accent)] text-white text-sm font-bold transition-colors shrink-0">
                                    <Plus className="w-3.5 h-3.5" /> {showForm ? "Cancel" : "+ Add Source"}
                                </button>
                            )}
                        </div>
                    </div>
                </section>

                <div className="space-y-6">

                {/* ── New secret reveal ─────────────────────────────── */}
                {newSource && (
                    <div className="rounded-[4px] border border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)]/50 bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/20 p-5">
                        <div className="flex items-start gap-3 mb-4">
                            <CheckCircle2 className="w-5 h-5 text-[color:var(--ok)] dark:text-[color:var(--ok)] shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm font-bold text-[color:var(--ok)] dark:text-[color:var(--ok)]">Webhook source created — save these now</p>
                                <p className="text-xs text-[color:var(--ok)] dark:text-[color:var(--ok)] mt-0.5">The secret will not be shown again. Paste both into your service's webhook settings.</p>
                            </div>
                            <button onClick={() => setNewSource(null)} className="ml-auto text-[color:var(--ok)] hover:text-[color:var(--ok)] dark:hover:text-[color:var(--ok)]">✕</button>
                        </div>
                        <div className="space-y-3">
                            {[{ label: "Webhook URL", value: newSource.url }, { label: "Signing Secret", value: newSource.secret }].map(({ label, value }) => (
                                <div key={label}>
                                    <p className="text-xs font-bold text-[color:var(--ok)] dark:text-[color:var(--ok)] uppercase tracking-wider mb-1">{label}</p>
                                    <div className="flex items-center gap-2">
                                        <code className="flex-1 font-mono text-xs bg-[var(--card)] dark:bg-[var(--card)] border border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)]/50 rounded-[3px] px-3 py-2 overflow-hidden text-ellipsis whitespace-nowrap text-[color:var(--ink)] dark:text-[color:var(--ink)]">
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
                <div className="flex gap-1 p-1 rounded-[4px] bg-[var(--bg-deep)] dark:bg-[var(--card)]/60 w-fit">
                    {(["sources", "events"] as const).map(tab => (
                        <button key={tab} onClick={() => setActiveTab(tab)}
                            className={`px-5 py-2.5 rounded-[3px] text-sm font-semibold transition-all ${activeTab === tab ? "bg-[var(--card)] dark:bg-[var(--card)] text-[color:var(--ink)] dark:text-[color:var(--ink)] shadow-sm" : "text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] hover:text-[color:var(--ink-soft)] dark:hover:text-[color:var(--ink)]"}`}>
                            {tab === "sources" ? `Sources (${sources.length})` : "Recent Events"}
                        </button>
                    ))}
                </div>

                {/* ── Error ───────────────────────────────────────────── */}
                {error && (
                    <div className="flex items-center gap-2 text-sm text-[color:var(--danger)] dark:text-[color:var(--danger)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/30 border border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)]/40 rounded-[3px] px-4 py-3">
                        <AlertCircle className="w-4 h-4 shrink-0" /> {error}
                    </div>
                )}

                {/* ── SOURCES TAB ──────────────────────────────────────── */}
                {activeTab === "sources" && (
                    <div className="space-y-4">

                        {/* Add form */}
                        {showForm && (
                            <div className="rounded-[4px] border-2 border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[var(--card)] dark:bg-[var(--card)] overflow-hidden shadow-sm">
                                <div className="px-6 py-4 border-b border-[color:var(--line)] dark:border-[color:var(--line)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]/40 dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/10">
                                    <p className="text-xs font-bold text-[color:var(--accent)] dark:text-[color:var(--accent)] uppercase tracking-widest mb-0.5">Add Webhook Source</p>
                                    <p className="text-sm text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">
                                        You'll get a unique URL and secret to paste into your service's webhook settings.
                                    </p>
                                </div>
                                <form onSubmit={createSource} className="p-6 space-y-4">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <label className={lbl}>Source Name <span className="text-[color:var(--danger)]">*</span></label>
                                            <input value={addName} onChange={e => setAddName(e.target.value)} className={inp} placeholder="e.g. GitHub - Engineering" required />
                                            <p className="text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] mt-1">What service will send events here?</p>
                                        </div>
                                        <div>
                                            <label className={lbl}>Description <span className="font-normal text-[color:var(--ink-muted)] normal-case">(optional)</span></label>
                                            <input value={addDesc} onChange={e => setAddDesc(e.target.value)} className={inp} placeholder="e.g. PR and push events for the main repo" />
                                        </div>
                                    </div>

                                    {/* How it works */}
                                    <div className="rounded-[3px] bg-[var(--bg-deep)] dark:bg-[var(--card)]/50 border border-[color:var(--line)] dark:border-[color:var(--line)] px-4 py-3 text-sm text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">
                                        <p className="font-semibold text-[color:var(--ink)] dark:text-[color:var(--ink)] mb-1">What happens next</p>
                                        <ol className="space-y-1 text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] list-decimal list-inside">
                                            <li>You get a unique webhook URL and a signing secret</li>
                                            <li>Paste both into your service (GitHub Settings → Webhooks, Jira Project → Automation, etc.)</li>
                                            <li>Every event from that service → your agents react automatically</li>
                                        </ol>
                                    </div>

                                    {addError && <div className="flex items-center gap-2 text-sm text-[color:var(--danger)] dark:text-[color:var(--danger)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/30 border border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)]/40 rounded-[3px] px-4 py-2.5"><AlertCircle className="w-4 h-4 shrink-0" />{addError}</div>}

                                    <div className="flex gap-3">
                                        <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2.5 rounded-full border border-[color:var(--line)] dark:border-[color:var(--line)] text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)] text-sm font-semibold hover:bg-[var(--bg-deep)] dark:hover:bg-[var(--card)] transition-colors">Cancel</button>
                                        <button type="submit" disabled={adding} className="px-6 py-2.5 rounded-full bg-[var(--accent)] hover:bg-[var(--accent)] disabled:opacity-50 text-white text-sm font-bold transition-colors">
                                            {adding ? "Creating…" : "Create Source"}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        )}

                        {/* Source list */}
                        {loading ? (
                            <div className="space-y-3">{[1,2].map(i => <div key={i} className="h-24 rounded-[4px] bg-[var(--line)] dark:bg-[var(--card)] animate-pulse" />)}</div>
                        ) : sources.length === 0 && !showForm ? (
                            <div className="rounded-[4px] border-2 border-dashed border-[color:var(--line)] dark:border-[color:var(--line)] p-12 text-center">
                                <div className="w-14 h-14 rounded-[4px] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/40 flex items-center justify-center mx-auto mb-4">
                                    <ArrowDownToLine className="w-7 h-7 text-[color:var(--accent)]" />
                                </div>
                                <h3 className="text-base font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)] mb-1">No webhook sources yet</h3>
                                <p className="text-sm text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] max-w-sm mx-auto mb-5 leading-relaxed">
                                    Add a source to let GitHub, Jira, Slack, or any service push events directly to your agents.
                                </p>
                                <button onClick={() => setShowForm(true)} className="px-5 py-2.5 rounded-full bg-[var(--accent)] hover:bg-[var(--accent)] text-white text-sm font-bold transition-colors">
                                    Add your first source
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {sources.map(source => (
                                    <div key={source.id} className="rounded-[4px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] p-5 shadow-sm">
                                        <div className="flex items-start gap-3">
                                            <div className="w-9 h-9 rounded-[3px] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/40 flex items-center justify-center shrink-0">
                                                <ArrowDownToLine className="w-4.5 h-4.5 text-[color:var(--accent)]" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                    <p className="font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)]">{source.name}</p>
                                                    <span className="text-[11px] font-semibold rounded-full px-2 py-0.5 bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/40 text-[color:var(--ok)] dark:text-[color:var(--ok)] border border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)]/40">Active</span>
                                                </div>
                                                {source.description && <p className="text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] mb-2">{source.description}</p>}

                                                {/* Webhook URL */}
                                                <div className="flex items-center gap-2 mb-2">
                                                    <code className="flex-1 font-mono text-xs bg-[var(--bg-deep)] dark:bg-[var(--card)] border border-[color:var(--line)] dark:border-[color:var(--line)] rounded-[3px] px-3 py-1.5 overflow-hidden text-ellipsis whitespace-nowrap text-[color:var(--accent)] dark:text-[color:var(--accent)]">
                                                        {source.inboundUrl}
                                                    </code>
                                                    <CopyBtn text={source.inboundUrl} label="Copy URL" />
                                                </div>

                                                <p className="text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">
                                                    {source.eventCount !== undefined ? `${source.eventCount} events received` : "No events yet"}
                                                    {source.lastReceivedAt && ` · Last: ${new Date(source.lastReceivedAt).toLocaleString()}`}
                                                </p>
                                            </div>

                                            <button onClick={() => void removeSource(source.id, source.name)}
                                                className="flex items-center gap-1.5 text-xs font-semibold border border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)] text-[color:var(--danger)] dark:text-[color:var(--danger)] rounded-[3px] px-3 py-1.5 hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] dark:hover:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/20 transition-colors shrink-0">
                                                <Trash2 className="w-3 h-3" /> Remove
                                            </button>
                                        </div>

                                        {/* How to use */}
                                        <div className="mt-4 pt-4 border-t border-[color:var(--line)] dark:border-[color:var(--line)]">
                                            <p className="text-xs font-semibold text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] mb-2">Paste this URL into your service's webhook settings:</p>
                                            <div className="flex flex-wrap gap-2">
                                                {[
                                                    { label: "GitHub", href: "https://docs.github.com/en/webhooks/using-webhooks/creating-webhooks" },
                                                    { label: "Jira",   href: "https://developer.atlassian.com/server/jira/platform/webhooks/" },
                                                    { label: "Slack",  href: "https://api.slack.com/messaging/webhooks" },
                                                    { label: "Any service", href: "#" },
                                                ].map(({ label, href }) => (
                                                    <a key={label} href={href} target="_blank" rel="noopener noreferrer"
                                                        className="flex items-center gap-1 text-xs text-[color:var(--accent)] dark:text-[color:var(--accent)] hover:underline">
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
                                className="border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] text-[color:var(--ink)] dark:text-[color:var(--ink)] rounded-[3px] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--accent)_40%,transparent)]">
                                <option value="">All sources</option>
                                {sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                            <select value={filterLimit} onChange={e => setFilterLimit(e.target.value)}
                                className="border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] text-[color:var(--ink)] dark:text-[color:var(--ink)] rounded-[3px] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--accent)_40%,transparent)]">
                                {["20","50","100"].map(v => <option key={v} value={v}>{v} events</option>)}
                            </select>
                            <button onClick={() => void loadEvents()} disabled={loading}
                                className="flex items-center gap-1.5 text-sm font-semibold border border-[color:var(--line)] dark:border-[color:var(--line)] text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)] rounded-[3px] px-3 py-2 hover:bg-[var(--bg-deep)] dark:hover:bg-[var(--card)] disabled:opacity-50 transition-colors">
                                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
                            </button>
                        </div>

                        {loading ? (
                            <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-16 rounded-[3px] bg-[var(--line)] dark:bg-[var(--card)] animate-pulse" />)}</div>
                        ) : events.length === 0 ? (
                            <div className="rounded-[4px] border border-dashed border-[color:var(--line)] dark:border-[color:var(--line)] p-10 text-center">
                                <Clock className="w-8 h-8 text-[color:var(--ink-muted)] dark:text-[color:var(--ink-soft)] mx-auto mb-3" />
                                <p className="text-sm font-semibold text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">No events received yet</p>
                                <p className="text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] mt-1">Events will appear here once your service starts sending webhooks.</p>
                            </div>
                        ) : (
                            <div className="rounded-[4px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] overflow-hidden shadow-sm">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--bg-deep)] dark:bg-[var(--card)]/50">
                                            {["Received", "Source", "Method", "Status"].map(h => (
                                                <th key={h} className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[color:var(--line)] dark:divide-[color:var(--line)]/60">
                                        {events.map(ev => (
                                            <tr key={ev.id} className="hover:bg-[var(--bg-deep)] dark:hover:bg-[var(--card)]/30 transition-colors">
                                                <td className="px-4 py-3 text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] whitespace-nowrap">
                                                    {new Date(ev.receivedAt).toLocaleString()}
                                                </td>
                                                <td className="px-4 py-3 text-xs font-mono text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">
                                                    {sources.find(s => s.id === ev.sourceId)?.name ?? ev.sourceId.slice(0, 8)}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className="text-[11px] font-bold font-mono bg-[var(--bg-deep)] dark:bg-[var(--card)] text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)] rounded px-2 py-0.5">{ev.method}</span>
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
        </div>
    );
}
