import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
    autoProcessProvisioningForUser,
    getProvisioningStatusForUser,
    initializeTenantWorkspaceAndBot,
    listAuditEvents,
    processProvisioningQueue,
    retryProvisioningJob,
} from "../lib/auth-store";

const DB_PATH = process.env.WEBSITE_AUTH_DB_PATH ?? ".auth.sqlite";
const DUMMY_PASSWORD_HASH =
    "scrypt:0000000000000000000000000000000000000000000000000000000000000000:0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";

const createTestUser = (db: DatabaseSync, suffix: string): string => {
    const id = `tst_prv_${suffix}`;
    db.prepare(
        "INSERT INTO users (id, email, name, company, role, password_hash, created_at) VALUES (?, ?, ?, ?, 'admin', ?, ?)",
    ).run(id, `${id}@agentfarm.local`, `Provisioning ${suffix}`, "AgentFarm Test", DUMMY_PASSWORD_HASH, Date.now());
    return id;
};

const cleanupUser = (db: DatabaseSync, userId: string): void => {
    const row = db.prepare("SELECT tenant_id FROM users WHERE id = ?").get(userId) as
        | { tenant_id: string | null }
        | undefined;
    if (row?.tenant_id) {
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

test("provisioning worker: queued job progresses to completed and updates runtime statuses", () => {
    const db = new DatabaseSync(DB_PATH);
    const suffix = `${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const userId = createTestUser(db, suffix);

    const init = initializeTenantWorkspaceAndBot({ userId, tenantName: "AgentFarm Provisioning" });

    const run = processProvisioningQueue({
        limit: 1,
        jobIds: [init.provisioningJobId],
        actorId: "test-worker",
        actorEmail: "worker@agentfarm.local",
    });

    assert.equal(run.processed, 1);
    assert.equal(run.completed, 1);
    assert.equal(run.failed, 0);

    const status = getProvisioningStatusForUser(userId);
    assert.equal(status.tenant?.tenantStatus, "ready");
    assert.equal(status.workspace?.workspaceStatus, "ready");
    assert.equal(status.bot?.botStatus, "active");
    assert.equal(status.provisioningJob?.status, "completed");

    const audit = listAuditEvents({ tenantId: init.tenant.id, limit: 100 });
    assert.equal(audit.some((event) => event.action === "provisioning.job.status_updated"), true);
    assert.equal(
        audit.some((event) => event.action === "provisioning.job.completed" && event.targetId === init.provisioningJobId),
        true,
    );

    cleanupUser(db, userId);
});

test("provisioning worker: failed jobs mark tenant/workspace/bot degraded and emit failure audit", () => {
    const db = new DatabaseSync(DB_PATH);
    const suffix = `${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const userId = createTestUser(db, suffix);

    const init = initializeTenantWorkspaceAndBot({ userId, tenantName: "AgentFarm Provisioning" });

    const run = processProvisioningQueue({
        limit: 1,
        jobIds: [init.provisioningJobId],
        failJobIds: [init.provisioningJobId],
        actorId: "test-worker",
        actorEmail: "worker@agentfarm.local",
    });

    assert.equal(run.processed, 1);
    assert.equal(run.completed, 0);
    assert.equal(run.failed, 1);

    const status = getProvisioningStatusForUser(userId);
    assert.equal(status.tenant?.tenantStatus, "degraded");
    assert.equal(status.workspace?.workspaceStatus, "failed");
    assert.equal(status.bot?.botStatus, "failed");
    assert.equal(status.provisioningJob?.status, "failed");
    assert.equal(status.provisioningJob?.failureReason, "azure_capacity_unavailable");
    assert.equal(status.provisioningJob?.remediationHint, "Retry after 5 minutes or reduce runtime tier.");
    assert.ok((status.provisioningJob?.updatedAt ?? 0) > 0);

    const audit = listAuditEvents({ tenantId: init.tenant.id, limit: 100 });
    assert.equal(
        audit.some((event) => event.action === "provisioning.job.failed" && event.targetId === init.provisioningJobId),
        true,
    );

    cleanupUser(db, userId);
});

test("provisioning worker: respects processing limit and only consumes queued jobs", () => {
    const db = new DatabaseSync(DB_PATH);
    const suffixA = `${Date.now()}_${Math.floor(Math.random() * 1000)}_a`;
    const suffixB = `${Date.now()}_${Math.floor(Math.random() * 1000)}_b`;
    const userA = createTestUser(db, suffixA);
    const userB = createTestUser(db, suffixB);

    const initA = initializeTenantWorkspaceAndBot({ userId: userA, tenantName: "AgentFarm Provisioning A" });
    const initB = initializeTenantWorkspaceAndBot({ userId: userB, tenantName: "AgentFarm Provisioning B" });

    const firstRun = processProvisioningQueue({
        limit: 1,
        jobIds: [initA.provisioningJobId, initB.provisioningJobId],
        actorId: "test-worker",
        actorEmail: "worker@agentfarm.local",
    });

    assert.equal(firstRun.processed, 1);

    const statusAAfterFirst = getProvisioningStatusForUser(userA);
    const statusBAfterFirst = getProvisioningStatusForUser(userB);
    const completedCount = [statusAAfterFirst, statusBAfterFirst].filter(
        (status) => status.provisioningJob?.status === "completed",
    ).length;
    const queuedCount = [statusAAfterFirst, statusBAfterFirst].filter(
        (status) => status.provisioningJob?.status === "queued",
    ).length;

    assert.equal(completedCount, 1);
    assert.equal(queuedCount, 1);

    const secondRun = processProvisioningQueue({
        limit: 10,
        jobIds: [initA.provisioningJobId, initB.provisioningJobId],
        actorId: "test-worker",
        actorEmail: "worker@agentfarm.local",
    });

    assert.equal(secondRun.processed, 1);

    const statusAFinal = getProvisioningStatusForUser(userA);
    const statusBFinal = getProvisioningStatusForUser(userB);
    assert.equal(statusAFinal.provisioningJob?.status, "completed");
    assert.equal(statusBFinal.provisioningJob?.status, "completed");

    cleanupUser(db, userA);
    cleanupUser(db, userB);
});

test("provisioning auto-tick: processes queued job for a specific user tenant", () => {
    const db = new DatabaseSync(DB_PATH);
    const suffix = `${Date.now()}_${Math.floor(Math.random() * 1000)}_auto`;
    const userId = createTestUser(db, suffix);

    initializeTenantWorkspaceAndBot({ userId, tenantName: "AgentFarm Auto Tick" });

    const result = autoProcessProvisioningForUser({
        userId,
        actorId: "test-auto",
        actorEmail: "auto@agentfarm.local",
    });

    assert.equal(result.processed, 1);
    assert.equal(result.completed, 1);
    assert.equal(result.failed, 0);

    const status = getProvisioningStatusForUser(userId);
    assert.equal(status.provisioningJob?.status, "completed");

    cleanupUser(db, userId);
});

test("provisioning retry: failed job creates a new queued retry and is idempotent", () => {
    const db = new DatabaseSync(DB_PATH);
    const suffix = `${Date.now()}_${Math.floor(Math.random() * 1000)}_retry`;
    const userId = createTestUser(db, suffix);

    const init = initializeTenantWorkspaceAndBot({ userId, tenantName: "AgentFarm Retry" });

    processProvisioningQueue({
        limit: 1,
        jobIds: [init.provisioningJobId],
        failJobIds: [init.provisioningJobId],
        actorId: "test-worker",
        actorEmail: "worker@agentfarm.local",
    });

    const firstRetry = retryProvisioningJob({
        jobId: init.provisioningJobId,
        requestedBy: userId,
        actorId: "test-operator",
        actorEmail: "operator@agentfarm.local",
    });

    assert.equal(firstRetry.ok, true);
    if (!firstRetry.ok) {
        assert.fail("expected retry to succeed");
    }
    assert.equal(firstRetry.reused, false);
    assert.equal(firstRetry.job.status, "queued");
    assert.equal(firstRetry.job.retryOfJobId, init.provisioningJobId);

    const secondRetry = retryProvisioningJob({
        jobId: init.provisioningJobId,
        requestedBy: userId,
        actorId: "test-operator",
        actorEmail: "operator@agentfarm.local",
    });

    assert.equal(secondRetry.ok, true);
    if (!secondRetry.ok) {
        assert.fail("expected idempotent retry lookup to succeed");
    }
    assert.equal(secondRetry.reused, true);
    assert.equal(secondRetry.job.id, firstRetry.job.id);

    const sourceAgain = retryProvisioningJob({
        jobId: firstRetry.job.id,
        requestedBy: userId,
        actorId: "test-operator",
        actorEmail: "operator@agentfarm.local",
    });
    assert.equal(sourceAgain.ok, false);
    if (sourceAgain.ok) {
        assert.fail("queued retry job should not be retryable");
    }
    assert.equal(sourceAgain.error, "not_retryable");

    cleanupUser(db, userId);
});

test("provisioning retry: rate-limit blocks attempt beyond MAX_RETRY_ATTEMPTS (3)", () => {
    const db = new DatabaseSync(DB_PATH);
    const suffix = `${Date.now()}_${Math.floor(Math.random() * 1000)}_ratelimit`;
    const userId = createTestUser(db, suffix);

    const init = initializeTenantWorkspaceAndBot({ userId, tenantName: "AgentFarm Rate Limit" });

    // Fail the original job
    processProvisioningQueue({
        limit: 1,
        jobIds: [init.provisioningJobId],
        failJobIds: [init.provisioningJobId],
        actorId: "test-worker",
        actorEmail: "worker@agentfarm.local",
    });

    let lastJobId = init.provisioningJobId;
    for (let attempt = 1; attempt <= 3; attempt++) {
        const retryResult = retryProvisioningJob({
            jobId: lastJobId,
            requestedBy: userId,
            actorId: "test-operator",
            actorEmail: "operator@agentfarm.local",
        });
        assert.equal(retryResult.ok, true, `attempt ${attempt} should succeed`);
        if (!retryResult.ok) {
            assert.fail(`expected retry attempt ${attempt} to succeed`);
        }
        assert.equal(retryResult.job.retryAttemptCount, attempt, `attempt count should be ${attempt}`);

        // Fail the new retry job so we can retry it again
        processProvisioningQueue({
            limit: 1,
            jobIds: [retryResult.job.id],
            failJobIds: [retryResult.job.id],
            actorId: "test-worker",
            actorEmail: "worker@agentfarm.local",
        });

        lastJobId = retryResult.job.id;
    }

    // 4th retry attempt should be blocked
    const blockedRetry = retryProvisioningJob({
        jobId: lastJobId,
        requestedBy: userId,
        actorId: "test-operator",
        actorEmail: "operator@agentfarm.local",
    });
    assert.equal(blockedRetry.ok, false);
    if (blockedRetry.ok) {
        assert.fail("4th retry should be blocked by rate limit");
    }
    assert.equal(blockedRetry.error, "retry_limit_exceeded");
    assert.equal(blockedRetry.retryAttemptCount, 3);

    cleanupUser(db, userId);
});
