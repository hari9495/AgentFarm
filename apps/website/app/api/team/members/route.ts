import { NextResponse } from "next/server";
import { getPortalUserFromRequest } from "@/lib/portal-request-auth";

export const dynamic = 'force-dynamic';

const GATEWAY_URL =
    process.env.API_GATEWAY_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:3000";

// Team roster lives in the gateway's TenantPortalAccount table — the same
// store portal login authenticates against, so invited members can sign in.

export async function GET(request: Request) {
    const user = await getPortalUserFromRequest(request);
    if (!user) {
        return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    try {
        const res = await fetch(`${GATEWAY_URL}/portal/data/team/members`, {
            headers: { cookie: request.headers.get("cookie") ?? "" },
            cache: "no-store",
        });
        const body = await res.json().catch(() => ({}));
        return NextResponse.json(body, { status: res.status });
    } catch {
        return NextResponse.json({ error: "Team service unreachable." }, { status: 502 });
    }
}

export async function POST(request: Request) {
    const user = await getPortalUserFromRequest(request);
    if (!user) {
        return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
    }

    try {
        const res = await fetch(`${GATEWAY_URL}/portal/data/team/members`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                cookie: request.headers.get("cookie") ?? "",
            },
            body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        return NextResponse.json(data, { status: res.status });
    } catch {
        return NextResponse.json({ error: "Team service unreachable." }, { status: 502 });
    }
}
