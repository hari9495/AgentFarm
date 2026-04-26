import type { Metadata } from "next";
import DeploymentHistoryTable from "@/components/dashboard/DeploymentHistoryTable";
import ProvisioningOpsPanel from "@/components/dashboard/ProvisioningOpsPanel";

export const metadata: Metadata = {
    title: "Deployments - AgentFarm Dashboard",
    description: "Track deployment history and status transitions for marketplace-launched agents.",
};

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
                <ProvisioningOpsPanel />
                <DeploymentHistoryTable />
            </div>
        </div>
    );
}
