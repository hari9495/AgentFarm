
import { NextResponse } from "next/server";
import { getSessionUser, listTeamMembers } from "@/lib/auth-store";

const SESSION_COOKIE = "agentfarm_session";

function getCookieValue(cookieHeader: string | null, name: string): string | null {
    if (!cookieHeader) return null;
    const cookie = cookieHeader
        .split(";")
        .map((p) => p.trim())
        .find((p) => p.startsWith(`${name}=`));
    return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : null;
}

export async function GET(request: Request) {
    const cookies = request.headers.get("cookie");
    const token = getCookieValue(cookies, SESSION_COOKIE);
    if (!token) {
        return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const user = await getSessionUser(token);
    if (!user) {
        return NextResponse.json({ error: "Invalid session." }, { status: 401 });
    }
    if (!user.tenantId) {
        return NextResponse.json({ members: [] });
    }

    const members = await listTeamMembers(user.tenantId);
    return NextResponse.json({ members });
}
