import type { Metadata } from "next";
import { Target, Zap, Users } from "lucide-react";
import Link from "next/link";
import { aboutPageContent } from "@/lib/marketing-content";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { organizationSchema, breadcrumbSchema } from "@/lib/seo-schemas";

export const metadata: Metadata = {
    ...aboutPageContent.metadata,
    keywords: [
        "AgentFarms about", "AI worker platform company", "governed AI company India",
        "AI staffing platform founders", "AgentFarms team", "AI automation startup",
    ],
    alternates: { canonical: "https://agentfarms.in/about" },
    openGraph: {
        title: aboutPageContent.metadata.title,
        description: aboutPageContent.metadata.description,
        url: "https://agentfarms.in/about",
        type: "website",
    },
};

const valueIcons = { target: Target, zap: Zap, users: Users } as const;

const pageSchemas = [
    organizationSchema,
    breadcrumbSchema([
        { name: "Home", url: "https://agentfarms.in" },
        { name: "About", url: "https://agentfarms.in/about" },
    ]),
];

export default function AboutPage() {
    const { hero, stats, mission, values, team, backers, cta } = aboutPageContent;

    return (
        <div style={{ background: "#ffffff" }}>
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pageSchemas) }} />

            {/* Hero tile — white */}
            <section className="af-tile af-tile-white text-center" style={{ paddingTop: 80, paddingBottom: 72 }}>
                <div className="af-container-narrow">
                    <p className="af-eyebrow mb-4">{hero.eyebrow}</p>
                    <h1
                        className="font-semibold text-[var(--op-ink)]"
                        style={{ fontSize: "clamp(2.4rem, 5vw, 3.6rem)", letterSpacing: "-0.03em", lineHeight: 1.07 }}
                    >
                        {hero.titleLead}{" "}
                        <span className="text-[var(--op-indigo)]">{hero.titleAccent}</span>
                    </h1>
                    <p className="mt-5 text-[17px] text-[var(--op-ink-soft)]" style={{ lineHeight: 1.47, letterSpacing: "-0.022em" }}>
                        {hero.description}
                    </p>
                </div>
            </section>

            {/* Stats tile — parchment */}
            <section className="af-tile af-tile-parchment" style={{ paddingTop: 48, paddingBottom: 48 }}>
                <div className="af-container-narrow">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
                        {stats.map((stat) => (
                            <div key={stat.label}>
                                <p className="font-semibold" style={{ fontSize: "2rem", letterSpacing: "-0.03em", lineHeight: 1 }}>
                                    <AnimatedNumber value={stat.value} style={{ background: "linear-gradient(120deg, var(--op-ink) 45%, var(--op-indigo))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", display: "inline-block" }} />
                                </p>
                                <p className="mt-1.5 text-[13px] text-[var(--op-muted)]">{stat.label}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Mission tile — white */}
            <section className="af-tile af-tile-white">
                <div className="af-container">
                    <div className="grid lg:grid-cols-2 gap-12 items-center">
                        <div>
                            <p className="af-eyebrow mb-4">{mission.eyebrow}</p>
                            <h2
                                className="font-semibold text-[var(--op-ink)]"
                                style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.6rem)", letterSpacing: "-0.028em", lineHeight: 1.07 }}
                            >
                                {mission.title}
                            </h2>
                            <p className="mt-4 text-[17px] text-[var(--op-ink-soft)]" style={{ lineHeight: 1.47, letterSpacing: "-0.022em" }}>
                                {mission.description}
                            </p>
                            <div className="mt-6 grid grid-cols-2 gap-3">
                                {mission.callouts.map((callout) => (
                                    <div
                                        key={callout.label}
                                        className="rounded-[14px] p-4"
                                        style={{ border: "1px solid var(--op-line)", background: "var(--op-paper-2)" }}
                                    >
                                        <p
                                            className="font-semibold text-[var(--op-ink)]"
                                            style={{ fontSize: "1.5rem", letterSpacing: "-0.025em" }}
                                        >
                                            {callout.value}
                                        </p>
                                        <p className="text-[13px] text-[var(--op-muted)] mt-0.5">{callout.label}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div
                            className="rounded-[18px] overflow-hidden"
                            style={{ border: "1px solid var(--op-line)", boxShadow: "0 24px 56px -20px rgba(0,0,0,0.12)" }}
                        >
                            <img
                                src={mission.image}
                                alt={mission.imageAlt}
                                className="w-full h-72 object-cover"
                                loading="lazy"
                            />
                            <div className="px-5 py-4" style={{ background: "var(--op-paper-2)", borderTop: "1px solid var(--op-line)" }}>
                                <p className="text-[15px] font-semibold text-[var(--op-ink)]">{mission.imageCaptionTitle}</p>
                                <p className="text-[13px] text-[var(--op-muted)] mt-0.5">{mission.imageCaptionBody}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Values tile — parchment */}
            <section className="af-tile af-tile-parchment">
                <div className="af-container">
                    <h2
                        className="font-semibold text-[var(--op-ink)] mb-2"
                        style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.4rem)", letterSpacing: "-0.025em" }}
                    >
                        What we believe
                    </h2>
                    <p className="text-[17px] text-[var(--op-muted)] mb-10 max-w-2xl" style={{ lineHeight: 1.5 }}>
                        {aboutPageContent.teamIntro}
                    </p>
                    <div className="grid sm:grid-cols-3 gap-4">
                        {values.map((value) => {
                            const Icon = valueIcons[value.icon];
                            return (
                                <div
                                    key={value.title}
                                    className="op-lift rounded-[18px] p-6"
                                    style={{ background: "#ffffff", border: "1px solid var(--op-line)" }}
                                >
                                    <div
                                        className="w-10 h-10 rounded-[10px] flex items-center justify-center mb-4"
                                        style={{ background: "rgba(37,99,235,0.08)" }}
                                    >
                                        <Icon className="w-5 h-5 text-[var(--op-indigo)]" />
                                    </div>
                                    <h3 className="font-semibold text-[17px] text-[var(--op-ink)] mb-2" style={{ letterSpacing: "-0.018em" }}>
                                        {value.title}
                                    </h3>
                                    <p className="text-[15px] text-[var(--op-muted)]" style={{ lineHeight: 1.5 }}>
                                        {value.description}
                                    </p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* Team tile — white */}
            <section className="af-tile af-tile-white">
                <div className="af-container">
                    <h2
                        className="font-semibold text-[var(--op-ink)] mb-2"
                        style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.4rem)", letterSpacing: "-0.025em" }}
                    >
                        The team
                    </h2>
                    <p className="text-[17px] text-[var(--op-muted)] mb-10 max-w-2xl" style={{ lineHeight: 1.5 }}>
                        {aboutPageContent.teamIntro}
                    </p>
                    <div className="grid sm:grid-cols-2 gap-4">
                        {team.map((member) => (
                            <div
                                key={member.name}
                                className="rounded-[18px] overflow-hidden"
                                style={{ border: "1px solid var(--op-line)" }}
                            >
                                <img
                                    src={member.photo}
                                    alt={member.name}
                                    className="w-full h-48 object-cover object-top"
                                    loading="lazy"
                                />
                                <div className="px-5 py-4" style={{ background: "var(--op-paper-2)", borderTop: "1px solid var(--op-line)" }}>
                                    <p className="font-semibold text-[17px] text-[var(--op-ink)]" style={{ letterSpacing: "-0.018em" }}>
                                        {member.name}
                                    </p>
                                    <p className="text-[14px] text-[var(--op-indigo)] mt-0.5 font-medium">{member.role}</p>
                                    <p className="text-[14px] text-[var(--op-muted)] mt-2" style={{ lineHeight: 1.5 }}>{member.bio}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Backers tile — parchment */}
            <section className="af-tile af-tile-parchment text-center">
                <div className="af-container">
                    <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--op-muted)] mb-8">
                        Backed by builders who care about durable systems
                    </p>
                    <div className="flex flex-wrap justify-center gap-3">
                        {backers.map((backer) => (
                            <span
                                key={backer}
                                className="rounded-full px-5 py-2.5 text-[15px] font-semibold text-[var(--op-ink)]"
                                style={{ background: "#ffffff", border: "1px solid var(--op-line)" }}
                            >
                                {backer}
                            </span>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA tile — dark */}
            <section className="af-tile af-tile-dark text-center">
                <div className="af-container-narrow">
                    <h2
                        className="font-semibold text-[color:var(--op-ink)]"
                        style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.6rem)", letterSpacing: "-0.025em", lineHeight: 1.1 }}
                    >
                        {cta.title}
                    </h2>
                    <p className="mt-4 text-[17px] text-[var(--op-muted)]" style={{ lineHeight: 1.47 }}>
                        {cta.description}
                    </p>
                    <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
                        <Link
                            href={cta.primary.href}
                            className="px-6 py-3 rounded-full text-[17px] font-medium text-white transition-colors"
                            style={{ background: "var(--op-indigo)" }}
                        >
                            {cta.primary.label}
                        </Link>
                        <Link
                            href={cta.secondary.href}
                            className="px-6 py-3 rounded-full text-[17px] font-medium text-[color:var(--op-ink)] transition-colors"
                            style={{ border: "1px solid var(--op-line)" }}
                        >
                            {cta.secondary.label}
                        </Link>
                    </div>
                </div>
            </section>
        </div>
    );
}
