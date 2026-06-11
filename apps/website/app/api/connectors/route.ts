
import { NextResponse } from "next/server";
import { getPortalUserFromRequest } from "@/lib/portal-request-auth";

export const dynamic = 'force-dynamic';

const API_GATEWAY_URL =
    process.env.API_GATEWAY_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:3000";

// Map website tool names to gateway connector types
const TOOL_TO_CONNECTOR_TYPE: Record<string, string> = {
    generic_rest: "custom_api",
    generic_rest_messaging: "custom_api",
    generic_rest_code: "custom_api",
    generic_rest_email: "custom_api",
    jira: "jira",
    teams: "teams",
    github: "github",
    email: "email",
};

// Reverse map: gateway connector type → canonical tool name shown in the catalog
const CONNECTOR_TYPE_TO_TOOL: Record<string, string> = {
    custom_api: "generic_rest",
    jira: "jira",
    teams: "teams",
    github: "github",
    email: "generic_smtp",
};

// Forward portal_session cookie to gateway so its preHandler can inject the session.
// The gateway already supports portal_session as a v1 auth fallback.
function gatewayFetch(path: string, options: RequestInit, portalSessionToken: string): Promise<Response> {
    return fetch(`${API_GATEWAY_URL}${path}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            Cookie: `portal_session=${encodeURIComponent(portalSessionToken)}`,
            ...(options.headers ?? {}),
        },
    });
}

// Map form configValues to the snake_case credential shape each gateway validator expects.
function mapToGatewayCredentials(
    connectorType: string,
    configValues: Record<string, string>,
): Record<string, unknown> {
    // GitHub: { access_token, owner? }
    if (connectorType === "github") {
        const creds: Record<string, unknown> = { access_token: configValues["token"] ?? "" };
        if (configValues["owner"]) creds["owner"] = configValues["owner"];
        return creds;
    }

    // Jira: { base_url, email, api_token }
    if (connectorType === "jira") {
        return {
            base_url: configValues["baseUrl"] ?? "",
            email: configValues["email"] ?? "",
            api_token: configValues["apiToken"] ?? configValues["token"] ?? "",
        };
    }

    // Email: { type: "smtp"|"sendgrid", ... }
    if (connectorType === "email") {
        const type = configValues["type"] ?? "smtp";
        if (type === "sendgrid") return { type, api_key: configValues["apiKey"] ?? configValues["token"] ?? "" };
        return {
            type,
            host: configValues["host"] ?? "",
            port: Number(configValues["port"] ?? 587),
            user: configValues["user"] ?? "",
            pass: configValues["pass"] ?? configValues["password"] ?? "",
        };
    }

    // Custom REST API (default): { base_url, auth_type, bearer_token|api_key|basic_user+pass }
    const baseUrl = configValues["baseUrl"] ?? "";
    const rawAuthType = configValues["authType"] ?? "none";
    const authValue = configValues["authValue"] ?? "";
    const authHeader = configValues["authHeader"] ?? "";
    const authType = rawAuthType === "basic" ? "basic_auth" : rawAuthType;
    const creds: Record<string, unknown> = { base_url: baseUrl, auth_type: authType };
    if (authType === "bearer_token" && authValue) creds["bearer_token"] = authValue;
    if (authType === "api_key" && authValue) {
        creds["api_key"] = authValue;
        if (authHeader) creds["api_key_header"] = authHeader;
    }
    if (authType === "basic_auth" && authValue) {
        const idx = authValue.indexOf(":");
        creds["basic_user"] = idx >= 0 ? authValue.slice(0, idx) : authValue;
        creds["basic_pass"] = idx >= 0 ? authValue.slice(idx + 1) : "";
    }
    return creds;
}

function getPortalSessionToken(request: Request): string | null {
    const cookieHeader = request.headers.get("cookie") ?? "";
    const match = cookieHeader
        .split(";")
        .map((p) => p.trim())
        .find((p) => p.startsWith("portal_session="));
    return match ? decodeURIComponent(match.slice("portal_session=".length)) : null;
}

// ── GET /api/connectors ────────────────────────────────────────────────────
export async function GET(request: Request) {
    const user = await getPortalUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const portalToken = getPortalSessionToken(request);
    if (!portalToken) {
        return NextResponse.json({ error: "connector_bridge_unavailable" }, { status: 503 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId") ?? "";
    const botId = searchParams.get("botId") ?? "";

    const qs = new URLSearchParams();
    if (workspaceId) qs.set("workspace_id", workspaceId);
    if (botId) qs.set("bot_id", botId);

    try {
        const res = await gatewayFetch(
            `/v1/connectors/health/summary?${qs.toString()}`,
            { method: "GET" },
            portalToken,
        );
        const body: unknown = await res.json();
        if (!res.ok) {
            // Health/summary failed — still return a valid context using the workspace
            // from the portal session so the page can proceed.
            return NextResponse.json({
                configured: [],
                available: [],
                context: {
                    selectedWorkspaceId: user.workspaceIds[0] ?? "",
                    selectedBotId: "",
                    selectedRoleKey: "",
                    selectedPolicyPackVersion: "",
                    disallowed_tools_hidden_count: 0,
                    options: [],
                },
            });
        }
        // Transform gateway shape { workspace_id, connectors[] } → page-expected shape
        // { configured[], available[], context }. The page merges available[] with the
        // static catalog, so returning [] lets the static catalog show all options.
        const gw = body as {
            workspace_id?: string;
            connectors?: Array<{
                connector_id: string;
                connector_type: string;
                is_connected: boolean;
                status: string;
                last_healthcheck_at: string | null;
            }>;
        };
        const configured = (gw.connectors ?? []).map((c) => ({
            connectorId: c.connector_id,
            tool: CONNECTOR_TYPE_TO_TOOL[c.connector_type] ?? c.connector_type,
            category: "task_tracker",
            displayName: c.connector_type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
            status: c.is_connected ? "connected" : "disconnected",
            authMethod: "api_key",
            lastHealthcheckAt: c.last_healthcheck_at ?? null,
            lastErrorClass: null,
        }));
        return NextResponse.json({
            configured,
            available: [],
            context: {
                selectedWorkspaceId: gw.workspace_id || user.workspaceIds[0] || "",
                selectedBotId: "",
                selectedRoleKey: "",
                selectedPolicyPackVersion: "",
                disallowed_tools_hidden_count: 0,
                options: [],
            },
        });
    } catch (err) {
        // On network error, still return a valid context from the portal session.
        return NextResponse.json({
            configured: [],
            available: [],
            context: {
                selectedWorkspaceId: user.workspaceIds[0] ?? "",
                selectedBotId: "",
                selectedRoleKey: "",
                selectedPolicyPackVersion: "",
                disallowed_tools_hidden_count: 0,
                options: [],
            },
        });
    }
}

// ── POST /api/connectors ───────────────────────────────────────────────────
export async function POST(request: Request) {
    const user = await getPortalUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const portalToken = getPortalSessionToken(request);
    if (!portalToken) {
        return NextResponse.json({ error: "connector_bridge_unavailable" }, { status: 503 });
    }

    let body: {
        tool?: string;
        displayName?: string;
        configValues?: Record<string, string>;
        workspaceId?: string;
        botId?: string;
    };

    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    if (!body.tool?.trim()) {
        return NextResponse.json({ error: "tool is required." }, { status: 400 });
    }

    const connectorType = TOOL_TO_CONNECTOR_TYPE[body.tool.trim()] ?? body.tool.trim();
    let workspaceId = body.workspaceId ?? "";

    // Primary fallback: workspace already resolved by getPortalUserFromRequest.
    if (!workspaceId) {
        workspaceId = user.workspaceIds[0] ?? "";
    }

    // Secondary fallback: ask the gateway health/summary.
    if (!workspaceId) {
        try {
            const summaryRes = await gatewayFetch(
                "/v1/connectors/health/summary",
                { method: "GET" },
                portalToken,
            );
            if (summaryRes.ok) {
                const summaryData = await summaryRes.json() as { workspace_id?: string };
                workspaceId = summaryData.workspace_id ?? "";
            }
        } catch { /* fall through */ }
    }
    if (!workspaceId) {
        return NextResponse.json(
            { error: "workspace_required", detail: "No workspace found for your account. Please contact support." },
            { status: 400 },
        );
    }

    // OAuth connectors redirect to provider auth
    const oauthTools = new Set(["teams"]);
    if (oauthTools.has(body.tool.trim())) {
        try {
            const res = await gatewayFetch(
                "/v1/connectors/oauth/initiate",
                {
                    method: "POST",
                    body: JSON.stringify({
                        connector_type: connectorType,
                        workspace_id: workspaceId,
                    }),
                },
                portalToken,
            );
            const data: unknown = await res.json();
            if (!res.ok) {
                return NextResponse.json({ error: "gateway_error", detail: data }, { status: 502 });
            }
            const initiateData = data as { authorization_url?: string };
            return NextResponse.json({
                status: "ok",
                nextStep: { action: "oauth", oauthUrl: initiateData.authorization_url },
            });
        } catch (err) {
            const detail = err instanceof Error ? err.message : String(err);
            return NextResponse.json({ error: "gateway_error", detail }, { status: 502 });
        }
    }

    // Non-OAuth: build a stable connectorId and PUT credentials.
    // Gateway auto-creates the metadata record if it doesn't exist yet.
    const connectorId = `${connectorType}:${user.tenantId}:${workspaceId}`;
    const credentials = mapToGatewayCredentials(connectorType, body.configValues ?? {});

    try {
        const res = await gatewayFetch(
            `/v1/connectors/${encodeURIComponent(connectorId)}/credentials`,
            { method: "PUT", body: JSON.stringify({ credentials }) },
            portalToken,
        );
        const data: unknown = await res.json();
        if (!res.ok) {
            return NextResponse.json({ error: "gateway_error", detail: data }, { status: 502 });
        }
        return NextResponse.json({ status: "ok", connectorId, nextStep: { action: "ready" } });
    } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: "gateway_error", detail }, { status: 502 });
    }
}
