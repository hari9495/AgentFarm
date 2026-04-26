import { NextResponse } from "next/server";
import { getSessionUser, isCompanyOperatorEmail } from "@/lib/auth-store";

const COOKIE_NAME = "agentfarm_session";

const getCookieValue = (cookieHeader: string | null, name: string): string | null => {
    if (!cookieHeader) return null;
    const cookie = cookieHeader
        .split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${name}=`));
    if (!cookie) return null;
    return decodeURIComponent(cookie.slice(name.length + 1));
};

export async function GET(request: Request) {
    const token = getCookieValue(request.headers.get("cookie"), COOKIE_NAME);
    if (!token) {
        return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    const user = getSessionUser(token);
    if (!user) {
        return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    return NextResponse.json({
        authenticated: true,
        user,
        isCompanyOperator: isCompanyOperatorEmail(user.email),
    });
}
