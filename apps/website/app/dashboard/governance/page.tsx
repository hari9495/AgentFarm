import type { Metadata } from "next";
import { ShieldCheck, ChevronRight } from "lucide-react";
import GovernancePageClient from "./GovernancePageClient";

export const metadata: Metadata = {
    title: "Governance · AgentFarms",
    description: "Configure approval workflows, monitor governance KPIs, and manage compliance plugins for your AI workforce.",
};

export default function GovernancePage() {
    return (
        <div className="min-h-screen bg-slate-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-6 space-y-6">

                {/* Dark hero */}
                <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-blue-50 via-white to-white">
                    <div className="absolute inset-0 pointer-events-none">
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_80%_at_0%_0%,rgba(99,102,241,0.18)_0%,transparent_60%)]" />
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_70%_at_100%_100%,rgba(139,92,246,0.12)_0%,transparent_60%)]" />
                        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "radial-gradient(circle, rgba(37,99,235,1) 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
                    </div>
                    <div className="relative px-6 sm:px-8 py-6 sm:py-8">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="flex items-center gap-2 rounded-xl bg-blue-50 border border-blue-200 px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-blue-700">
                                <ShieldCheck className="w-3.5 h-3.5" />
                                Governance
                            </div>
                            <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
                            <span className="text-xs text-slate-500">Compliance</span>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5">
                            <div>
                                <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight leading-tight">Governance & Compliance</h1>
                                <p className="mt-2 text-slate-600 text-base max-w-lg">
                                    Configure multi-step approval workflows, track SLA health, and control
                                    which compliance plugins govern your AI agents.
                                </p>
                            </div>
                        </div>

                        {/* Tab bar sits at the bottom of the hero */}
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

                <GovernancePageClient />

            </div>
        </div>
    );
}
