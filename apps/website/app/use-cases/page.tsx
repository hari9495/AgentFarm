import type { Metadata } from "next";
import { Code2, Megaphone, HeadphonesIcon, Briefcase, Users, ShieldCheck, CheckCircle2, ArrowRight } from "lucide-react";
import Link from "next/link";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";

export const metadata: Metadata = {
    title: "AI Worker Use Cases — Engineering, Support, Operations",
    description: "Real-world examples of how engineering, support, and operations teams use AgentFarms AI workers to increase output while keeping full human oversight.",
};

const cases = [
    {
        icon: Code2,
        audience: "Engineering Teams",
        headline: "Ship features without drowning in PR overhead",
        story: "A 20-person engineering team deployed a Developer and Tester worker pair. The Developer opens PRs, the Tester runs CI and fixes failures — engineers stay focused on architecture and review. Every action logged, every PR approval-gated.",
        results: ["PR cycle time cut by 60%", "CI failures resolved automatically", "Full audit trail per release", "Engineers focus on design, not drudgery"],
        image: "https://images.unsplash.com/photo-1518773553398-650c184e0bb3?auto=format&fit=crop&w=800&q=80",
    },
    {
        icon: Megaphone,
        audience: "Sales & Marketing",
        headline: "Outreach that never misses a follow-up",
        story: "A Series B SaaS company deployed a Sales Rep and Marketing Specialist worker. The Sales Rep manages CRM updates, follow-up emails, and meeting prep — the Marketing Specialist drafts campaigns, schedules posts, and tracks results. Human reps approve every send.",
        results: ["Pipeline coverage up 3×", "Zero missed follow-ups", "Campaigns launched 5× faster", "Every outbound approved before send"],
        image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=800&q=80",
    },
    {
        icon: HeadphonesIcon,
        audience: "Customer Support",
        headline: "24/7 support without a 24/7 headcount",
        story: "A consumer fintech deployed a Customer Support Executive worker that handles Tier 1 tickets via email and chat — checking order status, processing refunds, drafting complex replies for human review. Escalations route to humans in real time.",
        results: ["Tier 1 tickets resolved in < 2 min", "Support team handles 3× more volume", "Escalations flagged instantly", "Full ticket history in the audit trail"],
        image: "https://images.unsplash.com/photo-1611532736597-de2d4265fba3?auto=format&fit=crop&w=800&q=80",
    },
    {
        icon: Briefcase,
        audience: "Operations & Admin",
        headline: "Every recurring task handled, every deadline met",
        story: "An operations-heavy company deployed a Corporate Assistant worker that manages calendar invites, meeting notes, vendor follow-ups, and internal report compilation. The team stopped losing hours to scheduling and copy-paste work.",
        results: ["15 hrs/week saved per ops manager", "Zero missed scheduling conflicts", "Reports generated automatically", "All actions logged for review"],
        image: "https://images.unsplash.com/photo-1516116216624-53e697fedbea?auto=format&fit=crop&w=800&q=80",
    },
    {
        icon: Users,
        audience: "HR & Recruiting",
        headline: "Source, screen, and schedule without the overhead",
        story: "A fast-growing startup deployed a Recruiter worker that sourced candidates, screened CVs, scheduled interviews, and drafted offer letters — all under HR team oversight. Human recruiters handled final calls and decisions.",
        results: ["Time-to-screen cut from days to hours", "Hiring pipeline 2× more candidates", "Offer letters drafted in minutes", "Every decision logged with rationale"],
        image: "https://images.unsplash.com/photo-1521791136064-7986c2920216?auto=format&fit=crop&w=800&q=80",
    },
    {
        icon: ShieldCheck,
        audience: "Enterprise & Regulated",
        headline: "Autonomous execution with enterprise-grade governance",
        story: "A regulated enterprise deployed AI workers across Engineering, Legal, and Finance — each with role-scoped tool access and a strict approval policy. LOW-risk tasks auto-execute. HIGH-risk changes pause for human sign-off. Every action is logged in the evidence plane.",
        results: ["Full audit trail for every agent action", "Approval gates on all high-risk changes", "Teams notifications for escalations", "Compliance evidence exported on demand"],
        image: "https://images.unsplash.com/photo-1555949963-ff9fe0c870eb?auto=format&fit=crop&w=800&q=80",
    },
];

const roi = [
    { tier: "1–3 AI workers", hours: "15–25 hrs/wk", cost: "$24k–$40k/yr", note: "~40% of a full-time role" },
    { tier: "4–10 AI workers", hours: "80–150 hrs/wk", cost: "$128k–$240k/yr", note: "~2–3 full-time headcount" },
    { tier: "10+ AI workers", hours: "300–600 hrs/wk", cost: "$480k–$960k/yr", note: "~7–15 full-time employees" },
];

export default function UseCasesPage() {
    return (
        <div style={{ background: "#ffffff" }}>

            {/* Hero */}
            <section className="af-tile af-tile-white text-center" style={{ paddingTop: 80, paddingBottom: 72 }}>
                <div className="af-container-narrow">
                    <p className="af-eyebrow mb-4">Use Cases</p>
                    <h1 className="font-semibold text-[var(--op-ink)]" style={{ fontSize: "clamp(2.4rem, 5vw, 3.6rem)", letterSpacing: "-0.03em", lineHeight: 1.07 }}>
                        Built for every department in your company
                    </h1>
                    <p className="mt-5 text-[17px] text-[var(--op-ink-soft)] max-w-lg mx-auto" style={{ lineHeight: 1.47, letterSpacing: "-0.022em" }}>
                        From engineering teams to HR, operations, and sales — see how AgentFarms workers take on repeatable work across every function.
                    </p>
                </div>
            </section>

            {/* Case studies — alternating tiles */}
            {cases.map((c, i) => {
                const Icon = c.icon;
                const isDark = i % 2 === 1;
                const isReversed = i % 2 === 1;
                return (
                    <section key={c.audience} className={`af-tile ${isDark ? "af-tile-dark" : "af-tile-parchment"}`} style={{ paddingTop: 64, paddingBottom: 64 }}>
                        <div className="af-container">
                            <div className={`grid lg:grid-cols-2 gap-12 items-center ${isReversed ? "lg:[&>*:first-child]:order-2 lg:[&>*:last-child]:order-1" : ""}`}>
                                <div>
                                    <div className="flex items-center gap-2 mb-5">
                                        <div className="w-8 h-8 rounded-[8px] flex items-center justify-center" style={{ background: isDark ? "rgba(37,99,235,0.15)" : "rgba(37,99,235,0.08)" }}>
                                            <Icon className="w-4.5 h-4.5" style={{ color: isDark ? "var(--op-indigo)" : "var(--op-indigo)" }} />
                                        </div>
                                        <span className="text-[12px] font-semibold uppercase tracking-[0.06em]" style={{ color: isDark ? "var(--op-indigo)" : "var(--op-indigo)" }}>
                                            {c.audience}
                                        </span>
                                    </div>
                                    <h2 className="font-semibold mb-4" style={{ fontSize: "clamp(1.6rem, 3vw, 2.2rem)", letterSpacing: "-0.025em", lineHeight: 1.1, color: isDark ? "var(--op-paper-2)" : "var(--op-ink)" }}>
                                        {c.headline}
                                    </h2>
                                    <p className="text-[15px] mb-6" style={{ lineHeight: 1.6, color: isDark ? "var(--op-muted)" : "var(--op-ink-soft)" }}>
                                        {c.story}
                                    </p>
                                    <div className="grid grid-cols-2 gap-2">
                                        {c.results.map((r) => (
                                            <div key={r} className="flex items-start gap-2">
                                                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" style={{ color: isDark ? "var(--op-indigo)" : "var(--op-indigo)" }} />
                                                <span className="text-[13px]" style={{ lineHeight: 1.4, color: isDark ? "var(--op-muted)" : "var(--op-ink-soft)" }}>{r}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="rounded-[18px] overflow-hidden" style={{ border: isDark ? "1px solid var(--op-line)" : "1px solid var(--op-line)", boxShadow: "0 24px 56px -20px rgba(0,0,0,0.18)" }}>
                                    <img src={c.image} alt={c.headline} className="w-full h-64 sm:h-72 object-cover" loading="lazy" />
                                </div>
                            </div>
                        </div>
                    </section>
                );
            })}

            {/* ROI estimate — white */}
            <section className="af-tile af-tile-white">
                <div className="af-container">
                    <div className="text-center mb-12">
                        <p className="af-eyebrow mb-4">ROI estimate</p>
                        <h2 className="font-semibold text-[var(--op-ink)]" style={{ fontSize: "clamp(1.9rem, 3.5vw, 2.8rem)", letterSpacing: "-0.028em", lineHeight: 1.07 }}>
                            How much could your team save?
                        </h2>
                        <p className="mt-3 mx-auto max-w-md text-[17px] text-[var(--op-ink-soft)]" style={{ lineHeight: 1.47 }}>
                            Based on median outcomes across customers. Actual results vary by role and workflow.
                        </p>
                    </div>
                    <div className="grid sm:grid-cols-3 gap-4 max-w-[800px] mx-auto">
                        {roi.map((r) => (
                            <div key={r.tier} className="op-lift rounded-[18px] p-6 text-center" style={{ border: "1px solid var(--op-line)" }}>
                                <p className="text-[13px] font-semibold text-[var(--op-muted)] mb-3">{r.tier}</p>
                                <p className="font-semibold" style={{ fontSize: "1.8rem", letterSpacing: "-0.025em", lineHeight: 1 }}><AnimatedNumber value={r.hours} style={{ background: "linear-gradient(120deg, var(--op-ink) 45%, var(--op-indigo))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", display: "inline-block" }} /></p>
                                <p className="text-[14px] font-semibold text-[var(--op-indigo)] mt-1">{r.cost} saved</p>
                                <p className="text-[12px] text-[var(--op-muted)] mt-2">{r.note}</p>
                            </div>
                        ))}
                    </div>
                    <p className="text-center text-[12px] text-[var(--op-muted)] mt-6">
                        Estimate based on $80/hr blended labor cost across all role types and median AgentFarms automation rates.
                    </p>
                </div>
            </section>

            {/* CTA — dark */}
            <section className="af-tile af-tile-dark text-center">
                <div className="af-container-narrow">
                    <h2 className="font-semibold text-[color:var(--op-ink)]" style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.6rem)", letterSpacing: "-0.025em", lineHeight: 1.1 }}>
                        Which departments would you staff first?
                    </h2>
                    <p className="mt-4 text-[17px] text-[var(--op-muted)]" style={{ lineHeight: 1.47 }}>
                        Start with the workflow that hurts most and expand once the output proves itself.
                    </p>
                    <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
                        <Link href="/get-started" className="px-6 py-3 rounded-full text-[17px] font-medium text-white transition-colors" style={{ background: "var(--op-indigo)" }}>
                            Start free trial <ArrowRight className="inline w-4 h-4 ml-1" />
                        </Link>
                        <Link href="/marketplace" className="px-6 py-3 rounded-full text-[17px] font-medium text-[color:var(--op-ink)] transition-colors" style={{ border: "1px solid var(--op-line)" }}>
                            Browse agent roles
                        </Link>
                    </div>
                </div>
            </section>
        </div>
    );
}
