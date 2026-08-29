import type { Metadata } from "next";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import MarketplaceGrid from "@/components/marketplace/MarketplaceGrid";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { marketplaceItemListSchema, aggregateRatingSchema, breadcrumbSchema } from "@/lib/seo-schemas";

export const metadata: Metadata = {
    title: "AI Worker Marketplace — 13 Specialist Roles | AgentFarms",
    description:
        "Browse and hire AI workers across 13 specialist roles — Backend Developer, QA Engineer, Sales Rep, Customer Support, Project Manager, and more. Deploy in under 10 minutes.",
    keywords: [
        "AI worker marketplace", "hire AI agents", "AI backend developer",
        "AI QA engineer", "AI sales rep", "AI customer support agent",
        "AI project manager", "AI content writer", "AI recruiter",
        "AI marketing specialist", "buy AI worker India", "AI staffing marketplace",
    ],
    alternates: { canonical: "https://agentfarms.in/marketplace" },
    openGraph: {
        title: "AI Worker Marketplace — 13 Specialist Roles | AgentFarms",
        description: "Browse 13 governed AI worker roles. Deploy in under 10 minutes with human approval gates.",
        url: "https://agentfarms.in/marketplace",
        type: "website",
    },
};

const stats = [
    { label: "AI worker roles", value: "13" },
    { label: "Avg hire time", value: "< 10 min" },
    { label: "Actions audited", value: "100%" },
    { label: "Departments covered", value: "8" },
];

const launchPaths = [
    {
        label: "Start with Engineering & QA",
        detail: "Deploy a Backend Developer and QA Engineer pair. PRs open automatically, CI runs, failures fix themselves — engineers review, not babysit.",
    },
    {
        label: "Add Sales & Marketing",
        detail: "Sales Rep and Marketing Specialist handle outreach, CRM hygiene, campaign drafts, and follow-up sequences with full human approval on every send.",
    },
    {
        label: "Cover Operations & Support",
        detail: "Corporate Assistant, Customer Support, and Project Manager workers for every recurring task that currently eats up your most capable people.",
    },
];

const trustPoints = [
    "14-day free trial, no card required",
    "Deploy in under 10 minutes",
    "Human approval on every high-risk action",
    "Full audit trail — every task, every decision",
];

const pageSchemas = [
    marketplaceItemListSchema,
    aggregateRatingSchema,
    breadcrumbSchema([
        { name: "Home", url: "https://agentfarms.in" },
        { name: "Marketplace", url: "https://agentfarms.in/marketplace" },
    ]),
];

export default function MarketplacePage() {
    return (
        <div style={{ background: "#ffffff" }}>
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pageSchemas) }} />

            {/* Hero — white */}
            <section className="af-tile af-tile-white" style={{ paddingTop: 80, paddingBottom: 64 }}>
                <div className="af-container-wide">
                    <div className="grid lg:grid-cols-[1fr_320px] gap-12 items-start">

                        {/* Left — headline + CTAs */}
                        <div>
                            <p className="af-eyebrow mb-5">Agent Marketplace</p>
                            <h1
                                className="font-semibold text-[var(--op-ink)]"
                                style={{ fontSize: "clamp(2.2rem, 4.5vw, 3.4rem)", letterSpacing: "-0.03em", lineHeight: 1.07 }}
                            >
                                Hire an AI worker for every role in your company
                            </h1>
                            <p className="mt-4 max-w-xl text-[17px] text-[var(--op-ink-soft)]" style={{ lineHeight: 1.47, letterSpacing: "-0.022em" }}>
                                13 specialist AI workers across engineering, sales, marketing, support, operations, and more.
                                Real tool access, approval gates on every high-stakes action, full evidence trail.
                            </p>

                            {/* Trust bullets */}
                            <ul className="mt-5 grid sm:grid-cols-2 gap-2">
                                {trustPoints.map((t) => (
                                    <li key={t} className="flex items-center gap-2 text-[14px] text-[var(--op-ink-soft)]">
                                        <CheckCircle2 className="w-4 h-4 shrink-0 text-[var(--op-indigo)]" />
                                        {t}
                                    </li>
                                ))}
                            </ul>

                            <div className="mt-8 flex flex-col sm:flex-row gap-3">
                                <Link href="/get-started" className="btn-primary">
                                    Start free trial
                                    <ArrowRight className="w-4 h-4" />
                                </Link>
                                <Link href="/book-demo" className="btn-secondary">
                                    Book a live demo
                                </Link>
                            </div>
                        </div>

                        {/* Right — stat tiles */}
                        <div className="grid grid-cols-2 gap-3" aria-label="Marketplace metrics">
                            {stats.map((s) => (
                                <div
                                    key={s.label}
                                    className="op-lift rounded-[14px] p-5 flex flex-col gap-1"
                                    style={{ border: "1px solid var(--op-line)", background: "var(--op-paper-2)" }}
                                >
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--op-muted)]">{s.label}</p>
                                    <p className="font-semibold" style={{ fontSize: "1.8rem", letterSpacing: "-0.03em", lineHeight: 1 }}>
                                        <AnimatedNumber value={s.value} style={{ background: "linear-gradient(120deg, var(--op-ink) 45%, var(--op-indigo))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", display: "inline-block" }} />
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Launch path cards */}
                    <div className="mt-10 grid md:grid-cols-3 gap-4">
                        {launchPaths.map((path) => (
                            <div
                                key={path.label}
                                className="op-lift rounded-[14px] p-5"
                                style={{ border: "1px solid var(--op-line)", background: "var(--op-paper-2)" }}
                            >
                                <p className="font-semibold text-[15px] text-[var(--op-ink)] mb-2" style={{ letterSpacing: "-0.015em" }}>
                                    {path.label}
                                </p>
                                <p className="text-[13px] text-[var(--op-muted)]" style={{ lineHeight: 1.5 }}>{path.detail}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Grid section — parchment */}
            <section className="af-tile af-tile-parchment" style={{ paddingTop: 56, paddingBottom: 80 }}>
                <div className="af-container-wide">
                    <div className="flex items-baseline justify-between mb-8">
                        <div>
                            <h2 className="font-semibold text-[var(--op-ink)]" style={{ fontSize: "clamp(1.4rem, 2.5vw, 1.8rem)", letterSpacing: "-0.022em" }}>
                                Browse all workers
                            </h2>
                            <p className="mt-1 text-[14px] text-[var(--op-muted)]">
                                Filter by department, plan, or search by skill
                            </p>
                        </div>
                    </div>
                    <MarketplaceGrid />
                </div>
            </section>
        </div>
    );
}
