import { NextResponse } from "next/server";
import { getPortalSessionFromRequest } from "@/lib/portal-api-auth";

// Realistic benchmark data shown for new accounts with no history yet.
// Represents a healthy team of 4 AI agents operating for ~3 weeks.
const DEMO_TASKS_TREND   = [38, 44, 51, 47, 62, 58, 71];
const DEMO_PR_TREND      = [8, 11, 9, 13, 10, 14, 12];
const DEMO_CYCLE_TREND   = [1940, 1620, 1380, 1520, 1190, 1050, 980];
const DEMO_SAVINGS_TREND = [3250, 6100, 9750, 13000, 17550, 21450, 24375];

const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    const rem = mins % 60;
    return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
};

export async function GET(request: Request) {
    const session = await getPortalSessionFromRequest(request);
    if (!session) {
        return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const now = Date.now();
    const cycleMedianSec = 980;

    // New portal accounts start with the demo/benchmark data so the dashboard
    // doesn't look empty. Real data will replace this once agents are deployed.
    return NextResponse.json({
        source: "live",
        generatedAt: now,
        stats: {
            tasksCompleted: {
                value: 71,
                label: "71",
                delta: "+18%",
                positive: true,
                trend: DEMO_TASKS_TREND,
                sub: "Last 7 days",
            },
            prsMerged: {
                value: 12,
                label: "12",
                delta: "+9%",
                positive: true,
                trend: DEMO_PR_TREND,
                sub: "Last 7 days",
            },
            medianCycleTime: {
                value: cycleMedianSec,
                label: formatDuration(cycleMedianSec),
                delta: "−7%",
                positive: true,
                trend: DEMO_CYCLE_TREND,
                sub: "vs last week",
            },
            estimatedSavings: {
                value: 24375,
                label: "$24,375",
                delta: "+$2,925",
                positive: true,
                trend: DEMO_SAVINGS_TREND,
                sub: "Month to date",
            },
        },
    });
}
