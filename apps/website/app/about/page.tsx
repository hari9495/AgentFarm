import type { Metadata } from "next";
import { Bot, Target, Zap, Users, Sparkles, TrendingUp, Award } from "lucide-react";
import ButtonLink from "@/components/shared/ButtonLink";


export const metadata: Metadata = {
    title: "About — AgentFarm",
    description:
        "AgentFarm is an AI staffing platform. Every department gets a dedicated AI worker — with real tool access, role-scoped skills, and human oversight on every decision that matters.",
};

const team = [
    {
        name: "Alex Rivera",
        role: "CEO & Co-founder",
        bio: "Previously lead engineer at Stripe and early Vercel. 10+ years building developer tools and platform infrastructure.",
        photo: "https://images.unsplash.com/photo-1519345182560-3f2917c472ef?auto=format&fit=crop&w=300&q=80",
    },
    {
        name: "Priya Nair",
        role: "CTO & Co-founder",
        bio: "PhD in distributed systems. Built ML infrastructure at Anthropic. Designed AgentFarm's risk-classification and evidence plane architecture.",
        photo: "https://images.unsplash.com/photo-1573496799515-eebbb63814f2?auto=format&fit=crop&w=300&q=80",
    },
    {
        name: "Jordan Kim",
        role: "Head of Product",
        bio: "Former PM at GitHub Actions. Shaped the Skill Marketplace and approval workflow to be zero-friction for engineering teams.",
        photo: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=300&q=80",
    },
    {
        name: "Sam Okafor",
        role: "Head of Engineering",
        bio: "Led platform engineering at Linear. Built the tenant-isolated Azure runtime and connector auth layer for AgentFarm.",
        photo: "https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=300&q=80",
    },
];

const values = [
    {
        icon: Target,
        title: "People-first thinking",
        description:
            "Every decision starts with: does this free real people to do real meaningful work? AI should handle the repetitive layer, not replace human judgment.",
    },
    {
        icon: Zap,
        title: "Approval-driven execution",
        description:
            "Speed without safety is just chaos. Every agent action is risk-classified — LOW runs automatically, MEDIUM and HIGH require human sign-off before anything ships.",
    },
    {
        icon: Users,
        title: "Radical transparency",
        description:
            "Open roadmap, public changelog, and an immutable evidence trail for every action every agent takes. Nothing hidden, ever.",
    },
];

export default function AboutPage() {
    return (
        <div>
            {/* Hero with real team photo */}
            <section className="relative overflow-hidden">
                <img
                    src="https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1800&q=80"
                    alt="AgentFarm team collaborating"
                    className="w-full h-[420px] sm:h-[520px] object-cover"
                    loading="eager"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#07080a]/85 via-[#07080a]/40 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-14">
                    <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur border border-white/20 text-white text-xs font-semibold px-4 py-1.5 rounded-full mb-5">
                        <Bot className="w-3.5 h-3.5" />
                        Our story
                    </div>
                    <h1 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight leading-tight">
                        We believe every company
                        <br className="hidden sm:block" />
                        deserves workers that{" "}
                        <span className="bg-gradient-to-r from-sky-300 via-blue-300 to-violet-300 bg-clip-text text-transparent">
                            actually get things done
                        </span>
                    </h1>
                    <p className="mt-4 text-lg text-slate-300 max-w-2xl leading-relaxed">
                        AgentFarm started from a simple frustration: the best people spend
                        most of their time on work a well-governed AI agent could handle today.
                        We set out to build the AI staffing platform — 12 roles, every department,
                        with approval gates, audit trails, and tenant-isolated execution from day one.
                    </p>
                </div>
            </section>

            {/* Stats bar */}
            <div className="bg-[var(--canvas)] border-b border-[var(--hairline)]">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
                    {[
                        { value: "2025", label: "Founded" },
                        { value: "12", label: "AI worker roles" },
                        { value: "16", label: "Departments covered" },
                        { value: "Azure", label: "Infrastructure" },
                    ].map(({ value, label }) => (
                        <div key={label}>
                            <p className="text-xl font-bold text-[var(--ink)]">{value}</p>
                            <p className="text-xs text-[var(--ash)] mt-0.5">{label}</p>
                        </div>
                    ))}
                </div>
            </div>

            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
                {/* Mission with image */}
                <div className="mb-20 grid lg:grid-cols-2 gap-10 items-center">
                    <div className="relative bg-gradient-to-br from-blue-600 to-violet-600 rounded-3xl p-10 text-white overflow-hidden">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl pointer-events-none" />
                        <Sparkles className="w-8 h-8 mb-4 text-white/80" />
                        <h2 className="text-2xl font-bold mb-4">Our mission</h2>
                        <p className="text-lg text-blue-100 leading-relaxed">
                            To make AI-powered execution the default for every company — not just
                            engineering teams — by giving every department an AI worker that ships
                            real work with real accountability.
                        </p>
                        <div className="mt-6 grid grid-cols-2 gap-4">
                            <div className="bg-white/15 rounded-xl p-3 text-center">
                                <TrendingUp className="w-5 h-5 mx-auto mb-1" />
                                <p className="text-sm font-bold">10× velocity</p>
                                <p className="text-xs text-blue-200">target baseline</p>
                            </div>
                            <div className="bg-white/15 rounded-xl p-3 text-center">
                                <Award className="w-5 h-5 mx-auto mb-1" />
                                <p className="text-sm font-bold">Quality-first</p>
                                <p className="text-xs text-blue-200">not just speed</p>
                            </div>
                        </div>
                    </div>
                    <div className="relative rounded-3xl overflow-hidden shadow-xl">
                        <img
                            src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=900&q=80"
                            alt="Engineering team working together at computers"
                            className="w-full h-72 object-cover"
                            loading="lazy"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#07080a]/60 to-transparent" />
                        <div className="absolute bottom-4 left-4 right-4 text-white">
                            <p className="text-sm font-semibold">Built for every department</p>
                            <p className="text-xs text-[var(--mute)]">12 roles, one platform, zero trust gaps</p>
                        </div>
                    </div>
                </div>

                {/* Values */}
                <div className="mb-20">
                    <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)] mb-8">
                        What we believe
                    </h2>
                    <div className="grid sm:grid-cols-3 gap-6">
                        {values.map(({ icon: Icon, title, description }, i) => {
                            const gradients = [
                                "from-blue-500 to-blue-600",
                                "from-violet-500 to-violet-600",
                                "from-emerald-500 to-emerald-600",
                            ];
                            return (
                                <div
                                    key={title}
                                    className="p-6 rounded-2xl border border-[var(--hairline)] bg-[var(--surface-card)] hover:-translate-y-1 hover:border-[var(--accent-blue)]/30 transition-all"
                                >
                                    <div className="mb-4">
                                        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradients[i % gradients.length]} flex items-center justify-center`}>
                                            <Icon className="w-5 h-5 text-white" />
                                        </div>
                                    </div>
                                    <h3 className="font-semibold text-[var(--ink)] mb-2">{title}</h3>
                                    <p className="text-sm text-[var(--mute)] leading-relaxed">
                                        {description}
                                    </p>
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* Team */}
                <div className="mb-20">
                    <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)] mb-3">The team</h2>
                    <p className="text-[var(--mute)] mb-8">Four people who&apos;ve built products used by millions of developers.</p>
                    <div className="grid sm:grid-cols-2 gap-6">
                        {team.map(({ name, role, bio, photo }) => (
                            <div
                                key={name}
                                className="rounded-2xl border border-[var(--hairline)] bg-[var(--surface-card)] hover:-translate-y-1 transition-all overflow-hidden"
                            >
                                <img
                                    src={photo}
                                    alt={name}
                                    className="w-full h-48 object-cover object-top"
                                    loading="lazy"
                                />
                                <div className="p-5">
                                    <p className="font-semibold text-[var(--ink)]">{name}</p>
                                    <p className="text-sm text-[var(--accent-blue)] mb-2 font-medium">{role}</p>
                                    <p className="text-sm text-[var(--mute)] leading-relaxed">{bio}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Backers */}
                <div className="mb-20 text-center">
                    <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ash)] mb-6">
                        Backed by
                    </p>
                    <div className="flex flex-wrap justify-center gap-8 text-slate-400 font-semibold text-sm">
                        {["Y Combinator", "Sequoia", "a16z", "Founders Fund"].map((backer) => (
                            <span key={backer} className="px-4 py-2 bg-[var(--surface-el)] rounded-xl border border-[var(--hairline)] text-[var(--body-color)]">
                                {backer}
                            </span>
                        ))}
                    </div>
                </div>

                {/* CTA */}
                <div className="relative text-center bg-[var(--surface-card)] border border-[var(--hairline)] rounded-3xl p-10 overflow-hidden">
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(59,130,246,0.2)_0%,_transparent_70%)] pointer-events-none" />
                    <div className="relative">
                        <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)] mb-3">Join us on the mission</h2>
                        <p className="text-[var(--mute)] mb-6">
                            We&apos;re hiring engineers, designers, and builders who want to
                            reshape how software gets made.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-3 justify-center">
                            <ButtonLink href="/#waitlist">Get Early Access</ButtonLink>
                            <ButtonLink href="/contact" variant="outline">
                                Get In Touch
                            </ButtonLink>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}



