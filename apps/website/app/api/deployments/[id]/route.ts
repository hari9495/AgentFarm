
import { NextResponse } from "next/server";
import { getPortalUserFromRequest } from "@/lib/portal-request-auth";
import { getLatestDeploymentForUser } from "@/lib/auth-store";

export const dynamic = 'force-dynamic';




export async function GET(request: Request) {
    const user = await getPortalUserFromRequest(request);
    if (!user) {
        return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const latest = await getLatestDeploymentForUser(user.id);

    return NextResponse.json({
        status: "ok",
        deployment: latest,
    });
}

