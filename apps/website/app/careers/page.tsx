import type { Metadata } from "next";
import { ArrowRight, MapPin, Clock, Zap, Users, ShieldCheck, BarChart3 } from "lucide-react";
import Link from "next/link";

export const metadata: Metadata = {
    title: "Join AgentFarms — Careers at the Governed AI Platform",
    description:
        "Join the team building the governed execution layer for AI work. Small team, direct impact — making AI workers trustworthy for real-world business operations.",
};

const openRoles = [
    {
        title: "Senior Backend Engineer",
        department: "Engineering",
        location: "Remote (US / EU)",
        type: "Full-time",
        description:
            "Build the execution engine that powers 13 AI worker roles. You'll work on task scheduling, LLM dispatch, tool connectors, and the approval pipeline.",
        href: "/contact",
    },
    {
        title: "Product Engineer — Dashboard",
        department: "Engineering",
        location: "Remote (US / EU)",
        type: "Full-time",
        description:
            "Own the operator dashboard — approvals queue, evidence explorer, deployment controls. React 19, Next.js 15, real-time data from a Fastify API.",
        href: "/contact",
    },
    {
        title: "Developer Advocate",
        department: "Growth",
        location: "Remote",
        type: "Full-time",
        description:
            "Help engineering teams understand how to deploy governed AI workers. Write guides, produce demos, and engage the community around agentic workflows.",
        href: "/contact",
    },
    {
        title: "Solutions Engineer",
        department: "Customer Success",
        location: "Remote (US)",
        type: "Full-time",
        description:
            "Onboard enterprise customers, configure workers, map approval policies to compliance requirements, and help teams expand beyond the pilot.",
        href: "/contact",
    },
];

const values = [
    {
        icon: Zap,
        title: "Small team, real leverage",
        body: "Every person ships work that reaches customers. No large bureaucracy, no approval chains that slow down good ideas.",
    },
    {
        icon: ShieldCheck,
        title: "Governance is the product",
        body: "We are building AI workers that teams can actually trust. If you care about responsible AI in practice, this work is the right fit.",
    },
    {
        icon: Users,
        title: "Async-first, remote-friendly",
        body: "We document decisions, ship context with every change, and default to writing over synchronous interruptions.",
    },
    {
        icon: BarChart3,
        title: "Measured outcomes",
        body: "We track what we ship, how it performs, and where we need to improve. Data over intuition where both are available.",
    },
];

const perks = [
    "Competitive salary + equity",
    "Fully remote — work from anywhere",
    "Health, dental, and vision coverage",
    "Home office stipend",
    "Annual learning budget",
    "Flexible PTO",
    "Team offsites 2× per year",
    "Latest hardware — your choice",
];

export default function CareersPage() {
    return (
        <div style={{ background: "#ffffff" }}>

            {/* Hero */}
            <section className="af-tile af-tile-white text-center" style={{ paddingTop: 80, paddingBottom: 72 }}>
                <div className="af-container-narrow">
                    <p className="af-eyebrow mb-4">Careers</p>
                    <h1
                        className="font-semibold text-[var(--op-ink)]"
                        style={{ fontSize: "clamp(2.4rem, 5vw, 3.6rem)", letterSpacing: "-0.03em", lineHeight: 1.07 }}
                    >
                        Build the future of governed AI work
                    </h1>
                    <p className="mt-5 text-[17px] text-[var(--op-ink-soft)] max-w-lg mx-auto" style={{ lineHeight: 1.47, letterSpacing: "-0.022em" }}>
                        We are a small, focused team making AI workers trustworthy enough for real business operations.
                        If you care about output, governance, and shipping work that matters, we would like to hear from you.
                    </p>
                    <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
                        <a href="#open-roles" className="btn-primary">
                            See open roles
                            <ArrowRight className="w-4 h-4" />
                        </a>
                        <Link href="/about" className="btn-secondary">
                            About AgentFarms
                        </Link>
                    </div>
                </div>
            </section>

            {/* Values */}
            <section className="af-tile af-tile-parchment">
                <div className="af-container">
                    <h2
                        className="font-semibold text-[var(--op-ink)] text-center mb-12"
                        style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.4rem)", letterSpacing: "-0.025em" }}
                    >
                        How we work
                    </h2>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {values.map((v) => {
                            const Icon = v.icon;
                            return (
                                <div
                                    key={v.title}
                                    className="op-lift rounded-[18px] p-6"
                                    style={{ background: "#ffffff", border: "1px solid var(--op-line)" }}
                                >
                                    <div
                                        className="w-9 h-9 rounded-[8px] flex items-center justify-center mb-4"
                                        style={{ background: "rgba(37,99,235,0.08)" }}
                                    >
                                        <Icon className="w-5 h-5 text-[var(--op-indigo)]" />
                                    </div>
                                    <h3 className="font-semibold text-[15px] text-[var(--op-ink)] mb-2" style={{ letterSpacing: "-0.015em" }}>
                                        {v.title}
                                    </h3>
                                    <p className="text-[14px] text-[var(--op-muted)]" style={{ lineHeight: 1.5 }}>{v.body}</p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* Open roles */}
            <section id="open-roles" className="af-tile af-tile-white">
                <div className="af-container">
                    <h2
                        className="font-semibold text-[var(--op-ink)] mb-2"
                        style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.4rem)", letterSpacing: "-0.025em" }}
                    >
                        Open roles
                    </h2>
                    <p className="text-[17px] text-[var(--op-muted)] mb-10" style={{ lineHeight: 1.5 }}>
                        {openRoles.length} positions currently open
                    </p>
                    <div className="space-y-4">
                        {openRoles.map((role) => (
                            <div
                                key={role.title}
                                className="op-lift rounded-[18px] p-6"
                                style={{ border: "1px solid var(--op-line)" }}
                            >
                                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                                    <div className="flex-1">
                                        <div className="flex flex-wrap items-center gap-2 mb-2">
                                            <span
                                                className="text-[11px] font-semibold uppercase tracking-[0.06em] px-2.5 py-1 rounded-full text-[var(--op-indigo)]"
                                                style={{ background: "rgba(37,99,235,0.08)" }}
                                            >
                                                {role.department}
                                            </span>
                                            <span className="flex items-center gap-1 text-[13px] text-[var(--op-muted)]">
                                                <MapPin className="w-3.5 h-3.5" />
                                                {role.location}
                                            </span>
                                            <span className="flex items-center gap-1 text-[13px] text-[var(--op-muted)]">
                                                <Clock className="w-3.5 h-3.5" />
                                                {role.type}
                                            </span>
                                        </div>
                                        <h3 className="font-semibold text-[19px] text-[var(--op-ink)] mb-2" style={{ letterSpacing: "-0.02em" }}>
                                            {role.title}
                                        </h3>
                                        <p className="text-[15px] text-[var(--op-muted)] max-w-2xl" style={{ lineHeight: 1.5 }}>
                                            {role.description}
                                        </p>
                                    </div>
                                    <Link
                                        href={role.href}
                                        className="shrink-0 self-start inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-[15px] font-medium text-white transition-colors"
                                        style={{ background: "var(--op-indigo)" }}
                                    >
                                        Apply
                                        <ArrowRight className="w-4 h-4" />
                                    </Link>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div
                        className="mt-6 rounded-[18px] p-6 text-center"
                        style={{ border: "1px solid var(--op-line)", background: "var(--op-paper-2)" }}
                    >
                        <p className="text-[15px] text-[var(--op-muted)] mb-3">
                            Don&apos;t see a role that fits? We hire for people before roles.
                        </p>
                        <Link href="/contact" className="text-[15px] text-[var(--op-indigo)] hover:text-[var(--op-indigo-ink)] transition-colors font-medium">
                            Send us a general application &rarr;
                        </Link>
                    </div>
                </div>
            </section>

            {/* Perks */}
            <section className="af-tile af-tile-parchment">
                <div className="af-container">
                    <h2
                        className="font-semibold text-[var(--op-ink)] mb-10 text-center"
                        style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.4rem)", letterSpacing: "-0.025em" }}
                    >
                        Benefits &amp; perks
                    </h2>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 max-w-[860px] mx-auto">
                        {perks.map((perk) => (
                            <div
                                key={perk}
                                className="op-lift rounded-[14px] px-5 py-4 flex items-center gap-3"
                                style={{ background: "#ffffff", border: "1px solid var(--op-line)" }}
                            >
                                <span className="w-2 h-2 rounded-full shrink-0 bg-[var(--op-indigo)]" />
                                <span className="text-[14px] text-[var(--op-ink)]" style={{ letterSpacing: "-0.01em" }}>{perk}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA */}
            <section className="af-tile af-tile-dark text-center">
                <div className="af-container-narrow">
                    <h2
                        className="font-semibold text-[color:var(--op-ink)]"
                        style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.6rem)", letterSpacing: "-0.025em", lineHeight: 1.1 }}
                    >
                        Ready to join the team?
                    </h2>
                    <p className="mt-4 text-[17px] text-[var(--op-muted)]" style={{ lineHeight: 1.47 }}>
                        Browse open roles above or send us a note directly.
                    </p>
                    <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
                        <a
                            href="#open-roles"
                            className="px-6 py-3 rounded-full text-[17px] font-medium text-white transition-colors"
                            style={{ background: "var(--op-indigo)" }}
                        >
                            See open roles
                        </a>
                        <Link
                            href="/contact"
                            className="px-6 py-3 rounded-full text-[17px] font-medium text-[color:var(--op-ink)] transition-colors"
                            style={{ border: "1px solid var(--op-line)" }}
                        >
                            Get in touch
                        </Link>
                    </div>
                </div>
            </section>
        </div>
    );
}
