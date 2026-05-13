export const runtime = 'edge'

import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getUserById, getSessionUser, updateUserRole, UserRole, writeAuditEvent } from "@/lib/auth-store";

const COOKIE_NAME = "agentfarm_session";

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const jar = await cookies();
    const token = jar.get(COOKIE_NAME)?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const actor = await getSessionUser(token);
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (actor.role === "member") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id: targetId } = await params;
    let body: { role?: string; reason?: string };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const newRole = body.role;
    if (newRole !== "superadmin" && newRole !== "admin" && newRole !== "member") {
        return NextResponse.json({ error: "role must be 'superadmin', 'admin', or 'member'" }, { status: 400 });
    }

    const reason = (body.reason ?? "").trim();
    if (!reason) {
        return NextResponse.json({ error: "A reason is required when changing a user role." }, { status: 422 });
    }

    const targetBefore = await getUserById(targetId);
    const result = await updateUserRole(targetId, newRole as UserRole, actor.id, actor.role);
    if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 422 });
    }

    writeAuditEvent({
        actorId: actor.id,
        actorEmail: actor.email,
        action: "user.role_change",
        targetType: "user",
        targetId: targetId,
        tenantId: "",
        beforeState: { role: targetBefore?.role ?? "unknown" },
        afterState: { role: newRole },
        reason,
    });

    return NextResponse.json({ ok: true });
}
