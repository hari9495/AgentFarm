import type { Metadata } from "next";
import { cookies } from "next/headers";
import TasksPageClient from "@/components/dashboard/TasksPageClient";

export const metadata: Metadata = {
    title: "Tasks - AgentFarms Dashboard",
    description: "Submit tasks to AI agents and view results.",
};

const GATEWAY_URL =
    process.env.API_GATEWAY_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:3000";

interface PortalAgent {
    id: string;
    role: string;
    status: string;
    workspace: { name: string } | null;
}

async function fetchAgents(token: string): Promise<PortalAgent[]> {
    try {
        const res = await fetch(`${GATEWAY_URL}/portal/data/agents?limit=50`, {
            headers: { cookie: `portal_session=${token}` },
            cache: "no-store",
        });
        if (!res.ok) return [];
        const data = (await res.json()) as { agents?: PortalAgent[] };
        return data.agents ?? [];
    } catch {
        return [];
    }
}

export default async function TasksPage() {
    const cookieStore = await cookies();
    const token = cookieStore.get("portal_session")?.value ?? "";
    const agents = await fetchAgents(token);

    return <TasksPageClient agents={agents} />;
}
