
import { NextResponse } from "next/server";
import { GATEWAY_URL } from "../../_utils";

// CSAT surveys are authenticated by the token in the URL, not by portal_session —
// this proxy needs no session/cookie forwarding (matches gateway's public endpoint).
export async function GET(
    _request: Request,
    { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
    const { token } = await params;

    const upstream = await fetch(`${GATEWAY_URL}/v1/portal/csat/${encodeURIComponent(token)}`, {
        cache: "no-store",
    });

    const data = (await upstream.json().catch(() => ({}))) as Record<string, unknown>;
    return NextResponse.json(data, { status: upstream.status });
}
