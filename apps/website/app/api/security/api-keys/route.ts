import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-store";

const COOKIE_NAME = "agentfarm_session";
const GATEWAY_URL = process.env.API_GATEWAY_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

const getCookieValue = (h: string | null, name: string): string | null => {
    if (!h) return null;
    const c = h.split(";").map(p => p.trim()).find(p => p.startsWith(`${name}=`));
    return c ? decodeURIComponent(c.slice(name.length + 1)) : null;
};

export async function GET(request: Request) {
    const token = getCookieValue(request.headers.get("cookie"), COOKIE_NAME);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await getSessionUser(token);
    if (!user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });

    try {
        const res = await fetch(`${GATEWAY_URL}/v1/api-keys`, {
            headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
            cache: "no-store",
        });
        const body = await res.json().catch(() => ({}));
        return NextResponse.json(body, { status: res.status });
    } catch {
        return NextResponse.json({ error: "Gateway unavailable" }, { status: 502 });
    }
}

export async function POST(request: Request) {
    const token = getCookieValue(request.headers.get("cookie"), COOKIE_NAME);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await getSessionUser(token);
    if (!user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });

    const body = await request.json().catch(() => ({}));

    try {
        const res = await fetch(`${GATEWAY_URL}/v1/api-keys`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify(body),
            cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        return NextResponse.json(data, { status: res.status });
    } catch {
        return NextResponse.json({ error: "Gateway unavailable" }, { status: 502 });
    }
}
