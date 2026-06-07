import { NextResponse } from "next/server";
import {
    getNotificationPrefs,
    getSessionUser,
    notificationPrefDefaults,
    updateNotificationPrefs,
    type NotificationPrefKey,
} from "@/lib/auth-store";

const COOKIE_NAME = "agentfarm_session";

const getCookieValue = (cookieHeader: string | null, name: string): string | null => {
    if (!cookieHeader) return null;
    const cookie = cookieHeader
        .split(";")
        .map((c) => c.trim())
        .find((c) => c.startsWith(`${name}=`));
    if (!cookie) return null;
    return decodeURIComponent(cookie.slice(name.length + 1));
};

const VALID_KEYS = new Set<NotificationPrefKey>(Object.keys(notificationPrefDefaults) as NotificationPrefKey[]);

async function authenticate(request: Request) {
    const token = getCookieValue(request.headers.get("cookie"), COOKIE_NAME);
    if (!token) return null;
    return getSessionUser(token);
}

export async function GET(request: Request) {
    const user = await authenticate(request);
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const prefs = await getNotificationPrefs(user.id);
    return NextResponse.json({ status: "ok", prefs });
}

export async function PATCH(request: Request) {
    const user = await authenticate(request);
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    let body: Partial<Record<string, unknown>>;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const updates: Partial<Record<NotificationPrefKey, boolean>> = {};
    for (const [key, value] of Object.entries(body)) {
        if (!VALID_KEYS.has(key as NotificationPrefKey)) {
            return NextResponse.json({ error: `Unknown preference key: ${key}` }, { status: 400 });
        }
        if (typeof value !== "boolean") {
            return NextResponse.json({ error: `Preference ${key} must be a boolean.` }, { status: 400 });
        }
        updates[key as NotificationPrefKey] = value;
    }

    if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: "No valid preference fields provided." }, { status: 400 });
    }

    const result = await updateNotificationPrefs(user.id, updates);
    return NextResponse.json({ status: "ok", prefs: result.prefs });
}
