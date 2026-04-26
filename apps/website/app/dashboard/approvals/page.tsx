import type { Metadata } from "next";
import ApprovalsQueue from "@/components/dashboard/ApprovalsQueue";

export const metadata: Metadata = {
    title: "Approvals - AgentFarm Dashboard",
    description: "Org-wide approval inbox for all pending high-risk actions.",
};

export default function DashboardApprovalsPage() {
    return (
        <ApprovalsQueue
            scope="org"
            headerTitle="Approval Inbox"
            headerSubtitle="All pending approval requests across your org"
        />
    );
}
