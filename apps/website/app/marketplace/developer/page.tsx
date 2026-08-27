import type { Metadata } from "next";
import Link from "next/link";
import {
    Code2, GitBranch, CheckCircle2, Zap, Shield, Clock,
    ArrowLeft, Star, Users, BarChart3,
} from "lucide-react";
import HireAgentButton from "@/components/marketplace/HireAgentButton";

export const metadata: Metadata = {
    title: "AI Developer Agent — Hire a Governed Worker | AgentFarms",
    description:
        "Hire an AI Developer that writes code, creates PRs, fixes CI failures, and reviews pull requests — integrated with GitHub, Jira, and your existing stack.",
    openGraph: {
        title: "AI Developer Agent – AgentFarms",
        description:
            "An always-on AI developer that works your Jira backlog: writes tested code, opens pull requests, and ships features end-to-end.",
        type: "website",
        url: "https://agentfarms.in/marketplace/developer",
    },
    alternates: {
        canonical: "https://agentfarms.in/marketplace/developer",
    },
};

// ─── Static data ──────────────────────────────────────────────────────────────

const CAPABILITIES = [
    {
        icon: Code2,
        title: "Feature implementation",
        detail: "Reads Jira tickets, writes clean TypeScript/Python, adds unit tests, commits to a branch.",
    },
    {
        icon: GitBranch,
        title: "Pull request creation",
        detail: "Opens a PR with a structured description, diff summary, and linked ticket. Assigns reviewers.",
    },
    {
        icon: CheckCircle2,
        title: "CI failure triage",
        detail: "Reads failing test output, identifies root cause, pushes a fix commit within the same session.",
    },
    {
        icon: Shield,
        title: "Code review",
        detail: "Reviews open PRs for security anti-patterns, missing error handling, and performance regressions.",
    },
    {
        icon: BarChart3,
        title: "Database migrations",
        detail: "Writes zero-downtime Prisma or Alembic migrations, validates backward compatibility before applying.",
    },
    {
        icon: Zap,
        title: "Refactoring & cleanup",
        detail: "Decomposes large modules, extracts reusable utilities, and updates all call sites with full test coverage.",
    },
];

const CONNECTORS = [
    { name: "GitHub", color: "bg-slate-900 text-white" },
    { name: "GitLab", color: "bg-orange-600 text-white" },
    { name: "Jira", color: "bg-blue-600 text-white" },
    { name: "Linear", color: "bg-violet-600 text-white" },
    { name: "Slack", color: "bg-emerald-700 text-white" },
    { name: "PostgreSQL", color: "bg-sky-700 text-white" },
    { name: "MySQL", color: "bg-orange-500 text-white" },
];

const SAMPLE_TASKS = [
    "Fix failing unit test in auth.ts — TypeError: cannot read property 'id' of undefined",
    "Implement POST /v1/webhooks endpoint from Jira ticket DEV-412",
    "Review PR #189 — check for SQL injection and missing input validation",
    "Write Prisma migration to add `last_login_at` column to users table",
    "Refactor UserService into separate AuthService and ProfileService modules",
];

const SAMPLE_PR = {
    title: "feat(auth): add JWT refresh token rotation (#142)",
    description: `## Summary
Implements sliding-window refresh token rotation as specified in DEV-142.
Tokens are single-use — each refresh issues a new token and invalidates the old one.

## Changes
- \`auth/token.service.ts\`: rotation logic + invalidation index
- \`auth/token.service.test.ts\`: 9 new test cases (happy path + replay attack)
- \`migrations/20260515_add_token_family.sql\`: token family table for replay detection

## Checklist
- [x] Tests pass (pnpm test)
- [x] Lint clean (pnpm lint)
- [x] Migration reversible
- [x] No breaking API changes`,
};

const PRICING = {
    seat: { label: "Monthly seat", amount: "$99", period: "/mo" },
    perTask: { label: "Per task executed", amount: "$0.10" },
    approvals: { label: "Approval decisions", amount: "Included" },
    support: { label: "Slack support", amount: "Included" },
};

const SOCIAL_PROOF = { teams: 214, rating: 4.9, hoursPerMonth: 60 };

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DeveloperMarketplacePage() {
    return (
        <div className="min-h-screen bg-[var(--canvas)] text-[var(--body-color)]">

            {/* Breadcrumb */}
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
                <Link
                    href="/marketplace"
                    className="inline-flex items-center gap-1.5 text-sm text-[var(--mute)] hover:text-[var(--ink)] transition-colors"
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
                        <span className="inline-flex items-center rounded-full bg-blue-500/10 text-[var(--accent-blue)] border border-blue-500/20 px-3 py-1 text-xs font-semibold mb-4">
                            Engineering
                        </span>
                        <h1 className="text-3xl sm:text-4xl font-semibold text-[var(--ink)] tracking-tight leading-tight">
                            AI Developer Agent
                        </h1>
                        <p className="mt-3 text-[var(--mute)] text-base sm:text-lg max-w-xl leading-relaxed">
                            An always-on developer that works your Jira backlog — writes tested code,
                            opens pull requests, fixes CI failures, and reviews PRs. Integrated with
                            GitHub, Jira, and your existing tools.
                        </p>

                        {/* Social proof row */}
                        <div className="mt-6 flex flex-wrap items-center gap-4">
                            <div className="flex items-center gap-1.5 rounded-lg bg-[var(--surface-el)] border border-[var(--hairline)] px-3 py-1.5 text-sm">
                                <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400 shrink-0" aria-hidden="true" />
                                <strong className="text-[var(--ink)]">{SOCIAL_PROOF.rating}</strong>
                                <span className="text-[var(--mute)]">rating</span>
                            </div>
                            <div className="flex items-center gap-1.5 rounded-lg bg-[var(--surface-el)] border border-[var(--hairline)] px-3 py-1.5 text-sm">
                                <Users className="h-3.5 w-3.5 text-[var(--mute)] shrink-0" aria-hidden="true" />
                                <strong className="text-[var(--ink)]">{SOCIAL_PROOF.teams}</strong>
                                <span className="text-[var(--mute)]">teams</span>
                            </div>
                            <div className="flex items-center gap-1.5 rounded-lg bg-[var(--surface-el)] border border-[var(--hairline)] px-3 py-1.5 text-sm">
                                <Clock className="h-3.5 w-3.5 text-[var(--mute)] shrink-0" aria-hidden="true" />
                                <span className="text-[var(--mute)]">~</span>
                                <strong className="text-[var(--ink)]">{SOCIAL_PROOF.hoursPerMonth}h</strong>
                                <span className="text-[var(--mute)]">saved/mo</span>
                            </div>
                        </div>
                    </div>

                    {/* Right: pricing card */}
                    <div className="shrink-0 w-full sm:w-64 rounded-2xl border border-[var(--hairline)] bg-[var(--surface-el)] p-5 flex flex-col gap-4 self-start">
                        <div>
                            <p className="text-2xl font-bold text-[var(--ink)]">
                                {PRICING.seat.amount}
                                <span className="text-sm font-normal text-[var(--mute)]">{PRICING.seat.period}</span>
                            </p>
                            <p className="text-xs text-[var(--mute)] mt-0.5">per agent seat</p>
                        </div>
                        <ul className="space-y-2.5 text-sm border-t border-[var(--hairline)] pt-4">
                            <li className="flex items-center justify-between gap-2">
                                <span className="text-[var(--mute)]">{PRICING.perTask.label}</span>
                                <strong className="text-[var(--ink)] shrink-0">{PRICING.perTask.amount}</strong>
                            </li>
                            <li className="flex items-center justify-between gap-2">
                                <span className="text-[var(--mute)]">{PRICING.approvals.label}</span>
                                <strong className="text-[var(--accent-green)] shrink-0">{PRICING.approvals.amount}</strong>
                            </li>
                            <li className="flex items-center justify-between gap-2">
                                <span className="text-[var(--mute)]">{PRICING.support.label}</span>
                                <strong className="text-[var(--accent-green)] shrink-0">{PRICING.support.amount}</strong>
                            </li>
                        </ul>
                        <HireAgentButton
                            roleKey="developer"
                            source="marketplace-developer"
                            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--ink)] px-4 py-3 text-sm font-semibold text-[var(--canvas)] hover:opacity-90 active:scale-[0.98] transition-all"
                        />
                        <p className="text-[11px] text-[var(--mute)] text-center leading-relaxed">
                            Setup wizard takes &lt; 5 minutes.
                            <br />Cancel any time.
                        </p>
                    </div>
                </div>
            </section>

            {/* Divider */}
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                <hr className="border-t border-[var(--hairline)]" />
            </div>

            {/* Connectors */}
            <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
                <h2 className="text-[11px] font-semibold uppercase tracking-widest text-[var(--mute)] mb-4">
                    Works with your stack
                </h2>
                <div className="flex flex-wrap gap-2">
                    {CONNECTORS.map((c) => (
                        <span
                            key={c.name}
                            className={`inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-semibold ${c.color}`}
                        >
                            {c.name}
                        </span>
                    ))}
                </div>
            </section>

            {/* Divider */}
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                <hr className="border-t border-[var(--hairline)]" />
            </div>

            {/* Capabilities */}
            <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <h2 className="text-xl font-semibold text-[var(--ink)] mb-6">What it can do</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {CAPABILITIES.map((cap) => {
                        const Icon = cap.icon;
                        return (
                            <div
                                key={cap.title}
                                className="rounded-xl border border-[var(--hairline)] bg-[var(--surface-el)] p-5 hover:border-[var(--accent-blue)]/30 hover:-translate-y-0.5 transition-all duration-200"
                            >
                                <div className="flex items-center gap-2.5 mb-2.5">
                                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
                                        <Icon className="h-3.5 w-3.5 text-[var(--accent-blue)]" aria-hidden="true" />
                                    </div>
                                    <h3 className="text-sm font-semibold text-[var(--ink)]">{cap.title}</h3>
                                </div>
                                <p className="text-sm text-[var(--mute)] leading-relaxed">{cap.detail}</p>
                            </div>
                        );
                    })}
                </div>
            </section>

            {/* Divider */}
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                <hr className="border-t border-[var(--hairline)]" />
            </div>

            {/* Sample tasks */}
            <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <h2 className="text-xl font-semibold text-[var(--ink)] mb-5">Sample tasks it handles</h2>
                <ul className="space-y-3">
                    {SAMPLE_TASKS.map((task) => (
                        <li key={task} className="flex items-start gap-3 rounded-lg border border-[var(--hairline)] bg-[var(--surface-el)] px-4 py-3 text-sm text-[var(--body-color)]">
                            <CheckCircle2 className="h-4 w-4 text-[var(--accent-green)] shrink-0 mt-0.5" aria-hidden="true" />
                            {task}
                        </li>
                    ))}
                </ul>
            </section>

            {/* Divider */}
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                <hr className="border-t border-[var(--hairline)]" />
            </div>

            {/* Sample PR */}
            <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <h2 className="text-xl font-semibold text-[var(--ink)] mb-5">Sample pull request</h2>
                <div className="rounded-xl border border-[var(--hairline)] overflow-hidden">
                    <div className="bg-[var(--surface-el)] border-b border-[var(--hairline)] px-5 py-3 flex items-center gap-2">
                        <GitBranch className="h-4 w-4 text-[var(--accent-green)] shrink-0" aria-hidden="true" />
                        <span className="text-sm font-semibold text-[var(--ink)] truncate">{SAMPLE_PR.title}</span>
                    </div>
                    <pre className="bg-[var(--surface-card)] px-5 py-4 text-xs text-[var(--mute)] whitespace-pre-wrap font-mono leading-relaxed overflow-x-auto">
                        {SAMPLE_PR.description}
                    </pre>
                </div>
            </section>

            {/* Divider */}
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                <hr className="border-t border-[var(--hairline)]" />
            </div>

            {/* Bottom CTA */}
            <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 pb-20">
                <div className="relative overflow-hidden rounded-2xl border border-[var(--accent-blue)]/20 bg-[var(--surface-el)] p-10 text-center">
                    {/* Subtle blue glow backdrop */}
                    <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-500/5 via-transparent to-blue-500/5" aria-hidden="true" />
                    <div className="relative">
                        <h2 className="text-2xl font-semibold text-[var(--ink)] mb-2">
                            Ready to hire your AI developer?
                        </h2>
                        <p className="text-sm text-[var(--mute)] mb-7 max-w-md mx-auto leading-relaxed">
                            Connect your GitHub and Jira, configure the agent persona, set approval policies,
                            and deploy — in under 5 minutes.
                        </p>
                        <HireAgentButton roleKey="developer" source="marketplace-developer-bottom" />
                    </div>
                </div>
            </section>

        </div>
    );
}
