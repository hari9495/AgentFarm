import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
    createApprovalRequest,
    exportComplianceEvidencePack,
    getComplianceEvidenceSummary,
    updateApprovalDecision,
    writeAuditEvent,
} from "../lib/auth-store";

const DB_PATH = process.env.WEBSITE_AUTH_DB_PATH ?? ".auth.sqlite";

test("compliance evidence summary reports approvals, latency, and audit freshness", () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const db = new DatabaseSync(DB_PATH);

    const approval = createApprovalRequest({
        title: `Compliance evidence scenario ${suffix}`,
        agentSlug: "ai-security-engineer",
        agent: "AI Security Engineer",
        requestedBy: "dashboard-control-plane",
        channel: "Dashboard",
        reason: "Testing evidence summary and export behavior.",
        risk: "high",
        actorId: "test-suite",
        actorEmail: "test-suite@agentfarm.local",
        escalationTimeoutSeconds: 120,
    });

    const decided = updateApprovalDecision({
        id: approval.id,
        decision: "approved",
        decidedBy: "reviewer@agentfarm.local",
        reason: "Validation complete; approval granted.",
    });
    assert.notEqual(decided, null);

    writeAuditEvent({
        actorId: "test-suite",
        actorEmail: "test-suite@agentfarm.local",
        action: "compliance.export.requested",
        targetType: "evidence_pack",
        targetId: `pack-${suffix}`,
        tenantId: "",
        afterState: { format: "json" },
        reason: "Synthetic audit event for compliance summary test.",
    });

    const summary = getComplianceEvidenceSummary({ windowHours: 24 });
    assert.ok(summary.approvalsRequested >= 1);
    assert.ok(summary.approvalsApproved >= 1);
    assert.ok(summary.auditEventsCaptured >= 1);
    assert.equal(typeof summary.approvalDecisionLatencyP95Seconds, "number");

    const pack = exportComplianceEvidencePack();
    assert.ok(pack.approvals.some((item) => item.id === approval.id));
    assert.ok(pack.auditEvents.some((item) => item.action === "compliance.export.requested"));
    assert.equal(pack.retentionPolicy.activeDays, 365);
    assert.equal(pack.retentionPolicy.archiveDays, 730);

    db.prepare("DELETE FROM approvals WHERE id = ?").run(approval.id);
    db.prepare("DELETE FROM company_audit_events WHERE target_id = ? OR target_id = ?").run(approval.id, `pack-${suffix}`);
});
