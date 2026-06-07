
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSessionUser, getUserById, isCompanyOperatorEmail, listTeamMembers, listUsers } from "@/lib/auth-store";

const COOKIE_NAME = "agentfarm_session";

export async function GET() {
    const jar = await cookies();
    const token = jar.get(COOKIE_NAME)?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await getSessionUser(token);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role === "member") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // SECURITY: this endpoint is reachable from BOTH the per-tenant Admin
    // Console (org admins managing their own roster) and the Company Portal
    // (AgentFarm staff managing every tenant's roster — by design). Only
    // staff get the unscoped, cross-tenant listUsers(); ordinary org admins
    // must only ever see users that belong to their own tenant — never
    // accept a tenant id from the request, always derive from the session.
    let users;
    if (isCompanyOperatorEmail(user.email)) {
        users = await listUsers();
    } else if (user.tenantId) {
        users = await listTeamMembers(user.tenantId);
    } else {
        const self = await getUserById(user.id);
        users = self ? [self] : [];
    }

    return NextResponse.json({ users });
}

