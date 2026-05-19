import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-store";

const COOKIE_NAME = "agentfarm_session";

function getCookieValue(header: string | null, name: string): string | null {
    if (!header) return null;
    const match = header.split(";").map(p => p.trim()).find(p => p.startsWith(`${name}=`));
    if (!match) return null;
    return decodeURIComponent(match.slice(name.length + 1));
}

export async function GET(request: Request) {
    const cookieHeader = request.headers.get("cookie");
    const token = getCookieValue(cookieHeader, COOKIE_NAME);

    console.log("[whoami] cookie header present:", !!cookieHeader);
    console.log("[whoami] token present:", !!token, "length:", token?.length);

    if (!token) {
        return NextResponse.json({ authenticated: false, reason: "no token" });
    }

    try {
        const user = await getSessionUser(token);
        console.log("[whoami] getSessionUser result:", user ? user.email : "null");

        if (!user) {
            return NextResponse.json({ authenticated: false, reason: "session not found or expired" });
        }

        return NextResponse.json({ authenticated: true, user: { id: user.id, email: user.email, role: user.role } });
    } catch (err) {
        console.error("[whoami] getSessionUser threw:", err);
        return NextResponse.json({ authenticated: false, reason: "error", error: String(err) }, { status: 500 });
    }
}
