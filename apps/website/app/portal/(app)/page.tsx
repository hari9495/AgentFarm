import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import OnboardingChecklist from "./onboarding-checklist";

const GATEWAY_URL =
    process.env.API_GATEWAY_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:3000";

async function fetchPortalData(token: string) {
    const headers = { cookie: `portal_session=${token}` };
    const base = GATEWAY_URL;

    const [agentsRes, usageRes, connectorsRes, schedulesRes] = await Promise.allSettled([
        fetch(`${base}/portal/data/agents?limit=10`,     { headers, cache: "no-store" }),
        fetch(`${base}/portal/data/usage`,               { headers, cache: "no-store" }),
        fetch(`${base}/portal/data/connectors`,          { headers, cache: "no-store" }),
        fetch(`${base}/v1/schedules`,                    { headers, cache: "no-store" }),
    ]);

    const agents = agentsRes.status === "fulfilled" && agentsRes.value.ok
        ? ((await agentsRes.value.json()) as { agents?: { status: string }[] }).agents ?? []
        : [];

    const usage = usageRes.status === "fulfilled" && usageRes.value.ok
        ? ((await usageRes.value.json()) as { totalTasks?: number })
        : { totalTasks: 0 };

    const connectors = connectorsRes.status === "fulfilled" && connectorsRes.value.ok
        ? ((await connectorsRes.value.json()) as { connectors?: { status: string }[] }).connectors ?? []
        : [];

    const schedules = schedulesRes.status === "fulfilled" && schedulesRes.value.ok
        ? ((await schedulesRes.value.json()) as { schedules?: unknown[] }).schedules ?? []
        : [];

    return {
        hasActiveAgent: agents.some((a) => a.status === "active"),
        hasAnyAgent: agents.length > 0,
        totalTasks: usage.totalTasks ?? 0,
        hasConnector: connectors.some((c) => c.status === "connected"),
        hasSchedule: schedules.length > 0,
    };
}

export default async function PortalHomePage() {
    const cookieStore = await cookies();
    const token = cookieStore.get("portal_session")?.value;
    if (!token) redirect("/portal/login");

    const data = await fetchPortalData(token).catch(() => ({
        hasActiveAgent: false,
        hasAnyAgent: false,
        totalTasks: 0,
        hasConnector: false,
        hasSchedule: false,
    }));

    const allDone =
        data.hasActiveAgent &&
        data.totalTasks > 0 &&
        data.hasConnector &&
        data.hasSchedule;

    return (
        <div>
            <div className="mb-6">
                <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                    {allDone ? "You're all set 🎉" : "Get started"}
                </h1>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {allDone
                        ? "Your agents are running. Check the pages below to see what they're doing."
                        : "Complete these steps to get the most out of your agents."}
                </p>
            </div>
            <OnboardingChecklist
                hasActiveAgent={data.hasActiveAgent}
                hasAnyAgent={data.hasAnyAgent}
                totalTasks={data.totalTasks}
                hasConnector={data.hasConnector}
                hasSchedule={data.hasSchedule}
            />
        </div>
    );
}
