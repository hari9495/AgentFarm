import type { Metadata } from "next";
import { ShoppingCart, Rocket, Link as LinkIcon, MessageSquare, CheckCircle2, BarChart3, Sparkles, Users } from "lucide-react";
import ButtonLink from "@/components/shared/ButtonLink";

export const metadata: Metadata = {
    title: "How It Works — AgentFarm",
    description: "Learn how AgentFarm provisions AI workers for any department and connects them to your real tools in under 10 minutes.",
};

const steps = [
    {
        number: "01",
        icon: ShoppingCart,
        gradient: "from-blue-500 to-blue-600",
        title: "Browse the Role Marketplace",
        description:
            "Browse 12 AI worker roles across every department — Developer, Tester, Sales Rep, Marketing Specialist, Customer Support Executive, Corporate Assistant, and more. Select the role your team needs and AgentFarm provisions a dedicated, tenant-isolated Azure VM runtime for that agent.",
        detail: "Role live in under 2 minutes",
        image: "https://images.unsplash.com/photo-1526628953301-3e589a6a8b74?auto=format&fit=crop&w=900&q=80",
    },
    {
        number: "02",
        icon: Users,
        gradient: "from-violet-500 to-violet-600",
        title: "Set Up Your Agent's Identity",
        description:
            "Give your AI worker a name, email address, and persona. External people — customers, candidates, vendors — interact with the agent as they would a human employee. Configure escalation rules so the agent knows when to act autonomously and when to loop in a human.",
        detail: "Persona configured in minutes",
        image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=900&q=80",
    },
    {
        number: "03",
        icon: LinkIcon,
        gradient: "from-emerald-500 to-emerald-600",
        title: "Connect Your Tools",
        description:
            "Connect the tools your AI worker needs: GitHub, Jira, Slack, HubSpot, Salesforce, Gmail, Google Calendar, and more — all via MCP connectors. AgentFarm uses least-privilege OAuth scopes and never stores credentials in plaintext. For tools with no connector, the agent operates in full desktop mode — it sees the screen and uses it like a human.",
        detail: "Setup in under 5 minutes",
        image: "https://images.unsplash.com/photo-1556075798-4825dfaaf498?auto=format&fit=crop&w=900&q=80",
    },
    {
        number: "04",
        icon: MessageSquare,
        gradient: "from-orange-500 to-orange-600",
        title: "Assign Work — Agent Classifies Risk",
        description:
            "Assign a task via Jira, Slack, Teams, or email. The agent classifies every action by risk: LOW-risk tasks execute automatically, MEDIUM and HIGH-risk actions pause and notify you for approval before proceeding. Nothing risky ships without sign-off.",
        detail: "Execution starts in <30s",
        image: "https://images.unsplash.com/photo-1611532736597-de2d4265fba3?auto=format&fit=crop&w=900&q=80",
    },
    {
        number: "05",
        icon: CheckCircle2,
        gradient: "from-pink-500 to-pink-600",
        title: "Review and Approve",
        description:
            "Every significant action comes to you for review. Approve in one click from your email, Slack, or Teams. The agent's output — a PR, a drafted email, a filled form, a generated report — is visible before anything is committed.",
        detail: "One-click approval from anywhere",
        image: "https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=900&q=80",
    },
    {
        number: "06",
        icon: BarChart3,
        gradient: "from-indigo-500 to-indigo-600",
        title: "Monitor Across Every Agent",
        description:
            "The AgentFarm dashboard shows real-time activity across all your AI workers: tasks completed, decisions made, approvals pending, audit evidence exported. Pause, redirect, or hire a new agent role in minutes.",
        detail: "Full observability, always",
        image: "https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=900&q=80",
    },
];

export default function HowItWorksPage() {
    return (
        <div>
            {/* Hero with real photo */}
            <section className="relative overflow-hidden">
                <img
                    src="https://images.unsplash.com/photo-1600880292203-757bb62b4baf?auto=format&fit=crop&w=1800&q=80"
                    alt="Engineer working on laptop with product dashboards"
                    className="w-full h-[420px] sm:h-[500px] object-cover"
                    loading="eager"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-[#07080a]/85 via-[#07080a]/70 to-transparent" />
                <div className="absolute inset-0 flex items-center">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
                        <div className="max-w-2xl">
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-300 bg-white/10 backdrop-blur border border-white/20 px-3 py-1.5 rounded-full mb-5">
                                <Sparkles className="w-3.5 h-3.5" />
                                How It Works
                            </span>
                            <h1 className="mt-3 text-4xl sm:text-6xl font-extrabold text-white tracking-tight leading-tight">
                                From zero to a working AI employee in{" "}
                                <span className="bg-gradient-to-r from-emerald-300 to-blue-300 bg-clip-text text-transparent">
                                    under 10 minutes
                                </span>
                            </h1>
                            <p className="mt-5 text-xl text-slate-300 leading-relaxed">
                                AgentFarm slots into your existing workflow without disruption.
                                Pick a role, connect your tools, set approval rules — and your AI worker starts on day one.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Setup time bar */}
            <div className="bg-[var(--canvas)] border-b border-[var(--hairline)]">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-wrap justify-center gap-8 text-center">
                    {[
                        { label: "Browse marketplace + pick a role", time: "1 min" },
                        { label: "Configure persona + connect tools", time: "5 min" },
                        { label: "First task assigned to agent", time: "8 min" },
                        { label: "First output ready for review", time: "<15 min" },
                    ].map(({ label, time }) => (
                        <div key={label} className="flex items-center gap-3">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                            <span className="text-[var(--mute)] text-sm">{label}</span>
                            <span className="text-[var(--ink)] font-semibold text-sm">{time}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Steps with photos */}
            <section className="py-24">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="space-y-16">
                        {steps.map((step, i) => {
                            const StepIcon = step.icon;
                            const isEven = i % 2 === 1;
                            return (
                                <div
                                    key={step.number}
                                    className={`grid grid-cols-1 lg:grid-cols-2 gap-10 items-center ${isEven ? "lg:flex-row-reverse" : ""}`}
                                >
                                    <div className={isEven ? "lg:order-2" : ""}>
                                        <div className="flex items-center gap-3 mb-4">
                                            <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${step.gradient} flex items-center justify-center shadow-lg`}>
                                                <StepIcon className="w-5 h-5 text-white" />
                                            </div>
                                            <span className="text-xs font-bold text-[var(--ash)] font-mono uppercase tracking-widest">Step {step.number}</span>
                                        </div>
                                        <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)] mb-4">{step.title}</h2>
                                        <p className="text-[var(--mute)] leading-relaxed mb-5">{step.description}</p>
                                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--accent-green)] bg-[var(--accent-green)]/10 border border-[var(--accent-green)]/20 px-3 py-1.5 rounded-full">
                                            ✓ {step.detail}
                                        </span>
                                    </div>
                                    <div className={`relative rounded-2xl overflow-hidden shadow-xl ${isEven ? "lg:order-1" : ""}`}>
                                        <img
                                            src={step.image}
                                            alt={step.title}
                                            className="w-full h-64 sm:h-72 object-cover"
                                            loading="lazy"
                                        />
                                        <div className="absolute top-3 left-3 bg-[#07080a]/80 backdrop-blur-sm text-white text-xs font-mono px-2.5 py-1 rounded-full">
                                            {step.number}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="mt-20 relative overflow-hidden rounded-3xl">
                        <img
                            src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1800&q=80"
                            alt="Team working together successfully"
                            className="absolute inset-0 w-full h-full object-cover"
                            loading="lazy"
                        />
                        <div className="absolute inset-0 bg-[var(--canvas)] border border-[var(--hairline)]" />
                        <div className="relative py-14 px-10 text-white text-center">
                            <h3 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)] mb-3">Ready to hire your first AI worker?</h3>
                            <p className="text-[var(--mute)] mb-6">Start with any role. 14-day free trial. No credit card required.</p>
                            <ButtonLink href="/#waitlist" size="lg">
                                Get Started Free
                            </ButtonLink>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
