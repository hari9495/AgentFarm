import { NextRequest, NextResponse } from "next/server";
import { getPortalUserFromRequest } from "@/lib/portal-request-auth";

export const dynamic = 'force-dynamic';


const GATEWAY_URL =
    process.env.API_GATEWAY_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:3000";

type RouteContext = { params: Promise<{ sessionId: string }> };

// GET /api/wizard/[sessionId] — fetch wizard session state
export async function GET(request: NextRequest, context: RouteContext) {
    const { sessionId } = await context.params;
    const user = await getPortalUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const res = await fetch(`${GATEWAY_URL}/v1/setup-wizard/${encodeURIComponent(sessionId)}`, {
        method: "GET",
        headers: { cookie: request.headers.get("cookie") ?? "" },
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
}

// PATCH /api/wizard/[sessionId] — advance a wizard step
export async function PATCH(request: NextRequest, context: RouteContext) {
    const { sessionId } = await context.params;
    const user = await getPortalUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const res = await fetch(`${GATEWAY_URL}/v1/setup-wizard/${encodeURIComponent(sessionId)}/step`, {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json",
            cookie: request.headers.get("cookie") ?? "",
        },
        body: JSON.stringify(body),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
}

// POST /api/wizard/[sessionId] — complete wizard and fire provisioning
export async function POST(request: NextRequest, context: RouteContext) {
    const { sessionId } = await context.params;
    const user = await getPortalUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const res = await fetch(`${GATEWAY_URL}/v1/setup-wizard/${encodeURIComponent(sessionId)}/complete`, {
        method: "POST",
        headers: { cookie: request.headers.get("cookie") ?? "" },
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
}
