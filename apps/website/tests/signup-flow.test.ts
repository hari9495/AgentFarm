import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
    getProvisioningStatusForUser,
    initializeTenantWorkspaceAndBot,
} from "../lib/auth-store";

const DB_PATH = process.env.WEBSITE_AUTH_DB_PATH ?? ".auth.sqlite";
const DUMMY_PASSWORD_HASH =
    "scrypt:0000000000000000000000000000000000000000000000000000000000000000:0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";

const createTestUser = (db: DatabaseSync, suffix: string): string => {
    const id = `tst_sig_${suffix}`;
    db.prepare(
        "INSERT INTO users (id, email, name, company, role, password_hash, created_at) VALUES (?, ?, ?, ?, 'member', ?, ?)",
    ).run(id, `${id}@agentfarm.local`, `Signup ${suffix}`, "AgentFarm Test", DUMMY_PASSWORD_HASH, Date.now());
    return id;
};

const cleanupUser = (db: DatabaseSync, userId: string): void => {
    const row = db.prepare("SELECT tenant_id FROM users WHERE id = ?").get(userId) as
        | { tenant_id: string | null }
        | undefined;
    if (row?.tenant_id) {
        db.prepare("DELETE FROM provisioning_queue WHERE tenant_id = ?").run(row.tenant_id);
        db.prepare(
            "DELETE FROM customer_bots WHERE workspace_id IN (SELECT id FROM customer_workspaces WHERE tenant_id = ?)",
        ).run(row.tenant_id);
        db.prepare("DELETE FROM customer_workspaces WHERE tenant_id = ?").run(row.tenant_id);
        db.prepare("DELETE FROM customer_tenants WHERE id = ?").run(row.tenant_id);
    }
    db.prepare("DELETE FROM users WHERE id = ?").run(userId);
};

test("signup flow: tenant is created with provisioning status after initialization", () => {
    const db = new DatabaseSync(DB_PATH);
    const suffix = `${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const userId = createTestUser(db, suffix);

    const result = initializeTenantWorkspaceAndBot({ userId, tenantName: "AgentFarm Test" });

    assert.equal(result.tenant.tenantStatus, "provisioning");
    assert.equal(result.tenant.tenantName, "AgentFarm Test");
    assert.equal(result.tenant.planId, "starter");
    assert.ok(result.tenant.id.startsWith("tnt_"), "tenant id must use tnt_ prefix");

    cleanupUser(db, userId);
});

test("signup flow: default workspace is created with provisioning status and correct fields", () => {
    const db = new DatabaseSync(DB_PATH);
    const suffix = `${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const userId = createTestUser(db, suffix);

    const result = initializeTenantWorkspaceAndBot({ userId, tenantName: "AgentFarm Test" });

    assert.equal(result.workspace.workspaceStatus, "provisioning");
    assert.equal(result.workspace.workspaceName, "Primary Workspace");
    assert.equal(result.workspace.roleType, "developer");
    assert.equal(result.workspace.runtimeTier, "standard");
    assert.equal(result.workspace.tenantId, result.tenant.id);

    cleanupUser(db, userId);
});

test("signup flow: default bot is created with created status and correct fields", () => {
    const db = new DatabaseSync(DB_PATH);
    const suffix = `${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const userId = createTestUser(db, suffix);

    const result = initializeTenantWorkspaceAndBot({ userId, tenantName: "AgentFarm Test" });

    assert.equal(result.bot.botStatus, "created");
    assert.equal(result.bot.botName, "Developer Agent");
    assert.equal(result.bot.policyPackVersion, "v1");
    assert.equal(result.bot.workspaceId, result.workspace.id);
    assert.equal(result.bot.connectorProfileId, null);

    cleanupUser(db, userId);
});

test("signup flow: provisioning queue entry satisfies provisioning.requested contract", () => {
    const db = new DatabaseSync(DB_PATH);
    const suffix = `${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const userId = createTestUser(db, suffix);

    const result = initializeTenantWorkspaceAndBot({ userId, tenantName: "AgentFarm Test" });
    const status = getProvisioningStatusForUser(userId);

    assert.ok(status.provisioningJob, "provisioning job must exist");
    const job = status.provisioningJob!;

    assert.equal(job.tenantId, result.tenant.id);
    assert.equal(job.workspaceId, result.workspace.id);
    assert.equal(job.botId, result.bot.id);
    assert.equal(job.triggerSource, "signup_complete");
    assert.equal(job.status, "queued");
    assert.equal(job.roleType, "developer");
    assert.equal(job.runtimeTier, "standard");
    assert.equal(job.planId, "starter");
    assert.ok(job.correlationId.startsWith("cor_"), "correlationId must be present with cor_ prefix");
    assert.ok(job.requestedAt > 0, "requestedAt must be populated");

    cleanupUser(db, userId);
});

test("signup flow: initializeTenantWorkspaceAndBot is idempotent on repeated calls", () => {
    const db = new DatabaseSync(DB_PATH);
    const suffix = `${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const userId = createTestUser(db, suffix);

    const first = initializeTenantWorkspaceAndBot({ userId, tenantName: "AgentFarm Test" });
    const second = initializeTenantWorkspaceAndBot({ userId, tenantName: "AgentFarm Test" });

    assert.equal(first.tenant.id, second.tenant.id);
    assert.equal(first.workspace.id, second.workspace.id);
    assert.equal(first.bot.id, second.bot.id);
    assert.equal(first.provisioningJobId, second.provisioningJobId);

    const tenantCount = db
        .prepare("SELECT COUNT(*) AS count FROM customer_tenants WHERE id = ?")
        .get(first.tenant.id) as { count: number };
    assert.equal(Number(tenantCount.count), 1, "only one customer_tenant record must exist");

    cleanupUser(db, userId);
});
