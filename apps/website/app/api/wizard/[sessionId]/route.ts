import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-store";

const SESSION_COOKIE = "agentfarm_session";
const GATEWAY_URL =
    process.env.API_GATEWAY_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:3000";

function getCookieValue(cookieHeader: string | null, name: string): string | null {
    if (!cookieHeader) return null;
    const cookie = cookieHeader
        .split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${name}=`));
    if (!cookie) return null;
    return decodeURIComponent(cookie.slice(name.length + 1));
}

type RouteContext = { params: Promise<{ sessionId: string }> };

// GET /api/wizard/[sessionId] — fetch wizard session state
export async function GET(request: NextRequest, context: RouteContext) {
    const { sessionId } = await context.params;
    const token = getCookieValue(request.headers.get("cookie"), SESSION_COOKIE);
    if (!token) {
        return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const user = await getSessionUser(token);
    if (!user) {
        return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
    }

    const gatewayToken = user.gatewayToken ?? token;

    const res = await fetch(`${GATEWAY_URL}/v1/setup-wizard/${encodeURIComponent(sessionId)}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${gatewayToken}` },
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
}

// PATCH /api/wizard/[sessionId] — advance a wizard step
export async function PATCH(request: NextRequest, context: RouteContext) {
    const { sessionId } = await context.params;
    const token = getCookieValue(request.headers.get("cookie"), SESSION_COOKIE);
    if (!token) {
        return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const user = await getSessionUser(token);
    if (!user) {
        return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const gatewayToken = user.gatewayToken ?? token;

    const res = await fetch(`${GATEWAY_URL}/v1/setup-wizard/${encodeURIComponent(sessionId)}/step`, {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${gatewayToken}`,
        },
        body: JSON.stringify(body),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
}

// POST /api/wizard/[sessionId] — complete wizard and fire provisioning
export async function POST(request: NextRequest, context: RouteContext) {
    const { sessionId } = await context.params;
    const token = getCookieValue(request.headers.get("cookie"), SESSION_COOKIE);
    if (!token) {
        return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const user = await getSessionUser(token);
    if (!user) {
        return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
    }

    const gatewayToken = user.gatewayToken ?? token;

    const res = await fetch(`${GATEWAY_URL}/v1/setup-wizard/${encodeURIComponent(sessionId)}/complete`, {
        method: "POST",
        headers: { Authorization: `Bearer ${gatewayToken}` },
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
}
