import { NextResponse } from "next/server";
import { getPortalUserFromRequest } from "@/lib/portal-request-auth";

export const dynamic = 'force-dynamic';

const GATEWAY_URL = process.env.API_GATEWAY_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

// GET — list the managed connector catalog (Tier 2: pick a tool, paste a token, activate).
export async function GET(request: Request) {
    const user = await getPortalUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const res = await fetch(`${GATEWAY_URL}/v1/mcp/catalog`, {
            headers: { cookie: request.headers.get("cookie") ?? "" },
            cache: "no-store",
        });
        const body = await res.json().catch(() => ({ catalog: [] }));
        return NextResponse.json(body, { status: res.status });
    } catch {
        return NextResponse.json({ error: "Gateway unavailable" }, { status: 502 });
    }
}
