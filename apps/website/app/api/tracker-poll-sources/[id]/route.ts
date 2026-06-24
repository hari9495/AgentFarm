import { NextResponse } from "next/server";
import { getPortalUserFromRequest } from "@/lib/portal-request-auth";

export const dynamic = 'force-dynamic';

const GATEWAY_URL = process.env.API_GATEWAY_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

function portalCookie(request: Request): string {
    return request.headers.get("cookie") ?? "";
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getPortalUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    try {
        const res = await fetch(`${GATEWAY_URL}/v1/tracker-poll-sources/${encodeURIComponent(id)}`, {
            method: "PATCH",
            headers: { cookie: portalCookie(request), "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        const resBody = await res.json().catch(() => ({}));
        return NextResponse.json(resBody, { status: res.status });
    } catch {
        return NextResponse.json({ error: "Gateway unavailable" }, { status: 502 });
    }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getPortalUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;

    try {
        const res = await fetch(`${GATEWAY_URL}/v1/tracker-poll-sources/${encodeURIComponent(id)}`, {
            method: "DELETE",
            headers: { cookie: portalCookie(request) },
        });
        const resBody = await res.json().catch(() => ({}));
        return NextResponse.json(resBody, { status: res.status });
    } catch {
        return NextResponse.json({ error: "Gateway unavailable" }, { status: 502 });
    }
}
