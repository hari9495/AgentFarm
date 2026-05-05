import type { Metadata } from "next";
import DeploymentHistoryTable from "@/components/dashboard/DeploymentHistoryTable";
import ProvisioningOpsPanel from "@/components/dashboard/ProvisioningOpsPanel";
import PremiumIcon from "@/components/shared/PremiumIcon";
import { Activity, AlertTriangle, CheckCircle2, Layers } from "lucide-react";

export const metadata: Metadata = {
    title: "Deployments - AgentFarm Dashboard",
    description: "Track deployment history and status transitions for marketplace-launched agents.",
};

const deploymentStats = [
    { label: "Total Deployments", value: "148", icon: Layers, tone: "sky" as const },
    { label: "In Progress", value: "3", icon: Activity, tone: "amber" as const },
    { label: "Succeeded (30d)", value: "141", icon: CheckCircle2, tone: "emerald" as const },
    { label: "Failed (30d)", value: "4", icon: AlertTriangle, tone: "rose" as const },
];

export default function DeploymentsPage() {
    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
                <div>
                    <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Deployments</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        Recent deployment requests and progression states.
                    </p>
                </div>

                {/* Stats bar */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {deploymentStats.map(({ label, value, icon, tone }) => (
                        <div key={label} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex items-center gap-3">
                            <PremiumIcon icon={icon} tone={tone} containerClassName="w-10 h-10 rounded-xl shrink-0" iconClassName="w-5 h-5" />
                            <div>
                                <p className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 leading-none">{value}</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{label}</p>
                            </div>
                        </div>
                    ))}
                </div>

                <ProvisioningOpsPanel />
                <DeploymentHistoryTable />
            </div>
        </div>
    );
}
