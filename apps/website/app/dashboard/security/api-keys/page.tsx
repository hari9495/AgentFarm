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
    viewer: "bg-[var(--bg-deep)] dark:bg-[var(--card)] text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]",
    operator: "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/30 text-[color:var(--accent)] dark:text-[color:var(--accent)]",
    admin: "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/30 text-[color:var(--accent)] dark:text-[color:var(--accent)]",
};

function formatDate(iso: string | null): string {
    if (!iso) return "Never";
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const inputClass =
    "w-full rounded-[3px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] px-3 py-2 text-sm text-[color:var(--ink)] dark:text-[color:var(--ink)] placeholder:text-[color:var(--ink-muted)] focus:outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--accent)_40%,transparent)]/40";

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
        <div className="min-h-screen bg-[var(--bg-deep)] dark:bg-[var(--bg)]">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 py-6 space-y-6">

                <section className="relative overflow-hidden rounded-[4px] border border-[color:var(--line)] bg-gradient-to-br from-[color-mix(in_srgb,var(--accent)_8%,transparent)] via-[var(--card)] to-[var(--card)]">
                    <div className="absolute inset-0 pointer-events-none">
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_80%_at_0%_0%,rgba(167,139,250,0.16)_0%,transparent_60%)]" />
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_70%_at_100%_100%,rgba(56,189,248,0.12)_0%,transparent_60%)]" />
                    </div>
                    <div className="relative px-6 sm:px-8 py-6 sm:py-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5">
                        <div>
                            <div className="flex items-center gap-2 rounded-[3px] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-[color:var(--accent)] w-fit mb-4">
                                <PremiumIcon icon={KeyRound} tone="violet" containerClassName="w-4 h-4 rounded bg-[var(--accent)]/20 text-[color:var(--accent)]" iconClassName="w-2.5 h-2.5" />
                                API Keys
                            </div>
                            <h1 className="text-3xl sm:text-4xl font-extrabold text-[color:var(--ink)] tracking-tight leading-tight">Programmatic access</h1>
                            <p className="mt-2 text-[color:var(--ink-soft)] text-base max-w-lg">
                                Generate scoped API keys to call AgentFarms from your own scripts and integrations. Keys inherit a role that limits what they can do.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => { setShowForm((v) => !v); setMintedKey(null); }}
                            className="inline-flex items-center gap-2 rounded-[3px] bg-[var(--card)] text-[color:var(--ink)] text-sm font-bold px-4 py-2.5 hover:bg-[var(--bg-deep)] transition-colors shrink-0"
                        >
                            <Plus className="w-4 h-4" />
                            New key
                        </button>
                    </div>
                </section>

                {mintedKey && (
                    <div className="rounded-[4px] border border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)]/40 bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/20 p-5 space-y-3">
                        <p className="text-sm font-bold text-[color:var(--ok)] dark:text-[color:var(--ok)]">"{mintedKey.name}" created — copy this key now</p>
                        <p className="text-xs text-[color:var(--ok)]/80 dark:text-[color:var(--ok)]/80">
                            For your security, we only show the full key once. Store it somewhere safe — you'll need to create a new key if you lose this one.
                        </p>
                        <div className="flex items-center gap-2">
                            <code className="flex-1 rounded-[3px] bg-[var(--card)] dark:bg-[var(--card)] border border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)]/40 px-3 py-2 text-xs font-mono text-[color:var(--ink-soft)] dark:text-[color:var(--ink)] overflow-x-auto whitespace-nowrap">
                                {mintedKey.rawKey}
                            </code>
                            <button type="button" onClick={copyMintedKey} className="inline-flex items-center gap-1.5 rounded-[3px] bg-[var(--ok)] text-white text-xs font-bold px-3 py-2 hover:bg-[var(--ok)] transition-colors shrink-0">
                                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                {copied ? "Copied" : "Copy"}
                            </button>
                        </div>
                        <button type="button" onClick={() => setMintedKey(null)} className="text-xs font-semibold text-[color:var(--ok)] dark:text-[color:var(--ok)] hover:underline">
                            I've saved it — dismiss
                        </button>
                    </div>
                )}

                {showForm && (
                    <form onSubmit={handleCreate} className="rounded-[4px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] p-5 space-y-4">
                        <h2 className="text-sm font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)]">Create a new API key</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] mb-1.5">Name *</label>
                                <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Reporting script" required />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] mb-1.5">Role</label>
                                <select className={inputClass} value={role} onChange={(e) => setRole(e.target.value as ApiKeyRole)}>
                                    {ROLES.map((r) => (
                                        <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <p className="text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">
                            Viewer keys can read data only. Operator keys can take actions. Admin keys can manage your workspace — issue these sparingly.
                        </p>
                        {createError && (
                            <p className="text-xs text-[color:var(--danger)] dark:text-[color:var(--danger)] flex items-center gap-1.5">
                                <AlertTriangle className="w-3.5 h-3.5" /> {createError}
                            </p>
                        )}
                        <div className="flex items-center gap-3">
                            <button type="submit" disabled={creating} className="rounded-[3px] bg-[var(--accent)] dark:bg-[var(--card)] text-[color:var(--ink)] dark:text-[color:var(--ink)] text-sm font-bold px-4 py-2 disabled:opacity-60">
                                {creating ? "Creating…" : "Create key"}
                            </button>
                            <button type="button" onClick={() => setShowForm(false)} className="text-sm font-medium text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] hover:text-[color:var(--ink-soft)] dark:hover:text-[color:var(--ink)]">
                                Cancel
                            </button>
                        </div>
                    </form>
                )}

                <div className="rounded-[4px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] overflow-hidden">
                    <div className="px-5 py-4 border-b border-[color:var(--line)] dark:border-[color:var(--line)] flex items-center justify-between">
                        <h2 className="text-base font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)]">Your API keys</h2>
                        <button type="button" onClick={() => void load()} className="inline-flex items-center gap-1.5 text-xs font-semibold text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] hover:text-[color:var(--ink-soft)] dark:hover:text-[color:var(--ink)]">
                            <RefreshCw className="w-3.5 h-3.5" /> Refresh
                        </button>
                    </div>

                    {actionError && (
                        <div className="mx-5 mt-4 rounded-[3px] border border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)]/40 bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/20 px-3 py-2 text-xs text-[color:var(--danger)] dark:text-[color:var(--danger)]">
                            {actionError}
                        </div>
                    )}

                    {loadState === "loading" && (
                        <div className="px-5 py-10 text-center text-sm text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">Loading your API keys…</div>
                    )}
                    {loadState === "error" && (
                        <div className="px-5 py-10 text-center text-sm text-[color:var(--danger)] dark:text-[color:var(--danger)]">
                            We couldn't load your API keys right now. Try refreshing.
                        </div>
                    )}
                    {loadState === "ready" && keys.length === 0 && (
                        <div className="px-5 py-10 text-center text-sm text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">
                            No API keys yet. Create one to call AgentFarms from your own scripts and integrations.
                        </div>
                    )}
                    {loadState === "ready" && keys.length > 0 && (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm min-w-[680px]">
                                <thead>
                                    <tr className="bg-[var(--bg-deep)] dark:bg-[var(--card)]/50 text-xs font-semibold uppercase tracking-wide text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">
                                        <th className="text-left px-5 py-3">Name</th>
                                        <th className="text-left px-4 py-3">Key</th>
                                        <th className="text-left px-4 py-3">Role</th>
                                        <th className="text-left px-4 py-3">Status</th>
                                        <th className="text-left px-4 py-3">Last used</th>
                                        <th className="px-4 py-3" />
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[color:var(--line)] dark:divide-[color:var(--line)]/70">
                                    {keys.map((key) => (
                                        <tr key={key.id} className="hover:bg-[var(--bg-deep)] dark:hover:bg-[var(--card)]/40 transition-colors">
                                            <td className="px-5 py-3.5">
                                                <div className="flex items-center gap-2">
                                                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/40 text-[color:var(--accent)] dark:text-[color:var(--accent)] shrink-0">
                                                        <KeyRound className="w-3.5 h-3.5" />
                                                    </span>
                                                    <span className="font-semibold text-[color:var(--ink)] dark:text-[color:var(--ink)]">{key.name}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3.5">
                                                <code className="text-xs font-mono text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">{key.keyPrefix}…</code>
                                            </td>
                                            <td className="px-4 py-3.5">
                                                <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${ROLE_BADGE[key.role]}`}>{key.role}</span>
                                            </td>
                                            <td className="px-4 py-3.5">
                                                {key.enabled ? (
                                                    <span className="text-xs font-semibold rounded-full px-2 py-0.5 bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/30 text-[color:var(--ok)] dark:text-[color:var(--ok)]">Active</span>
                                                ) : (
                                                    <span className="text-xs font-semibold rounded-full px-2 py-0.5 bg-[var(--bg-deep)] dark:bg-[var(--card)] text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">Disabled</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3.5 text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">{formatDate(key.lastUsedAt)}</td>
                                            <td className="px-4 py-3.5">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    <button
                                                        type="button"
                                                        disabled={busyId === key.id}
                                                        onClick={() => void handleToggle(key)}
                                                        title={key.enabled ? "Disable key" : "Enable key"}
                                                        className="inline-flex items-center gap-1 rounded-[3px] border border-[color:var(--line)] dark:border-[color:var(--line)] px-2.5 py-1.5 text-xs font-semibold text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)] hover:bg-[var(--bg-deep)] dark:hover:bg-[var(--card)] transition-colors disabled:opacity-50"
                                                    >
                                                        <ShieldOff className="w-3.5 h-3.5" />
                                                        {key.enabled ? "Disable" : "Enable"}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        disabled={busyId === key.id}
                                                        onClick={() => void handleDelete(key)}
                                                        title="Revoke key"
                                                        className="inline-flex items-center gap-1 rounded-[3px] border border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)]/40 px-2.5 py-1.5 text-xs font-semibold text-[color:var(--danger)] dark:text-[color:var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] dark:hover:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/20 transition-colors disabled:opacity-50"
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
