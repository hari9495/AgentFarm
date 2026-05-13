export const runtime = 'edge'

import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, listAuditEvents } from "@/lib/auth-store";

const COOKIE_NAME = "agentfarm_session";

export async function GET(req: NextRequest) {
    const jar = await cookies();
    const token = jar.get(COOKIE_NAME)?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await getSessionUser(token);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin" && user.role !== "superadmin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = req.nextUrl;
    const actorEmail = searchParams.get("actor") ?? undefined;
    const action = searchParams.get("action") ?? undefined;
    const tenantId = searchParams.get("tenantId") ?? undefined;
    const limitRaw = searchParams.get("limit");
    const limit = limitRaw ? Math.min(500, Math.max(10, Number(limitRaw))) : 100;

    const events = await listAuditEvents({ actorEmail, action, tenantId, limit });
    return NextResponse.json({ events, count: events.length });
}

