import type { Metadata } from "next";
import { ShoppingCart, Rocket, Link as LinkIcon, MessageSquare, GitPullRequest, BarChart3, Sparkles, CheckCircle2 } from "lucide-react";
import ButtonLink from "@/components/shared/ButtonLink";

export const metadata: Metadata = {
    title: "How It Works — AgentFarm",
    description: "Learn how AgentFarm AI agents integrate with your GitHub, Jira, and Microsoft Teams workflow.",
};

const steps = [
    {
        number: "01",
        icon: ShoppingCart,
        gradient: "from-blue-500 to-blue-600",
        title: "Provision Your Workspace",
        description:
            "Sign up and AgentFarm provisions a dedicated, tenant-isolated Azure VM runtime for your team. Your code and credentials never share infrastructure with other customers.",
        detail: "Takes under 2 minutes",
        image: "https://images.unsplash.com/photo-1526628953301-3e589a6a8b74?auto=format&fit=crop&w=900&q=80",
    },
    {
        number: "02",
        icon: Rocket,
        gradient: "from-violet-500 to-violet-600",
        title: "Install Developer Skills",
        description:
            "Browse the Skill Marketplace and install the 21 developer skills your team needs — PR creation, CI checks, test fixes, code review, security scanning, release notes, and more.",
        detail: "Skills live in ~30 seconds",
        image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=900&q=80",
    },
    {
        number: "03",
        icon: LinkIcon,
        gradient: "from-emerald-500 to-emerald-600",
        title: "Connect GitHub, Jira & Teams",
        description:
            "Grant repository access via GitHub OAuth. Link your Jira board and Microsoft Teams workspace in the integrations panel. AgentFarm uses least-privilege scopes and never stores credentials in plaintext.",
        detail: "Setup in under 5 minutes",
        image: "https://images.unsplash.com/photo-1556075798-4825dfaaf498?auto=format&fit=crop&w=900&q=80",
    },
    {
        number: "04",
        icon: MessageSquare,
        gradient: "from-orange-500 to-orange-600",
        title: "Assign Tasks — Agent Classifies Risk",
        description:
            "Assign a Jira ticket or send a Teams message. The agent classifies each action by risk: LOW actions execute automatically, MEDIUM and HIGH actions pause and request your approval before proceeding.",
        detail: "Execution starts in <30s",
        image: "https://images.unsplash.com/photo-1611532736597-de2d4265fba3?auto=format&fit=crop&w=900&q=80",
    },
    {
        number: "05",
        icon: GitPullRequest,
        gradient: "from-pink-500 to-pink-600",
        title: "Review the Pull Request",
        description:
            "Your teammate opens a PR on GitHub with clear change summaries and rationale. Review the diff, leave feedback, and approve with policy-aware guardrails.",
        detail: "PR ready in minutes",
        image: "https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=900&q=80",
    },
    {
        number: "06",
        icon: BarChart3,
        gradient: "from-indigo-500 to-indigo-600",
        title: "Monitor & Iterate",
        description:
            "The AgentFarm dashboard shows real-time metrics: tasks completed, PRs merged, test coverage, and deployment frequency. Use insights to refine role usage and approval rules.",
        detail: "Full observability, always",
        image: "https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=900&q=80",
    },
];

export default function HowItWorksPage() {
    return (
        <div className="site-shell">
            {/* Hero with real photo */}
            <section className="relative overflow-hidden">
                <img
                    src="https://images.unsplash.com/photo-1600880292203-757bb62b4baf?auto=format&fit=crop&w=1800&q=80"
                    alt="Engineer working on laptop with product dashboards"
                    className="w-full h-[420px] sm:h-[500px] object-cover"
                    loading="eager"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-emerald-900/85 via-slate-900/70 to-transparent" />
                <div className="absolute inset-0 flex items-center">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
                        <div className="max-w-2xl">
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-300 bg-white/10 backdrop-blur border border-white/20 px-3 py-1.5 rounded-full mb-5">
                                <Sparkles className="w-3.5 h-3.5" />
                                How It Works
                            </span>
                            <h1 className="mt-3 text-4xl sm:text-6xl font-extrabold text-white tracking-tight leading-tight">
                                From zero to trusted AI operations in{" "}
                                <span className="bg-gradient-to-r from-emerald-300 to-blue-300 bg-clip-text text-transparent">
                                    under 10 minutes
                                </span>
                            </h1>
                            <p className="mt-5 text-xl text-slate-300 leading-relaxed">
                                AgentFarm is designed to slot into your existing workflow with zero disruption.
                                No new tools, no new processes — just AI teammates inside the tools your team already uses.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Setup time bar */}
            <div className="bg-slate-900 dark:bg-slate-950 border-b border-slate-800">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-wrap justify-center gap-8 text-center">
                    {[
                        { label: "Provision workspace + install skills", time: "2 min" },
                        { label: "Connect GitHub + Jira + Teams", time: "5 min" },
                        { label: "First task assigned", time: "8 min" },
                        { label: "First review-ready PR", time: "<15 min" },
                    ].map(({ label, time }) => (
                        <div key={label} className="flex items-center gap-3">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                            <span className="text-slate-400 text-sm">{label}</span>
                            <span className="text-white font-semibold text-sm">{time}</span>
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
                                            <span className="text-xs font-bold text-slate-400 font-mono uppercase tracking-widest">Step {step.number}</span>
                                        </div>
                                        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">{step.title}</h2>
                                        <p className="text-slate-500 dark:text-slate-400 leading-relaxed mb-5">{step.description}</p>
                                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-100 dark:border-emerald-800 px-3 py-1.5 rounded-full">
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
                                        <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-sm text-white text-xs font-mono px-2.5 py-1 rounded-full">
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
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-900/90 to-violet-900/90" />
                        <div className="relative py-14 px-10 text-white text-center">
                            <h3 className="text-2xl font-bold mb-3">Ready to augment your team with trusted AI execution?</h3>
                            <p className="text-blue-100 mb-6">Start with a 14-day free trial. No credit card required.</p>
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
