import { NextResponse } from "next/server";
import { getPortalSessionFromRequest } from "@/lib/portal-api-auth";

export async function GET(request: Request) {
    const session = await getPortalSessionFromRequest(request);
    if (!session) {
        return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    return NextResponse.json({
        authenticated: true,
        user: {
            id: session.accountId,
            email: session.email,
            displayName: session.displayName,
            tenantId: session.tenantId,
            role: session.role,
        },
        isCompanyOperator: false,
    });
}
