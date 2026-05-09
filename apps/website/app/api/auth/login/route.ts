import { NextResponse } from "next/server";
import { authenticateUser, createSession, updateUserGatewayToken } from "@/lib/auth-store";

type LoginPayload = {
    email?: string;
    password?: string;
    from?: string;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COOKIE_NAME = "agentfarm_session";
const INTERNAL_COOKIE_NAME = "agentfarm_internal_session";
const API_BASE = process.env.API_GATEWAY_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

const getInternalDashboardUrl = (): string => {
    const raw = (process.env.AGENTFARM_INTERNAL_DASHBOARD_URL ?? "http://localhost:3001").trim();

    try {
        const parsed = new URL(raw);
        return parsed.toString().replace(/\/$/, "");
    } catch {
        return "http://localhost:3001";
    }
};

const fetchInternalToken = async (email: string, password: string): Promise<string | null> => {
    try {
        const response = await fetch(`${API_BASE}/auth/internal-login`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email, password }),
            cache: "no-store",
        });

        if (!response.ok) {
            return null;
        }

        const body = (await response.json()) as { token?: string };
        return typeof body.token === "string" && body.token.length > 0 ? body.token : null;
    } catch {
        return null;
    }
};

const fetchGatewayToken = async (email: string, password: string): Promise<string | null> => {
    try {
        const response = await fetch(`${API_BASE}/auth/login`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email, password }),
            cache: "no-store",
        });

        if (!response.ok) {
            return null;
        }

        const body = (await response.json()) as { token?: string };
        return typeof body.token === "string" && body.token.length > 0 ? body.token : null;
    } catch {
        return null;
    }
};

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

    const isInternalUser = user.role === "admin" || user.role === "superadmin";
    const [internalToken, gatewayToken] = await Promise.all([
        isInternalUser ? fetchInternalToken(email, password) : Promise.resolve(null),
        fetchGatewayToken(email, password),
    ]);

    if (gatewayToken) {
        updateUserGatewayToken({ userId: user.id, gatewayToken });
    }

    const redirectTo = isInternalUser
        ? getInternalDashboardUrl()
        : sanitizeFrom(payload.from);

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

    if (internalToken) {
        response.cookies.set({
            name: INTERNAL_COOKIE_NAME,
            value: internalToken,
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            path: "/",
            maxAge: 8 * 60 * 60,
        });
    }

    if (gatewayToken) {
        response.cookies.set({
            name: "agentfarm_gateway_session",
            value: gatewayToken,
            httpOnly: true,
            sameSite: "strict",
            secure: process.env.NODE_ENV === "production",
            path: "/",
            maxAge: 8 * 60 * 60,
        });
    }

    return response;
}
