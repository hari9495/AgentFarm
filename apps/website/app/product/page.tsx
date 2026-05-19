import type { Metadata } from "next";
import { Code2, Layout, TestTube2, Server, Zap, Shield, Activity, GitBranch, Sparkles, CheckCircle2 } from "lucide-react";
import ButtonLink from "@/components/shared/ButtonLink";

import ProductSceneSection from "@/components/product/ProductSceneSection";
import ProductDemoVideo from "@/components/product/ProductDemoVideo";

export const metadata: Metadata = {
    title: "Product — AgentFarm",
    description: "Explore AgentFarm: 12 AI worker roles for every department, approval-driven safety, tenant-isolated execution, and a full audit trail.",
};

const features = [
    {
        icon: Code2,
        gradient: "from-blue-500 to-blue-600",
        title: "12 AI Worker Roles",
        description:
            "Developer, Tester, Sales Rep, Marketing Specialist, Customer Support Executive, Corporate Assistant, Recruiter, Business Analyst, Technical Writer, Full Stack Developer, Content Writer, Project Manager — one platform for all 12.",
        image: "https://images.unsplash.com/photo-1518773553398-650c184e0bb3?auto=format&fit=crop&w=800&q=80",
    },
    {
        icon: Zap,
        gradient: "from-yellow-500 to-amber-500",
        title: "Role Marketplace",
        description:
            "Browse roles by department. Each role ships with pre-configured tool access, an approval policy, and a persona. Hire in under 10 minutes — no setup engineers required.",
        image: "https://images.unsplash.com/photo-1611532736597-de2d4265fba3?auto=format&fit=crop&w=800&q=80",
    },
    {
        icon: Shield,
        gradient: "from-red-500 to-red-600",
        title: "Risk-Classified Approval Gates",
        description:
            "Every action is classified as LOW, MEDIUM, or HIGH risk before execution. Low-risk tasks auto-execute. Risky actions pause and notify you for human approval — nothing ships without sign-off.",
        image: "https://images.unsplash.com/photo-1555949963-ff9fe0c870eb?auto=format&fit=crop&w=800&q=80",
    },
    {
        icon: Server,
        gradient: "from-orange-500 to-orange-600",
        title: "Tenant-Isolated Azure Runtime",
        description:
            "Each customer gets a dedicated Azure VM. Your data, credentials, and execution environment are never shared with other tenants — zero cross-customer exposure.",
        image: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=800&q=80",
    },
    {
        icon: TestTube2,
        gradient: "from-green-500 to-green-600",
        title: "Headless + Full Desktop Modes",
        description:
            "Agents work programmatically via MCP connectors for tools with APIs. For everything else, they operate in full desktop mode — seeing and using the screen like a human employee.",
        image: "https://images.unsplash.com/photo-1516116216624-53e697fedbea?auto=format&fit=crop&w=800&q=80",
    },
    {
        icon: Activity,
        gradient: "from-violet-500 to-violet-600",
        title: "Full Evidence & Audit Trail",
        description:
            "The evidence plane logs every agent action, approval decision, and outcome across all roles. Export audit evidence for compliance and review action history end-to-end.",
        image: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=800&q=80",
    },
    {
        icon: GitBranch,
        gradient: "from-slate-600 to-slate-700",
        title: "100+ Tool Connectors via MCP",
        description:
            "GitHub, Jira, Slack, HubSpot, Salesforce, Gmail, Google Calendar, and more — all via MCP connectors. Bring your own MCP server for internal systems. Agents share tools across roles.",
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
    "First AI worker live in your team within 15 minutes of signup",
    "Every action risk-classified — risky decisions require human approval before execution",
    "Role-scoped tool access — agents only touch what their role allows",
    "Full audit trail for every agent action, approval decision, and outcome",
];

const executionFlow = [
    {
        step: "01",
        title: "Browse roles + hire an AI worker",
        detail: "Dedicated Azure VM provisioned in minutes. Configure persona and approval rules from the setup wizard.",
    },
    {
        step: "02",
        title: "Connect tools for this role",
        detail: "OAuth connections with least-privilege scopes. Agent uses only the tools its role allows — nothing more.",
    },
    {
        step: "03",
        title: "Ship with approval-driven assurance",
        detail: "LOW-risk tasks auto-execute. MEDIUM and HIGH-risk actions pause for human approval before proceeding.",
    },
];

export default function ProductPage() {
    return (
        <div>
            {/* Hero with product screenshot */}
            <section className="relative overflow-hidden">
                <img
                    src="https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=1800&q=80"
                    alt="AgentFarm product dashboard showing AI teammates in action"
                    className="w-full h-[440px] sm:h-[540px] object-cover"
                    loading="eager"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-[#07080a]/90 via-[#07080a]/60 to-transparent" />
                <div className="absolute inset-0 flex items-center">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
                        <div className="max-w-2xl">
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-violet-300 bg-white/10 backdrop-blur border border-white/20 px-3 py-1.5 rounded-full mb-5">
                                <Sparkles className="w-3.5 h-3.5" />
                                Product
                            </span>
                            <h1 className="mt-3 text-4xl sm:text-6xl font-extrabold text-white leading-tight tracking-tight">
                                One platform for{" "}
                                <span className="bg-gradient-to-r from-violet-300 to-blue-300 bg-clip-text text-transparent">
                                    every AI worker role
                                </span>
                            </h1>
                            <p className="mt-5 text-xl text-slate-300 leading-relaxed">
                                AgentFarm gives every department a dedicated AI worker — 12 roles, real tool access,
                                approval gates on every high-stakes decision, and a full audit trail.
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
            <section className="bg-[var(--surface)] border-b border-[var(--hairline)] py-10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
                        {outcomes.map((o) => (
                            <div key={o} className="flex items-start gap-3">
                                <CheckCircle2 className="w-5 h-5 text-[var(--accent-green)] shrink-0 mt-0.5" />
                                <p className="text-sm text-[var(--body-color)] leading-snug">{o}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <section className="py-14 sm:py-16">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="rounded-3xl bg-[var(--surface-card)] border border-[var(--hairline)] px-5 py-6 sm:px-8 sm:py-8">
                        <p className="chip chip-accent">Execution Path</p>
                        <h2 className="mt-4 text-2xl sm:text-3xl font-semibold tracking-[-0.03em] text-[var(--ink)]">From role selection to trusted delivery in three steps</h2>
                        <div className="mt-6 grid gap-4 md:grid-cols-3">
                            {executionFlow.map((item) => (
                                <article key={item.step} className="rounded-2xl border border-[var(--hairline)] bg-[var(--surface-el)] p-4">
                                    <p className="text-xs font-semibold tracking-[0.14em] text-[var(--ash)]">STEP {item.step}</p>
                                    <h3 className="mt-2 text-base font-semibold text-[var(--ink)]">{item.title}</h3>
                                    <p className="mt-2 text-sm text-[var(--body-color)]">{item.detail}</p>
                                </article>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            <ProductSceneSection />

            {/* Demo video section */}
            <section className="py-20 bg-[var(--surface)]">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                    <p className="chip chip-accent mb-4">See it in action</p>
                    <h2 className="text-2xl sm:text-3xl font-semibold tracking-[-0.03em] text-[var(--ink)] mb-4">Watch an AI worker ship a feature</h2>
                    <p className="text-[var(--mute)] text-base mb-8 max-w-xl mx-auto">In 4 minutes, an AgentFarm worker takes a Jira ticket, writes the code, opens a PR, and passes CI. No prompting, no babysitting.</p>
                    <ProductDemoVideo />
                </div>
            </section>

            {/* Features grid with images */}
            <section className="py-24">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="max-w-2xl mx-auto text-center mb-16">
                        <h2 className="text-3xl sm:text-4xl font-semibold tracking-[-0.03em] text-[var(--ink)]">
                            Built for real engineering workflows
                        </h2>
                        <p className="mt-4 text-lg text-[var(--mute)]">
                            Every feature is designed around how teams across every department actually work — not how AI demos pretend they work.
                        </p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {features.map(({ icon: Icon, gradient, title, description, image }) => (
                            <div
                                key={title}
                                className="bg-[var(--surface-card)] rounded-2xl border border-[var(--hairline)] overflow-hidden hover:border-[var(--accent-blue)]/40 hover:-translate-y-1 transition-all group"
                            >
                                <div className="relative h-36 overflow-hidden">
                                    <img
                                        src={image}
                                        alt={title}
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                        loading="lazy"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-[#07080a]/70 to-transparent" />
                                    <div className="absolute bottom-3 left-3">
                                        <div className={`h-9 w-9 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center`}>
                                            <Icon className="w-5 h-5 text-white" />
                                        </div>
                                    </div>
                                </div>
                                <div className="p-5">
                                    <h3 className="font-semibold text-[var(--ink)] mb-2 text-sm">{title}</h3>
                                    <p className="text-xs text-[var(--mute)] leading-relaxed">{description}</p>
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
                        <div className="absolute inset-0 bg-gradient-to-br from-[#07080a]/90 via-[#07080a]/90 to-[#07080a]/90" />
                        <div className="relative py-16 px-10 text-center text-white">
                            <h2 className="text-3xl font-bold mb-4">
                                Ready to hire your first AI worker?
                            </h2>
                            <p className="text-[var(--mute)] mb-8 max-w-md mx-auto">Start with any role. 14-day free trial, no credit card, no commitments.</p>
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



