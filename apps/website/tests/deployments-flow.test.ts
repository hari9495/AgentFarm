import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
    cancelDeployment,
    completeOnboarding,
    getLatestDeploymentForUser,
    listDeploymentsForUser,
    requestDeployment,
    retryDeployment,
    saveMarketplaceSelection,
} from "../lib/auth-store";

const DB_PATH = process.env.WEBSITE_AUTH_DB_PATH ?? ".auth.sqlite";
const DUMMY_PASSWORD_HASH =
    "scrypt:0000000000000000000000000000000000000000000000000000000000000000:0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";

const createTestUser = (db: DatabaseSync, suffix: string): string => {
    const id = `tst_dep_${suffix}`;
    db.prepare(
        "INSERT INTO users (id, email, name, company, role, password_hash, created_at) VALUES (?, ?, ?, ?, 'member', ?, ?)",
    ).run(id, `${id}@agentfarm.local`, `Deploy ${suffix}`, "AgentFarm Test", DUMMY_PASSWORD_HASH, Date.now());
    return id;
};

test("deployment guardrail: onboarding must be completed before deploy request", () => {
    const db = new DatabaseSync(DB_PATH);
    const suffix = `${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const userId = createTestUser(db, suffix);

    saveMarketplaceSelection({
        userId,
        starterAgent: "ai-devops-engineer",
        config: { plan: "Pro+", source: "test" },
    });

    const deployment = requestDeployment({
        userId,
        botSlug: "ai-devops-engineer",
        botName: "AI DevOps Engineer",
    });

    assert.equal(deployment.ok, false);
    if (deployment.ok) {
        assert.fail("Expected deployment request to be blocked before onboarding completion");
    }
    assert.equal(deployment.error, "onboarding_required");

    db.prepare("DELETE FROM users WHERE id = ?").run(userId);
});

test("deployment flow: selected agent deploy request is created and visible on dashboard lane", () => {
    const db = new DatabaseSync(DB_PATH);
    const suffix = `${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const userId = createTestUser(db, suffix);

    saveMarketplaceSelection({
        userId,
        starterAgent: "ai-backend-developer",
        config: { plan: "Starter+", source: "test" },
    });

    completeOnboarding({
        userId,
        githubOrg: "agentfarm-test-org",
        inviteEmail: `invite-${suffix}@agentfarm.local`,
        starterAgent: "ai-backend-developer",
    });

    const deployment = requestDeployment({
        userId,
        botSlug: "ai-backend-developer",
        botName: "AI Backend Developer",
        actorEmail: "requester@agentfarm.local",
    });

    assert.equal(deployment.ok, true);
    if (!deployment.ok) {
        assert.fail("Expected deployment request to succeed after onboarding completion");
    }

    assert.equal(deployment.job.botSlug, "ai-backend-developer");
    assert.equal(deployment.job.status, "queued");
    assert.equal(deployment.job.lastActionType, "requested");
    assert.equal(deployment.job.lastActionBy, "requester@agentfarm.local");
    assert.equal(typeof deployment.job.lastActionAt, "number");

    const latest = getLatestDeploymentForUser(userId);
    assert.notEqual(latest, null);
    assert.equal(latest?.id, deployment.job.id);
    assert.equal(["queued", "running", "succeeded", "failed", "canceled"].includes(String(latest?.status)), true);

    db.prepare("DELETE FROM users WHERE id = ?").run(userId);
});

test("deployment history: returns newest first with both deployment records", () => {
    const db = new DatabaseSync(DB_PATH);
    const suffix = `${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const userId = createTestUser(db, suffix);

    saveMarketplaceSelection({
        userId,
        starterAgent: "ai-backend-developer",
        config: { plan: "Starter+", source: "test" },
    });

    completeOnboarding({
        userId,
        githubOrg: "agentfarm-test-org",
        inviteEmail: `invite-history-${suffix}@agentfarm.local`,
        starterAgent: "ai-backend-developer",
    });

    const first = requestDeployment({
        userId,
        botSlug: "ai-backend-developer",
        botName: "AI Backend Developer",
    });
    assert.equal(first.ok, true);
    if (!first.ok) {
        assert.fail("Expected first deployment to succeed");
    }

    saveMarketplaceSelection({
        userId,
        starterAgent: "ai-devops-engineer",
        config: { plan: "Starter+", source: "test" },
    });

    const second = requestDeployment({
        userId,
        botSlug: "ai-devops-engineer",
        botName: "AI DevOps Engineer",
    });
    assert.equal(second.ok, true);
    if (!second.ok) {
        assert.fail("Expected second deployment to succeed");
    }

    const baseTime = Date.now();
    db.prepare("UPDATE deployment_jobs SET created_at = ?, updated_at = ? WHERE id = ?").run(baseTime - 10_000, baseTime - 10_000, first.job.id);
    db.prepare("UPDATE deployment_jobs SET created_at = ?, updated_at = ? WHERE id = ?").run(baseTime - 1_000, baseTime - 1_000, second.job.id);

    const history = listDeploymentsForUser(userId, 10);
    assert.equal(history.length >= 2, true);
    assert.equal(history[0]?.id, second.job.id);
    assert.equal(history[1]?.id, first.job.id);
    assert.equal(history.some((job) => job.botSlug === "ai-devops-engineer"), true);
    assert.equal(history.some((job) => job.botSlug === "ai-backend-developer"), true);

    db.prepare("DELETE FROM users WHERE id = ?").run(userId);
});

test("deployment actions: cancel supports queued/running and rejects terminal states", () => {
    const db = new DatabaseSync(DB_PATH);
    const suffix = `${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const userId = createTestUser(db, suffix);

    saveMarketplaceSelection({
        userId,
        starterAgent: "ai-backend-developer",
        config: { plan: "Starter+", source: "test" },
    });

    completeOnboarding({
        userId,
        githubOrg: "agentfarm-test-org",
        inviteEmail: `invite-cancel-${suffix}@agentfarm.local`,
        starterAgent: "ai-backend-developer",
    });

    const deployment = requestDeployment({
        userId,
        botSlug: "ai-backend-developer",
        botName: "AI Backend Developer",
    });
    assert.equal(deployment.ok, true);
    if (!deployment.ok) {
        assert.fail("Expected deployment request to succeed");
    }

    const canceled = cancelDeployment({
        userId,
        deploymentId: deployment.job.id,
        actorEmail: "operator@agentfarm.local",
    });
    assert.equal(canceled.ok, true);
    if (!canceled.ok) {
        assert.fail("Expected queued deployment to be cancelable");
    }
    assert.equal(canceled.job.status, "canceled");
    assert.equal(canceled.job.lastActionType, "canceled");
    assert.equal(canceled.job.lastActionBy, "operator@agentfarm.local");
    assert.equal(typeof canceled.job.lastActionAt, "number");

    const secondCancel = cancelDeployment({
        userId,
        deploymentId: deployment.job.id,
    });
    assert.equal(secondCancel.ok, false);
    if (secondCancel.ok) {
        assert.fail("Expected terminal deployment cancellation to be rejected");
    }
    assert.equal(secondCancel.error, "not_cancelable");

    const latest = getLatestDeploymentForUser(userId);
    assert.notEqual(latest, null);
    assert.equal(latest?.status, "canceled");

    db.prepare("DELETE FROM users WHERE id = ?").run(userId);
});

test("deployment actions: retry only supports failed and creates a new queued job", () => {
    const db = new DatabaseSync(DB_PATH);
    const suffix = `${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const userId = createTestUser(db, suffix);

    saveMarketplaceSelection({
        userId,
        starterAgent: "ai-backend-developer",
        config: { plan: "Starter+", source: "test" },
    });

    completeOnboarding({
        userId,
        githubOrg: "agentfarm-test-org",
        inviteEmail: `invite-retry-${suffix}@agentfarm.local`,
        starterAgent: "ai-backend-developer",
    });

    const deployment = requestDeployment({
        userId,
        botSlug: "ai-backend-developer",
        botName: "AI Backend Developer",
    });
    assert.equal(deployment.ok, true);
    if (!deployment.ok) {
        assert.fail("Expected deployment request to succeed");
    }

    const retryBlocked = retryDeployment({
        userId,
        deploymentId: deployment.job.id,
    });
    assert.equal(retryBlocked.ok, false);
    if (retryBlocked.ok) {
        assert.fail("Expected retry to be blocked before failure");
    }
    assert.equal(retryBlocked.error, "not_retryable");

    db.prepare("UPDATE deployment_jobs SET status = ?, status_message = ?, updated_at = ? WHERE id = ?")
        .run("failed", "Provisioning failed due to quota limits.", Date.now(), deployment.job.id);

    const retried = retryDeployment({
        userId,
        deploymentId: deployment.job.id,
        actorEmail: "operator@agentfarm.local",
    });
    assert.equal(retried.ok, true);
    if (!retried.ok) {
        assert.fail("Expected failed deployment to be retryable");
    }
    assert.equal(retried.job.status, "queued");
    assert.equal(retried.job.id === deployment.job.id, false);
    assert.equal(retried.job.lastActionType, "retried");
    assert.equal(retried.job.lastActionBy, "operator@agentfarm.local");
    assert.equal(typeof retried.job.lastActionAt, "number");

    const latest = getLatestDeploymentForUser(userId);
    assert.notEqual(latest, null);
    assert.equal(latest?.id, retried.job.id);

    const history = listDeploymentsForUser(userId, 10);
    assert.equal(history.some((job) => job.id === deployment.job.id && job.status === "failed"), true);
    assert.equal(history.some((job) => job.id === retried.job.id && job.status === "queued"), true);

    db.prepare("DELETE FROM users WHERE id = ?").run(userId);
});
