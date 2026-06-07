
import { NextResponse } from "next/server";
import { GATEWAY_URL } from "../../_utils";

// Distinct from /api/portal/profile (which proxies the read-only /portal/data/profile
// endpoint). This proxies the account-settings mutation endpoint /portal/auth/profile.
export async function PATCH(request: Request): Promise<NextResponse> {
    const cookie = request.headers.get("cookie") ?? "";

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const upstream = await fetch(`${GATEWAY_URL}/portal/auth/profile`, {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify(body),
    });

    const data = (await upstream.json().catch(() => ({}))) as Record<string, unknown>;
    return NextResponse.json(data, { status: upstream.status });
}
