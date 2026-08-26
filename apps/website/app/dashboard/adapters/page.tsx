"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
    Plus, Trash2, Zap, RefreshCw, ChevronDown, ChevronUp, ChevronRight,
    AlertCircle, CheckCircle2, Layers,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type AdapterType = "source_control" | "ci_cd" | "issue_tracker" | "communication" | "cloud_provider" | "custom";
type AuthType    = "none" | "api_key" | "bearer_token" | "basic_auth";
type HttpMethod  = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type ActionDef = { name: string; method: HttpMethod; path: string; description: string };

type AdapterRecord = {
    adapter_id: string;
    name: string;
    type: AdapterType;
    description?: string;
    version?: string;
    endpoint_url?: string;
    health_score?: number;
    status: "active" | "inactive" | "error" | "unknown";
    registered_at: string;
    actions?: ActionDef[];
};

const ADAPTER_TYPES: { value: AdapterType; label: string }[] = [
    { value: "custom",         label: "Custom API"     },
    { value: "source_control", label: "Source Control" },
    { value: "issue_tracker",  label: "Issue Tracker"  },
    { value: "ci_cd",          label: "CI / CD"        },
    { value: "communication",  label: "Communication"  },
    { value: "cloud_provider", label: "Cloud Provider" },
];

const HTTP_METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const METHOD_COLORS: Record<HttpMethod, string> = {
    GET: "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/40",
    POST: "text-blue-600 bg-blue-50 dark:bg-blue-900/40",
    PUT: "text-amber-600 bg-amber-50 dark:bg-amber-900/40",
    PATCH: "text-blue-600 bg-blue-50 dark:bg-blue-900/40",
    DELETE: "text-rose-600 bg-rose-50 dark:bg-rose-900/40",
};

const inp = "w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-400";
const lbl = "block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5";

// ── Register form ─────────────────────────────────────────────────────────────

function RegisterForm({ onSave, onCancel }: { onSave: (data: unknown) => Promise<void>; onCancel: () => void }) {
    const [step, setStep] = useState<1 | 2 | 3>(1);

    const [adapterId, setAdapterId]       = useState("");
    const [name, setName]                 = useState("");
    const [type, setType]                 = useState<AdapterType>("custom");
    const [version, setVersion]           = useState("1.0.0");
    const [description, setDescription]   = useState("");

    const [endpointUrl, setEndpointUrl]   = useState("");
    const [authType, setAuthType]         = useState<AuthType>("none");
    const [apiKeyHeader, setApiKeyHeader] = useState("X-API-Key");
    const [apiKeyValue, setApiKeyValue]   = useState("");
    const [bearerToken, setBearerToken]   = useState("");
    const [basicUser, setBasicUser]       = useState("");
    const [basicPass, setBasicPass]       = useState("");
    const [healthPath, setHealthPath]     = useState("/health");

    const [actions, setActions]           = useState<ActionDef[]>([{ name: "", method: "GET", path: "", description: "" }]);

    const [saving, setSaving]   = useState(false);
    const [error, setError]     = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const addAction    = () => setActions(a => [...a, { name: "", method: "GET", path: "", description: "" }]);
    const removeAction = (i: number) => setActions(a => a.filter((_, idx) => idx !== i));
    const updateAction = (i: number, patch: Partial<ActionDef>) => setActions(a => a.map((ac, idx) => idx === i ? { ...ac, ...patch } : ac));

    async function submit() {
        setSaving(true); setError(null);
        try {
            const authConfig =
                authType === "api_key"      ? { type: "api_key",      header: apiKeyHeader, value: apiKeyValue }
              : authType === "bearer_token" ? { type: "bearer_token", token: bearerToken }
              : authType === "basic_auth"   ? { type: "basic_auth",   username: basicUser, password: basicPass }
              : { type: "none" };

            await onSave({
                adapter_id: adapterId.trim(), name: name.trim(), type,
                version: version.trim() || "1.0.0", description: description.trim() || undefined,
                endpoint_url: endpointUrl.trim(), auth: authConfig,
                health_check: { path: healthPath.trim() || "/health", expected_status: 200 },
                actions: actions.filter(a => a.name.trim() && a.path.trim()),
            });
            setSuccess(true);
            setTimeout(() => onCancel(), 1200);
        } catch (err) { setError(err instanceof Error ? err.message : "Failed to register."); }
        finally { setSaving(false); }
    }

    const STEPS = [{ n: 1, lbl: "Identity" }, { n: 2, lbl: "Connection" }, { n: 3, lbl: "Actions" }];

    return (
        <div className="rounded-2xl border-2 border-blue-200 dark:border-blue-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden mb-6">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div>
                    <p className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest mb-0.5">Register Custom Adapter</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Connect your internal API so your agents can call it</p>
                </div>
                <button onClick={onCancel} className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">✕</button>
            </div>

            {/* Step indicator */}
            <div className="flex items-center gap-2 px-6 py-3 border-b border-slate-100 dark:border-slate-800">
                {STEPS.map(({ n, lbl: l }, i) => (
                    <div key={n} className="flex items-center gap-2">
                        {i > 0 && <div className="w-8 h-px bg-slate-200 dark:bg-slate-700" />}
                        <div className="flex items-center gap-2">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step === n ? "bg-blue-600 text-white" : step > n ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300" : "bg-slate-100 dark:bg-slate-800 text-slate-400"}`}>
                                {step > n ? "✓" : n}
                            </div>
                            <span className={`text-xs font-semibold ${step === n ? "text-blue-600 dark:text-blue-400" : step > n ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400 dark:text-slate-500"}`}>{l}</span>
                        </div>
                    </div>
                ))}
            </div>

            <div className="p-6 space-y-4">
                {/* Step 1 */}
                {step === 1 && (
                    <>
                        <div className="grid grid-cols-2 gap-4">
                            <div><label className={lbl}>Adapter ID <span className="text-rose-500">*</span></label><input value={adapterId} onChange={e => setAdapterId(e.target.value)} className={inp} placeholder="inventory-api" /><p className="text-xs text-slate-400 mt-1">Unique ID — lowercase with hyphens</p></div>
                            <div><label className={lbl}>Display Name <span className="text-rose-500">*</span></label><input value={name} onChange={e => setName(e.target.value)} className={inp} placeholder="Inventory API" /></div>
                            <div><label className={lbl}>Type</label><select value={type} onChange={e => setType(e.target.value as AdapterType)} className={inp}>{ADAPTER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
                            <div><label className={lbl}>Version</label><input value={version} onChange={e => setVersion(e.target.value)} className={inp} placeholder="1.0.0" /></div>
                            <div className="col-span-2"><label className={lbl}>Description</label><input value={description} onChange={e => setDescription(e.target.value)} className={inp} placeholder="What does this adapter do? (optional)" /></div>
                        </div>
                        <div className="flex justify-end"><button onClick={() => { if (!adapterId.trim() || !name.trim()) { setError("Adapter ID and Name are required."); return; } setError(null); setStep(2); }} className="px-6 py-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold transition-colors">Next: Connection →</button></div>
                    </>
                )}

                {/* Step 2 */}
                {step === 2 && (
                    <>
                        <div><label className={lbl}>API Base URL <span className="text-rose-500">*</span></label><input value={endpointUrl} onChange={e => setEndpointUrl(e.target.value)} type="url" className={inp} placeholder="https://api.yourcompany.com/v1" /><p className="text-xs text-slate-400 mt-1">All action paths are appended to this URL</p></div>
                        <div>
                            <label className={lbl}>Authentication</label>
                            <div className="flex gap-2 flex-wrap">
                                {(["none","api_key","bearer_token","basic_auth"] as AuthType[]).map(a => (
                                    <button key={a} type="button" onClick={() => setAuthType(a)} className={`px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors ${authType === a ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300" : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:border-slate-400"}`}>
                                        {a === "none" ? "None" : a === "api_key" ? "API Key" : a === "bearer_token" ? "Bearer Token" : "Basic Auth"}
                                    </button>
                                ))}
                            </div>
                        </div>
                        {authType === "api_key" && <div className="grid grid-cols-3 gap-4"><div><label className={lbl}>Header Name</label><input value={apiKeyHeader} onChange={e => setApiKeyHeader(e.target.value)} className={inp} /></div><div className="col-span-2"><label className={lbl}>API Key <span className="text-rose-500">*</span></label><input value={apiKeyValue} onChange={e => setApiKeyValue(e.target.value)} type="password" className={inp} placeholder="sk-…" /><p className="text-xs text-slate-400 mt-1">Stored encrypted — never logged</p></div></div>}
                        {authType === "bearer_token" && <div><label className={lbl}>Bearer Token <span className="text-rose-500">*</span></label><input value={bearerToken} onChange={e => setBearerToken(e.target.value)} type="password" className={inp} /></div>}
                        {authType === "basic_auth" && <div className="grid grid-cols-2 gap-4"><div><label className={lbl}>Username <span className="text-rose-500">*</span></label><input value={basicUser} onChange={e => setBasicUser(e.target.value)} className={inp} /></div><div><label className={lbl}>Password <span className="text-rose-500">*</span></label><input value={basicPass} onChange={e => setBasicPass(e.target.value)} type="password" className={inp} /></div></div>}
                        <div><label className={lbl}>Health Check Path</label><input value={healthPath} onChange={e => setHealthPath(e.target.value)} className={inp} placeholder="/health" /><p className="text-xs text-slate-400 mt-1">GET request — expects HTTP 200</p></div>
                        <div className="flex gap-3 justify-end"><button onClick={() => setStep(1)} className="px-4 py-2 rounded-full border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">← Back</button><button onClick={() => { if (!endpointUrl.trim()) { setError("API Base URL is required."); return; } setError(null); setStep(3); }} className="px-6 py-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold transition-colors">Next: Actions →</button></div>
                    </>
                )}

                {/* Step 3 */}
                {step === 3 && (
                    <>
                        <div className="flex items-center justify-between"><div><p className="text-sm font-bold text-slate-900 dark:text-slate-100">Define what agents can do</p><p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Each action is a typed API call. Skip to register without actions now.</p></div><button onClick={addAction} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-semibold hover:border-slate-400 transition-colors"><Plus className="w-3 h-3" />Add action</button></div>
                        <div className="space-y-3">
                            {actions.map((action, i) => (
                                <div key={i} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4">
                                    <div className="flex items-center justify-between mb-3"><span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Action {i + 1}</span>{actions.length > 1 && <button onClick={() => removeAction(i)} className="text-slate-300 dark:text-slate-600 hover:text-rose-500 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>}</div>
                                    <div className="grid grid-cols-3 gap-3">
                                        <div><label className={lbl}>Name</label><input value={action.name} onChange={e => updateAction(i, { name: e.target.value })} className={inp} placeholder="get_stock" /></div>
                                        <div><label className={lbl}>Method</label><select value={action.method} onChange={e => updateAction(i, { method: e.target.value as HttpMethod })} className={inp}>{HTTP_METHODS.map(m => <option key={m} value={m}>{m}</option>)}</select></div>
                                        <div><label className={lbl}>Path</label><input value={action.path} onChange={e => updateAction(i, { path: e.target.value })} className={`${inp} font-mono`} placeholder="/inventory/{sku}" /></div>
                                        <div className="col-span-3"><label className={lbl}>What it does</label><input value={action.description} onChange={e => updateAction(i, { description: e.target.value })} className={inp} placeholder="Look up stock level by SKU" /></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="rounded-xl bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 px-4 py-3 text-sm text-blue-700 dark:text-blue-300">
                            <strong>{name}</strong> · {endpointUrl} · {authType.replace(/_/g, " ")} · {actions.filter(a => a.name.trim()).length} action{actions.filter(a => a.name.trim()).length !== 1 ? "s" : ""}
                        </div>
                        {error && <div className="flex items-center gap-2 text-sm text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 rounded-xl px-4 py-2"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>}
                        {success && <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/40 rounded-xl px-4 py-2"><CheckCircle2 className="w-4 h-4 shrink-0" />Adapter registered! Agents can now use it.</div>}
                        <div className="flex gap-3 justify-end"><button onClick={() => setStep(2)} className="px-4 py-2 rounded-full border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 text-sm hover:bg-slate-50 transition-colors">← Back</button><button onClick={submit} disabled={saving || success} className="px-6 py-2 rounded-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold transition-colors">{saving ? "Registering…" : success ? "✓ Done" : "Register Adapter"}</button></div>
                    </>
                )}

                {error && step < 3 && <div className="flex items-center gap-2 text-sm text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 rounded-xl px-4 py-2"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>}
            </div>
        </div>
    );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CustomerAdaptersPage() {
    const [adapters, setAdapters]   = useState<AdapterRecord[]>([]);
    const [loading, setLoading]     = useState(true);
    const [error, setError]         = useState<string | null>(null);
    const [showForm, setShowForm]   = useState(false);
    const [expanded, setExpanded]   = useState<string | null>(null);
    const [pinging, setPinging]         = useState<Record<string, boolean>>({});
    const [pingResults, setPingResults] = useState<Record<string, { ok: boolean; ms: number }>>({});

    const load = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const res = await fetch("/api/adapters");
            const body = await res.json() as { adapters?: AdapterRecord[]; error?: string };
            if (!res.ok) { setError(body.error ?? "Failed to load adapters"); return; }
            setAdapters(body.adapters ?? []);
        } catch { setError("Network error."); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { void load(); }, [load]);

    async function save(data: unknown) {
        const res = await fetch("/api/adapters", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
        });
        const body = await res.json() as { error?: string; message?: string };
        if (!res.ok) throw new Error(body.message ?? body.error ?? "Failed to register.");
        await load();
    }

    async function ping(adapter: AdapterRecord) {
        setPinging(p => ({ ...p, [adapter.adapter_id]: true }));
        try {
            const res = await fetch(`/api/adapters/${encodeURIComponent(adapter.adapter_id)}/health`, { method: "POST" });
            const body = await res.json() as { healthy?: boolean; latency_ms?: number };
            setPingResults(p => ({ ...p, [adapter.adapter_id]: { ok: body.healthy ?? res.ok, ms: body.latency_ms ?? 0 } }));
        } catch { setPingResults(p => ({ ...p, [adapter.adapter_id]: { ok: false, ms: 0 } })); }
        finally { setPinging(p => ({ ...p, [adapter.adapter_id]: false })); }
    }

    async function remove(id: string, name: string) {
        if (!confirm(`Remove "${name}"? Agents will lose access to its actions.`)) return;
        await fetch(`/api/adapters/${encodeURIComponent(id)}`, { method: "DELETE" });
        await load();
    }

    return (
        <div className="min-h-screen bg-slate-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-6 space-y-6">

                {/* Dark hero */}
                <section className="relative overflow-hidden rounded-2xl bg-slate-950">
                    <div className="absolute inset-0 pointer-events-none">
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_80%_at_0%_0%,rgba(14,165,233,0.18)_0%,transparent_60%)]" />
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_70%_at_100%_100%,rgba(16,185,129,0.12)_0%,transparent_60%)]" />
                        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,1) 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
                    </div>
                    <div className="relative px-6 sm:px-8 py-6 sm:py-8">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="flex items-center gap-2 rounded-xl bg-blue-500/10 border border-blue-500/20 px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-blue-400">
                                <Layers className="w-3.5 h-3.5" />
                                Custom APIs
                            </div>
                            <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
                            <span className="text-xs text-slate-500">Adapters</span>
                        </div>
                        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5">
                            <div>
                                <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">Custom API Adapters</h1>
                                <p className="mt-2 text-slate-400 text-base max-w-lg">Register your internal APIs so agents can call them as typed actions.</p>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                                <Link href="/dashboard/integrations" className="text-xs text-slate-400 hover:text-slate-200 transition-colors">
                                    ← Standard connectors
                                </Link>
                                <button onClick={() => setShowForm(v => !v)} className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold transition-colors">
                                    <Plus className="w-3.5 h-3.5" /> {showForm ? "Cancel" : "+ Register Adapter"}
                                </button>
                            </div>
                        </div>
                    </div>
                </section>

                <div className="space-y-6">

                {/* What is this */}
                {!showForm && adapters.length === 0 && !loading && (
                    <div className="rounded-2xl border border-blue-200 dark:border-blue-900/40 bg-blue-50/50 dark:bg-blue-950/10 p-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {[
                                { icon: "🏭", title: "Register your API", desc: "Point it at your internal tool's base URL and define how to authenticate." },
                                { icon: "⚡", title: "Define actions", desc: "Tell agents exactly which endpoints they can call and what parameters to send." },
                                { icon: "🤖", title: "Agents use it", desc: "Agents discover the adapter and can invoke its actions just like GitHub or Jira." },
                            ].map(({ icon, title, desc }) => (
                                <div key={title} className="flex gap-3">
                                    <span className="text-2xl">{icon}</span>
                                    <div>
                                        <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{title}</p>
                                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">{desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <button onClick={() => setShowForm(true)} className="mt-5 flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold transition-colors">
                            <Plus className="w-3.5 h-3.5" /> Register your first adapter
                        </button>
                    </div>
                )}

                {/* Form */}
                {showForm && <RegisterForm onSave={save} onCancel={() => { setShowForm(false); void load(); }} />}

                {/* List */}
                {error && <div className="flex items-center gap-2 text-sm text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 rounded-xl px-4 py-3"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>}

                {loading && <div className="space-y-3">{[1,2].map(i => <div key={i} className="h-20 rounded-2xl bg-slate-200 dark:bg-slate-800 animate-pulse" />)}</div>}

                {!loading && adapters.length > 0 && (
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wide">
                                Registered Adapters <span className="font-normal text-slate-400 normal-case">({adapters.length})</span>
                            </h2>
                            <button onClick={load} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors"><RefreshCw className="w-3 h-3" />Refresh</button>
                        </div>
                        <div className="space-y-3">
                            {adapters.map(adapter => {
                                const pingResult = pingResults[adapter.adapter_id];
                                const isExp = expanded === adapter.adapter_id;
                                return (
                                    <div key={adapter.adapter_id} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
                                        <div className="p-4 flex items-start gap-3">
                                            <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${adapter.status === "active" ? "bg-emerald-500" : adapter.status === "error" ? "bg-rose-500" : "bg-slate-300"}`} />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                                    <p className="font-bold text-slate-900 dark:text-slate-100 text-sm">{adapter.name}</p>
                                                    <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 rounded-full px-2 py-0.5">{adapter.type.replace(/_/g, " ")}</span>
                                                    {adapter.version && <span className="text-[10px] text-slate-400">v{adapter.version}</span>}
                                                </div>
                                                <p className="text-xs font-mono text-slate-400 dark:text-slate-500">{adapter.adapter_id}</p>
                                                {adapter.endpoint_url && <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">{adapter.endpoint_url}</p>}
                                                {pingResult && <p className={`text-xs mt-1 flex items-center gap-1 ${pingResult.ok ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>{pingResult.ok ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}{pingResult.ok ? `Healthy · ${pingResult.ms}ms` : "Unreachable"}</p>}
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                {adapter.actions && adapter.actions.length > 0 && (
                                                    <button onClick={() => setExpanded(isExp ? null : adapter.adapter_id)} className="flex items-center gap-1 text-xs border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 rounded-lg px-2.5 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors font-medium">
                                                        {adapter.actions.length} actions {isExp ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                                    </button>
                                                )}
                                                <button onClick={() => ping(adapter).catch(() => {})} disabled={pinging[adapter.adapter_id]} className="flex items-center gap-1 text-xs border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 rounded-lg px-2.5 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors font-medium">
                                                    <Zap className="w-3 h-3" />{pinging[adapter.adapter_id] ? "…" : "Ping"}
                                                </button>
                                                <button onClick={() => void remove(adapter.adapter_id, adapter.name)} className="flex items-center gap-1 text-xs border border-rose-200 dark:border-rose-900 text-rose-500 dark:text-rose-400 rounded-lg px-2.5 py-1.5 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors font-medium">
                                                    <Trash2 className="w-3 h-3" />
                                                </button>
                                            </div>
                                        </div>
                                        {isExp && adapter.actions && (
                                            <div className="border-t border-slate-100 dark:border-slate-800 px-4 py-3 bg-slate-50 dark:bg-slate-800/50">
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Actions your agents can call</p>
                                                <div className="space-y-1.5">
                                                    {adapter.actions.map((a, i) => (
                                                        <div key={i} className="flex items-center gap-2 flex-wrap">
                                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded font-mono ${METHOD_COLORS[a.method]}`}>{a.method}</span>
                                                            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 font-mono">{a.name}</span>
                                                            <span className="text-xs text-slate-400 font-mono">{a.path}</span>
                                                            {a.description && <span className="text-xs text-slate-500">— {a.description}</span>}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                </div>

            </div>
        </div>
    );
}
