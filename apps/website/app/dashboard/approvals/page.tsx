import type { Metadata } from "next";
import { headers } from "next/headers";
import { getSessionUser } from "@/lib/auth-store";
import ApprovalsQueue from "@/components/dashboard/ApprovalsQueue";

export const metadata: Metadata = {
    title: "Approvals - AgentFarms Dashboard",
    description: "Org-wide approval inbox for all pending high-risk actions.",
};

const COOKIE_NAME = "agentfarm_session";

const getCookieValue = (cookieHeader: string | null, name: string): string | null => {
    if (!cookieHeader) return null;
    const cookie = cookieHeader.split(";").map((c) => c.trim()).find((c) => c.startsWith(`${name}=`));
    if (!cookie) return null;
    return decodeURIComponent(cookie.slice(name.length + 1));
};

export default async function DashboardApprovalsPage() {
    const requestHeaders = await headers();
    const token = getCookieValue(requestHeaders.get("cookie"), COOKIE_NAME);
    const user = token ? await getSessionUser(token) : null;

    return (
        <ApprovalsQueue
            scope="org"
            headerTitle="Approval Inbox"
            headerSubtitle="All pending approval requests across your org"
            userRole={user?.role}
        />
    );
}
