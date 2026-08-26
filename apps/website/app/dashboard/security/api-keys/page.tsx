"use client";

import { useCallback, useEffect, useState } from "react";
import {
    AlertTriangle,
    Check,
    Copy,
    KeyRound,
    Plus,
    RefreshCw,
    ShieldOff,
    Trash2,
} from "lucide-react";
import PremiumIcon from "@/components/shared/PremiumIcon";

type ApiKeyRole = "viewer" | "operator" | "admin";

type ApiKey = {
    id: string;
    name: string;
    keyPrefix: string;
    scopes: string[];
    role: ApiKeyRole;
    enabled: boolean;
    expiresAt: string | null;
    lastUsedAt: string | null;
    createdAt: string;
    createdBy: string;
};

const ROLES: ApiKeyRole[] = ["viewer", "operator", "admin"];

const ROLE_BADGE: Record<ApiKeyRole, string> = {
    viewer: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300",
    operator: "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400",
    admin: "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400",
};

function formatDate(iso: string | null): string {
    if (!iso) return "Never";
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const inputClass =
    "w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40";

export default function ApiKeysPage() {
    const [keys, setKeys] = useState<ApiKey[]>([]);
    const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
    const [actionError, setActionError] = useState<string | null>(null);

    const [showForm, setShowForm] = useState(false);
    const [name, setName] = useState("");
    const [role, setRole] = useState<ApiKeyRole>("viewer");
    const [creating, setCreating] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);
    const [mintedKey, setMintedKey] = useState<{ rawKey: string; name: string } | null>(null);
    const [copied, setCopied] = useState(false);

    const [busyId, setBusyId] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoadState("loading");
        try {
            const res = await fetch("/api/security/api-keys", { credentials: "include" });
            if (!res.ok) throw new Error("failed");
            const data = (await res.json()) as { keys?: ApiKey[] };
            setKeys(data.keys ?? []);
            setLoadState("ready");
        } catch {
            setLoadState("error");
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    async function handleCreate(e: React.FormEvent) {
        e.preventDefault();
        if (!name.trim()) {
            setCreateError("Give this key a name so you can recognize it later.");
            return;
        }
        setCreating(true);
        setCreateError(null);
        try {
            const res = await fetch("/api/security/api-keys", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: name.trim(), role }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                if (res.status === 403) {
                    throw new Error("Your account doesn't have permission to create API keys. An operator or admin on your team can do this.");
                }
                throw new Error(typeof data?.error === "string" ? data.error : "Unable to create this key right now.");
            }
            setMintedKey({ rawKey: data.rawKey as string, name: name.trim() });
            setName("");
            setRole("viewer");
            setShowForm(false);
            await load();
        } catch (err) {
            setCreateError(err instanceof Error ? err.message : "Unable to create this key right now.");
        } finally {
            setCreating(false);
        }
    }

    async function handleToggle(key: ApiKey) {
        setBusyId(key.id);
        setActionError(null);
        try {
            const res = await fetch(`/api/security/api-keys/${encodeURIComponent(key.id)}`, {
                method: "PATCH",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ enabled: !key.enabled }),
            });
            if (!res.ok) {
                if (res.status === 403) throw new Error("Your account doesn't have permission to manage API keys.");
                throw new Error("Unable to update this key right now.");
            }
            setKeys((prev) => prev.map((k) => (k.id === key.id ? { ...k, enabled: !k.enabled } : k)));
        } catch (err) {
            setActionError(err instanceof Error ? err.message : "Unable to update this key right now.");
        } finally {
            setBusyId(null);
        }
    }

    async function handleDelete(key: ApiKey) {
        if (!confirm(`Revoke "${key.name}"? Anything using this key will stop working immediately.`)) return;
        setBusyId(key.id);
        setActionError(null);
        try {
            const res = await fetch(`/api/security/api-keys/${encodeURIComponent(key.id)}`, {
                method: "DELETE",
                credentials: "include",
            });
            if (!res.ok) {
                if (res.status === 403) throw new Error("Your account doesn't have permission to revoke API keys — this requires an admin.");
                throw new Error("Unable to revoke this key right now.");
            }
            setKeys((prev) => prev.filter((k) => k.id !== key.id));
        } catch (err) {
            setActionError(err instanceof Error ? err.message : "Unable to revoke this key right now.");
        } finally {
            setBusyId(null);
        }
    }

    function copyMintedKey() {
        if (!mintedKey) return;
        void navigator.clipboard.writeText(mintedKey.rawKey).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 py-6 space-y-6">

                <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-blue-50 via-white to-white">
                    <div className="absolute inset-0 pointer-events-none">
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_80%_at_0%_0%,rgba(167,139,250,0.16)_0%,transparent_60%)]" />
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_70%_at_100%_100%,rgba(56,189,248,0.12)_0%,transparent_60%)]" />
                    </div>
                    <div className="relative px-6 sm:px-8 py-6 sm:py-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5">
                        <div>
                            <div className="flex items-center gap-2 rounded-xl bg-blue-50 border border-blue-200 px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-blue-300 w-fit mb-4">
                                <PremiumIcon icon={KeyRound} tone="violet" containerClassName="w-4 h-4 rounded bg-blue-400/20 text-blue-300" iconClassName="w-2.5 h-2.5" />
                                API Keys
                            </div>
                            <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight leading-tight">Programmatic access</h1>
                            <p className="mt-2 text-slate-600 text-base max-w-lg">
                                Generate scoped API keys to call AgentFarms from your own scripts and integrations. Keys inherit a role that limits what they can do.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => { setShowForm((v) => !v); setMintedKey(null); }}
                            className="inline-flex items-center gap-2 rounded-xl bg-white text-slate-900 text-sm font-bold px-4 py-2.5 hover:bg-slate-100 transition-colors shrink-0"
                        >
                            <Plus className="w-4 h-4" />
                            New key
                        </button>
                    </div>
                </section>

                {mintedKey && (
                    <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-950/20 p-5 space-y-3">
                        <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300">"{mintedKey.name}" created — copy this key now</p>
                        <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80">
                            For your security, we only show the full key once. Store it somewhere safe — you'll need to create a new key if you lose this one.
                        </p>
                        <div className="flex items-center gap-2">
                            <code className="flex-1 rounded-lg bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-900/40 px-3 py-2 text-xs font-mono text-slate-700 dark:text-slate-200 overflow-x-auto whitespace-nowrap">
                                {mintedKey.rawKey}
                            </code>
                            <button type="button" onClick={copyMintedKey} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold px-3 py-2 hover:bg-emerald-700 transition-colors shrink-0">
                                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                {copied ? "Copied" : "Copy"}
                            </button>
                        </div>
                        <button type="button" onClick={() => setMintedKey(null)} className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline">
                            I've saved it — dismiss
                        </button>
                    </div>
                )}

                {showForm && (
                    <form onSubmit={handleCreate} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
                        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Create a new API key</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">Name *</label>
                                <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Reporting script" required />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">Role</label>
                                <select className={inputClass} value={role} onChange={(e) => setRole(e.target.value as ApiKeyRole)}>
                                    {ROLES.map((r) => (
                                        <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <p className="text-xs text-slate-400 dark:text-slate-500">
                            Viewer keys can read data only. Operator keys can take actions. Admin keys can manage your workspace — issue these sparingly.
                        </p>
                        {createError && (
                            <p className="text-xs text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                                <AlertTriangle className="w-3.5 h-3.5" /> {createError}
                            </p>
                        )}
                        <div className="flex items-center gap-3">
                            <button type="submit" disabled={creating} className="rounded-lg bg-blue-600 dark:bg-white text-white dark:text-slate-900 text-sm font-bold px-4 py-2 disabled:opacity-60">
                                {creating ? "Creating…" : "Create key"}
                            </button>
                            <button type="button" onClick={() => setShowForm(false)} className="text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
                                Cancel
                            </button>
                        </div>
                    </form>
                )}

                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Your API keys</h2>
                        <button type="button" onClick={() => void load()} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
                            <RefreshCw className="w-3.5 h-3.5" /> Refresh
                        </button>
                    </div>

                    {actionError && (
                        <div className="mx-5 mt-4 rounded-lg border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/20 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
                            {actionError}
                        </div>
                    )}

                    {loadState === "loading" && (
                        <div className="px-5 py-10 text-center text-sm text-slate-400 dark:text-slate-500">Loading your API keys…</div>
                    )}
                    {loadState === "error" && (
                        <div className="px-5 py-10 text-center text-sm text-rose-600 dark:text-rose-400">
                            We couldn't load your API keys right now. Try refreshing.
                        </div>
                    )}
                    {loadState === "ready" && keys.length === 0 && (
                        <div className="px-5 py-10 text-center text-sm text-slate-400 dark:text-slate-500">
                            No API keys yet. Create one to call AgentFarms from your own scripts and integrations.
                        </div>
                    )}
                    {loadState === "ready" && keys.length > 0 && (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm min-w-[680px]">
                                <thead>
                                    <tr className="bg-slate-50 dark:bg-slate-800/50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                        <th className="text-left px-5 py-3">Name</th>
                                        <th className="text-left px-4 py-3">Key</th>
                                        <th className="text-left px-4 py-3">Role</th>
                                        <th className="text-left px-4 py-3">Status</th>
                                        <th className="text-left px-4 py-3">Last used</th>
                                        <th className="px-4 py-3" />
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                                    {keys.map((key) => (
                                        <tr key={key.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                            <td className="px-5 py-3.5">
                                                <div className="flex items-center gap-2">
                                                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 shrink-0">
                                                        <KeyRound className="w-3.5 h-3.5" />
                                                    </span>
                                                    <span className="font-semibold text-slate-800 dark:text-slate-100">{key.name}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3.5">
                                                <code className="text-xs font-mono text-slate-500 dark:text-slate-400">{key.keyPrefix}…</code>
                                            </td>
                                            <td className="px-4 py-3.5">
                                                <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${ROLE_BADGE[key.role]}`}>{key.role}</span>
                                            </td>
                                            <td className="px-4 py-3.5">
                                                {key.enabled ? (
                                                    <span className="text-xs font-semibold rounded-full px-2 py-0.5 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400">Active</span>
                                                ) : (
                                                    <span className="text-xs font-semibold rounded-full px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">Disabled</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3.5 text-xs text-slate-500 dark:text-slate-400">{formatDate(key.lastUsedAt)}</td>
                                            <td className="px-4 py-3.5">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    <button
                                                        type="button"
                                                        disabled={busyId === key.id}
                                                        onClick={() => void handleToggle(key)}
                                                        title={key.enabled ? "Disable key" : "Enable key"}
                                                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
                                                    >
                                                        <ShieldOff className="w-3.5 h-3.5" />
                                                        {key.enabled ? "Disable" : "Enable"}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        disabled={busyId === key.id}
                                                        onClick={() => void handleDelete(key)}
                                                        title="Revoke key"
                                                        className="inline-flex items-center gap-1 rounded-lg border border-rose-200 dark:border-rose-900/40 px-2.5 py-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors disabled:opacity-50"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                        Revoke
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
