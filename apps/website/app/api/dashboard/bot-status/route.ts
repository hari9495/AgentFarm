import { NextResponse } from "next/server";
import { getPortalSessionFromRequest, extractPortalTokenFromRequest } from "@/lib/portal-api-auth";

export const dynamic = 'force-dynamic';

const GATEWAY_URL =
    process.env.API_GATEWAY_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:3000";

const TONES = ["sky", "violet", "amber", "rose", "emerald"];

type PortalAgent = { id: string; role: string; status: string; updatedAt: string };
type AgentUsage = { botId: string; taskCount: number; successRate: number };

const STATUS_MAP: Record<string, string> = {
    active: "active",
    created: "provisioning",
    paused: "paused",
    error: "error",
    maintenance: "maintenance",
};

function titleCase(role: string): string {
    return role.split(/[_\s]+/).filter(Boolean).map((w) => w[0]!.toUpperCase() + w.slice(1)).join(" ");
}

// Live bot status for the tenant: real agents joined with real task usage.
export async function GET(request: Request) {
    const session = await getPortalSessionFromRequest(request);
    if (!session) {
        return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const cookie = `portal_session=${extractPortalTokenFromRequest(request)}`;

    try {
        const [agentsRes, usageRes] = await Promise.all([
            fetch(`${GATEWAY_URL}/portal/data/agents?limit=100`, { headers: { cookie }, cache: "no-store" }),
            fetch(`${GATEWAY_URL}/portal/data/usage/agents`, { headers: { cookie }, cache: "no-store" }),
        ]);

        if (!agentsRes.ok) {
            return NextResponse.json({ error: "Unable to load agents." }, { status: agentsRes.status });
        }

        const agentsData = (await agentsRes.json()) as { agents: PortalAgent[] };
        const usageData = usageRes.ok
            ? ((await usageRes.json()) as { agents: AgentUsage[] })
            : { agents: [] };
        const usageByBot = new Map(usageData.agents.map((u) => [u.botId, u]));

        const bots = (agentsData.agents ?? []).map((bot, idx) => {
            const usage = usageByBot.get(bot.id);
            const taskCount = usage?.taskCount ?? 0;
            return {
                slug: bot.id,
                name: titleCase(bot.role),
                role: titleCase(bot.role),
                tone: TONES[idx % TONES.length]!,
                status: STATUS_MAP[bot.status] ?? "maintenance",
                autonomyLevel: "medium",
                approvalPolicy: "high-only",
                tasksCompleted: taskCount,
                reliabilityPct: taskCount > 0 ? Math.round((usage?.successRate ?? 0) * 1000) / 10 : 0,
                shiftStart: "09:00",
                shiftEnd: "18:00",
                activeDays: "mon,tue,wed,thu,fri",
                notes: "",
                lastActivityAt: new Date(bot.updatedAt).getTime(),
            };
        });

        return NextResponse.json({ bots });
    } catch {
        return NextResponse.json({ error: "Gateway unavailable" }, { status: 502 });
    }
}
