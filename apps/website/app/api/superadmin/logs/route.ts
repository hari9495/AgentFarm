
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, listCompanyLogs, LogLevel, isCompanyOperatorEmail } from "@/lib/auth-store";

const COOKIE_NAME = "agentfarm_session";

export async function GET(req: NextRequest) {
    const jar = await cookies();
    const token = jar.get(COOKIE_NAME)?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await getSessionUser(token);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!isCompanyOperatorEmail(user.email)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get("tenantId") ?? undefined;
    const levelRaw = searchParams.get("level") ?? undefined;
    const limitRaw = searchParams.get("limit") ?? undefined;
    const level = levelRaw === "info" || levelRaw === "warn" || levelRaw === "error" ? (levelRaw as LogLevel) : undefined;
    const limit = limitRaw ? Number(limitRaw) : undefined;

    return NextResponse.json({
        logs: listCompanyLogs({ tenantId, level, limit }),
    });
}

