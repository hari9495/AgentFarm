import { NextResponse } from "next/server";
import { GATEWAY_URL } from "../../_utils";

export async function POST(request: Request): Promise<NextResponse> {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const upstream = await fetch(`${GATEWAY_URL}/portal/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });

    const data = (await upstream.json().catch(() => ({}))) as Record<string, unknown>;
    const response = NextResponse.json(data, { status: upstream.status });

    // Forward Set-Cookie from gateway so the browser receives the portal_session cookie.
    const setCookie = upstream.headers.get("set-cookie");
    if (setCookie) {
        response.headers.set("set-cookie", setCookie);
    }

    return response;
}
