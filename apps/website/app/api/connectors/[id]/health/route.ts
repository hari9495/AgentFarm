import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-store";

const SESSION_COOKIE = "agentfarm_session";
const GATEWAY_COOKIE = "agentfarm_gateway_session";

const API_GATEWAY_URL =
    process.env.API_GATEWAY_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:3000";

function getCookieValue(cookieHeader: string | null, name: string): string | null {
    if (!cookieHeader) return null;
    const cookie = cookieHeader
        .split(";")
        .map((p) => p.trim())
        .find((p) => p.startsWith(`${name}=`));
    return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : null;
}

async function gatewayFetch(
    path: string,
    options: RequestInit,
    gatewayToken: string
): Promise<Response> {
    return fetch(`${API_GATEWAY_URL}${path}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${gatewayToken}`,
            ...(options.headers ?? {}),
        },
    });
}

type RouteParams = { params: Promise<{ id: string }> };

// ── POST /api/connectors/[id]/health ─────────────────────────────────────────
export async function POST(request: Request, { params }: RouteParams) {
    const cookies = request.headers.get("cookie");
    const token = getCookieValue(cookies, SESSION_COOKIE);
    if (!token) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const user = getSessionUser(token);
    if (!user) return NextResponse.json({ error: "Invalid session." }, { status: 401 });

    const gatewayToken = getCookieValue(cookies, GATEWAY_COOKIE);
    if (!gatewayToken) {
        return NextResponse.json({ error: "connector_bridge_unavailable" }, { status: 503 });
    }

    const { id } = await params;
    const workspaceId = new URL(request.url).searchParams.get("workspaceId");

    try {
        const res = await gatewayFetch(
            "/v1/connectors/health/check",
            {
                method: "POST",
                body: JSON.stringify({ connectorId: id, workspaceId }),
            },
            gatewayToken
        );
        const body: unknown = await res.json();
        if (!res.ok) {
            return NextResponse.json({ error: "gateway_error", detail: body }, { status: 502 });
        }
        return NextResponse.json(body);
    } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: "gateway_error", detail }, { status: 502 });
    }
}
