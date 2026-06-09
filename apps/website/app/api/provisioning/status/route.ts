import { NextResponse } from "next/server";
import { getPortalSessionFromRequest } from "@/lib/portal-api-auth";

export async function GET(request: Request) {
    const session = await getPortalSessionFromRequest(request);
    if (!session) {
        return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    // Portal users are in a fully provisioned workspace — no pending provisioning jobs.
    return NextResponse.json({
        status: "ok",
        tenant: { id: session.tenantId, tenantStatus: "ready" },
        workspace: null,
        bot: null,
        provisioningJob: null,
        provisioningTimeline: [],
        estimatedSecondsRemaining: null,
        slaMetrics: null,
        provisioningAlerts: [],
        autoProcessed: { processed: 0, completed: 0, failed: 0 },
    });
}
