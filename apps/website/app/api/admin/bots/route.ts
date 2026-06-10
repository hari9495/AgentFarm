
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSessionUser, listBots } from "@/lib/auth-store";
import { getPortalUserFromRequest } from "@/lib/portal-request-auth";

const COOKIE_NAME = "agentfarm_session";

export async function GET(request: Request) {
    const jar = await cookies();
    const token = jar.get(COOKIE_NAME)?.value;

    if (token) {
        const user = await getSessionUser(token);
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    } else {
        // Fallback: portal customers viewing their bot status via the portal dashboard.
        const portalUser = await getPortalUserFromRequest(request);
        if (!portalUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const bots = await listBots();
    return NextResponse.json({ bots });
}
