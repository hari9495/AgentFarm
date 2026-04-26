import { NextResponse } from "next/server";
import { getProvisioningStatusForUser, getSessionUser, processProvisioningQueue } from "@/lib/auth-store";

const COOKIE_NAME = "agentfarm_session";

type ProcessPayload = {
    limit?: number;
    jobIds?: string[];
    failJobIds?: string[];
};

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

    if (user.role === "member") {
        return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    let payload: ProcessPayload = {};
    try {
        payload = (await request.json()) as ProcessPayload;
    } catch {
        payload = {};
    }

    const currentStatus = getProvisioningStatusForUser(user.id);

    const result = processProvisioningQueue({
        limit: payload.limit,
        jobIds: payload.jobIds,
        tenantIds: currentStatus.tenant ? [currentStatus.tenant.id] : undefined,
        failJobIds: payload.failJobIds,
        actorId: user.id,
        actorEmail: user.email,
    });

    return NextResponse.json({
        status: "ok",
        ...result,
    });
}
