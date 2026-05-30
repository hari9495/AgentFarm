import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import GovernancePageClient from "./GovernancePageClient";

export const metadata: Metadata = {
    title: "Governance · AgentFarms",
    description: "Configure approval workflows, monitor governance KPIs, and manage compliance plugins for your AI workforce.",
};

export default function GovernancePage() {
    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950">

            {/* ── Page header ──────────────────────────────────────────── */}
            <section className="relative overflow-hidden border-b border-slate-200 dark:border-slate-800 bg-slate-950">
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_80%_at_0%_0%,rgba(99,102,241,0.15)_0%,transparent_60%)]" />
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_60%_at_100%_100%,rgba(139,92,246,0.1)_0%,transparent_60%)]" />
                </div>

                <div className="relative max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-10 sm:py-12">
                    <div className="flex items-center gap-2 mb-5">
                        <div className="flex items-center gap-2 rounded-xl bg-violet-500/10 border border-violet-500/20 px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-violet-400">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            Governance
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                        <div>
                            <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">
                                Governance & Compliance
                            </h1>
                            <p className="mt-2 text-slate-400 text-base max-w-xl">
                                Configure multi-step approval workflows, track SLA health, and control
                                which compliance plugins govern your AI agents.
                            </p>
                        </div>
                    </div>

                    {/* Tab bar sits at the bottom of the header */}
                    <div className="mt-8 -mb-px flex gap-0 border-b border-slate-800">
                        {[
                            { id: "kpis",      label: "KPIs",      sub: "Is governance working?" },
                            { id: "workflows", label: "Workflows",  sub: "Multi-step approval flows" },
                            { id: "plugins",   label: "Plugins",    sub: "Compliance extensions" },
                        ].map(({ id, label, sub }) => (
                            <div key={id} id={`tab-hint-${id}`}
                                className="px-5 py-3 text-xs text-slate-500 border-b-2 border-transparent">
                                <span className="font-bold text-slate-300 text-sm">{label}</span>
                                <span className="hidden sm:inline text-slate-600 ml-2">— {sub}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Interactive content ────────────────────────────────── */}
            <GovernancePageClient />
        </div>
    );
}
