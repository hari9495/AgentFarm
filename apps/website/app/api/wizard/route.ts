import { NextRequest, NextResponse } from "next/server";
import { getPortalUserFromRequest } from "@/lib/portal-request-auth";

const GATEWAY_URL =
    process.env.API_GATEWAY_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:3000";

// POST /api/wizard — start a new setup wizard session
export async function POST(request: NextRequest) {
    const user = await getPortalUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    let body: { initialRoleKey?: string } = {};
    try {
        body = await request.json();
    } catch {
        // body is optional
    }

    const res = await fetch(`${GATEWAY_URL}/v1/setup-wizard`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            cookie: request.headers.get("cookie") ?? "",
        },
        body: JSON.stringify(body),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
}
