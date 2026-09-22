import type { Metadata } from "next";
import ApprovalsQueue from "@/components/dashboard/ApprovalsQueue";
import { getPortalUser } from "@/lib/portal-server";

export const metadata: Metadata = {
    title: "Approvals - AgentFarms Dashboard",
    description: "Org-wide approval inbox for all pending high-risk actions.",
};

export default async function DashboardApprovalsPage() {
    const user = await getPortalUser();

    return (
        <ApprovalsQueue
            scope="org"
            headerTitle="Approval Inbox"
            headerSubtitle="All pending approval requests across your organisation."
            userRole={user?.role}
        />
    );
}
