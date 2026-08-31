import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import {
    FlaskConical, GitBranch, CheckCircle2, Zap, BarChart3, Clock,
    ArrowLeft, Star, Users, Bug, MonitorPlay, Shield, Globe, BookOpen, Lock,
} from "lucide-react";
import HireAgentButton from "@/components/marketplace/HireAgentButton";
import StackPill from "@/components/marketplace/StackPill";
import { getSessionUser, listWorkspaceBotsForUser } from "@/lib/auth-store";

export const metadata: Metadata = {
    title: "AI Tester Agent — Hire a Governed QA Worker | AgentFarms",
    description:
        "Hire an AI Tester that handles manual testing, Playwright/Cypress automation, JMeter load testing, Postman API testing, OWASP ZAP security scans, and test management.",
    openGraph: {
        title: "AI Tester Agent \u2013 AgentFarms",
        description:
            "A complete QA platform in one AI agent: automation testing, performance, API, security, manual, and test management \u2014 integrated with your entire stack.",
        type: "website",
        url: "https://agentfarms.in/marketplace/tester",
    },
    alternates: {
        canonical: "https://agentfarms.in/marketplace/tester",
    },
};

// ─── Static data ──────────────────────────────────────────────────────────────

const TESTING_CATEGORIES = [
    {
        icon: MonitorPlay,
        title: "Manual Testing",
        tools: ["Desktop VM", "noVNC", "Browser control"],
        detail:
            "Operates a real browser inside a secure VM — navigates pages, fills forms, checks visual layouts, and records observations exactly as a human tester would. Generates a structured bug report at the end.",
    },
    {
        icon: FlaskConical,
        title: "Automation Testing",
        tools: ["Selenium / WebDriver", "Playwright", "Cypress", "Appium"],
        detail:
            "Authors and runs automated suites in any language (JavaScript, TypeScript, Python, Java, C#, Ruby) across any framework. Supports web, desktop, and mobile (via Appium). Integrates results into your CI pipeline and opens Jira tickets for every failure.",
    },
    {
        icon: BarChart3,
        title: "Performance & Load Testing",
        tools: ["JMeter", "k6", "Artillery"],
        detail:
            "Builds load profiles for any backend stack — Node.js, Java, Python, .NET, Go, Ruby, PHP, and more. Runs baseline benchmarks, computes p50/p95/p99 latency, and flags regressions against the prior release.",
    },
    {
        icon: Globe,
        title: "API Testing",
        tools: ["Postman / Newman", "SoapUI"],
        detail:
            "Runs Postman collections through Newman for REST APIs built in any language or framework. Validates all assertions, publishes per-request failure reports, and supports SOAP/REST/GraphQL contract tests.",
    },
    {
        icon: Shield,
        title: "Security Testing",
        tools: ["OWASP ZAP (DAST)", "Semgrep (SAST)", "Trufflehog / gitleaks", "Burp Suite"],
        detail:
            "Runs dynamic application security testing via ZAP spider + active scan. Combines with static analysis and secret scanning for a full security test report in one pass.",
    },
    {
        icon: BookOpen,
        title: "Test Management",
        tools: ["TestRail", "Jira Zephyr"],
        detail:
            "Syncs test cases to TestRail or Zephyr, publishes run results, and links defects back to test cases automatically — keeping your test management tool in perfect sync with CI.",
    },
];

const CONNECTORS = [
    { name: "GitHub", color: "bg-slate-900 text-white" },
    { name: "GitLab", color: "bg-orange-600 text-white" },
    { name: "Jira", color: "bg-blue-600 text-white" },
    { name: "Linear", color: "bg-violet-600 text-white" },
    { name: "Slack", color: "bg-emerald-700 text-white" },
    { name: "Jenkins", color: "bg-red-700 text-white" },
    { name: "CircleCI", color: "bg-gray-800 text-white" },
    { name: "Selenium", color: "bg-green-700 text-white" },
    { name: "Playwright", color: "bg-teal-700 text-white" },
    { name: "Cypress", color: "bg-gray-700 text-white" },
    { name: "Appium", color: "bg-purple-700 text-white" },
    { name: "k6", color: "bg-indigo-700 text-white" },
    { name: "Artillery", color: "bg-yellow-700 text-white" },
    { name: "Postman", color: "bg-orange-700 text-white" },
    { name: "SoapUI", color: "bg-cyan-700 text-white" },
    { name: "TestRail", color: "bg-sky-700 text-white" },
    { name: "Zephyr", color: "bg-blue-800 text-white" },
    { name: "OWASP ZAP", color: "bg-red-900 text-white" },
];

const SAMPLE_TASKS = [
    "Write Cypress end-to-end tests for the new checkout flow — cover all payment providers",
    "Triage CI failure on PR #234 — 3 failing Playwright tests in the payments module",
    "Run k6 load test for /v1/agents/list at 500 rps — flag if p99 exceeds 300 ms",
    "Execute Newman collection against staging and publish failures to Jira",
    "Perform OWASP ZAP scan on https://staging.myapp.com — create security report",
    "Sync failed Playwright results to TestRail run TR-88 and link JIRA defects",
    "Run Appium smoke suite on Android emulator for release 2.4.0",
    "Generate coverage gap analysis and create Jira subtasks for uncovered error paths",
];

const SAMPLE_REPORT = {
    title: "CI Triage Report — PR #234 (payments: checkout flow)",
    body: `## Failures (3 of 47 tests)

1. POST /v1/checkout — coupon code SAVE20 returns 500
   Root cause: discount.service.ts line 84 — null guard missing when plan has no
   priceOverride. couponCode is applied before plan lookup completes.
   → Bug filed: QA-112 (P1, assigned to dev sprint)

2. POST /v1/checkout — expired coupon returns 200 instead of 400
   Root cause: expiry check is skipped when STRIPE_TEST_MODE=true.
   → Bug filed: QA-113 (P2)

3. GET /v1/invoices/:id — returns 403 for service account token
   Root cause: auth middleware rejects non-human session tokens.
   → Existing issue QA-99 — linked as blocker.

## Recommendation
Block merge until QA-112 is resolved. QA-113 and QA-99 can follow in next patch.`,
};

const PRICING = {
    seat: { label: "Monthly seat", amount: "$99", period: "/mo" },
    perTask: { label: "Per task executed", amount: "$0.10" },
    approvals: { label: "Approval decisions", amount: "Included" },
    support: { label: "Slack support", amount: "Included" },
};

const SOCIAL_PROOF = { teams: 147, rating: 4.8, hoursPerMonth: 45 };

const COOKIE_NAME = "agentfarm_session";

const getCookieValue = (cookieHeader: string | null, name: string): string | null => {
    if (!cookieHeader) return null;
    const cookie = cookieHeader
        .split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${name}=`));
    if (!cookie) return null;
    return decodeURIComponent(cookie.slice(name.length + 1));
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function TesterMarketplacePage() {
    const requestHeaders = await headers();
    const token = getCookieValue(requestHeaders.get("cookie"), COOKIE_NAME);
    let hasTesterAgent = false;
    if (token) {
        const user = await getSessionUser(token).catch(() => null);
        if (user) {
            const bots = await listWorkspaceBotsForUser(user.id).catch(() => []);
            hasTesterAgent = bots.some((b) => b.roleType === "tester");
        }
    }

    return (
        <div className="min-h-screen bg-[var(--op-paper)] text-[var(--op-ink-soft)]">

            {/* Breadcrumb */}
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
                <Link
                    href="/marketplace"
                    className="inline-flex items-center gap-1.5 text-sm text-[var(--op-muted)] hover:text-[var(--op-ink)] transition-colors"
                >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Marketplace
                </Link>
            </div>

            {/* Hero */}
            <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-8">

                    {/* Left: identity + social proof */}
                    <div className="flex-1 min-w-0">
                        <span className="inline-flex items-center rounded-full bg-emerald-500/10 text-[var(--op-approved)] border border-emerald-500/20 px-3 py-1 text-xs font-semibold mb-4">
                            Quality Assurance
                        </span>
                        <h1 className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl font-extrabold text-[var(--op-ink)] tracking-tight leading-tight">
                            AI Tester Agent
                        </h1>
                        <p className="mt-3 text-[var(--op-muted)] text-base sm:text-lg max-w-xl leading-relaxed">
                            A complete QA platform in one AI agent — works with{" "}
                            <strong className="text-[var(--op-ink)]">any programming language and any framework</strong>.
                            Manual desktop testing, Selenium/Playwright/Cypress/Appium automation, k6 &amp; JMeter
                            load testing, Postman API testing, OWASP ZAP security scans, and
                            TestRail/Zephyr test management.
                        </p>

                        {/* Social proof row */}
                        <div className="mt-6 flex flex-wrap items-center gap-4">
                            <div className="flex items-center gap-1.5 rounded-lg bg-[var(--op-paper-2)] border border-[var(--op-line)] px-3 py-1.5 text-sm">
                                <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400 shrink-0" aria-hidden="true" />
                                <strong className="text-[var(--op-ink)]">{SOCIAL_PROOF.rating}</strong>
                                <span className="text-[var(--op-muted)]">rating</span>
                            </div>
                            <div className="flex items-center gap-1.5 rounded-lg bg-[var(--op-paper-2)] border border-[var(--op-line)] px-3 py-1.5 text-sm">
                                <Users className="h-3.5 w-3.5 text-[var(--op-muted)] shrink-0" aria-hidden="true" />
                                <strong className="text-[var(--op-ink)]">{SOCIAL_PROOF.teams}</strong>
                                <span className="text-[var(--op-muted)]">teams</span>
                            </div>
                            <div className="flex items-center gap-1.5 rounded-lg bg-[var(--op-paper-2)] border border-[var(--op-line)] px-3 py-1.5 text-sm">
                                <Clock className="h-3.5 w-3.5 text-[var(--op-muted)] shrink-0" aria-hidden="true" />
                                <span className="text-[var(--op-muted)]">~</span>
                                <strong className="text-[var(--op-ink)]">{SOCIAL_PROOF.hoursPerMonth}h</strong>
                                <span className="text-[var(--op-muted)]">saved/mo</span>
                            </div>
                        </div>
                    </div>

                    {/* Right: pricing card */}
                    <div className="shrink-0 w-full sm:w-64 rounded-2xl border border-[var(--op-line)] bg-[var(--op-paper-2)] p-5 flex flex-col gap-4 self-start">
                        <div>
                            <p className="text-2xl font-bold text-[var(--op-ink)]">
                                {PRICING.seat.amount}
                                <span className="text-sm font-normal text-[var(--op-muted)]">{PRICING.seat.period}</span>
                            </p>
                            <p className="text-xs text-[var(--op-muted)] mt-0.5">per agent seat</p>
                        </div>
                        <ul className="space-y-2.5 text-sm border-t border-[var(--op-line)] pt-4">
                            <li className="flex items-center justify-between gap-2">
                                <span className="text-[var(--op-muted)]">{PRICING.perTask.label}</span>
                                <strong className="text-[var(--op-ink)] shrink-0">{PRICING.perTask.amount}</strong>
                            </li>
                            <li className="flex items-center justify-between gap-2">
                                <span className="text-[var(--op-muted)]">{PRICING.approvals.label}</span>
                                <strong className="text-[var(--op-approved)] shrink-0">{PRICING.approvals.amount}</strong>
                            </li>
                            <li className="flex items-center justify-between gap-2">
                                <span className="text-[var(--op-muted)]">{PRICING.support.label}</span>
                                <strong className="text-[var(--op-approved)] shrink-0">{PRICING.support.amount}</strong>
                            </li>
                        </ul>
                        <HireAgentButton
                            roleKey="tester"
                            source="marketplace-tester"
                            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--op-indigo)] px-4 py-3 text-sm font-semibold text-white hover:opacity-90 active:scale-[0.98] transition-all"
                        />
                        <p className="text-[11px] text-[var(--op-muted)] text-center leading-relaxed">
                            Setup wizard takes &lt; 5 minutes.
                            <br />Cancel any time.
                        </p>
                    </div>
                </div>
            </section>

            {/* Divider */}
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                <hr className="border-t border-[var(--op-line)]" />
            </div>

            {/* Connectors — visible only after purchase */}
            <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
                <h2 className="text-[11px] font-semibold uppercase tracking-widest text-[var(--op-muted)] mb-4">
                    Works with your stack
                </h2>
                {hasTesterAgent ? (
                    <div className="flex flex-wrap gap-2">
                        {CONNECTORS.map((c) => (
                            <StackPill key={c.name} name={c.name} />
                        ))}
                    </div>
                ) : (
                    <div className="relative">
                        {/* Blurred preview */}
                        <div className="flex flex-wrap gap-2 select-none" aria-hidden="true" style={{ filter: "blur(4px)", pointerEvents: "none" }}>
                            {CONNECTORS.map((c) => (
                                <StackPill key={c.name} name={c.name} />
                            ))}
                        </div>
                        {/* Lock overlay */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl bg-[var(--op-paper)]/80 backdrop-blur-sm">
                            <Lock className="h-5 w-5 text-[var(--op-muted)]" aria-hidden="true" />
                            <p className="text-sm font-medium text-[var(--op-ink)]">
                                Available after hiring the Tester agent
                            </p>
                            <p className="text-xs text-[var(--op-muted)] text-center max-w-xs">
                                18 integrations across automation, performance, API, security, and test management tools — unlocked when you set up your agent.
                            </p>
                        </div>
                    </div>
                )}
            </section>

            {/* Divider */}
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                <hr className="border-t border-[var(--op-line)]" />
            </div>

            {/* Capabilities */}
            <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <h2 className="text-xl font-semibold text-[var(--op-ink)] mb-6">Testing disciplines</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {TESTING_CATEGORIES.map((cat) => {
                        const Icon = cat.icon;
                        return (
                            <div
                                key={cat.title}
                                className="rounded-xl border border-[var(--op-line)] bg-[var(--op-paper-2)] p-5 hover:border-emerald-500/30 hover:-translate-y-0.5 transition-all duration-200"
                            >
                                <div className="flex items-center gap-2.5 mb-2">
                                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
                                        <Icon className="h-3.5 w-3.5 text-[var(--op-approved)]" aria-hidden="true" />
                                    </div>
                                    <h3 className="text-sm font-semibold text-[var(--op-ink)]">{cat.title}</h3>
                                </div>
                                <div className="flex flex-wrap gap-1 mb-2.5">
                                    {cat.tools.map((t) => (
                                        <span key={t} className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-emerald-500/10 text-[var(--op-approved)] border border-emerald-500/20">{t}</span>
                                    ))}
                                </div>
                                <p className="text-sm text-[var(--op-muted)] leading-relaxed">{cat.detail}</p>
                            </div>
                        );
                    })}
                </div>
            </section>

            {/* Divider */}
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                <hr className="border-t border-[var(--op-line)]" />
            </div>

            {/* Sample tasks */}
            <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <h2 className="text-xl font-semibold text-[var(--op-ink)] mb-5">Sample tasks it handles</h2>
                <ul className="space-y-3">
                    {SAMPLE_TASKS.map((task) => (
                        <li key={task} className="flex items-start gap-3 rounded-lg border border-[var(--op-line)] bg-[var(--op-paper-2)] px-4 py-3 text-sm text-[var(--op-ink-soft)]">
                            <CheckCircle2 className="h-4 w-4 text-[var(--op-approved)] shrink-0 mt-0.5" aria-hidden="true" />
                            {task}
                        </li>
                    ))}
                </ul>
            </section>

            {/* Divider */}
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                <hr className="border-t border-[var(--op-line)]" />
            </div>

            {/* Sample triage report */}
            <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <h2 className="text-xl font-semibold text-[var(--op-ink)] mb-5">Sample CI triage report</h2>
                <div className="rounded-xl border border-[var(--op-line)] overflow-hidden">
                    <div className="bg-[var(--op-paper-2)] border-b border-[var(--op-line)] px-5 py-3 flex items-center gap-2">
                        <Bug className="h-4 w-4 text-[var(--op-approved)] shrink-0" aria-hidden="true" />
                        <span className="text-sm font-semibold text-[var(--op-ink)] truncate">{SAMPLE_REPORT.title}</span>
                    </div>
                    <pre className="bg-[var(--op-paper)] px-5 py-4 text-xs text-[var(--op-muted)] whitespace-pre-wrap font-mono leading-relaxed overflow-x-auto">
                        {SAMPLE_REPORT.body}
                    </pre>
                </div>
            </section>

            {/* Divider */}
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                <hr className="border-t border-[var(--op-line)]" />
            </div>

            {/* Bottom CTA */}
            <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 pb-20">
                <div className="relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-[var(--op-paper-2)] p-10 text-center">
                    {/* Subtle green glow backdrop */}
                    <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-emerald-500/5 via-transparent to-emerald-500/5" aria-hidden="true" />
                    <div className="relative">
                        <h2 className="text-2xl font-semibold text-[var(--op-ink)] mb-2">
                            Ready to hire your AI tester?
                        </h2>
                        <p className="text-sm text-[var(--op-muted)] mb-7 max-w-md mx-auto leading-relaxed">
                            Connect your repos, CI pipeline, and test management tools, configure the agent
                            persona, and deploy your full-stack QA agent \u2014 in under 5 minutes.
                        </p>
                        <HireAgentButton roleKey="tester" source="marketplace-tester-bottom" />
                    </div>
                </div>
            </section>

        </div>
    );
}
