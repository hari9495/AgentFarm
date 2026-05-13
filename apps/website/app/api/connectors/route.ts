export const runtime = 'edge'

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-store";
import crypto from "crypto";

const SESSION_COOKIE = "agentfarm_session";
const GATEWAY_COOKIE = "agentfarm_gateway_session";

const API_GATEWAY_URL =
    process.env.API_GATEWAY_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:3000";

function getCookieValue(cookieHeader: string | null, name: string): string | null {
    if (!cookieHeader) return null;
    const cookie = cookieHeader
        .split(";")
        .map((p) => p.trim())
        .find((p) => p.startsWith(`${name}=`));
    return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : null;
}

async function gatewayFetch(
    path: string,
    options: RequestInit,
    gatewayToken: string
): Promise<Response> {
    return fetch(`${API_GATEWAY_URL}${path}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${gatewayToken}`,
            ...(options.headers ?? {}),
        },
    });
}

type GatewayInitiateResponse = {
    connector_id: string;
    connector_type: string;
    auth_session_id: string;
    state_nonce: string;
    authorization_url: string;
    expires_at: string;
    status: string;
    token_storage: string;
};

// â”€â”€ GET /api/connectors â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function GET(request: Request) {
    const cookies = request.headers.get("cookie");
    const token = getCookieValue(cookies, SESSION_COOKIE);
    if (!token) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const user = await getSessionUser(token);
    if (!user) return NextResponse.json({ error: "Invalid session." }, { status: 401 });

    const gatewayToken = getCookieValue(cookies, GATEWAY_COOKIE);
    if (!gatewayToken) {
        return NextResponse.json({ error: "connector_bridge_unavailable" }, { status: 503 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId") ?? user.gatewayWorkspaceId ?? "";
    const botId = searchParams.get("botId") ?? user.gatewayBotId ?? "";

    const qs = new URLSearchParams();
    if (workspaceId) qs.set("workspace_id", workspaceId);
    if (botId) qs.set("bot_id", botId);

    try {
        const res = await gatewayFetch(
            `/v1/connectors/health/summary?${qs.toString()}`,
            { method: "GET" },
            gatewayToken
        );
        const body: unknown = await res.json();
        if (!res.ok) {
            return NextResponse.json({ error: "gateway_error", detail: body }, { status: 502 });
        }
        return NextResponse.json(body);
    } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: "gateway_error", detail }, { status: 502 });
    }
}

// â”€â”€ POST /api/connectors â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function POST(request: Request) {
    const cookies = request.headers.get("cookie");
    const token = getCookieValue(cookies, SESSION_COOKIE);
    if (!token) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const user = await getSessionUser(token);
    if (!user) return NextResponse.json({ error: "Invalid session." }, { status: 401 });

    const gatewayToken = getCookieValue(cookies, GATEWAY_COOKIE);
    if (!gatewayToken) {
        return NextResponse.json({ error: "connector_bridge_unavailable" }, { status: 503 });
    }

    let body: {
        tool?: string;
        displayName?: string;
        baseUrl?: string;
        authMethod?: string;
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

    const workspaceId = body.workspaceId ?? user.gatewayWorkspaceId ?? "";

    try {
        if (body.authMethod === "oauth2") {
            const res = await gatewayFetch(
                "/v1/connectors/oauth/initiate",
                {
                    method: "POST",
                    body: JSON.stringify({
                        connector_type: body.tool.trim(),
                        workspace_id: workspaceId,
                    }),
                },
                gatewayToken
            );
            const data: unknown = await res.json();
            if (!res.ok) {
                return NextResponse.json({ error: "gateway_error", detail: data }, { status: 502 });
            }
            const initiateData = data as GatewayInitiateResponse;
            return NextResponse.json({
                status: "ok",
                nextStep: {
                    action: "oauth",
                    oauthUrl: initiateData.authorization_url,
                },
            });
        }

        // api_key or generic_rest â€” store credentials via gateway
        const connectorId = crypto.randomUUID();
        const res = await gatewayFetch(
            `/v1/connectors/${connectorId}/credentials`,
            {
                method: "PUT",
                body: JSON.stringify({
                    credentials: body.configValues ?? {},
                }),
            },
            gatewayToken
        );
        const data: unknown = await res.json();
        if (!res.ok) {
            return NextResponse.json({ error: "gateway_error", detail: data }, { status: 502 });
        }
        return NextResponse.json({ status: "ok", nextStep: { action: "ready" } });
    } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: "gateway_error", detail }, { status: 502 });
    }
}

