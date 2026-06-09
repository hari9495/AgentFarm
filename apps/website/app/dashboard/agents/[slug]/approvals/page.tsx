import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ApprovalsQueue from "@/components/dashboard/ApprovalsQueue";
import { getPortalUser, portalFetch } from "@/lib/portal-server";

export const metadata: Metadata = {
    title: "Agent Approvals - AgentFarms Dashboard",
};

interface PortalAgent {
    id: string;
    role: string;
    status: string;
    workspace: { name: string } | null;
}

export default async function AgentApprovalsPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;

    // slug == agent id (set by the agents list page)
    const data = await portalFetch<{ agent: PortalAgent }>(`/portal/data/agents/${encodeURIComponent(slug)}`);
    if (!data?.agent) notFound();

    const agent = data.agent;
    const agentName = agent.workspace?.name ?? agent.role ?? slug;
    const user = await getPortalUser();

    return (
        <ApprovalsQueue
            scope="agent"
            agentSlug={slug}
            headerTitle={`${agentName} Approvals`}
            headerSubtitle="Pending requests that require human approval"
            backHref={`/dashboard/agents/${slug}`}
            userRole={user?.role}
        />
    );
}
