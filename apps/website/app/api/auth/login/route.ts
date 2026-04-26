import { NextResponse } from "next/server";
import { authenticateUser, createSession } from "@/lib/auth-store";

type LoginPayload = {
    email?: string;
    password?: string;
    from?: string;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COOKIE_NAME = "agentfarm_session";

/** Validate a post-login redirect path: must be relative and start with /. */
function sanitizeFrom(from: unknown): string {
    if (typeof from !== "string") return "/dashboard";
    const trimmed = from.trim();
    // Must be a relative path (no protocol, no //), no open redirects
    if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.includes(":")) {
        return "/dashboard";
    }
    return trimmed || "/dashboard";
}

export async function POST(request: Request) {
    let payload: LoginPayload;

    try {
        payload = (await request.json()) as LoginPayload;
    } catch {
        return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const email = payload.email?.trim().toLowerCase() ?? "";
    const password = payload.password ?? "";

    if (!emailPattern.test(email)) {
        return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    if (password.length < 8) {
        return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    const user = await authenticateUser(email, password);
    if (!user) {
        return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
    }

    const { sessionToken } = createSession(user.id);

    const redirectTo = sanitizeFrom(payload.from);

    const response = NextResponse.json({
        status: "ok",
        user,
        redirectTo,
    });

    response.cookies.set({
        name: COOKIE_NAME,
        value: sessionToken,
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 8 * 60 * 60,
    });

    return response;
}
