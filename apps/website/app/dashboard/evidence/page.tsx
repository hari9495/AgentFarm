import type { Metadata } from "next";
import EvidenceCompliancePanel from "@/components/dashboard/EvidenceCompliancePanel";

export const metadata: Metadata = {
    title: "Evidence & Compliance - AgentFarm Dashboard",
    description: "Governance KPI view and compliance evidence export pack.",
};

export default function DashboardEvidencePage() {
    return <EvidenceCompliancePanel />;
}
