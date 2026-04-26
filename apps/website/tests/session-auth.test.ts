import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
    authenticateUser,
    createApprovalRequest,
    createSession,
    createUser,
    deleteSession,
    getSessionUser,
    initializeTenantWorkspaceAndBot,
    listApprovals,
    listRecentActivity,
} from "../lib/auth-store";

const DB_PATH = process.env.WEBSITE_AUTH_DB_PATH ?? ".auth.sqlite";

const makeSuffix = (): string => `${Date.now()}_${Math.floor(Math.random() * 9999)}`;

const cleanupUser = (db: DatabaseSync, userId: string): void => {
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
    const row = db.prepare("SELECT tenant_id FROM users WHERE id = ?").get(userId) as
        | { tenant_id: string | null }
        | undefined;
    if (row?.tenant_id) {
        db.prepare("DELETE FROM approvals WHERE tenant_id = ?").run(row.tenant_id);
        db.prepare("DELETE FROM company_audit_events WHERE tenant_id = ?").run(row.tenant_id);
        db.prepare("DELETE FROM provisioning_queue WHERE tenant_id = ?").run(row.tenant_id);
        db.prepare(
            "DELETE FROM customer_bots WHERE workspace_id IN (SELECT id FROM customer_workspaces WHERE tenant_id = ?)",
        ).run(row.tenant_id);
        db.prepare("DELETE FROM customer_workspaces WHERE tenant_id = ?").run(row.tenant_id);
        db.prepare("DELETE FROM customer_tenants WHERE id = ?").run(row.tenant_id);
    }
    db.prepare("DELETE FROM users WHERE id = ?").run(userId);
};

// ── Session token validation ───────────────────────────────────────────────

test("session auth: valid session token resolves to the correct user", async () => {
    const db = new DatabaseSync(DB_PATH);
    const suffix = makeSuffix();
    const email = `tst_auth_${suffix}@agentfarm.local`;
    const password = "Test1234!";

    const user = await createUser({ email, password, name: "Auth Tester", company: "AgentFarm Test" });
    const { sessionToken } = createSession(user.id);

    const resolved = getSessionUser(sessionToken);
    assert.ok(resolved, "should resolve to a user");
    assert.equal(resolved.id, user.id);
    assert.equal(resolved.email, email);
    assert.equal(resolved.role, "member");
    assert.equal(resolved.tenantId, null); // no tenant provisioned yet

    cleanupUser(db, user.id);
});

test("session auth: invalid token returns null", () => {
    const result = getSessionUser("completely-invalid-token-that-never-existed");
    assert.equal(result, null);
});

test("session auth: deleted session token returns null", async () => {
    const db = new DatabaseSync(DB_PATH);
    const suffix = makeSuffix();
    const email = `tst_del_${suffix}@agentfarm.local`;
    const password = "Delete1234!";

    const user = await createUser({ email, password, name: "Delete Tester", company: "AgentFarm Test" });
    const { sessionToken } = createSession(user.id);

    deleteSession(sessionToken);

    const resolved = getSessionUser(sessionToken);
    assert.equal(resolved, null, "deleted session should not resolve");

    cleanupUser(db, user.id);
});

test("session auth: tenantId is populated after tenant initialization", async () => {
    const db = new DatabaseSync(DB_PATH);
    const suffix = makeSuffix();
    const email = `tst_tid_${suffix}@agentfarm.local`;
    const password = "Tenant1234!";

    const user = await createUser({ email, password, name: "Tenant Tester", company: "AgentFarm Test" });
    const init = initializeTenantWorkspaceAndBot({ userId: user.id, tenantName: "Auth Test Corp" });
    const { sessionToken } = createSession(user.id);

    const resolved = getSessionUser(sessionToken);
    assert.ok(resolved, "should resolve user");
    assert.equal(resolved.tenantId, init.tenant.id, "tenantId should match provisioned tenant");

    cleanupUser(db, user.id);
});

test("session auth: login returns authenticated user via authenticateUser", async () => {
    const db = new DatabaseSync(DB_PATH);
    const suffix = makeSuffix();
    const email = `tst_login_${suffix}@agentfarm.local`;
    const password = "Login1234!";

    await createUser({ email, password, name: "Login Tester", company: "AgentFarm Test" });

    const authenticated = await authenticateUser(email, password);
    assert.ok(authenticated, "should authenticate with correct credentials");
    assert.equal(authenticated.email, email);

    const badAuth = await authenticateUser(email, "wrongpassword");
    assert.equal(badAuth, null, "wrong password should return null");

    const { sessionToken } = createSession(authenticated.id);
    cleanupUser(db, authenticated.id);

    // After cleanup session token should be gone too (cascaded in cleanupUser)
    const resolved = getSessionUser(sessionToken);
    assert.equal(resolved, null);
});

// ── Workspace-scoped RLS ──────────────────────────────────────────────────

test("workspace RLS: listApprovals scopes results to caller's tenantId", async () => {
    const db = new DatabaseSync(DB_PATH);
    const suffixA = `${makeSuffix()}_wrlsA`;
    const suffixB = `${makeSuffix()}_wrlsB`;

    const emailA = `tst_rls_a_${suffixA}@agentfarm.local`;
    const emailB = `tst_rls_b_${suffixB}@agentfarm.local`;
    const password = "RlsTest1234!";

    const userA = await createUser({ email: emailA, password, name: "RLS User A", company: "Tenant A Corp" });
    const userB = await createUser({ email: emailB, password, name: "RLS User B", company: "Tenant B Corp" });

    const initA = initializeTenantWorkspaceAndBot({ userId: userA.id, tenantName: "RLS Tenant A" });
    const initB = initializeTenantWorkspaceAndBot({ userId: userB.id, tenantName: "RLS Tenant B" });

    createApprovalRequest({
        title: "Tenant A Action",
        agentSlug: "dev-agent",
        agent: "Developer Agent",
        requestedBy: userA.id,
        channel: "teams",
        reason: "Testing RLS for Tenant A",
        risk: "low",
        tenantId: initA.tenant.id,
        actorId: userA.id,
        actorEmail: emailA,
    });

    createApprovalRequest({
        title: "Tenant B Action",
        agentSlug: "dev-agent",
        agent: "Developer Agent",
        requestedBy: userB.id,
        channel: "teams",
        reason: "Testing RLS for Tenant B",
        risk: "high",
        tenantId: initB.tenant.id,
        actorId: userB.id,
        actorEmail: emailB,
    });

    const approvalsForA = listApprovals({ status: "pending", tenantId: initA.tenant.id });
    const approvalsForB = listApprovals({ status: "pending", tenantId: initB.tenant.id });

    // Each tenant should only see their own approval
    assert.ok(
        approvalsForA.every((a) => a.requestedBy === userA.id),
        "Tenant A should only see their own approvals",
    );
    assert.ok(
        approvalsForB.every((a) => a.requestedBy === userB.id),
        "Tenant B should only see their own approvals",
    );

    // Tenant A's view must not include Tenant B's high-risk approval
    assert.equal(
        approvalsForA.some((a) => a.risk === "high" && a.requestedBy === userB.id),
        false,
        "Tenant A must not see Tenant B's approvals",
    );

    cleanupUser(db, userA.id);
    cleanupUser(db, userB.id);
});

test("workspace RLS: listRecentActivity scopes to caller's tenantId", async () => {
    const db = new DatabaseSync(DB_PATH);
    const suffixA = `${makeSuffix()}_actA`;
    const suffixB = `${makeSuffix()}_actB`;

    const emailA = `tst_act_a_${suffixA}@agentfarm.local`;
    const emailB = `tst_act_b_${suffixB}@agentfarm.local`;
    const password = "Activity1234!";

    const userA = await createUser({ email: emailA, password, name: "Activity User A", company: "Activity Corp A" });
    const userB = await createUser({ email: emailB, password, name: "Activity User B", company: "Activity Corp B" });

    const initA = initializeTenantWorkspaceAndBot({ userId: userA.id, tenantName: "Activity Tenant A" });
    const initB = initializeTenantWorkspaceAndBot({ userId: userB.id, tenantName: "Activity Tenant B" });

    createApprovalRequest({
        title: "Activity A Only",
        agentSlug: "dev-agent",
        agent: "Developer Agent",
        requestedBy: userA.id,
        channel: "teams",
        reason: "Activity scoping test A",
        risk: "low",
        tenantId: initA.tenant.id,
        actorId: userA.id,
        actorEmail: emailA,
    });

    createApprovalRequest({
        title: "Activity B Only",
        agentSlug: "dev-agent",
        agent: "Developer Agent",
        requestedBy: userB.id,
        channel: "teams",
        reason: "Activity scoping test B",
        risk: "medium",
        tenantId: initB.tenant.id,
        actorId: userB.id,
        actorEmail: emailB,
    });

    const activityA = listRecentActivity(20, initA.tenant.id);
    const activityB = listRecentActivity(20, initB.tenant.id);

    assert.ok(
        activityA.some((e) => e.detail.includes("Activity A Only")),
        "Tenant A activity should include their own approval",
    );
    assert.equal(
        activityA.some((e) => e.detail.includes("Activity B Only")),
        false,
        "Tenant A activity must not include Tenant B's approval",
    );

    assert.ok(
        activityB.some((e) => e.detail.includes("Activity B Only")),
        "Tenant B activity should include their own approval",
    );
    assert.equal(
        activityB.some((e) => e.detail.includes("Activity A Only")),
        false,
        "Tenant B activity must not include Tenant A's approval",
    );

    cleanupUser(db, userA.id);
    cleanupUser(db, userB.id);
});
