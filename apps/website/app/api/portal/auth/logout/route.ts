import { NextResponse } from "next/server";
import { GATEWAY_URL } from "../../_utils";

export async function POST(request: Request): Promise<NextResponse> {
    const cookie = request.headers.get("cookie") ?? "";

    const upstream = await fetch(`${GATEWAY_URL}/portal/auth/logout`, {
        method: "POST",
        headers: { cookie },
    });

    const data = (await upstream.json().catch(() => ({}))) as Record<string, unknown>;
    const response = NextResponse.json(data, { status: upstream.status });

    // Forward the cleared portal_session cookie from the gateway.
    const setCookie = upstream.headers.get("set-cookie");
    if (setCookie) {
        response.headers.set("set-cookie", setCookie);
    }

    return response;
}
