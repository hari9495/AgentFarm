import type { Metadata } from "next";
import { ArrowRight, CheckCircle2, ShoppingCart, Users, Link as LinkIcon, MessageSquare, CheckCircle, BarChart3 } from "lucide-react";
import Link from "next/link";
import { howItWorksPageContent } from "@/lib/marketing-content";
import { howItWorksHowToSchema, breadcrumbSchema } from "@/lib/seo-schemas";

export const metadata: Metadata = {
    ...howItWorksPageContent.metadata,
    keywords: [
        "how AgentFarms works", "deploy AI worker tutorial", "AI agent setup guide",
        "governed AI deployment", "AI worker onboarding", "connect AI to GitHub Jira Slack",
        "AI approval policy setup", "AI task execution guide",
    ],
    alternates: { canonical: "https://agentfarms.in/how-it-works" },
    openGraph: {
        title: howItWorksPageContent.metadata.title,
        description: howItWorksPageContent.metadata.description,
        url: "https://agentfarms.in/how-it-works",
        type: "website",
    },
};

const stepIcons = {
    "shopping-cart": ShoppingCart,
    users: Users,
    link: LinkIcon,
    "message-square": MessageSquare,
    "check-circle-2": CheckCircle,
    "bar-chart-3": BarChart3,
} as const;

const pageSchemas = [
    howItWorksHowToSchema,
    breadcrumbSchema([
        { name: "Home", url: "https://agentfarms.in" },
        { name: "How It Works", url: "https://agentfarms.in/how-it-works" },
    ]),
];

export default function HowItWorksPage() {
    const { hero, timeline, steps, cta } = howItWorksPageContent;

    return (
        <div style={{ background: "#ffffff" }}>
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pageSchemas) }} />

            {/* Hero — white */}
            <section className="af-tile af-tile-white text-center" style={{ paddingTop: 80, paddingBottom: 72 }}>
                <div className="af-container-narrow">
                    <p className="af-eyebrow mb-4">{hero.eyebrow}</p>
                    <h1
                        className="font-semibold text-[#1d1d1f]"
                        style={{ fontSize: "clamp(2.4rem, 5vw, 3.6rem)", letterSpacing: "-0.03em", lineHeight: 1.07 }}
                    >
                        {hero.titleLead}{" "}
                        <span className="text-[#0066cc]">{hero.titleAccent}</span>
                    </h1>
                    <p className="mt-5 text-[17px] text-[#424245] max-w-lg mx-auto" style={{ lineHeight: 1.47, letterSpacing: "-0.022em" }}>
                        {hero.description}
                    </p>
                </div>
            </section>

            {/* Timeline bar — parchment */}
            <section className="af-tile af-tile-parchment" style={{ paddingTop: 32, paddingBottom: 32 }}>
                <div className="af-container">
                    <div className="flex flex-wrap justify-center gap-6">
                        {timeline.map((item, i) => (
                            <div key={item.label} className="flex items-center gap-3">
                                <span
                                    className="text-[12px] font-semibold text-white rounded-full w-5 h-5 flex items-center justify-center shrink-0"
                                    style={{ background: "#0066cc", fontSize: "11px" }}
                                >
                                    {i + 1}
                                </span>
                                <span className="text-[14px] text-[#6e6e73]">{item.label}</span>
                                <span className="text-[14px] font-semibold text-[#0066cc]">{item.time}</span>
                                {i < timeline.length - 1 && (
                                    <ArrowRight className="w-3.5 h-3.5 text-[#d2d2d7] hidden sm:block" />
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Steps — alternating tiles */}
            {steps.map((step, index) => {
                const StepIcon = stepIcons[step.icon as keyof typeof stepIcons] ?? CheckCircle;
                const isDark = index % 2 === 1;
                const isReversed = index % 2 === 1;

                return (
                    <section
                        key={step.number}
                        className={`af-tile ${isDark ? "af-tile-dark" : "af-tile-white"}`}
                        style={{ paddingTop: 72, paddingBottom: 72 }}
                    >
                        <div className="af-container">
                            <div className={`grid lg:grid-cols-2 gap-12 items-center ${isReversed ? "lg:[&>*:first-child]:order-2 lg:[&>*:last-child]:order-1" : ""}`}>
                                <div>
                                    <div className="flex items-center gap-3 mb-5">
                                        <div
                                            className="w-10 h-10 rounded-[10px] flex items-center justify-center"
                                            style={{ background: isDark ? "rgba(41,151,255,0.15)" : "rgba(0,102,204,0.08)" }}
                                        >
                                            <StepIcon className="w-5 h-5" style={{ color: isDark ? "#2997ff" : "#0066cc" }} />
                                        </div>
                                        <span className="text-[12px] font-semibold uppercase tracking-[0.08em]" style={{ color: isDark ? "#98989d" : "#aeaeb2" }}>
                                            Step {step.number}
                                        </span>
                                    </div>
                                    <h2
                                        className="font-semibold mb-4"
                                        style={{
                                            fontSize: "clamp(1.6rem, 3vw, 2.2rem)",
                                            letterSpacing: "-0.025em",
                                            lineHeight: 1.1,
                                            color: isDark ? "#f5f5f7" : "#1d1d1f",
                                        }}
                                    >
                                        {step.title}
                                    </h2>
                                    <p className="text-[17px] mb-5" style={{ lineHeight: 1.47, letterSpacing: "-0.022em", color: isDark ? "#98989d" : "#424245" }}>
                                        {step.description}
                                    </p>
                                    <span
                                        className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-full"
                                        style={{
                                            background: isDark ? "rgba(41,151,255,0.12)" : "rgba(0,102,204,0.08)",
                                            color: isDark ? "#2997ff" : "#0066cc",
                                        }}
                                    >
                                        {step.detail}
                                    </span>
                                </div>
                                <div
                                    className="rounded-[18px] overflow-hidden"
                                    style={{
                                        border: isDark ? "1px solid rgba(255,255,255,0.1)" : "1px solid #d2d2d7",
                                        boxShadow: "0 24px 56px -20px rgba(0,0,0,0.18)",
                                    }}
                                >
                                    <img
                                        src={step.image}
                                        alt={step.title}
                                        className="w-full h-64 sm:h-72 object-cover"
                                        loading="lazy"
                                    />
                                </div>
                            </div>
                        </div>
                    </section>
                );
            })}

            {/* CTA — dark */}
            <section className="af-tile af-tile-dark text-center">
                <div className="af-container-narrow">
                    <h2
                        className="font-semibold text-white"
                        style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.6rem)", letterSpacing: "-0.025em", lineHeight: 1.1 }}
                    >
                        {cta.title}
                    </h2>
                    <p className="mt-4 text-[17px] text-[#98989d]" style={{ lineHeight: 1.47 }}>
                        {cta.description}
                    </p>
                    <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
                        <Link href={cta.primary.href} className="px-6 py-3 rounded-full text-[17px] font-medium text-white transition-colors" style={{ background: "#0066cc" }}>
                            {cta.primary.label}
                        </Link>
                        <Link href="/pricing" className="px-6 py-3 rounded-full text-[17px] font-medium text-white transition-colors" style={{ border: "1px solid rgba(255,255,255,0.25)" }}>
                            See pricing
                        </Link>
                    </div>
                </div>
            </section>
        </div>
    );
}
