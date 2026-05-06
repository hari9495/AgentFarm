import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { GET as getConnectors, POST as postConnectors } from "../app/api/connectors/route";
import {
    createSession,
    createUser,
    initializeTenantWorkspaceAndBot,
} from "../lib/auth-store";
import { connectorStore } from "../lib/connector-store";

const DB_PATH = process.env.WEBSITE_AUTH_DB_PATH ?? ".auth.sqlite";

const withDb = (): DatabaseSync => {
    const db = new DatabaseSync(DB_PATH);
    db.exec("PRAGMA busy_timeout = 5000;");
    return db;
};

const cleanupUserTenant = (db: DatabaseSync, userId: string): void => {
    const row = db.prepare("SELECT tenant_id FROM users WHERE id = ?").get(userId) as { tenant_id: string | null } | undefined;
    const tenantId = row?.tenant_id ?? null;

    if (tenantId) {
        db.prepare("DELETE FROM provisioning_queue WHERE tenant_id = ?").run(tenantId);
        db.prepare("DELETE FROM customer_bots WHERE workspace_id IN (SELECT id FROM customer_workspaces WHERE tenant_id = ?)").run(tenantId);
        db.prepare("DELETE FROM customer_workspaces WHERE tenant_id = ?").run(tenantId);
        db.prepare("DELETE FROM customer_tenants WHERE id = ?").run(tenantId);
    }

    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM users WHERE id = ?").run(userId);
};

const addWorkspaceBot = (db: DatabaseSync, tenantId: string, roleType: string): { workspaceId: string; botId: string } => {
    const ts = Date.now();
    const workspaceId = `wsp_${randomBytes(10).toString("hex")}`;
    const botId = `bot_${randomBytes(10).toString("hex")}`;

    db.prepare(
        `INSERT INTO customer_workspaces (id, tenant_id, workspace_name, role_type, runtime_tier, workspace_status, created_at)
         VALUES (?, ?, ?, ?, 'standard', 'ready', ?)`,
    ).run(workspaceId, tenantId, `Workspace ${roleType}`, roleType, ts);

    db.prepare(
        `INSERT INTO customer_bots (id, workspace_id, bot_name, bot_status, policy_pack_version, created_at)
         VALUES (?, ?, ?, 'active', 'v1', ?)`,
    ).run(botId, workspaceId, `Bot ${roleType}`, ts);

    return { workspaceId, botId };
};

const makeCookieHeader = (token: string): string => `agentfarm_session=${encodeURIComponent(token)}`;

test("connectors GET returns bot-scoped catalog filtered by selected role", async () => {
    connectorStore.clear();
    const db = withDb();
    const suffix = `${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const user = await createUser({
        name: `Connector Scope ${suffix}`,
        email: `connector_scope_${suffix}@agentfarm.local`,
        company: "AgentFarm Test",
        password: "Password123!",
    });

    const initialized = initializeTenantWorkspaceAndBot({ userId: user.id, tenantName: "AgentFarm Test" });
    const alt = addWorkspaceBot(db, initialized.tenant.id, "corporate_assistant");

    const { sessionToken } = createSession(user.id);

    const response = await getConnectors(
        new Request(`http://localhost/api/connectors?workspaceId=${alt.workspaceId}&botId=${alt.botId}`, {
            headers: { cookie: makeCookieHeader(sessionToken) },
        }),
    );

    assert.equal(response.status, 200);
    const body = await response.json() as {
        context: { selectedRoleKey: string; selectedWorkspaceId: string; selectedBotId: string };
        available: Array<{ tool: string }>;
    };

    assert.equal(body.context.selectedRoleKey, "corporate_assistant");
    assert.equal(body.context.selectedWorkspaceId, alt.workspaceId);
    assert.equal(body.context.selectedBotId, alt.botId);
    assert.ok(body.available.some((item) => item.tool === "teams"), "teams should remain available for all roles");
    assert.ok(!body.available.some((item) => item.tool === "github"), "github must be hidden for non-code role");

    cleanupUserTenant(db, user.id);
    connectorStore.clear();
});

test("connectors POST rejects disallowed tool for selected bot role", async () => {
    connectorStore.clear();
    const db = withDb();
    const suffix = `${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const user = await createUser({
        name: `Connector Reject ${suffix}`,
        email: `connector_reject_${suffix}@agentfarm.local`,
        company: "AgentFarm Test",
        password: "Password123!",
    });

    const initialized = initializeTenantWorkspaceAndBot({ userId: user.id, tenantName: "AgentFarm Test" });
    const alt = addWorkspaceBot(db, initialized.tenant.id, "corporate_assistant");
    const { sessionToken } = createSession(user.id);

    const response = await postConnectors(
        new Request("http://localhost/api/connectors", {
            method: "POST",
            headers: {
                cookie: makeCookieHeader(sessionToken),
                "content-type": "application/json",
            },
            body: JSON.stringify({
                tool: "github",
                workspaceId: alt.workspaceId,
                botId: alt.botId,
            }),
        }),
    );

    assert.equal(response.status, 403);
    const body = await response.json() as { error: string; selected_role: string };
    assert.equal(body.selected_role, "corporate_assistant");
    assert.ok(body.error.includes("not allowed"));

    cleanupUserTenant(db, user.id);
    connectorStore.clear();
});

test("connectors are isolated by selected workspace", async () => {
    connectorStore.clear();
    const db = withDb();
    const suffix = `${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const user = await createUser({
        name: `Connector Isolation ${suffix}`,
        email: `connector_isolation_${suffix}@agentfarm.local`,
        company: "AgentFarm Test",
        password: "Password123!",
    });

    const initialized = initializeTenantWorkspaceAndBot({ userId: user.id, tenantName: "AgentFarm Test" });
    const alt = addWorkspaceBot(db, initialized.tenant.id, "corporate_assistant");
    const { sessionToken } = createSession(user.id);

    const createResponse = await postConnectors(
        new Request("http://localhost/api/connectors", {
            method: "POST",
            headers: {
                cookie: makeCookieHeader(sessionToken),
                "content-type": "application/json",
            },
            body: JSON.stringify({
                tool: "teams",
                workspaceId: initialized.workspace.id,
                botId: initialized.bot.id,
            }),
        }),
    );

    assert.equal(createResponse.status, 201);

    const altResponse = await getConnectors(
        new Request(`http://localhost/api/connectors?workspaceId=${alt.workspaceId}&botId=${alt.botId}`, {
            headers: { cookie: makeCookieHeader(sessionToken) },
        }),
    );
    assert.equal(altResponse.status, 200);

    const altBody = await altResponse.json() as { configured: Array<{ workspaceId: string }> };
    assert.equal(altBody.configured.length, 0);

    cleanupUserTenant(db, user.id);
    connectorStore.clear();
});
