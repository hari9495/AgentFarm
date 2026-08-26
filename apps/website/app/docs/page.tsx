import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Zap, BookOpen, Code2, Plug, ShieldCheck, Terminal } from "lucide-react";
import { H1, Lead, H2, P, Callout, PageNav, Tag } from "@/components/docs/DocComponents";

export const metadata: Metadata = {
    title: "Documentation — AgentFarms",
    description: "Everything you need to deploy governed AI workers, connect real tools, and understand the operating model behind AgentFarms.",
    alternates: { canonical: "https://agentfarms.in/docs" },
};

const quickLinks = [
    {
        icon: Zap,
        title: "Quickstart",
        description: "Deploy your first AI worker in under 10 minutes.",
        href: "/docs/quickstart",
        cta: "Get started →",
    },
    {
        icon: BookOpen,
        title: "Core Concepts",
        description: "Understand the task lifecycle, execution model, and approval controls.",
        href: "/docs/concepts",
        cta: "Read concepts →",
    },
    {
        icon: Code2,
        title: "REST API Reference",
        description: "Programmatically manage workers, tasks, and approvals.",
        href: "/docs/api-reference",
        cta: "View API →",
    },
    {
        icon: Plug,
        title: "Connectors",
        description: "Connect GitHub, Jira, Slack, Salesforce, and 14 more tools.",
        href: "/docs/connectors",
        cta: "Browse connectors →",
    },
    {
        icon: ShieldCheck,
        title: "Approval Gates",
        description: "How risk classification and human-in-the-loop review works.",
        href: "/docs/approvals",
        cta: "Learn approvals →",
    },
    {
        icon: Terminal,
        title: "SDK",
        description: "TypeScript SDK for building on top of AgentFarms.",
        href: "/docs/sdk",
        cta: "View SDK →",
    },
];

export default function DocsPage() {
    return (
        <article>
            {/* Header */}
            <div className="mb-8">
                <Tag>Documentation</Tag>
                <H1>AgentFarms Docs</H1>
                <Lead>
                    Everything you need to deploy AI workers, connect real systems, and understand
                    the governance model behind controlled AI execution.
                </Lead>
            </div>

            <Callout type="tip" title="New to AgentFarms?">
                Start with the <Link href="/docs/quickstart" className="text-[var(--op-indigo)] hover:underline font-medium">Quickstart guide</Link> — you can have a worker live and processing real tasks in under 10 minutes. No credit card required.
            </Callout>

            {/* Quick links grid */}
            <H2 id="explore">Explore the docs</H2>
            <div className="grid sm:grid-cols-2 gap-4 my-6">
                {quickLinks.map((card) => {
                    const Icon = card.icon;
                    return (
                        <Link
                            key={card.title}
                            href={card.href}
                            className="group flex flex-col gap-3 rounded-[14px] p-5 transition-all hover:-translate-y-0.5 hover:shadow-md"
                            style={{ border: "1px solid var(--op-line)" }}
                        >
                            <div className="flex items-center gap-2.5">
                                <div
                                    className="w-8 h-8 rounded-[8px] flex items-center justify-center shrink-0"
                                    style={{ background: "rgba(37,99,235,0.08)" }}
                                >
                                    <Icon className="w-4 h-4 text-[var(--op-indigo)]" />
                                </div>
                                <h3 className="font-semibold text-[15px] text-[var(--op-ink)] group-hover:text-[var(--op-indigo)] transition-colors" style={{ letterSpacing: "-0.015em" }}>
                                    {card.title}
                                </h3>
                            </div>
                            <p className="text-[13px] text-[var(--op-muted)]" style={{ lineHeight: 1.5 }}>
                                {card.description}
                            </p>
                            <span className="text-[13px] font-medium text-[var(--op-indigo)]">{card.cta}</span>
                        </Link>
                    );
                })}
            </div>

            {/* What is AgentFarms */}
            <H2 id="what-is">What is AgentFarms?</H2>
            <P>
                AgentFarms is a <strong>governed AI worker platform</strong>. It lets you deploy role-based AI workers
                that execute real tasks inside your tools — GitHub, Jira, Slack, Salesforce, and more —
                while routing important decisions through human approval gates. Every action is logged in
                an auditable evidence trail.
            </P>
            <P>
                AgentFarms is <em>not</em> a chatbot, copilot, or code suggestion tool. Workers execute
                complete multi-step workflows autonomously: they open PRs, update CRM records,
                triage support tickets, write documentation, and coordinate across tools — with a
                governance layer that stops risky actions before they reach production.
            </P>

            {/* How it fits */}
            <H2 id="how-it-fits">How AgentFarms fits into your stack</H2>
            <P>
                AgentFarms connects to the tools your team already uses. Workers receive tasks from
                the dashboard, API, or trigger integrations (webhooks, email, Slack). They execute
                inside a scoped, isolated environment and surface outputs back through the same
                channels.
            </P>

            <div
                className="rounded-[12px] p-5 my-5 font-mono text-[13px]"
                style={{ background: "#1a1a1c", color: "#e5e5ea" }}
            >
                <div className="text-[var(--op-muted)] mb-2"># Request flow</div>
                <div><span className="text-[#0a84ff]">Dashboard / API / Webhook</span></div>
                <div className="pl-4 text-[var(--op-muted)]">↓</div>
                <div><span className="text-[#30d158]">AgentFarms API Gateway</span> <span className="text-[var(--op-muted)]">(auth, billing, approvals)</span></div>
                <div className="pl-4 text-[var(--op-muted)]">↓</div>
                <div><span className="text-[#ffd60a]">Agent Runtime</span> <span className="text-[var(--op-muted)]">(LLM dispatch, action tiers)</span></div>
                <div className="pl-4 text-[var(--op-muted)]">↓</div>
                <div><span className="text-[#ff453a]">Connectors</span> <span className="text-[var(--op-muted)]">(GitHub, Jira, Slack, Salesforce…)</span></div>
            </div>

            {/* Key concepts */}
            <H2 id="key-concepts">Key concepts</H2>
            <div className="space-y-3 my-4">
                {[
                    { term: "Worker", def: "A deployed AI agent with a specific role (e.g. Backend Developer), scoped tool access, and a configured approval policy." },
                    { term: "Task", def: "A unit of work assigned to a worker. Tasks move through Receive → Plan → Execute → Review → Iterate." },
                    { term: "Approval gate", def: "A checkpoint that pauses execution and routes a decision to a human reviewer before a high-risk action executes." },
                    { term: "Evidence trail", def: "An append-only, searchable log of every action, approval decision, and output produced during task execution." },
                    { term: "Connector", def: "An OAuth-authenticated integration with an external tool (GitHub, Jira, Slack, etc.) that gives workers scoped access to actions." },
                    { term: "Risk level", def: "A classification (low / medium / high) assigned to each action that determines whether it auto-executes or requires approval." },
                ].map((item) => (
                    <div key={item.term} className="flex gap-3">
                        <span className="font-semibold text-[14px] text-[var(--op-ink)] shrink-0 min-w-[120px]">{item.term}</span>
                        <span className="text-[14px] text-[var(--op-muted)]" style={{ lineHeight: 1.6 }}>{item.def}</span>
                    </div>
                ))}
            </div>

            {/* Plans */}
            <H2 id="plans">Plans &amp; limits</H2>
            <div className="overflow-hidden rounded-[11px] my-4" style={{ border: "1px solid var(--op-line)" }}>
                <table className="w-full text-[13px]">
                    <thead>
                        <tr style={{ background: "var(--op-paper-2)", borderBottom: "1px solid var(--op-line)" }}>
                            <th className="px-4 py-2.5 text-left font-semibold text-[var(--op-ink)]">Plan</th>
                            <th className="px-4 py-2.5 text-left font-semibold text-[var(--op-ink)]">Workers</th>
                            <th className="px-4 py-2.5 text-left font-semibold text-[var(--op-ink)]">Tasks / month</th>
                            <th className="px-4 py-2.5 text-left font-semibold text-[var(--op-ink)]">Price</th>
                        </tr>
                    </thead>
                    <tbody>
                        {[
                            { plan: "Starter+", workers: "2", tasks: "2,000", price: "From $299/mo" },
                            { plan: "Pro+", workers: "5", tasks: "10,000", price: "From $599/mo" },
                            { plan: "Enterprise", workers: "Unlimited", tasks: "Unlimited", price: "Custom" },
                        ].map((row, i) => (
                            <tr key={row.plan} style={{ borderBottom: i < 2 ? "1px solid var(--op-line)" : "none" }}>
                                <td className="px-4 py-3 font-semibold text-[var(--op-ink)]">{row.plan}</td>
                                <td className="px-4 py-3 text-[var(--op-ink-soft)]">{row.workers}</td>
                                <td className="px-4 py-3 text-[var(--op-ink-soft)]">{row.tasks}</td>
                                <td className="px-4 py-3 text-[var(--op-ink-soft)]">{row.price}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <P>All plans include a 14-day free trial with no credit card required. See <Link href="/pricing" className="text-[var(--op-indigo)] hover:underline">full pricing details</Link>.</P>

            <PageNav
                next={{ href: "/docs/quickstart", label: "Quickstart" }}
            />
        </article>
    );
}
