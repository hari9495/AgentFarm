
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, isCompanyOperatorEmail, updateUserRole, type UserRole } from "@/lib/auth-store";

const SESSION_COOKIE = "agentfarm_session";
const VALID_ROLES: readonly UserRole[] = ["member", "admin", "superadmin"];

function isValidRole(value: unknown): value is UserRole {
    return typeof value === "string" && (VALID_ROLES as readonly string[]).includes(value);
}
const GATEWAY_URL =
    process.env.API_GATEWAY_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:3000";

function getCookieValue(cookieHeader: string | null, name: string): string | null {
    if (!cookieHeader) return null;
    const cookie = cookieHeader
        .split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${name}=`));
    if (!cookie) return null;
    return decodeURIComponent(cookie.slice(name.length + 1));
}

export async function POST(request: NextRequest) {
    const token = getCookieValue(request.headers.get("cookie"), SESSION_COOKIE);
    if (!token) {
        return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const user = await getSessionUser(token);
    if (!user) {
        return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
    }

    if (user.role !== "admin" && user.role !== "superadmin") {
        return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    let body: { tenantId?: string; orderId?: string } = {};
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const { tenantId, orderId } = body;
    if (!tenantId || !orderId) {
        return NextResponse.json({ error: "tenantId and orderId are required." }, { status: 400 });
    }

    if (typeof tenantId !== "string" || tenantId.trim().length === 0 || tenantId.length > 64 || /\s/.test(tenantId)) {
        return NextResponse.json({ error: "tenantId must be a non-empty string with no spaces, max 64 characters." }, { status: 400 });
    }

    if (typeof orderId !== "string" || orderId.trim().length === 0 || orderId.length > 64 || /\s/.test(orderId)) {
        return NextResponse.json({ error: "orderId must be a non-empty string with no spaces, max 64 characters." }, { status: 400 });
    }

    const gatewayToken = user.gatewayToken ?? token;

    const res = await fetch(`${GATEWAY_URL}/v1/admin/provision`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${gatewayToken}`,
        },
        body: JSON.stringify({ tenantId, orderId }),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
}

/**
 * Promote/demote a user. Used by:
 *  - admin/users, admin/superadmin (per-tenant Admin Console — org admins
 *    managing their own roster)
 *  - the Company Portal (AgentFarm staff managing any tenant's roster)
 *
 * SECURITY: ordinary org admins/superadmins are tenant-scoped — they can
 * only change the role of users within their OWN tenant. AgentFarm staff
 * (isCompanyOperatorEmail) retain cross-tenant access via their existing,
 * separately-audited path. updateUserRole() enforces the tenant check, the
 * role-hierarchy rules (only superadmin can grant/revoke superadmin, can't
 * demote the last superadmin, can't demote yourself, etc.), and writes the
 * audit trail entry.
 */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const { id: targetUserId } = await context.params;

    const token = getCookieValue(request.headers.get("cookie"), SESSION_COOKIE);
    if (!token) {
        return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const user = await getSessionUser(token);
    if (!user) {
        return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
    }

    if (user.role !== "admin" && user.role !== "superadmin") {
        return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    let body: { role?: unknown; reason?: unknown } = {};
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    if (!isValidRole(body.role)) {
        return NextResponse.json({ error: "role must be one of: member, admin, superadmin." }, { status: 400 });
    }

    const isStaff = isCompanyOperatorEmail(user.email);
    // Ordinary org admins are scoped to their own tenant; staff pass through
    // unscoped (their existing cross-tenant path, gated separately above by
    // role and isCompanyOperatorEmail).
    const scopeToTenantId = isStaff ? undefined : user.tenantId;

    const result = await updateUserRole(targetUserId, body.role, user.id, user.role, user.email, scopeToTenantId);
    if (!result.ok) {
        const status = result.error === "User not found." ? 404 : 400;
        return NextResponse.json({ error: result.error ?? "Failed to update role." }, { status });
    }

    return NextResponse.json({ ok: true });
}

