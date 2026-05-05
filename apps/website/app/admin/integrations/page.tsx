"use client";

import { CheckCircle2, Github, KeyRound, Link2, RefreshCw, Slack, UserCircle2 } from "lucide-react";
import { useState, useEffect } from "react";
import PremiumIcon from "@/components/shared/PremiumIcon";

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
    const [jiraWizardOpen, setJiraWizardOpen] = useState(false);
    const [jiraStep, setJiraStep] = useState(0);
    const [jiraAuthMethod, setJiraAuthMethod] = useState<"oauth" | "apikey">("oauth");

    useEffect(() => {
        setLoading(false);
        setError(null);
    }, []);

    const hasData = !loading && !error && integrations.length > 0;
    return (
        <div className="site-shell min-h-screen">
            <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-5 md:px-8">
                <div className="flex items-center gap-3">
                    <PremiumIcon icon={Link2} tone="sky" containerClassName="h-9 w-9 rounded-xl bg-sky-100 dark:bg-sky-900/40 text-sky-600 dark:text-sky-400" iconClassName="w-5 h-5" />
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
                            <PremiumIcon icon={RefreshCw} tone="rose" containerClassName="w-6 h-6 rounded-lg bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400" iconClassName="h-3.5 w-3.5" /> Retry
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
                        <div className="mb-3 flex justify-center">
                            <PremiumIcon icon={Link2} tone="slate" containerClassName="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500" iconClassName="w-5 h-5" />
                        </div>
                        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">No integrations configured</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Connect your tools to get started.</p>
                    </div>
                ) : (
                    <>
                        {integrations.map((i) => {
                            const Icon = i.icon;
                            return (
                                <article key={i.name} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex items-center gap-4">
                                    <PremiumIcon icon={Icon} tone="sky" containerClassName={`h-11 w-11 rounded-xl ${i.bg} shrink-0 ${i.color}`} iconClassName="w-5 h-5" />
                                    <div className="flex-1 min-w-0">
                                        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">{i.name}</h2>
                                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">{i.detail}</p>
                                    </div>
                                    {i.status === "connected" ? (
                                        <button className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
                                            <PremiumIcon icon={CheckCircle2} tone="emerald" containerClassName="w-6 h-6 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400" iconClassName="w-3.5 h-3.5" /> Manage
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => { setJiraWizardOpen(true); setJiraStep(0); }}
                                            className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-700"
                                        >
                                            <PremiumIcon icon={KeyRound} tone="sky" containerClassName="w-6 h-6 rounded-lg bg-white/15 text-white border-white/30" iconClassName="w-3.5 h-3.5" /> Connect
                                        </button>
                                    )}
                                </article>
                            );
                        })}
                    </>
                )}
            </div>

            {/* Jira setup wizard */}
            {jiraWizardOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl w-full max-w-md">
                        {/* Wizard header */}
                        <div className="px-6 pt-6 pb-4 border-b border-slate-100 dark:border-slate-800">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Connect Jira</h2>
                                <button onClick={() => setJiraWizardOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg leading-none">&times;</button>
                            </div>
                            {/* Step dots */}
                            <div className="flex items-center gap-2">
                                {["Auth method", "Credentials", "Verify"].map((label, idx) => (
                                    <div key={label} className="flex items-center gap-2">
                                        <div className={`flex items-center gap-1.5`}>
                                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${idx <= jiraStep ? "bg-sky-600 text-white" : "bg-slate-200 dark:bg-slate-700 text-slate-400"}`}>{idx + 1}</div>
                                            <span className={`text-xs font-medium ${idx === jiraStep ? "text-slate-900 dark:text-slate-100" : "text-slate-400 dark:text-slate-500"}`}>{label}</span>
                                        </div>
                                        {idx < 2 && <div className={`flex-1 h-px w-6 ${idx < jiraStep ? "bg-sky-600" : "bg-slate-200 dark:bg-slate-700"}`} />}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Step content */}
                        <div className="px-6 py-5">
                            {jiraStep === 0 && (
                                <div className="space-y-3">
                                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">Choose how you want to authenticate with Jira.</p>
                                    {(["oauth", "apikey"] as const).map((method) => (
                                        <label key={method} className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${jiraAuthMethod === method ? "border-sky-500 bg-sky-50 dark:bg-sky-900/20" : "border-slate-200 dark:border-slate-700 hover:border-slate-300"}`}>
                                            <input type="radio" checked={jiraAuthMethod === method} onChange={() => setJiraAuthMethod(method)} className="mt-0.5 accent-sky-600" />
                                            <div>
                                                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{method === "oauth" ? "OAuth 2.0 (recommended)" : "API Key + Email"}</p>
                                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{method === "oauth" ? "Authorize via Atlassian — no credentials stored" : "Personal access token with your Jira email"}</p>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            )}
                            {jiraStep === 1 && (
                                <div className="space-y-4">
                                    <p className="text-sm text-slate-600 dark:text-slate-400">{jiraAuthMethod === "oauth" ? "You'll be redirected to Atlassian to authorise access." : "Enter your Jira credentials below."}</p>
                                    {jiraAuthMethod === "apikey" ? (
                                        <>
                                            <div>
                                                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">Jira base URL</label>
                                                <input type="url" placeholder="https://your-org.atlassian.net" className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500" />
                                            </div>
                                            <div>
                                                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">Email address</label>
                                                <input type="email" placeholder="you@company.com" className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500" />
                                            </div>
                                            <div>
                                                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">API token</label>
                                                <input type="password" placeholder="••••••••••••••••" className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500" />
                                            </div>
                                        </>
                                    ) : (
                                        <div className="rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 text-xs text-slate-500 dark:text-slate-400">
                                            Clicking &quot;Next&quot; will open an Atlassian authorisation page. Return here after granting access.
                                        </div>
                                    )}
                                </div>
                            )}
                            {jiraStep === 2 && (
                                <div className="text-center py-4">
                                    <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center mx-auto mb-4">
                                        <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                                    </div>
                                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-1">Jira connected successfully</h3>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">AgentFarm can now read and update Jira issues. You can configure project filters in Settings.</p>
                                </div>
                            )}
                        </div>

                        {/* Actions */}
                        <div className="px-6 pb-6 flex items-center justify-between">
                            <button onClick={() => jiraStep > 0 ? setJiraStep(s => s - 1) : setJiraWizardOpen(false)} className="text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
                                {jiraStep === 0 ? "Cancel" : "Back"}
                            </button>
                            {jiraStep < 2 ? (
                                <button onClick={() => setJiraStep(s => s + 1)} className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-700">
                                    {jiraStep === 1 && jiraAuthMethod === "oauth" ? "Authorise with Atlassian" : "Next"}
                                </button>
                            ) : (
                                <button onClick={() => setJiraWizardOpen(false)} className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700">
                                    Done
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
