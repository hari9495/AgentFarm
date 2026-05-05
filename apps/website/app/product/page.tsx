import type { Metadata } from "next";
import { Code2, Layout, TestTube2, Server, Zap, Shield, Activity, GitBranch, Sparkles, CheckCircle2 } from "lucide-react";
import ButtonLink from "@/components/shared/ButtonLink";
import PremiumIcon from "@/components/shared/PremiumIcon";
import ProductSceneSection from "@/components/product/ProductSceneSection";
import ProductDemoVideo from "@/components/product/ProductDemoVideo";

export const metadata: Metadata = {
    title: "Product — AgentFarm",
    description: "Explore AgentFarm's AI teammate capabilities, integrations, and trust controls.",
};

const features = [
    {
        icon: Code2,
        gradient: "from-blue-500 to-blue-600",
        title: "Developer Agent — End-to-End Execution",
        description:
            "The Developer Agent implements features, creates branches, opens PRs with full codebase context, and responds to review comments — no human needed for the first pass.",
        image: "https://images.unsplash.com/photo-1518773553398-650c184e0bb3?auto=format&fit=crop&w=800&q=80",
    },
    {
        icon: Zap,
        gradient: "from-yellow-500 to-amber-500",
        title: "21-Skill Marketplace",
        description:
            "Install exactly the skills your team needs: Create PR, Run CI Checks, Fix Test Failures, Security Fix Suggest, Dependency Upgrade Plan, Release Notes Generate, Explain Code, Refactor Plan, and 13 more.",
        image: "https://images.unsplash.com/photo-1611532736597-de2d4265fba3?auto=format&fit=crop&w=800&q=80",
    },
    {
        icon: Shield,
        gradient: "from-red-500 to-red-600",
        title: "Risk-Classified Approval Gates",
        description:
            "Every action is classified as LOW, MEDIUM, or HIGH risk before execution. Low-risk actions auto-execute. Risky changes pause and request human approval via Teams or email — nothing ships without sign-off.",
        image: "https://images.unsplash.com/photo-1555949963-ff9fe0c870eb?auto=format&fit=crop&w=800&q=80",
    },
    {
        icon: Server,
        gradient: "from-orange-500 to-orange-600",
        title: "Tenant-Isolated Azure Runtime",
        description:
            "Each customer gets a dedicated Azure VM. Your code, tokens, and execution environment are never shared with other tenants — zero cross-customer exposure.",
        image: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=800&q=80",
    },
    {
        icon: TestTube2,
        gradient: "from-green-500 to-green-600",
        title: "CI Checks + Test Failure Fixes",
        description:
            "Agent runs CI checks after every PR, identifies test failures, diagnoses root cause, and pushes a targeted fix — all without human intervention for routine failures.",
        image: "https://images.unsplash.com/photo-1516116216624-53e697fedbea?auto=format&fit=crop&w=800&q=80",
    },
    {
        icon: Activity,
        gradient: "from-violet-500 to-violet-600",
        title: "Full Evidence & Audit Trail",
        description:
            "The evidence plane logs every agent action, approval decision, and outcome. Export audit evidence for compliance, review action history per PR, and track all approvals end-to-end.",
        image: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=800&q=80",
    },
    {
        icon: GitBranch,
        gradient: "from-slate-600 to-slate-700",
        title: "Native GitHub & Jira Integration",
        description:
            "Branch creation, PR authoring, code review comments, CI triggers, and Jira ticket transitions — all driven natively by the agent via OAuth with least-privilege scopes.",
        image: "https://images.unsplash.com/photo-1556075798-4825dfaaf498?auto=format&fit=crop&w=800&q=80",
    },
    {
        icon: Layout,
        gradient: "from-pink-500 to-pink-600",
        title: "10 LLM Providers with Fallback Routing",
        description:
            "AgentFarm routes tasks to the best-performing model across 10 providers — OpenAI, Azure OpenAI, Anthropic, Google, Mistral, GitHub Models, xAI, Together, and more — with health-score fallback.",
        image: "https://images.unsplash.com/photo-1547658719-da2b51169166?auto=format&fit=crop&w=800&q=80",
    },
];

const outcomes = [
    "First PR from the Developer Agent within 15 minutes of setup",
    "Every action risk-classified — risky changes require human approval before execution",
    "Security scan on every PR with evidence stored for compliance review",
    "Full audit trail for every agent action, approval decision, and outcome",
];

const executionFlow = [
    {
        step: "01",
        title: "Provision workspace + install skills",
        detail: "Dedicated Azure VM provisioned in minutes. Install the developer skills your team needs from the marketplace.",
    },
    {
        step: "02",
        title: "Connect GitHub, Jira & Teams",
        detail: "OAuth connections with least-privilege scopes. Agent reads Jira tickets and posts to Teams channels for approvals.",
    },
    {
        step: "03",
        title: "Ship with approval-driven assurance",
        detail: "LOW-risk actions auto-execute. MEDIUM and HIGH-risk actions pause for human approval before proceeding.",
    },
];

export default function ProductPage() {
    return (
        <div className="site-shell">
            {/* Hero with product screenshot */}
            <section className="relative overflow-hidden">
                <img
                    src="https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=1800&q=80"
                    alt="AgentFarm product dashboard showing AI teammates in action"
                    className="w-full h-[440px] sm:h-[540px] object-cover"
                    loading="eager"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-slate-900/90 via-slate-900/60 to-transparent" />
                <div className="absolute inset-0 flex items-center">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
                        <div className="max-w-2xl">
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-violet-300 bg-white/10 backdrop-blur border border-white/20 px-3 py-1.5 rounded-full mb-5">
                                <Sparkles className="w-3.5 h-3.5" />
                                Product
                            </span>
                            <h1 className="mt-3 text-4xl sm:text-6xl font-extrabold text-white leading-tight tracking-tight">
                                Everything your AI teammate operations{" "}
                                <span className="bg-gradient-to-r from-violet-300 to-blue-300 bg-clip-text text-transparent">
                                    needs to ship
                                </span>
                            </h1>
                            <p className="mt-5 text-xl text-slate-300 leading-relaxed">
                                AgentFarm gives you a full suite of AI engineering teammates, purpose-built
                                for real software development workflows with approvals and auditability.
                            </p>
                            <div className="mt-8 flex flex-wrap gap-4">
                                <ButtonLink href="/#waitlist" size="lg">
                                    Start Free Trial
                                </ButtonLink>
                                <ButtonLink href="/how-it-works" variant="outline" size="lg">
                                    How It Works
                                </ButtonLink>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Outcome checklist */}
            <section className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 py-10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
                        {outcomes.map((o) => (
                            <div key={o} className="flex items-start gap-3">
                                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                                <p className="text-sm text-slate-600 dark:text-slate-300 leading-snug">{o}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <section className="py-14 sm:py-16">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="site-section-shell rounded-3xl bg-white/85 dark:bg-slate-900/80 backdrop-blur px-5 py-6 sm:px-8 sm:py-8">
                        <p className="text-xs uppercase tracking-[0.16em] text-sky-700 dark:text-sky-300 font-semibold">Execution Path</p>
                        <h2 className="mt-2 text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">From role selection to trusted delivery in three steps</h2>
                        <div className="mt-6 grid gap-4 md:grid-cols-3">
                            {executionFlow.map((item) => (
                                <article key={item.step} className="rounded-2xl border border-slate-200/80 dark:border-slate-700/80 bg-white/90 dark:bg-slate-900/85 p-4">
                                    <p className="text-xs font-semibold tracking-[0.14em] text-slate-500 dark:text-slate-400">STEP {item.step}</p>
                                    <h3 className="mt-2 text-base font-semibold text-slate-900 dark:text-slate-100">{item.title}</h3>
                                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{item.detail}</p>
                                </article>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            <ProductSceneSection />

            {/* Demo video section */}
            <section className="py-20 bg-slate-50 dark:bg-slate-900/50">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                    <p className="text-xs font-semibold uppercase tracking-widest text-blue-600 dark:text-blue-400 mb-4">See it in action</p>
                    <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-100 mb-4">Watch an AI worker ship a feature</h2>
                    <p className="text-slate-500 dark:text-slate-400 text-base mb-8 max-w-xl mx-auto">In 4 minutes, an AgentFarm worker takes a Jira ticket, writes the code, opens a PR, and passes CI. No prompting, no babysitting.</p>
                    <ProductDemoVideo />
                </div>
            </section>

            {/* Features grid with images */}
            <section className="py-24">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="max-w-2xl mx-auto text-center mb-16">
                        <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-slate-100">
                            Built for real engineering workflows
                        </h2>
                        <p className="mt-4 text-lg text-slate-500 dark:text-slate-400">
                            Every feature is designed around how software teams actually work — not how AI demos pretend they work.
                        </p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {features.map(({ icon: Icon, gradient, title, description, image }) => (
                            <div
                                key={title}
                                className="border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all bg-white dark:bg-slate-900 group"
                            >
                                <div className="relative h-36 overflow-hidden">
                                    <img
                                        src={image}
                                        alt={title}
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                        loading="lazy"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                                    <div className="absolute bottom-3 left-3">
                                        <PremiumIcon
                                            icon={Icon}
                                            tone="cyan"
                                            containerClassName={`h-9 w-9 rounded-xl bg-gradient-to-br ${gradient} text-white border-white/20`}
                                            iconClassName="w-5 h-5"
                                        />
                                    </div>
                                </div>
                                <div className="p-5">
                                    <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2 text-sm">{title}</h3>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{description}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA */}
            <section className="py-20">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="relative overflow-hidden rounded-3xl">
                        <img
                            src="https://images.unsplash.com/photo-1504639725590-34d0984388bd?auto=format&fit=crop&w=1800&q=80"
                            alt="Team building software together"
                            className="absolute inset-0 w-full h-full object-cover"
                            loading="lazy"
                        />
                        <div className="absolute inset-0 bg-gradient-to-br from-violet-900/90 via-blue-900/85 to-slate-900/90" />
                        <div className="relative py-16 px-10 text-center text-white">
                            <h2 className="text-3xl font-bold mb-4">
                                Ready to augment your team with trusted AI execution?
                            </h2>
                            <p className="text-blue-100 mb-8 max-w-md mx-auto">Start with a 14-day free trial. No credit card, no commitments.</p>
                            <ButtonLink href="/#waitlist" size="lg">
                                Join the Waitlist
                            </ButtonLink>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
