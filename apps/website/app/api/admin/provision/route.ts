export const runtime = 'edge'

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-store";

const SESSION_COOKIE = "agentfarm_session";
const GATEWAY_URL =
    process.env.API_GATEWAY_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
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

export async function POST(request: NextRequest) {
    const token = getCookieValue(request.headers.get("cookie"), SESSION_COOKIE);
    if (!token) {
        return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const user = await getSessionUser(token);
    if (!user) {
        return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
    }

    if (user.role !== "admin" && user.role !== "superadmin") {
        return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    let body: { tenantId?: string; orderId?: string } = {};
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const { tenantId, orderId } = body;
    if (!tenantId || !orderId) {
        return NextResponse.json({ error: "tenantId and orderId are required." }, { status: 400 });
    }

    if (typeof tenantId !== "string" || tenantId.trim().length === 0 || tenantId.length > 64 || /\s/.test(tenantId)) {
        return NextResponse.json({ error: "tenantId must be a non-empty string with no spaces, max 64 characters." }, { status: 400 });
    }

    if (typeof orderId !== "string" || orderId.trim().length === 0 || orderId.length > 64 || /\s/.test(orderId)) {
        return NextResponse.json({ error: "orderId must be a non-empty string with no spaces, max 64 characters." }, { status: 400 });
    }

    const gatewayToken = user.gatewayToken ?? token;

    const res = await fetch(`${GATEWAY_URL}/v1/admin/provision`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${gatewayToken}`,
        },
        body: JSON.stringify({ tenantId, orderId }),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
}

