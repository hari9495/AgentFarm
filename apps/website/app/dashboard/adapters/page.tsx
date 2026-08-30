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
    GET: "text-[color:var(--ok)] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/40",
    POST: "text-[color:var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/40",
    PUT: "text-[color:var(--warn)] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--warn)_22%,transparent)]/40",
    PATCH: "text-[color:var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/40",
    DELETE: "text-[color:var(--danger)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/40",
};

const inp = "w-full border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] text-[color:var(--ink)] dark:text-[color:var(--ink)] rounded-[3px] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] placeholder:text-[color:var(--ink-muted)]";
const lbl = "block text-xs font-bold text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] uppercase tracking-wider mb-1.5";

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
        <div className="rounded-[4px] border-2 border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[var(--card)] dark:bg-[var(--card)] shadow-sm overflow-hidden mb-6">
            {/* Header */}
            <div className="px-6 py-4 border-b border-[color:var(--line)] dark:border-[color:var(--line)] flex items-center justify-between">
                <div>
                    <p className="text-xs font-bold text-[color:var(--accent)] dark:text-[color:var(--accent)] uppercase tracking-widest mb-0.5">Register Custom Adapter</p>
                    <p className="text-sm text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">Connect your internal API so your agents can call it</p>
                </div>
                <button onClick={onCancel} className="w-8 h-8 rounded-full bg-[var(--bg-deep)] dark:bg-[var(--card)] flex items-center justify-center text-[color:var(--ink-muted)] hover:text-[color:var(--ink-soft)] dark:hover:text-[color:var(--ink)] transition-colors">✕</button>
            </div>

            {/* Step indicator */}
            <div className="flex items-center gap-2 px-6 py-3 border-b border-[color:var(--line)] dark:border-[color:var(--line)]">
                {STEPS.map(({ n, lbl: l }, i) => (
                    <div key={n} className="flex items-center gap-2">
                        {i > 0 && <div className="w-8 h-px bg-[var(--line)] dark:bg-[var(--card)]" />}
                        <div className="flex items-center gap-2">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step === n ? "bg-[var(--accent)] text-[color:var(--ink)]" : step > n ? "bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/40 text-[color:var(--ok)] dark:text-[color:var(--ok)]" : "bg-[var(--bg-deep)] dark:bg-[var(--card)] text-[color:var(--ink-muted)]"}`}>
                                {step > n ? "✓" : n}
                            </div>
                            <span className={`text-xs font-semibold ${step === n ? "text-[color:var(--accent)] dark:text-[color:var(--accent)]" : step > n ? "text-[color:var(--ok)] dark:text-[color:var(--ok)]" : "text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]"}`}>{l}</span>
                        </div>
                    </div>
                ))}
            </div>

            <div className="p-6 space-y-4">
                {/* Step 1 */}
                {step === 1 && (
                    <>
                        <div className="grid grid-cols-2 gap-4">
                            <div><label className={lbl}>Adapter ID <span className="text-[color:var(--danger)]">*</span></label><input value={adapterId} onChange={e => setAdapterId(e.target.value)} className={inp} placeholder="inventory-api" /><p className="text-xs text-[color:var(--ink-muted)] mt-1">Unique ID — lowercase with hyphens</p></div>
                            <div><label className={lbl}>Display Name <span className="text-[color:var(--danger)]">*</span></label><input value={name} onChange={e => setName(e.target.value)} className={inp} placeholder="Inventory API" /></div>
                            <div><label className={lbl}>Type</label><select value={type} onChange={e => setType(e.target.value as AdapterType)} className={inp}>{ADAPTER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
                            <div><label className={lbl}>Version</label><input value={version} onChange={e => setVersion(e.target.value)} className={inp} placeholder="1.0.0" /></div>
                            <div className="col-span-2"><label className={lbl}>Description</label><input value={description} onChange={e => setDescription(e.target.value)} className={inp} placeholder="What does this adapter do? (optional)" /></div>
                        </div>
                        <div className="flex justify-end"><button onClick={() => { if (!adapterId.trim() || !name.trim()) { setError("Adapter ID and Name are required."); return; } setError(null); setStep(2); }} className="px-6 py-2 rounded-full bg-[var(--accent)] hover:bg-[var(--accent)] text-white text-sm font-bold transition-colors">Next: Connection →</button></div>
                    </>
                )}

                {/* Step 2 */}
                {step === 2 && (
                    <>
                        <div><label className={lbl}>API Base URL <span className="text-[color:var(--danger)]">*</span></label><input value={endpointUrl} onChange={e => setEndpointUrl(e.target.value)} type="url" className={inp} placeholder="https://api.yourcompany.com/v1" /><p className="text-xs text-[color:var(--ink-muted)] mt-1">All action paths are appended to this URL</p></div>
                        <div>
                            <label className={lbl}>Authentication</label>
                            <div className="flex gap-2 flex-wrap">
                                {(["none","api_key","bearer_token","basic_auth"] as AuthType[]).map(a => (
                                    <button key={a} type="button" onClick={() => setAuthType(a)} className={`px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors ${authType === a ? "border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/30 text-[color:var(--accent)] dark:text-[color:var(--accent)]" : "border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] hover:border-[color:var(--line)]"}`}>
                                        {a === "none" ? "None" : a === "api_key" ? "API Key" : a === "bearer_token" ? "Bearer Token" : "Basic Auth"}
                                    </button>
                                ))}
                            </div>
                        </div>
                        {authType === "api_key" && <div className="grid grid-cols-3 gap-4"><div><label className={lbl}>Header Name</label><input value={apiKeyHeader} onChange={e => setApiKeyHeader(e.target.value)} className={inp} /></div><div className="col-span-2"><label className={lbl}>API Key <span className="text-[color:var(--danger)]">*</span></label><input value={apiKeyValue} onChange={e => setApiKeyValue(e.target.value)} type="password" className={inp} placeholder="sk-…" /><p className="text-xs text-[color:var(--ink-muted)] mt-1">Stored encrypted — never logged</p></div></div>}
                        {authType === "bearer_token" && <div><label className={lbl}>Bearer Token <span className="text-[color:var(--danger)]">*</span></label><input value={bearerToken} onChange={e => setBearerToken(e.target.value)} type="password" className={inp} /></div>}
                        {authType === "basic_auth" && <div className="grid grid-cols-2 gap-4"><div><label className={lbl}>Username <span className="text-[color:var(--danger)]">*</span></label><input value={basicUser} onChange={e => setBasicUser(e.target.value)} className={inp} /></div><div><label className={lbl}>Password <span className="text-[color:var(--danger)]">*</span></label><input value={basicPass} onChange={e => setBasicPass(e.target.value)} type="password" className={inp} /></div></div>}
                        <div><label className={lbl}>Health Check Path</label><input value={healthPath} onChange={e => setHealthPath(e.target.value)} className={inp} placeholder="/health" /><p className="text-xs text-[color:var(--ink-muted)] mt-1">GET request — expects HTTP 200</p></div>
                        <div className="flex gap-3 justify-end"><button onClick={() => setStep(1)} className="px-4 py-2 rounded-full border border-[color:var(--line)] dark:border-[color:var(--line)] text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)] text-sm hover:bg-[var(--bg-deep)] dark:hover:bg-[var(--card)] transition-colors">← Back</button><button onClick={() => { if (!endpointUrl.trim()) { setError("API Base URL is required."); return; } setError(null); setStep(3); }} className="px-6 py-2 rounded-full bg-[var(--accent)] hover:bg-[var(--accent)] text-white text-sm font-bold transition-colors">Next: Actions →</button></div>
                    </>
                )}

                {/* Step 3 */}
                {step === 3 && (
                    <>
                        <div className="flex items-center justify-between"><div><p className="text-sm font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)]">Define what agents can do</p><p className="text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] mt-0.5">Each action is a typed API call. Skip to register without actions now.</p></div><button onClick={addAction} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)] text-xs font-semibold hover:border-[color:var(--line)] transition-colors"><Plus className="w-3 h-3" />Add action</button></div>
                        <div className="space-y-3">
                            {actions.map((action, i) => (
                                <div key={i} className="rounded-[3px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--bg-deep)] dark:bg-[var(--card)]/50 p-4">
                                    <div className="flex items-center justify-between mb-3"><span className="text-xs font-bold text-[color:var(--ink-muted)] uppercase tracking-wider">Action {i + 1}</span>{actions.length > 1 && <button onClick={() => removeAction(i)} className="text-[color:var(--ink-muted)] dark:text-[color:var(--ink-soft)] hover:text-[color:var(--danger)] transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>}</div>
                                    <div className="grid grid-cols-3 gap-3">
                                        <div><label className={lbl}>Name</label><input value={action.name} onChange={e => updateAction(i, { name: e.target.value })} className={inp} placeholder="get_stock" /></div>
                                        <div><label className={lbl}>Method</label><select value={action.method} onChange={e => updateAction(i, { method: e.target.value as HttpMethod })} className={inp}>{HTTP_METHODS.map(m => <option key={m} value={m}>{m}</option>)}</select></div>
                                        <div><label className={lbl}>Path</label><input value={action.path} onChange={e => updateAction(i, { path: e.target.value })} className={`${inp} font-mono`} placeholder="/inventory/{sku}" /></div>
                                        <div className="col-span-3"><label className={lbl}>What it does</label><input value={action.description} onChange={e => updateAction(i, { description: e.target.value })} className={inp} placeholder="Look up stock level by SKU" /></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="rounded-[3px] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/20 border border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)]/40 px-4 py-3 text-sm text-[color:var(--accent)] dark:text-[color:var(--accent)]">
                            <strong>{name}</strong> · {endpointUrl} · {authType.replace(/_/g, " ")} · {actions.filter(a => a.name.trim()).length} action{actions.filter(a => a.name.trim()).length !== 1 ? "s" : ""}
                        </div>
                        {error && <div className="flex items-center gap-2 text-sm text-[color:var(--danger)] dark:text-[color:var(--danger)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/30 border border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)]/40 rounded-[3px] px-4 py-2"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>}
                        {success && <div className="flex items-center gap-2 text-sm text-[color:var(--ok)] dark:text-[color:var(--ok)] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/30 border border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)]/40 rounded-[3px] px-4 py-2"><CheckCircle2 className="w-4 h-4 shrink-0" />Adapter registered! Agents can now use it.</div>}
                        <div className="flex gap-3 justify-end"><button onClick={() => setStep(2)} className="px-4 py-2 rounded-full border border-[color:var(--line)] dark:border-[color:var(--line)] text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)] text-sm hover:bg-[var(--bg-deep)] transition-colors">← Back</button><button onClick={submit} disabled={saving || success} className="px-6 py-2 rounded-full bg-[var(--accent)] hover:bg-[var(--accent)] disabled:opacity-50 text-white text-sm font-bold transition-colors">{saving ? "Registering…" : success ? "✓ Done" : "Register Adapter"}</button></div>
                    </>
                )}

                {error && step < 3 && <div className="flex items-center gap-2 text-sm text-[color:var(--danger)] dark:text-[color:var(--danger)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/30 border border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)]/40 rounded-[3px] px-4 py-2"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>}
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
                                <Layers className="w-3.5 h-3.5" />
                                Custom APIs
                            </div>
                            <ChevronRight className="w-3.5 h-3.5 text-[color:var(--ink-soft)]" />
                            <span className="text-xs text-[color:var(--ink-muted)]">Adapters</span>
                        </div>
                        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5">
                            <div>
                                <h1 className="text-3xl sm:text-4xl font-extrabold text-[color:var(--ink)] tracking-tight leading-tight">Custom API Adapters</h1>
                                <p className="mt-2 text-[color:var(--ink-soft)] text-base max-w-lg">Register your internal APIs so agents can call them as typed actions.</p>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                                <Link href="/dashboard/integrations" className="text-xs text-[color:var(--ink-muted)] hover:text-[color:var(--ink)] transition-colors">
                                    ← Standard connectors
                                </Link>
                                <button onClick={() => setShowForm(v => !v)} className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-[var(--accent)] hover:bg-[var(--accent)] text-white text-sm font-bold transition-colors">
                                    <Plus className="w-3.5 h-3.5" /> {showForm ? "Cancel" : "+ Register Adapter"}
                                </button>
                            </div>
                        </div>
                    </div>
                </section>

                <div className="space-y-6">

                {/* What is this */}
                {!showForm && adapters.length === 0 && !loading && (
                    <div className="rounded-[4px] border border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)]/40 bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]/50 dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/10 p-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {[
                                { icon: "🏭", title: "Register your API", desc: "Point it at your internal tool's base URL and define how to authenticate." },
                                { icon: "⚡", title: "Define actions", desc: "Tell agents exactly which endpoints they can call and what parameters to send." },
                                { icon: "🤖", title: "Agents use it", desc: "Agents discover the adapter and can invoke its actions just like GitHub or Jira." },
                            ].map(({ icon, title, desc }) => (
                                <div key={title} className="flex gap-3">
                                    <span className="text-2xl">{icon}</span>
                                    <div>
                                        <p className="text-sm font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)]">{title}</p>
                                        <p className="text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] mt-0.5 leading-relaxed">{desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <button onClick={() => setShowForm(true)} className="mt-5 flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-[var(--accent)] hover:bg-[var(--accent)] text-white text-sm font-bold transition-colors">
                            <Plus className="w-3.5 h-3.5" /> Register your first adapter
                        </button>
                    </div>
                )}

                {/* Form */}
                {showForm && <RegisterForm onSave={save} onCancel={() => { setShowForm(false); void load(); }} />}

                {/* List */}
                {error && <div className="flex items-center gap-2 text-sm text-[color:var(--danger)] dark:text-[color:var(--danger)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/30 border border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)] rounded-[3px] px-4 py-3"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>}

                {loading && <div className="space-y-3">{[1,2].map(i => <div key={i} className="h-20 rounded-[4px] bg-[var(--line)] dark:bg-[var(--card)] animate-pulse" />)}</div>}

                {!loading && adapters.length > 0 && (
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-sm font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)] uppercase tracking-wide">
                                Registered Adapters <span className="font-normal text-[color:var(--ink-muted)] normal-case">({adapters.length})</span>
                            </h2>
                            <button onClick={load} className="flex items-center gap-1.5 text-xs text-[color:var(--ink-muted)] hover:text-[color:var(--ink-soft)] transition-colors"><RefreshCw className="w-3 h-3" />Refresh</button>
                        </div>
                        <div className="space-y-3">
                            {adapters.map(adapter => {
                                const pingResult = pingResults[adapter.adapter_id];
                                const isExp = expanded === adapter.adapter_id;
                                return (
                                    <div key={adapter.adapter_id} className="rounded-[4px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] overflow-hidden shadow-sm">
                                        <div className="p-4 flex items-start gap-3">
                                            <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${adapter.status === "active" ? "bg-[var(--ok)]" : adapter.status === "error" ? "bg-[var(--danger)]" : "bg-[var(--bg-deep)]"}`} />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                                    <p className="font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)] text-sm">{adapter.name}</p>
                                                    <span className="text-[10px] font-bold uppercase tracking-wide text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] bg-[var(--bg-deep)] dark:bg-[var(--card)] rounded-full px-2 py-0.5">{adapter.type.replace(/_/g, " ")}</span>
                                                    {adapter.version && <span className="text-[10px] text-[color:var(--ink-muted)]">v{adapter.version}</span>}
                                                </div>
                                                <p className="text-xs font-mono text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">{adapter.adapter_id}</p>
                                                {adapter.endpoint_url && <p className="text-xs text-[color:var(--accent)] dark:text-[color:var(--accent)] mt-1">{adapter.endpoint_url}</p>}
                                                {pingResult && <p className={`text-xs mt-1 flex items-center gap-1 ${pingResult.ok ? "text-[color:var(--ok)] dark:text-[color:var(--ok)]" : "text-[color:var(--danger)] dark:text-[color:var(--danger)]"}`}>{pingResult.ok ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}{pingResult.ok ? `Healthy · ${pingResult.ms}ms` : "Unreachable"}</p>}
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                {adapter.actions && adapter.actions.length > 0 && (
                                                    <button onClick={() => setExpanded(isExp ? null : adapter.adapter_id)} className="flex items-center gap-1 text-xs border border-[color:var(--line)] dark:border-[color:var(--line)] text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)] rounded-[3px] px-2.5 py-1.5 hover:bg-[var(--bg-deep)] dark:hover:bg-[var(--card)] transition-colors font-medium">
                                                        {adapter.actions.length} actions {isExp ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                                    </button>
                                                )}
                                                <button onClick={() => ping(adapter).catch(() => {})} disabled={pinging[adapter.adapter_id]} className="flex items-center gap-1 text-xs border border-[color:var(--line)] dark:border-[color:var(--line)] text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)] rounded-[3px] px-2.5 py-1.5 hover:bg-[var(--bg-deep)] dark:hover:bg-[var(--card)] disabled:opacity-50 transition-colors font-medium">
                                                    <Zap className="w-3 h-3" />{pinging[adapter.adapter_id] ? "…" : "Ping"}
                                                </button>
                                                <button onClick={() => void remove(adapter.adapter_id, adapter.name)} className="flex items-center gap-1 text-xs border border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)] text-[color:var(--danger)] dark:text-[color:var(--danger)] rounded-[3px] px-2.5 py-1.5 hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] dark:hover:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/20 transition-colors font-medium">
                                                    <Trash2 className="w-3 h-3" />
                                                </button>
                                            </div>
                                        </div>
                                        {isExp && adapter.actions && (
                                            <div className="border-t border-[color:var(--line)] dark:border-[color:var(--line)] px-4 py-3 bg-[var(--bg-deep)] dark:bg-[var(--card)]/50">
                                                <p className="text-[10px] font-bold text-[color:var(--ink-muted)] uppercase tracking-widest mb-2">Actions your agents can call</p>
                                                <div className="space-y-1.5">
                                                    {adapter.actions.map((a, i) => (
                                                        <div key={i} className="flex items-center gap-2 flex-wrap">
                                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded font-mono ${METHOD_COLORS[a.method]}`}>{a.method}</span>
                                                            <span className="text-xs font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)] font-mono">{a.name}</span>
                                                            <span className="text-xs text-[color:var(--ink-muted)] font-mono">{a.path}</span>
                                                            {a.description && <span className="text-xs text-[color:var(--ink-muted)]">— {a.description}</span>}
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
