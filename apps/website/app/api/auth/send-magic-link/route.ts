import { NextResponse } from "next/server";
import { checkAuthRateLimit } from "@/lib/rate-limit";

// In-memory token store (process-local; acceptable for single-process prod / dev).
// In production replace with Redis or a DB table with a TTL index.
type MagicLinkEntry = { email: string; expiresAt: number };
const tokenStore = new Map<string, MagicLinkEntry>();
const EXPIRY_MS = 15 * 60 * 1000; // 15 minutes

function getClientIp(req: Request): string {
    return (
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        req.headers.get("x-real-ip") ??
        "unknown"
    );
}

function generateToken(): string {
    const bytes = new Uint8Array(32);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Exported so verify route can read tokens (same process).
export function consumeToken(token: string): string | null {
    const entry = tokenStore.get(token);
    if (!entry) return null;
    tokenStore.delete(token);
    if (Date.now() > entry.expiresAt) return null;
    return entry.email;
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
    const ip = getClientIp(request);

    // Rate limit: 5 requests per IP per hour
    const rlIp = checkAuthRateLimit(`magic-ip:${ip}`, 60 * 60 * 1000, 5);
    if (!rlIp.allowed) {
        return NextResponse.json(
            { error: "Too many requests. Please wait before retrying." },
            { status: 429, headers: { "Retry-After": String(Math.ceil(rlIp.retryAfterMs / 1000)) } },
        );
    }

    let email = "";
    try {
        const body = (await request.json()) as { email?: string };
        email = body.email?.trim().toLowerCase() ?? "";
    } catch {
        return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    if (!emailPattern.test(email) || email.length > 254) {
        return NextResponse.json({ error: "Enter a valid work email address." }, { status: 400 });
    }

    // Rate limit: 3 magic links per email per hour (prevent inbox spam)
    const rlEmail = checkAuthRateLimit(`magic-email:${email}`, 60 * 60 * 1000, 3);
    if (!rlEmail.allowed) {
        // Generic response — don't reveal that this email is being rate-limited
        return NextResponse.json({ status: "ok" });
    }

    const token = generateToken();
    tokenStore.set(token, { email, expiresAt: Date.now() + EXPIRY_MS });

    const baseUrl =
        request.headers.get("origin") ??
        process.env.NEXT_PUBLIC_SITE_URL ??
        "http://localhost:3002";
    const magicLink = `${baseUrl}/api/auth/verify-magic-link?token=${token}`;

    // In production: send via transactional email (Resend, SendGrid, SES, etc.)
    // For now log to server console in development.
    if (process.env.NODE_ENV !== "production") {
        console.log(`[magic-link] ${email} → ${magicLink}`);
    }

    // Always return generic OK — never confirm whether an account exists
    return NextResponse.json({ status: "ok" });
}
