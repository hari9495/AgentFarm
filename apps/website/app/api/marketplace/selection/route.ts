import { NextResponse } from "next/server";
import { getSessionUser, saveMarketplaceSelection } from "@/lib/auth-store";

type SelectionPayload = {
    starterAgent?: string;
    config?: Record<string, unknown>;
};

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

export async function POST(request: Request) {
    const token = getCookieValue(request.headers.get("cookie"), COOKIE_NAME);
    if (!token) {
        return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const user = getSessionUser(token);
    if (!user) {
        return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
    }

    let payload: SelectionPayload;
    try {
        payload = (await request.json()) as SelectionPayload;
    } catch {
        return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const starterAgent = payload.starterAgent?.trim() ?? "";
    if (starterAgent.length < 3) {
        return NextResponse.json({ error: "Starter agent is required." }, { status: 400 });
    }

    saveMarketplaceSelection({
        userId: user.id,
        starterAgent,
        config: payload.config,
    });

    return NextResponse.json({
        status: "ok",
        starterAgent,
    });
}
