import { NextResponse } from "next/server";
import { getPortalUserFromRequest } from "@/lib/portal-request-auth";

const GATEWAY_URL = process.env.API_GATEWAY_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

export async function PATCH(request: Request, { params }: { params: Promise<{ keyId: string }> }) {
    const user = await getPortalUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { keyId } = await params;
    const body = await request.json().catch(() => ({}));

    try {
        const res = await fetch(`${GATEWAY_URL}/v1/api-keys/${encodeURIComponent(keyId)}`, {
            method: "PATCH",
            headers: { cookie: request.headers.get("cookie") ?? "", "Content-Type": "application/json" },
            body: JSON.stringify(body),
            cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        return NextResponse.json(data, { status: res.status });
    } catch {
        return NextResponse.json({ error: "Gateway unavailable" }, { status: 502 });
    }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ keyId: string }> }) {
    const user = await getPortalUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { keyId } = await params;

    try {
        const res = await fetch(`${GATEWAY_URL}/v1/api-keys/${encodeURIComponent(keyId)}`, {
            method: "DELETE",
            headers: { cookie: request.headers.get("cookie") ?? "" },
            cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        return NextResponse.json(data, { status: res.status });
    } catch {
        return NextResponse.json({ error: "Gateway unavailable" }, { status: 502 });
    }
}
