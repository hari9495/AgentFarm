import { NextResponse } from "next/server";
import { getPortalUserFromRequest } from "@/lib/portal-request-auth";

export const dynamic = 'force-dynamic';


const GATEWAY_URL = process.env.API_GATEWAY_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

export async function GET(request: Request) {
    const user = await getPortalUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        // workspace_id is optional on the gateway and the portal session is
        // already tenant-scoped — passing the tenant id here used to trip the
        // workspace scope check with a 403.
        const res = await fetch(
            `${GATEWAY_URL}/v1/governance/kpis?time_window_seconds=86400`,
            { headers: { cookie: request.headers.get("cookie") ?? "" }, cache: "no-store" }
        );
        const body = await res.json().catch(() => ({}));
        return NextResponse.json(body, { status: res.status });
    } catch {
        return NextResponse.json({ error: "Gateway unavailable" }, { status: 502 });
    }
}
