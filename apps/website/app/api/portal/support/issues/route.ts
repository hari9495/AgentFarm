
import { NextResponse } from "next/server";
import { GATEWAY_URL } from "../../_utils";

// Proxies the portal-scoped (portal_session-authenticated) issue list —
// NOT /v1/support/issues, which requires an operator session and would 401
// when only a portal_session cookie is present.
export async function GET(request: Request): Promise<NextResponse> {
    const cookie = request.headers.get("cookie") ?? "";
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const qs = status ? `?status=${encodeURIComponent(status)}` : "";

    const upstream = await fetch(`${GATEWAY_URL}/v1/portal/support/issues${qs}`, {
        headers: { cookie },
        cache: "no-store",
    });

    const data = (await upstream.json().catch(() => ({}))) as Record<string, unknown>;
    return NextResponse.json(data, { status: upstream.status });
}
