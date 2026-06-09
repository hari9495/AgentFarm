
import { NextResponse } from "next/server";
import { getPortalUserFromRequest } from "@/lib/portal-request-auth";
import { listTeamMembers } from "@/lib/auth-store";

export const dynamic = 'force-dynamic';



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
