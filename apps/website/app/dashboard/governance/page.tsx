import type { Metadata } from "next";
import { ShieldCheck, ChevronRight } from "lucide-react";
import GovernancePageClient from "./GovernancePageClient";

export const metadata: Metadata = {
    title: "Governance · AgentFarms",
    description: "Configure approval workflows, monitor governance KPIs, and manage compliance plugins for your AI workforce.",
};

export default function GovernancePage() {
    return (
        <div className="min-h-svh bg-[var(--bg-deep)]">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-6 space-y-6">

                {/* Dark hero */}
                <section className="relative overflow-hidden rounded-xl border border-[color:var(--line)] bg-[var(--card)]">
                    <div className="absolute inset-0 pointer-events-none">
                    </div>
                    <div className="relative px-6 sm:px-8 py-6 sm:py-8">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="flex items-center gap-2 rounded-lg bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] px-3 py-1.5 text-xs font-semibold uppercase tracking-widest text-[color:var(--accent)]">
                                <ShieldCheck className="w-3.5 h-3.5" />
                                Governance
                            </div>
                            <ChevronRight className="w-3.5 h-3.5 text-[color:var(--ink-soft)]" />
                            <span className="text-xs text-[color:var(--ink-muted)]">Compliance</span>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5">
                            <div>
                                <h1 className="text-2xl sm:text-[28px] font-semibold text-[color:var(--ink)] tracking-tight leading-tight">Governance & Compliance</h1>
                                <p className="mt-2 text-[color:var(--ink-soft)] text-base max-w-lg">
                                    Configure multi-step approval workflows, track SLA health, and control
                                    which compliance plugins govern your AI agents.
                                </p>
                            </div>
                        </div>

                        {/* Tab bar sits at the bottom of the hero */}
                        <div className="mt-8 -mb-px flex gap-0 border-b border-[color:var(--line)]">
                            {[
                                { id: "kpis",      label: "KPIs",      sub: "Is governance working?" },
                                { id: "workflows", label: "Workflows",  sub: "Multi-step approval flows" },
                                { id: "plugins",   label: "Plugins",    sub: "Compliance extensions" },
                            ].map(({ id, label, sub }) => (
                                <div key={id} id={`tab-hint-${id}`}
                                    className="px-5 py-3 text-xs text-[color:var(--ink-muted)] border-b-2 border-transparent">
                                    <span className="font-bold text-[color:var(--ink-muted)] text-sm">{label}</span>
                                    <span className="hidden sm:inline text-[color:var(--ink-soft)] ml-2">— {sub}</span>
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
