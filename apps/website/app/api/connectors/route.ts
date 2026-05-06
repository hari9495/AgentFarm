import { NextResponse } from "next/server";
import { getSessionUser, listWorkspaceBotsForUser } from "@/lib/auth-store";
import { connectorStore } from "@/lib/connector-store";
import {
    CONNECTOR_REGISTRY,
    type ConnectorTool,
    type ConnectorCategory,
    type TenantConnector,
    type AgentRoleKey,
} from "@agentfarm/connector-contracts";
import crypto from "crypto";

const COOKIE_NAME = "agentfarm_session";

function getCookieValue(cookieHeader: string | null, name: string): string | null {
    if (!cookieHeader) return null;
    const cookie = cookieHeader
        .split(";")
        .map((p) => p.trim())
        .find((p) => p.startsWith(`${name}=`));
    return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : null;
}

type WorkspaceBotContext = {
    workspaceId: string;
    workspaceName: string;
    roleType: AgentRoleKey | string;
    botId: string;
    botName: string;
    botStatus: string;
    policyPackVersion: string;
};

const resolveWorkspaceBotContext = (input: {
    userId: string;
    requestedWorkspaceId: string | null;
    requestedBotId: string | null;
}): {
    selected: WorkspaceBotContext;
    all: WorkspaceBotContext[];
} | null => {
    const options = listWorkspaceBotsForUser(input.userId).map((item) => ({
        workspaceId: item.workspaceId,
        workspaceName: item.workspaceName,
        roleType: item.roleType,
        botId: item.botId,
        botName: item.botName,
        botStatus: item.botStatus,
        policyPackVersion: item.policyPackVersion,
    }));

    if (options.length === 0) {
        return null;
    }

    let selected = options[0];

    if (input.requestedWorkspaceId || input.requestedBotId) {
        const exact = options.find((option) => {
            const workspaceMatch = input.requestedWorkspaceId ? option.workspaceId === input.requestedWorkspaceId : true;
            const botMatch = input.requestedBotId ? option.botId === input.requestedBotId : true;
            return workspaceMatch && botMatch;
        });
        if (exact) {
            selected = exact;
        }
    }

    return { selected, all: options };
};

const isConnectorAllowedForRole = (roleType: string, tool: ConnectorTool): boolean => {
    const definition = CONNECTOR_REGISTRY.find((item) => item.tool === tool);
    if (!definition) return false;
    if (!definition.allowedRoles || definition.allowedRoles.length === 0) return true;
    return definition.allowedRoles.includes(roleType as AgentRoleKey);
};

// ── GET /api/connectors — list connectors for the current workspace ────────
export async function GET(request: Request) {
    const token = getCookieValue(request.headers.get("cookie"), COOKIE_NAME);
    if (!token) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const user = getSessionUser(token);
    if (!user) return NextResponse.json({ error: "Invalid session." }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category") as ConnectorCategory | null;
    const requestedWorkspaceId = searchParams.get("workspaceId");
    const requestedBotId = searchParams.get("botId");

    const context = resolveWorkspaceBotContext({
        userId: user.id,
        requestedWorkspaceId,
        requestedBotId,
    });

    if (!context) {
        return NextResponse.json({ error: "No workspace or bot context found for user." }, { status: 404 });
    }

    const selectedRole = context.selected.roleType;

    // Return both: what they have configured + the full registry they can add
    const tenantConnectors = Array.from(connectorStore.values()).filter(
        (c) => c.tenantId === user.company && c.workspaceId === context.selected.workspaceId
    );

    const allowedDefinitions = CONNECTOR_REGISTRY.filter((def) => isConnectorAllowedForRole(selectedRole, def.tool));
    const hiddenDefinitionCount = CONNECTOR_REGISTRY.length - allowedDefinitions.length;

    const available = allowedDefinitions.filter((def) =>
        category ? def.category === category : true
    ).map((def) => ({
        tool: def.tool,
        category: def.category,
        displayName: def.displayName,
        logoUrl: def.logoUrl,
        authMethod: def.authMethod,
        supportedActions: def.supportedActions,
        docsUrl: def.docsUrl,
        configSchema: def.configSchema ?? null,
        oauthScopes: def.oauthScopes ?? null,
        // is this tool already connected by this tenant?
        connected: tenantConnectors.some((c) => c.tool === def.tool),
    }));

    return NextResponse.json({
        status: "ok",
        configured: tenantConnectors,
        available,
        context: {
            selectedWorkspaceId: context.selected.workspaceId,
            selectedBotId: context.selected.botId,
            selectedRoleKey: selectedRole,
            selectedPolicyPackVersion: context.selected.policyPackVersion,
            options: context.all,
            disallowed_tools_hidden_count: hiddenDefinitionCount,
        },
    });
}

// ── POST /api/connectors — add / configure a connector ────────────────────
export async function POST(request: Request) {
    const token = getCookieValue(request.headers.get("cookie"), COOKIE_NAME);
    if (!token) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const user = getSessionUser(token);
    if (!user) return NextResponse.json({ error: "Invalid session." }, { status: 401 });

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

    const tool = body.tool?.trim() as ConnectorTool | undefined;
    if (!tool) return NextResponse.json({ error: "tool is required." }, { status: 400 });

    const definition = CONNECTOR_REGISTRY.find((d) => d.tool === tool);
    if (!definition) {
        return NextResponse.json(
            { error: `Unknown tool: ${tool}. Check GET /api/connectors for supported tools.` },
            { status: 400 }
        );
    }

    const context = resolveWorkspaceBotContext({
        userId: user.id,
        requestedWorkspaceId: body.workspaceId ?? null,
        requestedBotId: body.botId ?? null,
    });
    if (!context) {
        return NextResponse.json({ error: "No workspace or bot context found for user." }, { status: 404 });
    }

    if (!isConnectorAllowedForRole(context.selected.roleType, tool)) {
        return NextResponse.json(
            {
                error: `Tool '${tool}' is not allowed for role '${context.selected.roleType}'.`,
                selected_role: context.selected.roleType,
            },
            { status: 403 },
        );
    }

    // Validate required configSchema fields for non-OAuth connectors
    if (definition.configSchema && definition.configSchema.length > 0) {
        const missing = definition.configSchema
            .filter((f) => f.required)
            .filter((f) => !body.configValues?.[f.key])
            .map((f) => f.key);

        if (missing.length > 0) {
            return NextResponse.json(
                { error: `Missing required config fields: ${missing.join(", ")}` },
                { status: 400 }
            );
        }
    }

    // For generic REST connectors, base URL is required.
    // We detect this by authMethod so all custom REST categories are covered.
    const configuredBaseUrl = body.baseUrl ?? body.configValues?.baseUrl;
    if (definition.authMethod === "generic_rest" && !configuredBaseUrl) {
        return NextResponse.json({ error: "baseUrl is required for custom REST connectors." }, { status: 400 });
    }

    const connectorId = `conn_${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    const connector: TenantConnector = {
        connectorId,
        tenantId: user.company,
        workspaceId: context.selected.workspaceId,
        tool,
        category: definition.category,
        displayName: body.displayName?.trim() || definition.displayName,
        status: definition.authMethod === "oauth2" ? "pending_auth" : "connected",
        authMethod: definition.authMethod,
        secretRefId: null,
        baseUrl: configuredBaseUrl,
        configValues: body.configValues,
        lastHealthcheckAt: null,
        lastErrorClass: null,
        createdAt: now,
        updatedAt: now,
        createdByUserId: user.id,
    };

    connectorStore.set(connectorId, connector);

    // For OAuth connectors, return the auth URL the customer needs to open
    const oauthInitUrl =
        definition.authMethod === "oauth2"
            ? `/api/connectors/${connectorId}/oauth/start`
            : null;

    return NextResponse.json(
        {
            status: "ok",
            connector,
            context: {
                selectedWorkspaceId: context.selected.workspaceId,
                selectedBotId: context.selected.botId,
                selectedRoleKey: context.selected.roleType,
            },
            nextStep:
                definition.authMethod === "oauth2"
                    ? { action: "oauth", oauthInitUrl, message: "Visit oauthInitUrl to complete authentication." }
                    : { action: "ready", message: "Connector configured and ready." },
        },
        { status: 201 }
    );
}
