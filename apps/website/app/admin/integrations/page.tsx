"use client";

import { CheckCircle2, Github, KeyRound, Link2, RefreshCw, Slack, UserCircle2 } from "lucide-react";
import { useState, useEffect } from "react";

const integrations = [
    {
        name: "Slack Workspace",
        status: "connected",
        detail: "acme-workspace · 6 channels authorized",
        icon: Slack,
        color: "text-violet-600 dark:text-violet-400",
        bg: "bg-violet-100 dark:bg-violet-900/40",
    },
    {
        name: "GitHub Organization",
        status: "connected",
        detail: "acme-org · 27 repositories",
        icon: Github,
        color: "text-slate-700 dark:text-slate-300",
        bg: "bg-slate-100 dark:bg-slate-800",
    },
    {
        name: "SSO (SAML)",
        status: "connected",
        detail: "Okta · SCIM provisioning enabled",
        icon: UserCircle2,
        color: "text-emerald-600 dark:text-emerald-400",
        bg: "bg-emerald-100 dark:bg-emerald-900/40",
    },
    {
        name: "Jira",
        status: "disconnected",
        detail: "No workspace linked",
        icon: Link2,
        color: "text-sky-600 dark:text-sky-400",
        bg: "bg-sky-100 dark:bg-sky-900/40",
    },
];

export default function AdminIntegrationsPage() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // Simulate data loading - replace with actual API call when backend is ready
        setLoading(false);
        setError(null);
    }, []);

    const hasData = !loading && !error && integrations.length > 0;
    return (
        <div className="site-shell min-h-screen">
            <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-5 md:px-8">
                <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-xl bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center">
                        <Link2 className="w-5 h-5 text-sky-600 dark:text-sky-400" />
                    </div>
                    <div>
                        <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">Integrations</h1>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Organization-level connectors and identity integrations</p>
                    </div>
                </div>
            </div>

            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-4">
                {error ? (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 dark:border-rose-900/50 dark:bg-rose-950/30">
                        <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">Unable to load integrations</p>
                        <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{error}</p>
                        <button
                            onClick={() => window.location.reload()}
                            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-rose-300 dark:border-rose-700 px-3 py-1.5 text-xs font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/30"
                        >
                            <RefreshCw className="h-3.5 w-3.5" /> Retry
                        </button>
                    </div>
                ) : loading ? (
                    <div className="space-y-4 animate-pulse">
                        {[1, 2, 3, 4].map((i) => (
                            <div key={i} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                                <div className="flex items-center gap-4">
                                    <div className="h-11 w-11 rounded-xl bg-slate-200 dark:bg-slate-700 shrink-0" />
                                    <div className="flex-1">
                                        <div className="h-4 w-24 rounded bg-slate-200 dark:bg-slate-700 mb-2" />
                                        <div className="h-3 w-40 rounded bg-slate-200 dark:bg-slate-700" />
                                    </div>
                                    <div className="h-9 w-20 rounded bg-slate-200 dark:bg-slate-700" />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : !hasData ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-10 text-center">
                        <Link2 className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">No integrations configured</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Connect your tools to get started.</p>
                    </div>
                ) : (
                    <>
                        {integrations.map((i) => {
                            const Icon = i.icon;
                            return (
                                <article key={i.name} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex items-center gap-4">
                                    <div className={`h-11 w-11 rounded-xl ${i.bg} flex items-center justify-center shrink-0`}>
                                        <Icon className={`w-5 h-5 ${i.color}`} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">{i.name}</h2>
                                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">{i.detail}</p>
                                    </div>
                                    {i.status === "connected" ? (
                                        <button className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
                                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Manage
                                        </button>
                                    ) : (
                                        <button className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-700">
                                            <KeyRound className="w-3.5 h-3.5" /> Connect
                                        </button>
                                    )}
                                </article>
                            );
                        })}
                    </>
                )}
            </div>
        </div>
    );
}
