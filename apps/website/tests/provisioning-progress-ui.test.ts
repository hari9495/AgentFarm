import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
    ProvisioningProgressCardContent,
} from "../components/dashboard/ProvisioningProgressCard";

const renderHtml = (props: {
    loading: boolean;
    error: string | null;
    payload: Parameters<typeof ProvisioningProgressCardContent>[0]["payload"];
}) => {
    return renderToStaticMarkup(
        React.createElement(ProvisioningProgressCardContent, {
            ...props,
            onRefresh: () => undefined,
        }),
    );
};

test("provisioning progress UI: loading state", () => {
    const html = renderHtml({
        loading: true,
        error: null,
        payload: null,
    });

    assert.equal(html.includes("Loading provisioning status..."), true);
    assert.equal(html.includes("No active provisioning job"), false);
});

test("provisioning progress UI: no active job state", () => {
    const html = renderHtml({
        loading: false,
        error: null,
        payload: {
            tenant: null,
            workspace: null,
            bot: null,
            provisioningJob: null,
            provisioningTimeline: [],
            estimatedSecondsRemaining: null,
        },
    });

    assert.equal(html.includes("No active provisioning job for this workspace."), true);
    assert.equal(html.includes("Step history"), false);
});

test("provisioning progress UI: shows timeline and ETA", () => {
    const now = Date.now();
    const html = renderHtml({
        loading: false,
        error: null,
        payload: {
            tenant: { tenantStatus: "provisioning" },
            workspace: { workspaceStatus: "provisioning" },
            bot: { botStatus: "created" },
            provisioningJob: {
                id: "prv_abc123",
                status: "bootstrapping_vm",
                updatedAt: now - 2_000,
                failureReason: null,
                remediationHint: null,
            },
            provisioningTimeline: [
                { status: "queued", at: now - 15_000, reason: null },
                { status: "validating", at: now - 11_000, reason: null },
                { status: "creating_resources", at: now - 7_000, reason: null },
                { status: "bootstrapping_vm", at: now - 2_000, reason: null },
            ],
            estimatedSecondsRemaining: 210,
        },
    });

    assert.equal(html.includes("prv_abc123"), true);
    assert.equal(html.includes("bootstrapping vm"), true);
    assert.equal(html.includes("Estimated time remaining:"), true);
    assert.equal(html.includes("3m 30s"), true);
    assert.equal(html.includes("Step history"), true);
    assert.equal(html.includes("creating resources"), true);
});

test("provisioning progress UI: failed state shows remediation hint", () => {
    const now = Date.now();
    const html = renderHtml({
        loading: false,
        error: null,
        payload: {
            tenant: { tenantStatus: "degraded" },
            workspace: { workspaceStatus: "failed" },
            bot: { botStatus: "failed" },
            provisioningJob: {
                id: "prv_fail_1",
                status: "failed",
                updatedAt: now - 1_000,
                failureReason: "Quota exceeded while creating resources",
                remediationHint: "Retry after increasing quota or switch runtime tier.",
            },
            provisioningTimeline: [
                { status: "queued", at: now - 14_000, reason: null },
                { status: "validating", at: now - 11_000, reason: null },
                { status: "creating_resources", at: now - 3_000, reason: null },
                { status: "failed", at: now - 1_000, reason: "Quota exceeded" },
            ],
            estimatedSecondsRemaining: null,
        },
    });

    assert.equal(html.includes("Provisioning failed"), true);
    assert.equal(html.includes("Failure reason:"), true);
    assert.equal(html.includes("Quota exceeded while creating resources"), true);
    assert.equal(html.includes("Remediation:"), true);
    assert.equal(html.includes("Retry after increasing quota or switch runtime tier."), true);
});

test("provisioning progress UI: shows SLA metrics and stuck alert", () => {
    const now = Date.now();
    const html = renderHtml({
        loading: false,
        error: null,
        payload: {
            tenant: { tenantStatus: "provisioning" },
            workspace: { workspaceStatus: "provisioning" },
            bot: { botStatus: "created" },
            provisioningJob: {
                id: "prv_sla_1",
                status: "starting_container",
                updatedAt: now - 2_000,
                failureReason: null,
                remediationHint: null,
            },
            provisioningTimeline: [
                { status: "queued", at: now - 5_000, reason: null },
                { status: "validating", at: now - 4_000, reason: null },
                { status: "starting_container", at: now - 2_000, reason: null },
            ],
            estimatedSecondsRemaining: 120,
            slaMetrics: {
                elapsedSeconds: 3800,
                targetSeconds: 600,
                timeoutSeconds: 86400,
                stuckThresholdSeconds: 3600,
                withinTarget: false,
                breachedTarget: true,
                isStuck: true,
                isTimedOut: false,
            },
            provisioningAlerts: [
                {
                    level: "warning",
                    code: "provisioning_stuck_1h",
                    message: "Provisioning has been in progress for over 1 hour.",
                },
            ],
        },
    });

    assert.equal(html.includes("SLA target:"), true);
    assert.equal(html.includes("SLA status:"), true);
    assert.equal(html.includes("Breached"), true);
    assert.equal(html.includes("Provisioning alert"), true);
    assert.equal(html.includes("over 1 hour"), true);
});
