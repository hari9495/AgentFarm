import type { Metadata } from "next";
import { Code2, Layout, TestTube2, Server, Zap, Shield, Activity, GitBranch, Sparkles, CheckCircle2 } from "lucide-react";
import ButtonLink from "@/components/shared/ButtonLink";

export const metadata: Metadata = {
    title: "Product — AgentFarm",
    description: "Explore AgentFarm's AI teammate capabilities, integrations, and trust controls.",
};

const features = [
    {
        icon: Code2,
        gradient: "from-blue-500 to-blue-600",
        title: "Code Generation & Review",
        description:
            "AI backend teammates that implement features, write APIs, handle DB migrations, and review PRs with full codebase context.",
        image: "https://images.unsplash.com/photo-1518773553398-650c184e0bb3?auto=format&fit=crop&w=800&q=80",
    },
    {
        icon: TestTube2,
        gradient: "from-green-500 to-green-600",
        title: "Automated Testing",
        description:
            "QA robots that write unit, integration, and E2E test suites — and maintain coverage as your codebase evolves.",
        image: "https://images.unsplash.com/photo-1516116216624-53e697fedbea?auto=format&fit=crop&w=800&q=80",
    },
    {
        icon: Server,
        gradient: "from-orange-500 to-orange-600",
        title: "Infrastructure Automation",
        description:
            "DevOps agents that manage CI/CD pipelines, Kubernetes clusters, and deployments with policy-aware guardrails.",
        image: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=800&q=80",
    },
    {
        icon: Zap,
        gradient: "from-yellow-500 to-amber-500",
        title: "Instant Task Execution",
        description:
            "Assign a task via Slack or Jira and your AI teammate starts executing in under 30 seconds.",
        image: "https://images.unsplash.com/photo-1611532736597-de2d4265fba3?auto=format&fit=crop&w=800&q=80",
    },
    {
        icon: Shield,
        gradient: "from-red-500 to-red-600",
        title: "Secure Isolated Runtimes",
        description:
            "Each robot runs in a sandboxed container with role-based access control and a complete, immutable audit log.",
        image: "https://images.unsplash.com/photo-1555949963-ff9fe0c870eb?auto=format&fit=crop&w=800&q=80",
    },
    {
        icon: Activity,
        gradient: "from-violet-500 to-violet-600",
        title: "Performance Monitoring",
        description:
            "Real-time dashboard showing tasks completed, PRs merged, test coverage deltas, and deployment frequency.",
        image: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=800&q=80",
    },
    {
        icon: GitBranch,
        gradient: "from-slate-600 to-slate-700",
        title: "Deep GitHub Integration",
        description:
            "Branch creation, PR authoring, code review comments, and merge - all driven natively by your AI teammates.",
        image: "https://images.unsplash.com/photo-1556075798-4825dfaaf498?auto=format&fit=crop&w=800&q=80",
    },
    {
        icon: Layout,
        gradient: "from-pink-500 to-pink-600",
        title: "Frontend Engineering",
        description:
            "AI frontend developers build React components, fix UI bugs, and optimize Core Web Vitals automatically.",
        image: "https://images.unsplash.com/photo-1547658719-da2b51169166?auto=format&fit=crop&w=800&q=80",
    },
];

const outcomes = [
    "Teams report first PR from an AI teammate within 15 minutes of setup",
    "Average 18+ additional pull requests shipped per teammate per week",
    "Security scan on every PR with human review kept for high-risk changes",
    "Full audit trail for every agent action, approval, and decision",
];

const executionFlow = [
    {
        step: "01",
        title: "Choose role-based teammates",
        detail: "Start from marketplace roles mapped to your team structure and approval model.",
    },
    {
        step: "02",
        title: "Connect tools and policies",
        detail: "Wire in GitHub, ticketing, and communication channels with governed access controls.",
    },
    {
        step: "03",
        title: "Ship with human-in-the-loop assurance",
        detail: "Run production work with traceability, approvals, and a complete audit history.",
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
                                    <div className={`absolute bottom-3 left-3 w-9 h-9 bg-gradient-to-br ${gradient} rounded-xl flex items-center justify-center shadow`}>
                                        <Icon className="w-5 h-5 text-white" />
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
