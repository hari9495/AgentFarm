import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
    createApprovalRequest,
    listApprovals,
    listRecentActivity,
    updateApprovalDecision,
} from "../lib/auth-store";

const DB_PATH = process.env.WEBSITE_AUTH_DB_PATH ?? ".auth.sqlite";

test("approval vertical slice: request -> pending -> decision -> activity", () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const db = new DatabaseSync(DB_PATH);

    const created = createApprovalRequest({
        title: `Deploy production change ${suffix}`,
        agentSlug: "ai-devops-engineer",
        agent: "AI DevOps Engineer",
        requestedBy: "dashboard-control-plane",
        channel: "Dashboard / Agent Detail",
        reason: "High-risk production operation requires explicit human approval.",
        risk: "high",
        actorId: "test-suite",
        actorEmail: "test-suite@agentfarm.local",
    });

    assert.equal(created.status, "pending");

    const pending = listApprovals({ status: "pending", agentSlug: "ai-devops-engineer" });
    assert.equal(
        pending.some((item) => item.id === created.id),
        true,
        "created request should appear in pending approvals",
    );

    const decided = updateApprovalDecision({
        id: created.id,
        decision: "approved",
        decidedBy: "reviewer@agentfarm.local",
    });

    assert.notEqual(decided, null);
    assert.equal(decided?.status, "approved");

    const pendingAfter = listApprovals({ status: "pending", agentSlug: "ai-devops-engineer" });
    assert.equal(
        pendingAfter.some((item) => item.id === created.id),
        false,
        "approved request should no longer remain in pending list",
    );

    const approved = listApprovals({ status: "approved", agentSlug: "ai-devops-engineer" });
    assert.equal(
        approved.some((item) => item.id === created.id),
        true,
        "approved request should appear in approved list",
    );

    const activity = listRecentActivity(40);
    assert.equal(
        activity.some((event) => event.id === `ACT-REQ-${created.id}` && event.action === "Approval requested"),
        true,
        "activity should include approval request event",
    );
    assert.equal(
        activity.some((event) => event.id === `ACT-DEC-${created.id}` && event.action === "Approval approved"),
        true,
        "activity should include approval decision event",
    );

    db.prepare("DELETE FROM approvals WHERE id = ?").run(created.id);
    db.prepare("DELETE FROM company_audit_events WHERE target_id = ?").run(created.id);
});

test("approval vertical slice: rejection path is reflected in state and activity", () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const db = new DatabaseSync(DB_PATH);

    const created = createApprovalRequest({
        title: `Reject risky production change ${suffix}`,
        agentSlug: "ai-security-engineer",
        agent: "AI Security Engineer",
        requestedBy: "dashboard-control-plane",
        channel: "Dashboard / Agent Detail",
        reason: "Potential policy violation requires explicit rejection path validation.",
        risk: "high",
        actorId: "test-suite",
        actorEmail: "test-suite@agentfarm.local",
    });

    const rejected = updateApprovalDecision({
        id: created.id,
        decision: "rejected",
        decidedBy: "reviewer@agentfarm.local",
    });

    assert.notEqual(rejected, null);
    assert.equal(rejected?.status, "rejected");

    const pendingAfter = listApprovals({ status: "pending", agentSlug: "ai-security-engineer" });
    assert.equal(
        pendingAfter.some((item) => item.id === created.id),
        false,
        "rejected request should not remain in pending list",
    );

    const rejectedList = listApprovals({ status: "rejected", agentSlug: "ai-security-engineer" });
    assert.equal(
        rejectedList.some((item) => item.id === created.id),
        true,
        "rejected request should appear in rejected list",
    );

    const activity = listRecentActivity(40);
    assert.equal(
        activity.some(
            (event) =>
                event.id === `ACT-DEC-${created.id}`
                && event.action === "Approval rejected"
                && event.approvalOutcome === "rejected",
        ),
        true,
        "activity should include explicit rejected decision signal",
    );

    db.prepare("DELETE FROM approvals WHERE id = ?").run(created.id);
    db.prepare("DELETE FROM company_audit_events WHERE target_id = ?").run(created.id);
});
