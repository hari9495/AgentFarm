import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, isCompanyOperatorEmail, listAuditEvents } from "@/lib/auth-store";
import { checkRateLimit } from "@/lib/rate-limit";

const COOKIE_NAME = "agentfarm_session";

export async function GET(req: NextRequest) {
    const jar = await cookies();
    const token = jar.get(COOKIE_NAME)?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = getSessionUser(token);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!isCompanyOperatorEmail(user.email)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const rl = checkRateLimit(user.id);
    if (!rl.allowed) {
        return NextResponse.json(
            { error: "Too many requests. Please wait before retrying." },
            {
                status: 429,
                headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) },
            },
        );
    }

    const { searchParams } = new URL(req.url);
    const actorEmail = searchParams.get("actorEmail") ?? undefined;
    const tenantId = searchParams.get("tenantId") ?? undefined;
    const action = searchParams.get("action") ?? undefined;
    const limitRaw = searchParams.get("limit") ?? undefined;
    const limit = limitRaw ? Number(limitRaw) : undefined;

    return NextResponse.json({
        events: listAuditEvents({ actorEmail, tenantId, action, limit }),
    });
}
