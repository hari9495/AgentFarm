import { NextResponse } from "next/server";
import { consumeToken } from "../_magic-link-store";
import { findUserByEmail } from "@/lib/auth-store";
import { createSession } from "@/lib/auth-store";

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token") ?? "";

    if (!token) {
        return NextResponse.redirect(new URL("/login?error=invalid_link", request.url));
    }

    const email = consumeToken(token);

    if (!email) {
        // Token missing, already used, or expired
        return NextResponse.redirect(new URL("/login?error=expired_link", request.url));
    }

    // Look up the workspace account by email
    const user = await findUserByEmail(email);
    if (!user) {
        // Generic redirect — don't reveal account existence
        return NextResponse.redirect(new URL("/login?error=invalid_link", request.url));
    }

    // Create session cookie
    const { sessionToken } = await createSession(user.id);
    const response = NextResponse.redirect(new URL("/dashboard", request.url));
    response.cookies.set("agentfarm_session", sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 8 * 60 * 60, // 8 hours — matches SESSION_TTL_MS in auth-store
    });

    return response;
}
