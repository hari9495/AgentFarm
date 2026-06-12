import { NextResponse } from "next/server";
import { getPortalUserFromRequest } from "@/lib/portal-request-auth";

export const dynamic = 'force-dynamic';

const GATEWAY_URL =
    process.env.API_GATEWAY_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:3000";

// Promote / demote a teammate (member ↔ admin) via the gateway portal team API.
export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    const user = await getPortalUserFromRequest(request);
    if (!user) {
        return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const { id } = await params;

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
    }

    try {
        const res = await fetch(
            `${GATEWAY_URL}/portal/data/team/members/${encodeURIComponent(id)}`,
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    cookie: request.headers.get("cookie") ?? "",
                },
                body: JSON.stringify(body),
            },
        );
        const data = await res.json().catch(() => ({}));
        return NextResponse.json(data, { status: res.status });
    } catch {
        return NextResponse.json({ error: "Team service unreachable." }, { status: 502 });
    }
}
