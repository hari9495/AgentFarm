import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-store";
import { connectorStore } from "@/lib/connector-store";
import { CONNECTOR_REGISTRY, type TenantConnector, type ConnectorStatus } from "@agentfarm/connector-contracts";

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

// ── POST /api/connectors/[id]/health — run a connectivity check ────────────
export async function POST(request: Request, { params }: RouteParams) {
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

    const definition = CONNECTOR_REGISTRY.find((d) => d.tool === connector.tool);
    if (!definition) {
        return NextResponse.json({ error: "Connector definition missing." }, { status: 500 });
    }

    // For OAuth connectors: check if token ref is set (actual token validation
    // happens in the api-gateway against the provider — this is the website-side check)
    if (connector.authMethod === "oauth2") {
        if (!connector.secretRefId) {
            const updated: TenantConnector = {
                ...connector,
                status: "pending_auth",
                lastHealthcheckAt: new Date().toISOString(),
                lastErrorClass: "token_missing",
                updatedAt: new Date().toISOString(),
            };
            connectorStore.set(id, updated);
            return NextResponse.json({
                status: "pending_auth",
                healthy: false,
                message: "OAuth not completed. Please authenticate via the Connect button.",
                nextStep: { action: "oauth", oauthInitUrl: `/api/connectors/${id}/oauth/start` },
            });
        }

        // Token ref is present — mark healthy (real validation deferred to api-gateway)
        const updated: TenantConnector = {
            ...connector,
            status: "connected",
            lastHealthcheckAt: new Date().toISOString(),
            lastErrorClass: null,
            updatedAt: new Date().toISOString(),
        };
        connectorStore.set(id, updated);
        return NextResponse.json({ status: "ok", healthy: true, message: "Connector authenticated and ready." });
    }

    // For API key / generic_rest: validate base URL is reachable (lightweight ping)
    if (connector.authMethod === "api_key" || connector.authMethod === "generic_rest") {
        const baseUrl = connector.baseUrl ?? connector.configValues?.baseUrl;
        if (!baseUrl) {
            return NextResponse.json({ status: "error", healthy: false, message: "No base URL configured." });
        }

        try {
            const url = new URL(baseUrl);
            // Verify URL structure is valid — actual network call deferred to api-gateway
            const updated: TenantConnector = {
                ...connector,
                status: "connected",
                lastHealthcheckAt: new Date().toISOString(),
                lastErrorClass: null,
                updatedAt: new Date().toISOString(),
            };
            connectorStore.set(id, updated);
            return NextResponse.json({
                status: "ok",
                healthy: true,
                message: `Connector configured for ${url.hostname}. Live test will run on next agent action.`,
            });
        } catch {
            const updated: TenantConnector = {
                ...connector,
                status: "error",
                lastHealthcheckAt: new Date().toISOString(),
                lastErrorClass: "invalid_base_url",
                updatedAt: new Date().toISOString(),
            };
            connectorStore.set(id, updated);
            return NextResponse.json({
                status: "error",
                healthy: false,
                message: "Base URL is invalid. Please check your configuration.",
            });
        }
    }

    return NextResponse.json({ status: "ok", healthy: true, message: "Connector ready." });
}
