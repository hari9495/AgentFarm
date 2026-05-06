import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-store";
import { connectorStore } from "@/lib/connector-store";
import { type TenantConnector } from "@agentfarm/connector-contracts";

const COOKIE_NAME = "agentfarm_session";

function getCookieValue(cookieHeader: string | null, name: string): string | null {
    if (!cookieHeader) return null;
    const cookie = cookieHeader
        .split(";")
        .map((p) => p.trim())
        .find((p) => p.startsWith(`${name}=`));
    return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : null;
}

type RouteParams = { params: Promise<{ id: string }> };

// ── GET /api/connectors/[id] — get a single connector ──────────────────────
export async function GET(request: Request, { params }: RouteParams) {
    const token = getCookieValue(request.headers.get("cookie"), COOKIE_NAME);
    if (!token) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const user = getSessionUser(token);
    if (!user) return NextResponse.json({ error: "Invalid session." }, { status: 401 });

    const { id } = await params;
    const connector = connectorStore.get(id);
    const requestedWorkspaceId = new URL(request.url).searchParams.get("workspaceId");
    if (!connector || connector.tenantId !== user.company) {
        return NextResponse.json({ error: "Connector not found." }, { status: 404 });
    }
    if (requestedWorkspaceId && connector.workspaceId !== requestedWorkspaceId) {
        return NextResponse.json({ error: "Connector not found." }, { status: 404 });
    }

    return NextResponse.json({ status: "ok", connector });
}

// ── PATCH /api/connectors/[id] — update display name, config values ─────────
export async function PATCH(request: Request, { params }: RouteParams) {
    const token = getCookieValue(request.headers.get("cookie"), COOKIE_NAME);
    if (!token) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const user = getSessionUser(token);
    if (!user) return NextResponse.json({ error: "Invalid session." }, { status: 401 });

    const { id } = await params;
    const connector = connectorStore.get(id);
    const requestedWorkspaceId = new URL(request.url).searchParams.get("workspaceId");
    if (!connector || connector.tenantId !== user.company) {
        return NextResponse.json({ error: "Connector not found." }, { status: 404 });
    }
    if (requestedWorkspaceId && connector.workspaceId !== requestedWorkspaceId) {
        return NextResponse.json({ error: "Connector not found." }, { status: 404 });
    }

    let body: { displayName?: string; baseUrl?: string; configValues?: Record<string, string> };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const updated: TenantConnector = {
        ...connector,
        displayName: body.displayName?.trim() ?? connector.displayName,
        baseUrl: body.baseUrl ?? connector.baseUrl,
        configValues: body.configValues
            ? { ...connector.configValues, ...body.configValues }
            : connector.configValues,
        updatedAt: new Date().toISOString(),
    };

    connectorStore.set(id, updated);

    return NextResponse.json({ status: "ok", connector: updated });
}

// ── DELETE /api/connectors/[id] — remove a connector ─────────────────────
export async function DELETE(request: Request, { params }: RouteParams) {
    const token = getCookieValue(request.headers.get("cookie"), COOKIE_NAME);
    if (!token) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const user = getSessionUser(token);
    if (!user) return NextResponse.json({ error: "Invalid session." }, { status: 401 });

    const { id } = await params;
    const connector = connectorStore.get(id);
    const requestedWorkspaceId = new URL(request.url).searchParams.get("workspaceId");
    if (!connector || connector.tenantId !== user.company) {
        return NextResponse.json({ error: "Connector not found." }, { status: 404 });
    }
    if (requestedWorkspaceId && connector.workspaceId !== requestedWorkspaceId) {
        return NextResponse.json({ error: "Connector not found." }, { status: 404 });
    }

    connectorStore.delete(id);

    return NextResponse.json({
        status: "ok",
        message: `Connector "${connector.displayName}" removed.`,
    });
}
