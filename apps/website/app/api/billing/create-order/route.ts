
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

export async function POST(request: Request) {
    const cookies = request.headers.get("cookie");
    const token = getCookieValue(cookies, SESSION_COOKIE);
    if (!token) {
        return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const user = await getSessionUser(token);
    if (!user) {
        return NextResponse.json({ error: "Invalid session." }, { status: 401 });
    }

    let body: { planId?: unknown; customerEmail?: unknown; customerCountry?: unknown };
    try {
        body = (await request.json()) as {
            planId?: unknown;
            customerEmail?: unknown;
            customerCountry?: unknown;
        };
    } catch {
        return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const { planId, customerEmail, customerCountry } = body;
    if (typeof planId !== "string" || planId.trim() === "") {
        return NextResponse.json({ error: "planId is required." }, { status: 400 });
    }
    if (typeof customerEmail !== "string" || customerEmail.trim() === "") {
        return NextResponse.json({ error: "customerEmail is required." }, { status: 400 });
    }

    // Prefer gatewayTenantId if provisioned, fall back to local tenantId, then user id.
    const tenantId = user.gatewayTenantId ?? user.tenantId ?? user.id;

    try {
        const res = await fetch(`${API_GATEWAY_URL}/v1/billing/create-order`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                planId: planId.trim(),
                customerEmail: customerEmail.trim(),
                customerCountry: typeof customerCountry === "string" ? customerCountry.trim() : "US",
                tenantId,
            }),
        });

        const data: unknown = await res.json();
        return NextResponse.json(data, { status: res.status });
    } catch {
        return NextResponse.json({ error: "Gateway unavailable." }, { status: 500 });
    }
}

