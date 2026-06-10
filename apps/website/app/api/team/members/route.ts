
import { NextResponse } from "next/server";
import { getPortalUserFromRequest } from "@/lib/portal-request-auth";
import { listTeamMembers, createTeamMember, findUserByEmail } from "@/lib/auth-store";

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const user = await getPortalUserFromRequest(request);
    if (!user) {
        return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    if (!user.tenantId) {
        return NextResponse.json({ members: [] });
    }

    const members = await listTeamMembers(user.tenantId);
    return NextResponse.json({ members });
}

export async function POST(request: Request) {
    const user = await getPortalUserFromRequest(request);
    if (!user) {
        return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    if (user.role !== "owner" && user.role !== "admin") {
        return NextResponse.json({ error: "Only admins can add team members." }, { status: 403 });
    }
    if (!user.tenantId) {
        return NextResponse.json({ error: "Your account is not linked to a tenant yet." }, { status: 400 });
    }

    let body: { name?: unknown; email?: unknown; password?: unknown; role?: unknown };
    try {
        body = (await request.json()) as typeof body;
    } catch {
        return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
    }

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const role = body.role === "admin" ? "admin" : "member";

    if (!name) return NextResponse.json({ error: "Name is required." }, { status: 422 });
    if (!email || !email.includes("@")) return NextResponse.json({ error: "A valid email is required." }, { status: 422 });
    if (password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 422 });

    try {
        const localUser = await findUserByEmail(user.email);
        const company = localUser?.company ?? user.email.split("@")[1] ?? "";

        const member = await createTeamMember({
            name,
            email,
            password,
            role,
            tenantId: user.tenantId,
            company,
        });
        return NextResponse.json({ ok: true, member }, { status: 201 });
    } catch (err) {
        const e = err as { code?: string; message?: string };
        if (e.code === "EMAIL_TAKEN") {
            return NextResponse.json({ error: "A user with that email already exists." }, { status: 409 });
        }
        return NextResponse.json({ error: "Failed to create team member." }, { status: 500 });
    }
}
