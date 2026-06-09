import { NextResponse } from "next/server";
import { getPortalSessionFromRequest } from "@/lib/portal-api-auth";

export async function GET(request: Request) {
    const session = await getPortalSessionFromRequest(request);
    if (!session) {
        return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    // New portal accounts start with no activity history.
    // Return an empty list so the ActivityFeed shows its empty state gracefully.
    return NextResponse.json({
        status: "ok",
        events: [],
    });
}
