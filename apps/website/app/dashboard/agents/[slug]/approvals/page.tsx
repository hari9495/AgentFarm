import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth-store";
import ApprovalsQueue from "@/components/dashboard/ApprovalsQueue";

export const metadata: Metadata = {
    title: "Agent Approvals - AgentFarms Dashboard",
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

const COOKIE_NAME = "agentfarm_session";

const getCookieValue = (cookieHeader: string | null, name: string): string | null => {
    if (!cookieHeader) return null;
    const cookie = cookieHeader.split(";").map((c) => c.trim()).find((c) => c.startsWith(`${name}=`));
    if (!cookie) return null;
    return decodeURIComponent(cookie.slice(name.length + 1));
};

export default async function AgentApprovalsPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const agent = agents[slug];
    if (!agent) notFound();

    const requestHeaders = await headers();
    const token = getCookieValue(requestHeaders.get("cookie"), COOKIE_NAME);
    const user = token ? await getSessionUser(token) : null;

    return (
        <ApprovalsQueue
            scope="agent"
            agentSlug={slug}
            headerTitle={`${agent.name} Approvals`}
            headerSubtitle="Pending requests that require human approval"
            backHref={`/dashboard/agents/${slug}`}
            userRole={user?.role}
        />
    );
}
