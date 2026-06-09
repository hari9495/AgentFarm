import { NextResponse } from "next/server";
import { getPortalSessionFromRequest } from "@/lib/portal-api-auth";

export const dynamic = 'force-dynamic';


// Default preferences for a new portal user
const DEFAULT_PREFS = {
    emailApprovals: true,
    emailDeployments: true,
    emailBilling: true,
    emailSecurity: true,
    browserApprovals: true,
    browserDeployments: false,
    browserBilling: false,
    browserSecurity: true,
    slackApprovals: false,
    slackDeployments: false,
    slackBilling: false,
};

type PrefRecord = typeof DEFAULT_PREFS;

export async function GET(request: Request) {
    const session = await getPortalSessionFromRequest(request);
    if (!session) {
        return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    return NextResponse.json({ status: "ok", prefs: DEFAULT_PREFS });
}

export async function PATCH(request: Request) {
    const session = await getPortalSessionFromRequest(request);
    if (!session) {
        return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    let body: Partial<Record<string, unknown>>;
    try {
        body = (await request.json()) as Partial<Record<string, unknown>>;
    } catch {
        return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const validKeys = new Set(Object.keys(DEFAULT_PREFS));
    const updates: Partial<PrefRecord> = {};

    for (const [key, value] of Object.entries(body)) {
        if (!validKeys.has(key)) {
            return NextResponse.json({ error: `Unknown preference key: ${key}` }, { status: 400 });
        }
        if (typeof value !== "boolean") {
            return NextResponse.json({ error: `Preference ${key} must be a boolean.` }, { status: 400 });
        }
        (updates as Record<string, boolean>)[key] = value;
    }

    if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: "No valid preference fields provided." }, { status: 400 });
    }

    const prefs = { ...DEFAULT_PREFS, ...updates };
    return NextResponse.json({ status: "ok", prefs });
}
