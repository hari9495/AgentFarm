
import { NextResponse } from "next/server";
import { getSessionUser, deleteSession, deleteAccount } from "@/lib/auth-store";
import { checkAuthRateLimit } from "@/lib/rate-limit";

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

/**
 * DELETE /api/auth/delete-account
 *
 * Hard-deletes (anonymises) the authenticated user's account and all their data.
 * Satisfies GDPR Art. 17, DPDP s. 13, and CCPA "right to delete" obligations.
 *
 * Rate-limited to 3 attempts per 15 minutes per session to prevent abuse.
 * Requires a currently valid session cookie â€” no additional confirmation body
 * needed because the session already proves identity.
 */
export async function DELETE(request: Request) {
    const token = getCookieValue(request.headers.get("cookie"), COOKIE_NAME);
    if (!token) {
        return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    // Rate-limit by session token hash so a single session can't loop-delete
    const rateLimitKey = `delete-account:${token.slice(0, 16)}`;
    const rl = checkAuthRateLimit(rateLimitKey, 15 * 60 * 1000, 3);
    if (!rl.allowed) {
        return NextResponse.json(
            { error: "Too many requests. Try again later." },
            { status: 429 },
        );
    }

    const user = await getSessionUser(token);
    if (!user) {
        return NextResponse.json({ error: "Session not found or expired." }, { status: 401 });
    }

    const result = await deleteAccount(user.id);
    if (!result.ok) {
        return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    // Invalidate the session cookie on the client side
    const response = NextResponse.json({ status: "ok", message: "Account deleted." });
    response.cookies.set({
        name: COOKIE_NAME,
        value: "",
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 0,
    });
    return response;
}

