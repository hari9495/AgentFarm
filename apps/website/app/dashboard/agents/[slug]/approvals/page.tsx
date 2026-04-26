import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ApprovalsQueue from "@/components/dashboard/ApprovalsQueue";

export const metadata: Metadata = {
    title: "Agent Approvals - AgentFarm Dashboard",
};

const agents: Record<string, { name: string }> = {
    "ai-backend-developer": { name: "AI Backend Developer" },
    "ai-qa-engineer": { name: "AI QA Engineer" },
    "ai-devops-engineer": { name: "AI DevOps Engineer" },
    "ai-security-engineer": { name: "AI Security Engineer" },
};

export function generateStaticParams() {
    return Object.keys(agents).map((slug) => ({ slug }));
}

export default async function AgentApprovalsPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const agent = agents[slug];
    if (!agent) notFound();

    return (
        <ApprovalsQueue
            scope="agent"
            agentSlug={slug}
            headerTitle={`${agent.name} Approvals`}
            headerSubtitle="Pending requests that require human approval"
            backHref={`/dashboard/agents/${slug}`}
        />
    );
}
