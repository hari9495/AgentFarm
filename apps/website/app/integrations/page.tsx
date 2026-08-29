import type { Metadata } from "next";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import Link from "next/link";

export const metadata: Metadata = {
    title: "Integrations — 18 AgentFarms Connectors and Workflows",
    description:
        "Connect AgentFarms AI workers to the tools your team uses. 18 connectors covering code, task management, messaging, and CRM. OAuth and API key setup included.",
};

const categories = [
    {
        name: "Code & Version Control",
        connectors: [
            { name: "GitHub", description: "Open PRs, run CI checks, review code, and merge branches with full audit trail.", auth: "OAuth 2.0", status: "GA" },
            { name: "GitLab", description: "Manage merge requests, pipelines, and issue tracking across self-hosted or cloud.", auth: "OAuth 2.0", status: "GA" },
            { name: "Bitbucket", description: "Pull request workflow and CI integration for Bitbucket Cloud and Server.", auth: "OAuth 2.0", status: "GA" },
        ],
    },
    {
        name: "Task & Project Management",
        connectors: [
            { name: "Jira", description: "Create, update, and resolve tickets. Link tasks to PRs and track delivery status.", auth: "OAuth 2.0", status: "GA" },
            { name: "Linear", description: "Issue creation, cycle management, and project progress tracking.", auth: "API Key", status: "GA" },
            { name: "Asana", description: "Task assignment, project tracking, and team workload management.", auth: "OAuth 2.0", status: "GA" },
            { name: "Notion", description: "Read and write to pages, databases, and project wikis.", auth: "OAuth 2.0", status: "Beta" },
        ],
    },
    {
        name: "Messaging & Communication",
        connectors: [
            { name: "Slack", description: "Receive task assignments, send notifications, and surface approvals in channels.", auth: "OAuth 2.0", status: "GA" },
            { name: "Microsoft Teams", description: "Task intake, approval routing, and status updates via Teams channels and bots.", auth: "OAuth 2.0", status: "GA" },
        ],
    },
    {
        name: "Email",
        connectors: [
            { name: "Gmail", description: "Draft, send, and manage email threads. Handle support inboxes and follow-ups.", auth: "OAuth 2.0", status: "GA" },
            { name: "Outlook", description: "Microsoft 365 email integration for enterprise communication workflows.", auth: "OAuth 2.0", status: "GA" },
        ],
    },
    {
        name: "CRM & Sales",
        connectors: [
            { name: "Salesforce", description: "Read and update contacts, opportunities, and accounts. Log call and email activity.", auth: "OAuth 2.0", status: "GA" },
            { name: "HubSpot", description: "Contact enrichment, deal tracking, and sequence management.", auth: "OAuth 2.0", status: "GA" },
        ],
    },
    {
        name: "Customer Support",
        connectors: [
            { name: "Zendesk", description: "Create and update tickets, draft replies, and escalate issues based on policy.", auth: "API Key", status: "GA" },
            { name: "Intercom", description: "Respond to conversations, route tickets, and update contact records.", auth: "OAuth 2.0", status: "Beta" },
        ],
    },
    {
        name: "Cloud & Infrastructure",
        connectors: [
            { name: "Azure", description: "Provision resources, query deployment status, and manage Azure DevOps pipelines.", auth: "Service Principal", status: "GA" },
            { name: "GitHub Actions", description: "Trigger and monitor CI/CD pipelines, inspect logs, and respond to failures.", auth: "OAuth 2.0", status: "GA" },
        ],
    },
];

const highlights = [
    "OAuth 2.0 token auto-refresh — workers never lose access mid-task",
    "Per-workspace credential isolation — no cross-tenant access",
    "Scoped permissions — workers only access what the role requires",
    "Full connector health monitoring with automatic error surfacing",
    "Approval gate before any write operation on sensitive systems",
];

const totalConnectors = categories.reduce((n, c) => n + c.connectors.length, 0);

export default function IntegrationsPage() {
    return (
        <div style={{ background: "#ffffff" }}>

            {/* Hero */}
            <section className="af-tile af-tile-white text-center" style={{ paddingTop: 80, paddingBottom: 72 }}>
                <div className="af-container-narrow">
                    <p className="af-eyebrow mb-4">Integrations</p>
                    <h1
                        className="font-semibold text-[var(--op-ink)]"
                        style={{ fontSize: "clamp(2.4rem, 5vw, 3.6rem)", letterSpacing: "-0.03em", lineHeight: 1.07 }}
                    >
                        Connect every tool your team already uses
                    </h1>
                    <p className="mt-5 text-[17px] text-[var(--op-ink-soft)] max-w-lg mx-auto" style={{ lineHeight: 1.47, letterSpacing: "-0.022em" }}>
                        {totalConnectors} connectors across code, tasks, messaging, CRM, support, and infrastructure.
                        Workers get scoped access — no broader than the role requires.
                    </p>
                    <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
                        <Link href="/get-started" className="btn-primary">
                            Start free trial
                            <ArrowRight className="w-4 h-4" />
                        </Link>
                        <Link href="/docs/quickstart" className="btn-secondary">
                            See setup guide
                        </Link>
                    </div>
                </div>
            </section>

            {/* Highlights bar */}
            <section className="af-tile af-tile-parchment" style={{ paddingTop: 40, paddingBottom: 40 }}>
                <div className="af-container">
                    <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {highlights.map((h) => (
                            <li key={h} className="flex items-start gap-2.5 text-[15px] text-[var(--op-ink-soft)]">
                                <CheckCircle2 className="mt-0.5 w-4 h-4 shrink-0 text-[var(--op-indigo)]" />
                                <span style={{ lineHeight: 1.5 }}>{h}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            </section>

            {/* Connector grid by category */}
            {categories.map((cat, ci) => {
                const isDark = false; // tiles are all light now
                return (
                    <section
                        key={cat.name}
                        className={`af-tile ${ci % 2 === 1 ? "af-tile-parchment" : "af-tile-white"}`}
                        style={{ paddingTop: 56, paddingBottom: 56 }}
                    >
                        <div className="af-container">
                            <h2
                                className={`font-semibold mb-8 ${isDark ? "text-white" : "text-[var(--op-ink)]"}`}
                                style={{ fontSize: "1.2rem", letterSpacing: "-0.018em" }}
                            >
                                {cat.name}
                            </h2>
                            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {cat.connectors.map((connector) => (
                                    <div
                                        key={connector.name}
                                        className="op-lift rounded-[18px] p-5"
                                        style={{
                                            background: isDark ? "rgba(255,255,255,0.05)" : "#ffffff",
                                            border: isDark ? "1px solid var(--op-line)" : "1px solid var(--op-line)",
                                        }}
                                    >
                                        <div className="flex items-start justify-between gap-2 mb-3">
                                            <div
                                                className="w-9 h-9 rounded-[8px] flex items-center justify-center shrink-0 text-[13px] font-bold"
                                                style={{
                                                    background: isDark ? "rgba(37,99,235,0.15)" : "rgba(37,99,235,0.08)",
                                                    color: isDark ? "var(--op-indigo)" : "var(--op-indigo)",
                                                }}
                                            >
                                                {connector.name.slice(0, 2).toUpperCase()}
                                            </div>
                                            <span
                                                className="text-[11px] font-semibold uppercase tracking-[0.05em] px-2 py-0.5 rounded-full"
                                                style={{
                                                    background: connector.status === "GA"
                                                        ? (isDark ? "rgba(37,99,235,0.12)" : "rgba(37,99,235,0.08)")
                                                        : (isDark ? "rgba(255,159,10,0.15)" : "rgba(255,159,10,0.1)"),
                                                    color: connector.status === "GA"
                                                        ? (isDark ? "var(--op-indigo)" : "var(--op-indigo)")
                                                        : "#ff9f0a",
                                                }}
                                            >
                                                {connector.status}
                                            </span>
                                        </div>
                                        <h3
                                            className="font-semibold text-[15px] mb-1.5"
                                            style={{ color: isDark ? "var(--op-paper-2)" : "var(--op-ink)", letterSpacing: "-0.015em" }}
                                        >
                                            {connector.name}
                                        </h3>
                                        <p className="text-[13px] mb-3" style={{ color: isDark ? "var(--op-muted)" : "var(--op-muted)", lineHeight: 1.5 }}>
                                            {connector.description}
                                        </p>
                                        <p className="text-[12px]" style={{ color: isDark ? "var(--op-muted)" : "var(--op-muted)" }}>
                                            Auth: {connector.auth}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </section>
                );
            })}

            {/* CTA */}
            <section className="af-tile af-tile-dark text-center">
                <div className="af-container-narrow">
                    <h2
                        className="font-semibold text-[color:var(--op-ink)]"
                        style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.6rem)", letterSpacing: "-0.025em", lineHeight: 1.1 }}
                    >
                        Need a connector that&apos;s not listed?
                    </h2>
                    <p className="mt-4 text-[17px] text-[var(--op-muted)]" style={{ lineHeight: 1.47 }}>
                        Enterprise plans include custom connector development for internal tools and proprietary systems.
                    </p>
                    <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
                        <Link href="/contact" className="px-6 py-3 rounded-full text-[17px] font-medium text-white transition-colors" style={{ background: "var(--op-indigo)" }}>
                            Request a connector
                        </Link>
                        <Link href="/docs/quickstart" className="px-6 py-3 rounded-full text-[17px] font-medium text-[color:var(--op-ink)] transition-colors" style={{ border: "1px solid var(--op-line)" }}>
                            Setup guide
                        </Link>
                    </div>
                </div>
            </section>
        </div>
    );
}
