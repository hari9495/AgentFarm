"use client";

import { useState, useEffect } from "react";

// ── Types (mirrors connector-contracts, safe to duplicate for client) ──────
type ConnectorCategory = "task_tracker" | "messaging" | "code" | "email";
type ConnectorAuthMethod = "oauth2" | "api_key" | "bearer_token" | "basic" | "generic_rest";
type ConnectorStatus = "connected" | "disconnected" | "error" | "pending_auth";

interface ConfigField {
    key: string;
    label: string;
    type: "text" | "password" | "url" | "select";
    required: boolean;
    placeholder?: string;
    options?: { value: string; label: string }[];
    hint?: string;
}

interface AvailableConnector {
    tool: string;
    category: ConnectorCategory;
    displayName: string;
    logoUrl: string;
    authMethod: ConnectorAuthMethod;
    supportedActions: string[];
    docsUrl: string;
    configSchema: ConfigField[] | null;
    oauthScopes: string[] | null;
    connected: boolean;
}

interface WorkspaceBotOption {
    workspaceId: string;
    workspaceName: string;
    roleType: string;
    botId: string;
    botName: string;
    botStatus: string;
    policyPackVersion: string;
}

interface ConnectorContext {
    selectedWorkspaceId: string;
    selectedBotId: string;
    selectedRoleKey: string;
    selectedPolicyPackVersion: string;
    scope_model?: string;
    disallowed_tools_hidden_count: number;
    options: WorkspaceBotOption[];
}

interface ConfiguredConnector {
    connectorId: string;
    tool: string;
    category: ConnectorCategory;
    displayName: string;
    status: ConnectorStatus;
    authMethod: ConnectorAuthMethod;
    lastHealthcheckAt: string | null;
    lastErrorClass: string | null;
}

interface HealthCheckResult {
    healthy: boolean;
    message?: string;
    nextStep?: { oauthInitUrl?: string } | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────
const CATEGORY_LABELS: Record<ConnectorCategory, string> = {
    task_tracker: "Task Trackers",
    messaging: "Messaging",
    code: "Code & Version Control",
    email: "Email",
};

const CATEGORY_ORDER: ConnectorCategory[] = ["task_tracker", "messaging", "code", "email"];

const STATUS_COLORS: Record<ConnectorStatus, string> = {
    connected: "bg-[var(--accent-green)]/10 text-[var(--accent-green)]",
    pending_auth: "bg-amber-400/10 text-amber-400",
    error: "bg-rose-500/10 text-rose-400",
    disconnected: "bg-[var(--surface-el)] text-[var(--ash)]",
};

const STATUS_LABELS: Record<ConnectorStatus, string> = {
    connected: "Connected",
    pending_auth: "Auth Required",
    error: "Error",
    disconnected: "Disconnected",
};

function ConnectorIcon({ tool, size = 32 }: { tool: string; size?: number }) {
    // Simple emoji fallback per tool until real SVGs are served
    const icons: Record<string, string> = {
        jira: "🔷", linear: "🔵", asana: "🟠", monday: "🟣", trello: "🃏", clickup: "🟡",
        teams: "💬", slack: "💚", discord: "🎮", google_chat: "💭",
        github: "⬛", gitlab: "🟠", bitbucket: "🔵", azure_devops: "🔷",
        outlook: "📧", gmail: "📬", exchange: "📮",
        generic_rest: "🔌", generic_rest_messaging: "🔌", generic_rest_code: "🔌", generic_rest_email: "🔌", generic_smtp: "📨",
    };
    return (
        <span style={{ fontSize: size * 0.7 }} className="inline-flex items-center justify-center" aria-hidden>
            {icons[tool] ?? "🔌"}
        </span>
    );
}

// ── Add Connector Modal ────────────────────────────────────────────────────
function AddConnectorModal({
    connector,
    workspaceId,
    botId,
    onClose,
    onAdded,
}: {
    connector: AvailableConnector;
    workspaceId: string | null;
    botId: string | null;
    onClose: () => void;
    onAdded: () => void;
}) {
    const [displayName, setDisplayName] = useState(connector.displayName);
    const [configValues, setConfigValues] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fields = connector.configSchema ?? [];

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/connectors", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    tool: connector.tool,
                    displayName,
                    configValues,
                    workspaceId,
                    botId,
                }),
            });
            const json = await res.json() as { error?: string; nextStep?: { action: string; oauthUrl?: string } };
            if (!res.ok) {
                setError(json.error ?? "Failed to add connector.");
                return;
            }
            if (json.nextStep?.action === "oauth" && typeof json.nextStep.oauthUrl === "string") {
                window.location.href = json.nextStep.oauthUrl;
                return;
            }
            onAdded();
            onClose();
        } catch {
            setError("Network error. Please try again.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-[var(--surface-card)] rounded-xl shadow-xl w-full max-w-lg border border-[var(--hairline)]">
                {/* Header */}
                <div className="flex items-center gap-3 p-5 border-b border-[var(--hairline)]">
                    <ConnectorIcon tool={connector.tool} size={36} />
                    <div>
                        <h2 className="text-lg font-semibold text-[var(--ink)]">Connect {connector.displayName}</h2>
                        <p className="text-sm text-[var(--mute)] capitalize">{connector.category.replace("_", " ")}</p>
                    </div>
                    <button onClick={onClose} className="ml-auto text-[var(--ash)] hover:text-[var(--ink)] text-xl font-bold" aria-label="Close">×</button>
                </div>

                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    {/* Display name */}
                    <div>
                        <label className="block text-sm font-medium text-[var(--body-color)] mb-1">
                            Display Name
                        </label>
                        <input
                            type="text"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            className="w-full border border-[var(--hairline)] bg-[var(--surface-el)] text-[var(--ink)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent-blue)]"
                            placeholder="e.g. Our Jira, Engineering Slack"
                        />
                        <p className="text-xs text-[var(--ash)] mt-1">The name your team will see in the dashboard.</p>
                    </div>

                    {/* OAuth info block */}
                    {connector.authMethod === "oauth2" && (
                        <div className="rounded-lg border border-[var(--accent-blue)]/20 bg-[var(--accent-blue)]/5 p-4 text-sm text-[var(--accent-blue)]">
                            <p className="font-medium mb-1">OAuth 2.0 Authentication</p>
                            <p className="text-xs text-blue-700">
                                After clicking Add, you'll be redirected to {connector.displayName} to authorize access.
                                We request only the permissions your agent needs:
                            </p>
                            {connector.oauthScopes && (
                                <ul className="mt-2 text-xs text-[var(--accent-blue)]/80 space-y-0.5">
                                    {connector.oauthScopes.map((s) => (
                                        <li key={s} className="font-mono bg-[var(--accent-blue)]/10 rounded px-1">• {s}</li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}

                    {/* API key / generic_rest config fields */}
                    {fields.map((field) => (
                        <div key={field.key}>
                            <label className="block text-sm font-medium text-[var(--body-color)] mb-1">
                                {field.label}
                                {field.required && <span className="text-red-500 ml-1">*</span>}
                            </label>
                            {field.type === "select" ? (
                                <select
                                    value={configValues[field.key] ?? ""}
                                    onChange={(e) => setConfigValues((v) => ({ ...v, [field.key]: e.target.value }))}
                                    className="w-full border border-[var(--hairline)] bg-[var(--surface-el)] text-[var(--ink)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent-blue)]"
                                    required={field.required}
                                >
                                    <option value="">Select...</option>
                                    {field.options?.map((o) => (
                                        <option key={o.value} value={o.value}>{o.label}</option>
                                    ))}
                                </select>
                            ) : (
                                <input
                                    type={field.type === "password" ? "password" : field.type === "url" ? "url" : "text"}
                                    value={configValues[field.key] ?? ""}
                                    onChange={(e) => setConfigValues((v) => ({ ...v, [field.key]: e.target.value }))}
                                    className="w-full border border-[var(--hairline)] bg-[var(--surface-el)] text-[var(--ink)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent-blue)]"
                                    placeholder={field.placeholder}
                                    required={field.required}
                                />
                            )}
                            {field.hint && <p className="text-xs text-[var(--ash)] mt-1">{field.hint}</p>}
                        </div>
                    ))}

                    {/* Supported actions */}
                    <div>
                        <p className="text-xs font-medium text-[var(--ash)] uppercase tracking-wide mb-1">
                            Your agent will be able to:
                        </p>
                        <div className="flex flex-wrap gap-1">
                            {connector.supportedActions.map((a) => (
                                <span key={a} className="bg-[var(--surface-el)] text-[var(--mute)] rounded-full px-2 py-0.5 text-xs font-mono">
                                    {a}
                                </span>
                            ))}
                        </div>
                    </div>

                    {error && (
                        <p className="text-sm text-rose-400 bg-rose-500/10 rounded-lg px-3 py-2">{error}</p>
                    )}

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 border border-[var(--hairline)] text-[var(--body-color)] rounded-lg px-4 py-2 text-sm hover:bg-[var(--surface-el)] transition"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 bg-[var(--accent-blue)] text-[#07080a] rounded-lg px-4 py-2 text-sm font-medium hover:bg-[#8dd7ff] disabled:opacity-50 transition"
                        >
                            {loading ? "Connecting..." : connector.authMethod === "oauth2" ? "Continue to Auth" : "Add Connector"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ── Configured Connector Card ──────────────────────────────────────────────
function ConnectorCard({
    connector,
    onRemove,
    onHealthCheck,
}: {
    connector: ConfiguredConnector;
    onRemove: () => void;
    onHealthCheck: () => Promise<HealthCheckResult>;
}) {
    const [checking, setChecking] = useState(true);
    const [healthResult, setHealthResult] = useState<HealthCheckResult | null>(null);

    useEffect(() => {
        let cancelled = false;
        fetch(`/api/connectors/${connector.connectorId}/health`, { method: "POST" })
            .then((r) => r.json() as Promise<HealthCheckResult>)
            .then((result) => { if (!cancelled) { setHealthResult(result); setChecking(false); } })
            .catch(() => { if (!cancelled) { setChecking(false); } });
        return () => { cancelled = true; };
    }, [connector.connectorId]);

    async function runHealthCheck() {
        setChecking(true);
        const result = await onHealthCheck();
        setHealthResult(result);
        setChecking(false);
        if (result.healthy) {
            setTimeout(() => setHealthResult(null), 3000);
        }
    }

    return (
        <div className="bg-[var(--surface-card)] rounded-xl border border-[var(--hairline)] p-4 flex items-center gap-4 hover:shadow-sm transition">
            <ConnectorIcon tool={connector.tool} size={40} />
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <p className="font-medium text-[var(--ink)] text-sm truncate">{connector.displayName}</p>
                    {checking ? (
                        <span className="text-xs rounded-full px-2 py-0.5 font-medium bg-[var(--surface-el)] text-[var(--ash)]">
                            ⬤ Checking...
                        </span>
                    ) : healthResult !== null ? (
                        <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${healthResult.healthy ? "bg-[var(--accent-green)]/10 text-[var(--accent-green)]" : "bg-rose-500/10 text-rose-400"}`}>
                            {healthResult.healthy ? "⬤ Healthy" : "⬤ Degraded"}
                        </span>
                    ) : (
                        <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${STATUS_COLORS[connector.status]}`}>
                            {STATUS_LABELS[connector.status]}
                        </span>
                    )}
                </div>
                <p className="text-xs text-[var(--ash)] mt-0.5 capitalize">{connector.category.replace("_", " ")} · {connector.authMethod.replace("_", " ")}</p>
                {connector.lastHealthcheckAt && (
                    <p className="text-xs text-[var(--ash)]">
                        Last checked: {new Date(connector.lastHealthcheckAt).toLocaleString()}
                    </p>
                )}
                {connector.lastErrorClass && (
                    <p className="text-xs text-rose-400">Error: {connector.lastErrorClass.replace(/_/g, " ")}</p>
                )}
            </div>
            <div className="flex items-center gap-2">
                {healthResult !== null && !healthResult.healthy && healthResult.nextStep?.oauthInitUrl && (
                    <button
                        onClick={() => {
                            const oauthInitUrl = healthResult.nextStep?.oauthInitUrl;
                            if (oauthInitUrl) { window.location.href = oauthInitUrl; }
                        }}
                        className="text-xs text-amber-400 hover:text-amber-300 border border-amber-400/30 hover:border-amber-400 rounded-lg px-3 py-1.5 transition"
                    >
                        Re-authenticate
                    </button>
                )}
                <button
                    onClick={runHealthCheck}
                    disabled={checking}
                    className="text-xs text-[var(--accent-blue)] hover:text-[#8dd7ff] border border-[var(--accent-blue)]/30 hover:border-[var(--accent-blue)] rounded-lg px-3 py-1.5 transition disabled:opacity-50"
                >
                    {checking ? "Checking..." : "Test"}
                </button>
                <button
                    onClick={onRemove}
                    className="text-xs text-rose-400 hover:text-red-700 border border-red-200 hover:border-red-400 rounded-lg px-3 py-1.5 transition"
                >
                    Remove
                </button>
            </div>
        </div>
    );
}

// ── Available Connector Card ───────────────────────────────────────────────
function AvailableCard({
    connector,
    configuredStatus,
    onAdd,
}: {
    connector: AvailableConnector;
    configuredStatus: ConnectorStatus | null;
    onAdd: () => void;
}) {
    return (
        <div className="bg-[var(--surface-card)] rounded-xl border border-[var(--hairline)] p-4 flex items-center gap-3 hover:shadow-sm transition">
            <ConnectorIcon tool={connector.tool} size={36} />
            <div className="flex-1 min-w-0">
                <p className="font-medium text-[var(--ink)] text-sm">{connector.displayName}</p>
                <p className="text-xs text-[var(--ash)] mt-0.5">
                    {connector.supportedActions.length} actions · {connector.authMethod.replace("_", " ")}
                </p>
            </div>
            {connector.connected ? (
                configuredStatus === "error" || configuredStatus === "pending_auth" ? (
                    <button
                        onClick={onAdd}
                        className="text-xs bg-amber-500/20 text-amber-400 rounded-lg px-3 py-1.5 hover:bg-amber-500/30 transition font-medium"
                    >
                        Reconnect
                    </button>
                ) : (
                    <span className="text-xs bg-[var(--accent-green)]/10 text-[var(--accent-green)] rounded-full px-2 py-0.5 font-medium">
                        Connected
                    </span>
                )
            ) : (
                <button
                    onClick={onAdd}
                    className="text-xs bg-[var(--accent-blue)] text-[#07080a] rounded-lg px-3 py-1.5 hover:bg-[#8dd7ff] transition font-medium"
                >
                    + Add
                </button>
            )}
        </div>
    );
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function ConnectorsPage() {
    const [configured, setConfigured] = useState<ConfiguredConnector[]>([]);
    const [available, setAvailable] = useState<AvailableConnector[]>([]);
    const [context, setContext] = useState<ConnectorContext | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeCategory, setActiveCategory] = useState<ConnectorCategory | "all">("all");
    const [addingConnector, setAddingConnector] = useState<AvailableConnector | null>(null);
    const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

    const selectedWorkspaceId = context?.selectedWorkspaceId ?? null;
    const selectedBotId = context?.selectedBotId ?? null;

    const getSelectedWorkspaceBot = (): WorkspaceBotOption | null => {
        if (!context) return null;
        return (
            context.options.find((option) => option.workspaceId === context.selectedWorkspaceId && option.botId === context.selectedBotId)
            ?? context.options[0]
            ?? null
        );
    };

    function showToast(message: string, type: "success" | "error" = "success") {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3500);
    }

    async function loadConnectors(scope?: { workspaceId?: string | null; botId?: string | null }) {
        try {
            const workspaceId = scope?.workspaceId ?? selectedWorkspaceId;
            const botId = scope?.botId ?? selectedBotId;
            const params = new URLSearchParams();
            if (workspaceId) params.set("workspaceId", workspaceId);
            if (botId) params.set("botId", botId);

            const endpoint = params.size > 0 ? `/api/connectors?${params.toString()}` : "/api/connectors";
            const res = await fetch(endpoint);
            if (res.ok) {
                const data = await res.json() as any;
                setConfigured(data.configured ?? []);
                setAvailable(data.available ?? []);
                if (data.context) {
                    setContext(data.context as ConnectorContext);
                }
            }
        } catch {
            // silent
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        const storedBotSelection = window.localStorage.getItem("agentfarm_connectors_selected_bot");
        if (!storedBotSelection) {
            void loadConnectors();
            return;
        }

        try {
            const parsed = JSON.parse(storedBotSelection) as { workspaceId?: string; botId?: string };
            void loadConnectors({ workspaceId: parsed.workspaceId ?? null, botId: parsed.botId ?? null });
        } catch {
            void loadConnectors();
        }
    }, []);

    useEffect(() => {
        if (!selectedWorkspaceId || !selectedBotId) return;
        window.localStorage.setItem(
            "agentfarm_connectors_selected_bot",
            JSON.stringify({ workspaceId: selectedWorkspaceId, botId: selectedBotId }),
        );
    }, [selectedWorkspaceId, selectedBotId]);

    const handleScopeChange = (value: string) => {
        const [workspaceId, botId] = value.split("::");
        if (!workspaceId || !botId) return;
        void loadConnectors({ workspaceId, botId });
    };

    async function handleRemove(connectorId: string, name: string) {
        if (!confirm(`Remove "${name}"? Your agent will lose access to this tool.`)) return;
        const params = new URLSearchParams();
        if (selectedWorkspaceId) params.set("workspaceId", selectedWorkspaceId);
        const res = await fetch(`/api/connectors/${connectorId}${params.size > 0 ? `?${params.toString()}` : ""}`, { method: "DELETE" });
        if (res.ok) {
            showToast(`"${name}" removed.`);
            await loadConnectors();
        } else {
            showToast("Failed to remove connector.", "error");
        }
    }

    async function handleHealthCheck(connectorId: string): Promise<HealthCheckResult> {
        const params = new URLSearchParams();
        if (selectedWorkspaceId) params.set("workspaceId", selectedWorkspaceId);
        const res = await fetch(`/api/connectors/${connectorId}/health${params.size > 0 ? `?${params.toString()}` : ""}`, { method: "POST" });
        const json = await res.json() as HealthCheckResult;
        if (json.healthy) {
            showToast(json.message ?? "Connector is healthy.");
        } else {
            showToast(json.message ?? "Connector check failed.", "error");
        }
        await loadConnectors();
        return json;
    }

    const filteredAvailable = available.filter((c) =>
        activeCategory === "all" ? true : c.category === activeCategory
    );

    const customToolByCategory: Record<ConnectorCategory, string> = {
        task_tracker: "generic_rest",
        messaging: "generic_rest_messaging",
        code: "generic_rest_code",
        email: "generic_rest_email",
    };

    const getPreferredCustomConnector = (): AvailableConnector | undefined => {
        if (activeCategory !== "all") {
            return available.find((c) => c.tool === customToolByCategory[activeCategory]);
        }

        return available.find((c) => c.tool === "generic_rest")
            ?? available.find((c) => c.tool.startsWith("generic_rest"));
    };

    const groupedAvailable = CATEGORY_ORDER.reduce<Record<ConnectorCategory, AvailableConnector[]>>(
        (acc, cat) => {
            acc[cat] = filteredAvailable.filter((c) => c.category === cat);
            return acc;
        },
        {} as Record<ConnectorCategory, AvailableConnector[]>
    );

    return (
        <div className="min-h-screen bg-[var(--canvas)] p-6">
            {/* Toast */}
            {toast && (
                <div className={`fixed top-4 right-4 z-50 rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${toast.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}>
                    {toast.message}
                </div>
            )}

            {/* Add connector modal */}
            {addingConnector && (
                <AddConnectorModal
                    connector={addingConnector}
                    workspaceId={selectedWorkspaceId}
                    botId={selectedBotId}
                    onClose={() => setAddingConnector(null)}
                    onAdded={() => {
                        showToast(`${addingConnector.displayName} added successfully.`);
                        loadConnectors();
                    }}
                />
            )}

            <div className="max-w-5xl mx-auto space-y-8">

                {/* Connector showcase gallery */}
                <section className="rounded-2xl border border-[var(--hairline)] bg-[var(--surface-card)] p-6">
                    <div className="flex items-center justify-between mb-5">
                        <div>
                            <h2 className="text-base font-semibold text-[var(--ink)]">Available connectors</h2>
                            <p className="text-xs text-[var(--mute)] mt-0.5">All tools your agent can connect to. More added every sprint.</p>
                        </div>
                        <span className="text-xs font-semibold bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] px-2.5 py-1 rounded-full">{available.length} connectors</span>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-4">
                        {loading ? (
                            Array.from({ length: 12 }).map((_, i) => (
                                <div key={i} className="flex flex-col items-center gap-2 p-3 rounded-xl bg-[var(--surface-el)] border border-transparent animate-pulse">
                                    <div className="w-7 h-7 rounded bg-[var(--hairline)]" />
                                    <div className="h-2.5 w-10 rounded bg-[var(--hairline)]" />
                                </div>
                            ))
                        ) : available.length === 0 ? (
                            <div className="col-span-full text-center py-6 text-sm text-[var(--ash)]">No connectors available.</div>
                        ) : (
                            available.slice(0, 12).map((c) => {
                                const categoryColor: Record<ConnectorCategory, string> = {
                                    task_tracker: "bg-[var(--accent-blue)]/10",
                                    messaging: "bg-violet-500/10",
                                    code: "bg-[var(--surface-el)]",
                                    email: "bg-[var(--accent-green)]/10",
                                };
                                return (
                                    <div key={c.tool} className={`flex flex-col items-center gap-2 p-3 rounded-xl ${categoryColor[c.category]} border border-transparent hover:border-[var(--hairline)] transition-colors cursor-default`}>
                                        <ConnectorIcon tool={c.tool} size={28} />
                                        <span className="text-[11px] font-semibold text-[var(--mute)] text-center leading-none">{c.displayName}</span>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </section>

                {/* Header */}
                <div>
                    <h1 className="text-2xl font-semibold text-[var(--ink)] tracking-[-0.03em]">Integrations</h1>
                    <p className="text-[var(--mute)] mt-1 text-sm">
                        Connect your tools so your agent can work across your entire stack. Your agent's logic stays the same — only the connector changes.
                    </p>
                </div>

                {context && context.options.length > 0 && (
                    <section className="bg-[var(--surface-card)] rounded-xl border border-[var(--hairline)] p-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div>
                                <p className="text-sm font-semibold text-[var(--ink)]">Bot-scoped integration context</p>
                                <p className="text-xs text-[var(--mute)] mt-0.5">
                                    This catalog is filtered by selected bot role and policy. Configured connectors are scoped per workspace.
                                </p>
                            </div>
                            <select
                                value={`${context.selectedWorkspaceId}::${context.selectedBotId}`}
                                onChange={(event) => handleScopeChange(event.target.value)}
                                className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-el)] text-[var(--ink)] px-3 py-2 text-sm"
                                aria-label="Select workspace bot"
                            >
                                {context.options.map((option) => (
                                    <option key={`${option.workspaceId}::${option.botId}`} value={`${option.workspaceId}::${option.botId}`}>
                                        {option.workspaceName} - {option.botName}
                                    </option>
                                ))}
                            </select>
                        </div>
                        {(() => {
                            const selected = getSelectedWorkspaceBot();
                            if (!selected) return null;
                            return (
                                <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-[var(--body-color)] sm:grid-cols-3">
                                    <p>
                                        Role key: <span className="font-semibold text-[var(--ink)]">{context.selectedRoleKey}</span>
                                    </p>
                                    <p>
                                        Policy pack: <span className="font-semibold text-[var(--ink)]">{selected.policyPackVersion}</span>
                                    </p>
                                    <p>
                                        Hidden disallowed integrations: <span className="font-semibold text-[var(--ink)]">{context.disallowed_tools_hidden_count}</span>
                                    </p>
                                    {context.scope_model && (
                                        <p>
                                            Scope model: <span className="font-semibold text-[var(--ink)]">{context.scope_model}</span>
                                        </p>
                                    )}
                                </div>
                            );
                        })()}
                    </section>
                )}

                {/* Connected tools summary */}
                {configured.length > 0 && (
                    <section>
                        <h2 className="text-base font-semibold text-[var(--ink)] mb-3">
                            Your Connected Tools <span className="text-[var(--ash)] font-normal">({configured.length})</span>
                        </h2>
                        <div className="space-y-2">
                            {configured.map((c) => (
                                <ConnectorCard
                                    key={c.connectorId}
                                    connector={c}
                                    onRemove={() => handleRemove(c.connectorId, c.displayName)}
                                    onHealthCheck={() => handleHealthCheck(c.connectorId)}
                                />
                            ))}
                        </div>
                    </section>
                )}

                {/* No connections state */}
                {!loading && configured.length === 0 && (
                    <div className="bg-[var(--surface-card)] rounded-xl border border-dashed border-[var(--hairline)] p-8 text-center">
                        <p className="text-3xl mb-2">🔌</p>
                        <p className="font-medium text-[var(--ink)]">No tools connected yet</p>
                        <p className="text-sm text-[var(--ash)] mt-1">Add your first integration below to get your agent working.</p>
                    </div>
                )}

                {/* Available integrations */}
                <section>
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-base font-semibold text-[var(--ink)]">Available Integrations</h2>
                    </div>

                    {/* Category filter tabs */}
                    <div className="flex gap-2 mb-4 flex-wrap">
                        {(["all", ...CATEGORY_ORDER] as const).map((cat) => (
                            <button
                                key={cat}
                                onClick={() => setActiveCategory(cat)}
                                className={`text-xs rounded-full px-3 py-1.5 border transition font-medium ${activeCategory === cat
                                    ? "bg-[var(--accent-blue)] text-[#07080a] border-[var(--accent-blue)]"
                                    : "bg-[var(--surface-el)] text-[var(--mute)] border-[var(--hairline)] hover:border-[var(--ash)]"
                                    }`}
                            >
                                {cat === "all" ? "All" : CATEGORY_LABELS[cat]}
                            </button>
                        ))}
                    </div>

                    {loading ? (
                        <p className="text-sm text-[var(--ash)]">Loading integrations...</p>
                    ) : (
                        <div className="space-y-6">
                            {CATEGORY_ORDER.map((cat) => {
                                const items = groupedAvailable[cat];
                                if (items.length === 0) return null;
                                return (
                                    <div key={cat}>
                                        <h3 className="text-xs font-semibold text-[var(--ash)] uppercase tracking-wide mb-2">
                                            {CATEGORY_LABELS[cat]}
                                        </h3>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                            {items.map((c) => (
                                                <AvailableCard
                                                    key={c.tool}
                                                    connector={c}
                                                    configuredStatus={configured.find((cc) => cc.tool === c.tool)?.status ?? null}
                                                    onAdd={() => setAddingConnector(c)}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>

                {/* Custom REST API callout */}
                <section className="bg-[var(--surface-el)] border border-[var(--hairline)] rounded-xl p-5">
                    <div className="flex items-start gap-3">
                        <span className="text-2xl">🔌</span>
                        <div className="flex-1">
                            <p className="font-semibold text-base text-[var(--ink)]">Using a custom or internal tool?</p>
                            <p className="text-sm text-[var(--mute)] mt-1">
                                Any tool with a REST API can be connected using category-specific Custom REST connectors for tasks, messaging, code, and email.
                            </p>
                        </div>
                        <button
                            onClick={() => {
                                const generic = getPreferredCustomConnector();
                                if (generic) setAddingConnector(generic);
                            }}
                            className="shrink-0 bg-[var(--ink)] text-[var(--canvas)] rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90 transition"
                        >
                            + Custom API
                        </button>
                    </div>
                </section>

            </div>
        </div>
    );
}
