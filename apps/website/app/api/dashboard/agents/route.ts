import { NextResponse } from "next/server";
import { getPortalSessionFromRequest, extractPortalTokenFromRequest } from "@/lib/portal-api-auth";

const GATEWAY_URL =
    process.env.API_GATEWAY_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:3000";

const ROLE_NAMES: Record<string, string> = {
    developer:                  "AI Developer",
    full_stack_developer:       "AI Full-Stack Developer",
    business_analyst:           "AI Business Analyst",
    sales_agent:                "AI Sales Agent",
    recruiter:                  "AI Recruiter",
    content_writer:             "AI Content Writer",
    technical_writer:           "AI Technical Writer",
    project_manager:            "AI Project Manager",
    marketing_specialist:       "AI Marketing Specialist",
    devops:                     "AI DevOps Engineer",
    customer_support_executive: "AI Customer Support",
    corporate_assistant:        "AI Corporate Assistant",
    mobile:                     "AI Mobile Developer",
    tester:                     "AI Tester",
    meeting_agent:              "AI Meeting Agent",
};

const ROLE_COLORS = [
    "bg-sky-500", "bg-violet-500", "bg-amber-500",
    "bg-rose-500", "bg-emerald-500", "bg-indigo-500",
];

function roleToDisplayName(role: string): string {
    return ROLE_NAMES[role] ?? role.split("_").map((w) => w[0]!.toUpperCase() + w.slice(1)).join(" ");
}

function roleToInitials(role: string): string {
    return roleToDisplayName(role)
        .replace(/^AI /, "")
        .split(" ")
        .map((w) => w[0] ?? "")
        .join("")
        .slice(0, 2)
        .toUpperCase();
}

export async function GET(request: Request) {
    const session = await getPortalSessionFromRequest(request);
    if (!session) {
        return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const token = extractPortalTokenFromRequest(request);

    try {
        const res = await fetch(`${GATEWAY_URL}/portal/data/agents?limit=20`, {
            headers: { cookie: `portal_session=${token}` },
            cache: "no-store",
        });

        if (!res.ok) {
            return NextResponse.json({ agents: [] });
        }

        const data = (await res.json()) as { agents: Array<{ id: string; role: string; status: string }> };

        const agents = data.agents.map((bot, idx) => ({
            id: bot.id,
            ini: roleToInitials(bot.role),
            name: roleToDisplayName(bot.role),
            aBg: ROLE_COLORS[idx % ROLE_COLORS.length]!,
            status: bot.status,
        }));

        return NextResponse.json({ agents });
    } catch {
        return NextResponse.json({ agents: [] });
    }
}
