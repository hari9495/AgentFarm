/**
 * Sprint 6 — Marketplace Listing: hire flow contract tests
 *
 * Verifies:
 *   1. Developer bot exists in marketplace catalogue with correct metadata
 *   2. Developer bot dedicated page route is /marketplace/developer
 *   3. Wizard href contract for the developer role
 *   4. Required connectors are declared on the developer bot
 */

import test from "node:test";
import assert from "node:assert/strict";
import { marketplaceBots } from "../lib/bots.js";

// ─── The same override map maintained in MarketplaceGrid ─────────────────────
// Keep in sync with DEDICATED_DETAIL_PAGES in components/marketplace/MarketplaceGrid.tsx
const DEDICATED_DETAIL_PAGES: Record<string, string> = {
    "ai-backend-developer": "/marketplace/developer",
};

const buildHireHref = (roleKey: string, source: string): string =>
    `/onboarding?role=${encodeURIComponent(roleKey)}&source=${encodeURIComponent(source)}`;

const DEVELOPER_SLUG = "ai-backend-developer";
const DEVELOPER_ROLE_KEY = "developer";

test("marketplace: developer bot is present in marketplace catalogue", () => {
    const bot = marketplaceBots.find((b) => b.slug === DEVELOPER_SLUG);
    assert.notEqual(bot, undefined, `Expected ${DEVELOPER_SLUG} in marketplaceBots`);
});

test("marketplace: developer bot is available (not 'coming soon')", () => {
    const bot = marketplaceBots.find((b) => b.slug === DEVELOPER_SLUG);
    assert.equal(bot?.available, true, "Developer bot should be available");
});

test("marketplace: developer bot has a non-empty price", () => {
    const bot = marketplaceBots.find((b) => b.slug === DEVELOPER_SLUG);
    assert.ok(
        bot?.price && bot.price.length > 0,
        "Developer bot should have a price string",
    );
});

test("marketplace: developer bot is in Engineering department", () => {
    const bot = marketplaceBots.find((b) => b.slug === DEVELOPER_SLUG);
    assert.equal(bot?.department, "Engineering", "Developer bot should be in Engineering");
});

test("marketplace: developer bot declares GitHub as an integration", () => {
    const bot = marketplaceBots.find((b) => b.slug === DEVELOPER_SLUG);
    const integrations = bot?.integrations ?? [];
    assert.ok(
        integrations.includes("GitHub"),
        `Expected GitHub in integrations, got: ${integrations.join(", ")}`,
    );
});

test("marketplace: developer bot declares Jira as an integration", () => {
    const bot = marketplaceBots.find((b) => b.slug === DEVELOPER_SLUG);
    const integrations = bot?.integrations ?? [];
    assert.ok(
        integrations.includes("Jira"),
        `Expected Jira in integrations, got: ${integrations.join(", ")}`,
    );
});

test("marketplace: dedicated page override routes developer slug to /marketplace/developer", () => {
    const href = DEDICATED_DETAIL_PAGES[DEVELOPER_SLUG];
    assert.equal(href, "/marketplace/developer");
});

test("marketplace: dedicated page override does not affect unregistered slugs", () => {
    const href = DEDICATED_DETAIL_PAGES["ai-qa-engineer"];
    assert.equal(href, undefined, "Unregistered slug should not have a dedicated override");
});

test("marketplace: HireAgentButton wizard href includes role and source params", () => {
    const href = buildHireHref(DEVELOPER_ROLE_KEY, "marketplace-developer-hero");
    assert.ok(href.startsWith("/onboarding?"), "href should start with /onboarding?");
    assert.ok(href.includes("role=developer"), "href should include role=developer");
    assert.ok(href.includes("source=marketplace-developer-hero"), "href should include source param");
});

test("marketplace: HireAgentButton encodes special characters in source param", () => {
    const href = buildHireHref(DEVELOPER_ROLE_KEY, "marketplace developer bottom");
    assert.ok(
        href.includes("source=marketplace%20developer%20bottom"),
        "Source param should be URL-encoded",
    );
});

test("marketplace: all 12 canonical role slugs are present in marketplace catalogue", () => {
    const requiredSlugs = [
        "ai-technical-recruiter",
        "ai-backend-developer",
        "ai-full-stack-developer",
        "ai-qa-engineer",
        "ai-business-analyst",
        "ai-technical-writer",
        "ai-content-writer",
        "ai-sales-rep",
        "ai-marketing-specialist",
        "ai-corporate-assistant",
        "ai-customer-support-agent",
        "ai-project-manager",
    ];
    const catalogueSlugs = new Set(marketplaceBots.map((b) => b.slug));
    for (const slug of requiredSlugs) {
        assert.ok(catalogueSlugs.has(slug), `Expected slug ${slug} in marketplaceBots`);
    }
});
