import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
    getSessionUser,
    isCompanyOperatorEmail,
    revokeSessionById,
    writeAuditEvent,
} from "@/lib/auth-store";
import { checkRateLimit } from "@/lib/rate-limit";

const COOKIE_NAME = "agentfarm_session";

export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ sessionId: string }> },
) {
    const { sessionId } = await params;

    const jar = await cookies();
    const token = jar.get(COOKIE_NAME)?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = getSessionUser(token);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!isCompanyOperatorEmail(user.email)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const rl = checkRateLimit(user.id);
    if (!rl.allowed) {
        return NextResponse.json(
            { error: "Rate limit exceeded. Please wait before retrying." },
            { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
        );
    }

    if (!sessionId || typeof sessionId !== "string") {
        return NextResponse.json({ error: "Session ID is required." }, { status: 400 });
    }

    const result = revokeSessionById(sessionId);
    if (!result.ok) {
        return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }

    writeAuditEvent({
        actorId: user.id,
        actorEmail: user.email,
        action: "session.revoke",
        targetType: "session",
        targetId: sessionId,
        beforeState: { sessionId },
        afterState: { revoked: true },
        reason: "Revoked by company operator",
    });

    return NextResponse.json({ ok: true });
}
