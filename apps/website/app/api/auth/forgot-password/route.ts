export const runtime = 'edge'

import { NextResponse } from "next/server";
import { findUserByEmail } from "@/lib/auth-store";
import { checkAuthRateLimit } from "@/lib/rate-limit";

type ForgotPasswordPayload = {
    email?: string;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getClientIp(request: Request): string {
    return (
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        request.headers.get("x-real-ip") ??
        "unknown"
    );
}

export async function POST(request: Request) {
    const ip = getClientIp(request);
    const rlIp = checkAuthRateLimit(`forgotpw-ip:${ip}`, 60 * 60 * 1000, 5);
    if (!rlIp.allowed) {
        return NextResponse.json(
            { error: "Too many requests. Please wait before retrying." },
            { status: 429, headers: { "Retry-After": String(Math.ceil(rlIp.retryAfterMs / 1000)) } },
        );
    }

    let payload: ForgotPasswordPayload;

    try {
        payload = (await request.json()) as ForgotPasswordPayload;
    } catch {
        return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const email = payload.email?.trim().toLowerCase() ?? "";

    if (email.length > 254) {
        return NextResponse.json({ error: "Email address is too long." }, { status: 400 });
    }

    if (!emailPattern.test(email)) {
        return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    // Per-address rate limit: prevent spamming a single target inbox.
    const rlEmail = checkAuthRateLimit(`forgotpw-email:${email}`, 60 * 60 * 1000, 3);
    if (!rlEmail.allowed) {
        // Return generic OK to prevent user enumeration; still enforce the limit.
        return NextResponse.json({
            status: "ok",
            message: "If this account exists, a reset link has been sent.",
        });
    }

    // Account lookup is persisted, but response stays generic to prevent user enumeration.
    findUserByEmail(email);

    return NextResponse.json({
        status: "ok",
        message: "If this account exists, a reset link has been sent.",
    });
}

