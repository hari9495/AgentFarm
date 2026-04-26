import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
    DeploymentHistoryContent,
    type DeploymentJob,
} from "../components/dashboard/DeploymentHistoryTable";

const renderHtml = (props: {
    loading: boolean;
    error: string | null;
    items: DeploymentJob[];
    actionPendingById?: Record<string, "retry" | "cancel" | undefined>;
    openDetailsId?: string | null;
}) => {
    return renderToStaticMarkup(
        React.createElement(DeploymentHistoryContent, {
            ...props,
            actionPendingById: props.actionPendingById ?? {},
            openDetailsId: props.openDetailsId ?? null,
            onToggleDetails: () => undefined,
            onAction: () => undefined,
            onRefresh: () => undefined,
        }),
    );
};

test("deployments history UI: loading state", () => {
    const html = renderHtml({
        loading: true,
        error: null,
        items: [],
    });

    assert.equal(html.includes("Loading deployment history..."), true);
    assert.equal(html.includes("No deployments found yet"), false);
    assert.equal(html.includes("<table"), false);
});

test("deployments history UI: error state", () => {
    const html = renderHtml({
        loading: false,
        error: "Unable to load deployment history.",
        items: [],
    });

    assert.equal(html.includes("Unable to load deployment history."), true);
    assert.equal(html.includes("No deployments found yet"), false);
    assert.equal(html.includes("<table"), false);
});

test("deployments history UI: empty state", () => {
    const html = renderHtml({
        loading: false,
        error: null,
        items: [],
    });

    assert.equal(html.includes("No deployments found yet. Trigger one from marketplace."), true);
    assert.equal(html.includes("<table"), false);
});

test("deployments history UI: populated table renders deployment row", () => {
    const html = renderHtml({
        loading: false,
        error: null,
        items: [
            {
                id: "dep_abc123",
                botSlug: "ai-devops-engineer",
                botName: "AI DevOps Engineer",
                status: "running",
                statusMessage: "Provisioning infrastructure...",
                createdAt: Date.now() - 10_000,
                updatedAt: Date.now() - 10_000,
                lastActionType: "requested",
                lastActionBy: "requester@agentfarm.local",
                lastActionAt: Date.now() - 10_000,
            },
        ],
    });

    assert.equal(html.includes("<table"), true);
    assert.equal(html.includes("dep_abc123"), true);
    assert.equal(html.includes("AI DevOps Engineer"), true);
    assert.equal(html.includes("Provisioning infrastructure..."), true);
    assert.equal(html.includes("running"), true);
    assert.equal(html.includes("Cancel"), true);
    assert.equal(html.includes("View"), true);
});

test("deployments history UI: failed deployments expose retry action and details panel", () => {
    const html = renderHtml({
        loading: false,
        error: null,
        openDetailsId: "dep_fail_1",
        items: [
            {
                id: "dep_fail_1",
                botSlug: "ai-backend-developer",
                botName: "AI Backend Developer",
                status: "failed",
                statusMessage: "Quota exceeded while provisioning.",
                createdAt: Date.now() - 30_000,
                updatedAt: Date.now() - 20_000,
                lastActionType: "retried",
                lastActionBy: "operator@agentfarm.local",
                lastActionAt: Date.now() - 20_000,
            },
        ],
    });

    assert.equal(html.includes("Retry"), true);
    assert.equal(html.includes("Reason / Message:"), true);
    assert.equal(html.includes("Quota exceeded while provisioning."), true);
    assert.equal(html.includes("Action audit:"), true);
    assert.equal(html.includes("Retried by operator@agentfarm.local"), true);
});
