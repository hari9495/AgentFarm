export const runtime = 'edge'

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-store";

const SESSION_COOKIE = "agentfarm_session";

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

export async function GET(request: Request) {
    const cookies = request.headers.get("cookie");
    const token = getCookieValue(cookies, SESSION_COOKIE);
    if (!token) {
        return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const user = await getSessionUser(token);
    if (!user) {
        return NextResponse.json({ error: "Invalid session." }, { status: 401 });
    }

    const tenantId = user.gatewayTenantId ?? user.tenantId ?? user.id;

    try {
        const res = await fetch(
            `${API_GATEWAY_URL}/v1/billing/orders/${encodeURIComponent(tenantId)}`,
            {
                // Forward session token so the gateway can validate it.
                headers: { Authorization: `Bearer ${token}` },
                cache: "no-store",
            },
        );
        const data: unknown = await res.json();
        return NextResponse.json(data, { status: res.status });
    } catch {
        return NextResponse.json({ error: "Gateway unavailable." }, { status: 500 });
    }
}

