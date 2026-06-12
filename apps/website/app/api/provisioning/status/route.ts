import { NextResponse } from "next/server";
import { getPortalSessionFromRequest } from "@/lib/portal-api-auth";

export const dynamic = 'force-dynamic';

const GATEWAY_URL =
    process.env.API_GATEWAY_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:3000";

export async function GET(request: Request) {
    const session = await getPortalSessionFromRequest(request);
    if (!session) {
        return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    try {
        const res = await fetch(`${GATEWAY_URL}/portal/data/provisioning/status`, {
            headers: { cookie: request.headers.get("cookie") ?? "" },
            cache: "no-store",
        });
        const body = await res.json().catch(() => null);
        if (!res.ok || !body) {
            return NextResponse.json(
                { error: "Unable to load provisioning status." },
                { status: res.ok ? 502 : res.status },
            );
        }
        return NextResponse.json(body);
    } catch {
        return NextResponse.json({ error: "Provisioning service unreachable." }, { status: 502 });
    }
}
