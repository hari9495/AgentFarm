import type { Metadata } from "next";
import { ShieldCheck, ChevronRight } from "lucide-react";
import EvidenceCompliancePanel from "@/components/dashboard/EvidenceCompliancePanel";

export const metadata: Metadata = {
    title: "Evidence & Compliance - AgentFarms Dashboard",
    description: "Governance KPI view and compliance evidence export pack.",
};

export default function DashboardEvidencePage() {
    return (
        <div className="min-h-screen bg-slate-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-6 space-y-6">

                {/* Dark hero */}
                <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-blue-50 via-white to-white">
                    <div className="absolute inset-0 pointer-events-none">
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_80%_at_0%_0%,rgba(37,99,235,0.10)_0%,transparent_60%)]" />
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_70%_at_100%_100%,rgba(16,185,129,0.07)_0%,transparent_60%)]" />
                        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "radial-gradient(circle, rgba(37,99,235,1) 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
                    </div>
                    <div className="relative px-6 sm:px-8 py-6 sm:py-8">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="flex items-center gap-2 rounded-xl bg-blue-50 border border-blue-200 px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-blue-700">
                                <ShieldCheck className="w-3.5 h-3.5" />
                                Evidence
                            </div>
                            <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
                            <span className="text-xs text-slate-500">Compliance</span>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5">
                            <div>
                                <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight leading-tight">Evidence & Compliance</h1>
                                <p className="mt-2 text-slate-600 text-base max-w-lg">Governance KPIs and compliance evidence export pack.</p>
                            </div>
                        </div>
                    </div>
                </section>

                <EvidenceCompliancePanel />

            </div>
        </div>
    );
}
