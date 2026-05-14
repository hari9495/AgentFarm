
import { NextResponse } from "next/server";
import { getProvisioningStatusForUser, getSessionUser, retryProvisioningJob } from "@/lib/auth-store";

const COOKIE_NAME = "agentfarm_session";

type RetryPayload = {
    jobId?: string;
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

    const user = await getSessionUser(token);
    if (!user) {
        return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
    }

    if (user.role === "member") {
        return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    let payload: RetryPayload;
    try {
        payload = (await request.json()) as RetryPayload;
    } catch {
        return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const requestedJobId = payload.jobId?.trim() ?? "";
    if (!requestedJobId) {
        return NextResponse.json({ error: "jobId is required." }, { status: 400 });
    }

    const currentStatus = await getProvisioningStatusForUser(user.id);
    if (!currentStatus.tenant) {
        return NextResponse.json({ error: "No tenant provisioning context found." }, { status: 404 });
    }

    const retryResult = await retryProvisioningJob({
        jobId: requestedJobId,
        requestedBy: user.id,
        actorId: user.id,
        actorEmail: user.email,
        expectedTenantId: currentStatus.tenant.id,
    });

    if (!retryResult.ok) {
        if (retryResult.error === "not_found") {
            return NextResponse.json({ error: "Provisioning job not found." }, { status: 404 });
        }
        if (retryResult.error === "retry_limit_exceeded") {
            return NextResponse.json(
                { error: "Retry attempt limit reached (max 3).", retryAttemptCount: retryResult.retryAttemptCount },
                { status: 429 },
            );
        }
        return NextResponse.json({ error: "Provisioning job is not retryable." }, { status: 409 });
    }

    return NextResponse.json({
        status: "ok",
        job: retryResult.job,
        reused: retryResult.reused,
        retryAttemptCount: retryResult.job.retryAttemptCount,
    });
}

