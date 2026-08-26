import type { Metadata } from "next";
import DeploymentHistoryTable from "@/components/dashboard/DeploymentHistoryTable";
import ProvisioningOpsPanel from "@/components/dashboard/ProvisioningOpsPanel";
import PremiumIcon from "@/components/shared/PremiumIcon";
import ButtonLink from "@/components/shared/ButtonLink";
import { Activity, AlertTriangle, CheckCircle2, ChevronRight, Layers, Rocket } from "lucide-react";

export const metadata: Metadata = {
    title: "Deployments · AgentFarms Dashboard",
    description: "Track deployment history and status transitions for marketplace-launched agents.",
};

export default async function DeploymentsPage() {
    // Deployment data will be populated when agents are deployed from the marketplace.
    // Stats default to zero until then.
    const deploymentStats = [
        { label: "Total Deployments", value: "0", icon: Layers, tone: "sky" as const },
        { label: "In Progress", value: "0", icon: Activity, tone: "amber" as const },
        { label: "Succeeded (30d)", value: "0", icon: CheckCircle2, tone: "emerald" as const },
        { label: "Failed (30d)", value: "0", icon: AlertTriangle, tone: "rose" as const },
    ];

    return (
        <div className="min-h-screen bg-slate-50">

            {/* ── Single shared container — hero + all widgets aligned ── */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-6 space-y-6">

                {/* ── Hero header ─────────────────────────────────────── */}
                <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-blue-50 via-white to-white">
                    <div className="absolute inset-0 pointer-events-none">
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_80%_at_0%_0%,rgba(37,99,235,0.10)_0%,transparent_60%)]" />
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_70%_at_100%_100%,rgba(16,185,129,0.07)_0%,transparent_60%)]" />
                        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "radial-gradient(circle, rgba(37,99,235,1) 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
                    </div>

                    <div className="relative px-6 sm:px-8 py-6 sm:py-8">
                        {/* Breadcrumb */}
                        <div className="flex items-center gap-2 mb-5">
                            <div className="flex items-center gap-2 rounded-xl bg-blue-50 border border-blue-200 px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-blue-700">
                                <PremiumIcon icon={Rocket} tone="sky" containerClassName="w-4 h-4 rounded bg-blue-400/20 text-blue-300" iconClassName="w-2.5 h-2.5" />
                                Deployments
                            </div>
                            <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
                            <span className="text-xs text-slate-500">History &amp; Status</span>
                        </div>

                        {/* Title + actions */}
                        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5">
                            <div>
                                <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight leading-tight">
                                    Deployment Operations
                                </h1>
                                <p className="mt-2 text-slate-600 text-base max-w-lg">
                                    Track deployment requests, provisioning state, and progression for every marketplace-launched AI teammate.
                                </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 shrink-0">
                                <ButtonLink href="/marketplace" size="sm">
                                    <Rocket className="w-3.5 h-3.5" />
                                    Deploy from Marketplace
                                </ButtonLink>
                                <ButtonLink href="/dashboard" size="sm" variant="outline" className="!bg-white !text-slate-900 !border-slate-200 hover:!bg-slate-50">
                                    Back to Overview
                                </ButtonLink>
                            </div>
                        </div>

                        {/* Mini stats bar */}
                        <div className="mt-5 flex flex-wrap items-center gap-6 border-t border-slate-200 pt-4">
                            {deploymentStats.map(({ label, value }) => (
                                <div key={label} className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
                                    <span className="text-white font-bold">{value}</span>
                                    {label}
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ── Stat cards ──────────────────────────────────────── */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {deploymentStats.map(({ label, value, icon, tone }) => (
                        <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 flex items-center gap-3 shadow-sm">
                            <PremiumIcon icon={icon} tone={tone} containerClassName="w-10 h-10 rounded-xl shrink-0" iconClassName="w-5 h-5" />
                            <div className="min-w-0">
                                <p className="text-2xl font-extrabold text-slate-900 leading-none">{value}</p>
                                <p className="text-xs text-slate-500 mt-0.5 truncate">{label}</p>
                            </div>
                        </div>
                    ))}
                </div>

                {/* ── Widgets ─────────────────────────────────────────── */}
                <div className="space-y-6">
                    <ProvisioningOpsPanel />
                    <DeploymentHistoryTable />
                </div>

            </div>{/* end shared container */}
        </div>
    );
}
