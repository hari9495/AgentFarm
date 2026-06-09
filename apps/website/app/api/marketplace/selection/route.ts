
import { NextResponse } from "next/server";
import { getPortalUserFromRequest } from "@/lib/portal-request-auth";
import { saveMarketplaceSelection } from "@/lib/auth-store";

type SelectionPayload = {
    starterAgent?: string;
    config?: Record<string, unknown>;
};



export async function POST(request: Request) {
    const user = await getPortalUserFromRequest(request);
    if (!user) {
        return NextResponse.json({ error: "Authentication required." }, { status: 401 });
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

