
import { NextResponse } from "next/server";
import { getPortalUserFromRequest } from "@/lib/portal-request-auth";
import { getProvisioningStatusForUser, processProvisioningQueue } from "@/lib/auth-store";


type ProcessPayload = {
    limit?: number;
    jobIds?: string[];
    failJobIds?: string[];
};


export async function POST(request: Request) {
    const user = await getPortalUserFromRequest(request);
    if (!user) {
        return NextResponse.json({ error: "Authentication required." }, { status: 401 });
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

    const currentStatus = await getProvisioningStatusForUser(user.id);

    const result = await processProvisioningQueue({
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

