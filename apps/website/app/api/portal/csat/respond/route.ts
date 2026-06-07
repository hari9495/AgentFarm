
import { NextResponse } from "next/server";
import { GATEWAY_URL } from "../../_utils";

// CSAT surveys are authenticated by the token in the request body, not by
// portal_session — this proxy needs no session/cookie forwarding.
export async function POST(request: Request): Promise<NextResponse> {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const upstream = await fetch(`${GATEWAY_URL}/v1/portal/csat/respond`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });

    const data = (await upstream.json().catch(() => ({}))) as Record<string, unknown>;
    return NextResponse.json(data, { status: upstream.status });
}
