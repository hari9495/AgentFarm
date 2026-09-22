import type { Metadata } from "next";
import { ShieldCheck, ChevronRight } from "lucide-react";
import EvidenceCompliancePanel from "@/components/dashboard/EvidenceCompliancePanel";

export const metadata: Metadata = {
    title: "Evidence & Compliance - AgentFarms Dashboard",
    description: "Governance KPI view and compliance evidence export pack.",
};

export default function DashboardEvidencePage() {
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
                                Evidence
                            </div>
                            <ChevronRight className="w-3.5 h-3.5 text-[color:var(--ink-soft)]" />
                            <span className="text-xs text-[color:var(--ink-muted)]">Compliance</span>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5">
                            <div>
                                <h1 className="text-2xl sm:text-[28px] font-semibold text-[color:var(--ink)] tracking-tight leading-tight">Evidence & Compliance</h1>
                                <p className="mt-2 text-[color:var(--ink-soft)] text-base max-w-lg">Governance KPIs and compliance evidence export pack.</p>
                            </div>
                        </div>
                    </div>
                </section>

                <EvidenceCompliancePanel />

            </div>
        </div>
    );
}
