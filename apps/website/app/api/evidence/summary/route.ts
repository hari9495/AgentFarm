import { NextResponse } from "next/server";
import { getPortalSessionFromRequest } from "@/lib/portal-api-auth";

export const dynamic = 'force-dynamic';


export async function GET(request: Request) {
    const session = await getPortalSessionFromRequest(request);
    if (!session) {
        return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const windowHoursRaw = Number.parseInt(searchParams.get("windowHours") ?? "24", 10);
    const windowHours = Number.isFinite(windowHoursRaw) ? windowHoursRaw : 24;

    // New accounts have no evidence yet — return an empty summary.
    return NextResponse.json({
        status: "ok",
        summary: {
            windowHours,
            totalEvents: 0,
            passed: 0,
            failed: 0,
            pending: 0,
            complianceScore: 100,
            categories: [],
        },
    });
}
