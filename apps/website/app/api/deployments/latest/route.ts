import { NextResponse } from "next/server";
import { getPortalSessionFromRequest } from "@/lib/portal-api-auth";

export const dynamic = 'force-dynamic';


export async function GET(request: Request) {
    const session = await getPortalSessionFromRequest(request);
    if (!session) {
        return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    // No deployments yet for this workspace — return null so the panel shows its empty state.
    return NextResponse.json({
        status: "ok",
        deployment: null,
    });
}
