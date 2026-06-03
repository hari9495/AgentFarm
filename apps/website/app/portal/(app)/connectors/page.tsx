"use client";

import { useState, useEffect } from "react";
import {
    CheckCircle2, XCircle, AlertTriangle, Plug, Plus,
    Github, Mail, MessageSquare, Trello, Phone,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────

type ConnectorRecord = {
    connector_id: string;
    connector_type: string;
    status: string;
    scope_status: string | null;
    last_error_class: string | null;
    last_refresh_at: string | null;
    token_expires_at: string | null;
};

// ── Known connectors catalogue ─────────────────────────────────────────────

const KNOWN_CONNECTORS = [
    { type: "github",   label: "GitHub",         Icon: Github,       desc: "Code repos, pull requests, CI status" },
    { type: "jira",     label: "Jira",           Icon: Plug,         desc: "Issues, sprints, project tracking" },
    { type: "slack",    label: "Slack",          Icon: MessageSquare, desc: "Team messaging and notifications" },
    { type: "teams",    label: "Microsoft Teams", Icon: MessageSquare, desc: "Video calls, chat, file sharing" },
    { type: "email",    label: "Email",          Icon: Mail,         desc: "Outlook / Gmail / Exchange" },
    { type: "linear",   label: "Linear",         Icon: Trello,       desc: "Issue tracking and roadmaps" },
    { type: "twilio",   label: "Twilio",         Icon: Phone,        desc: "SMS and voice calls" },
] as const;

// ── Status helpers ─────────────────────────────────────────────────────────

function getStatusInfo(record: ConnectorRecord | undefined): {
    label: string;
    color: string;
    bg: string;
    Icon: React.ComponentType<{ className?: string }>;
} {
    if (!record) {
        return { label: "Not connected", color: "text-slate-400", bg: "bg-slate-100 dark:bg-slate-800", Icon: XCircle };
    }
    if (record.status === "connected" && record.scope_status !== "insufficient") {
        return { label: "Connected", color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/40", Icon: CheckCircle2 };
    }
    if (record.last_error_class) {
        return { label: "Error", color: "text-rose-600 dark:text-rose-400", bg: "bg-rose-50 dark:bg-rose-950/40", Icon: XCircle };
    }
    return { label: "Needs attention", color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/40", Icon: AlertTriangle };
}

// ── Request modal ──────────────────────────────────────────────────────────

function RequestModal({
    connectorType,
    onClose,
    onSubmit,
}: {
    connectorType: string;
    onClose: () => void;
    onSubmit: (note: string) => Promise<void>;
}) {
    const [note, setNote] = useState("");
    const [loading, setLoading] = useState(false);
    const [done, setDone] = useState(false);

    const handleSubmit = async () => {
        setLoading(true);
        try {
            await onSubmit(note);
            setDone(true);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div
            className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-6">
                {done ? (
                    <div className="text-center py-6">
                        <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
                        <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">Request sent!</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            Your workspace administrator will be notified to set up{" "}
                            <strong className="capitalize">{connectorType}</strong>.
                        </p>
                        <button
                            type="button"
                            onClick={onClose}
                            className="mt-4 px-4 py-2 rounded-lg bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 transition-colors"
                        >
                            Close
                        </button>
                    </div>
                ) : (
                    <>
                        <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">
                            Request <span className="capitalize">{connectorType}</span> connection
                        </h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                            Your workspace administrator will receive a notification to set up this integration.
                        </p>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                            Note <span className="font-normal text-slate-400">(optional)</span>
                        </label>
                        <textarea
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            rows={3}
                            placeholder="e.g. We need this to sync Jira issues with the developer agent"
                            className="w-full text-sm border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-400 resize-none"
                        />
                        <div className="flex gap-2 mt-4 justify-end">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => void handleSubmit()}
                                disabled={loading}
                                className="px-4 py-2 rounded-lg bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 disabled:opacity-50 transition-colors"
                            >
                                {loading ? "Sending…" : "Send request"}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function PortalConnectorsPage() {
    const [connectors, setConnectors] = useState<ConnectorRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [requestingType, setRequestingType] = useState<string | null>(null);

    useEffect(() => {
        void (async () => {
            try {
                const res = await fetch("/api/portal/connectors");
                if (!res.ok) { setError("Failed to load connector status."); return; }
                const data = (await res.json()) as { connectors?: ConnectorRecord[] };
                setConnectors(data.connectors ?? []);
            } catch {
                setError("Failed to load connector status.");
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const handleRequest = async (connectorType: string, note: string) => {
        await fetch("/api/portal/connectors/request", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ connector_type: connectorType, note }),
        });
    };

    const connectorMap = new Map(connectors.map((c) => [c.connector_type, c]));

    return (
        <div>
            <div className="mb-6">
                <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Integrations</h1>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Connected services your agents can use. Contact your administrator to add or reconfigure integrations.
                </p>
            </div>

            {error && (
                <div className="flex items-center gap-3 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 px-4 py-3 text-sm text-rose-700 dark:text-rose-400 mb-6">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    {error}
                </div>
            )}

            {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                        <div key={i} className="h-24 rounded-2xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {KNOWN_CONNECTORS.map(({ type, label, Icon, desc }) => {
                        const record = connectorMap.get(type);
                        const { label: statusLabel, color, bg, Icon: StatusIcon } = getStatusInfo(record);
                        const isConnected = record?.status === "connected";

                        return (
                            <div
                                key={type}
                                className="flex flex-col bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm gap-3"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="h-9 w-9 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                                        <Icon className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{label}</div>
                                        <div className="text-xs text-slate-400 dark:text-slate-500 truncate">{desc}</div>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between">
                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${color} ${bg}`}>
                                        <StatusIcon className="h-3 w-3" />
                                        {statusLabel}
                                    </span>

                                    {!isConnected && (
                                        <button
                                            type="button"
                                            onClick={() => setRequestingType(type)}
                                            className="flex items-center gap-1 text-xs font-medium text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 transition-colors"
                                        >
                                            <Plus className="h-3.5 w-3.5" />
                                            Request
                                        </button>
                                    )}

                                    {isConnected && record?.last_refresh_at && (
                                        <span className="text-xs text-slate-400 dark:text-slate-500">
                                            {new Date(record.last_refresh_at).toLocaleDateString()}
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <p className="mt-6 text-xs text-slate-400 dark:text-slate-500">
                To connect new integrations or reconfigure existing ones, ask your workspace administrator to use the operator dashboard.
            </p>

            {requestingType && (
                <RequestModal
                    connectorType={requestingType}
                    onClose={() => setRequestingType(null)}
                    onSubmit={async (note) => handleRequest(requestingType, note)}
                />
            )}
        </div>
    );
}
