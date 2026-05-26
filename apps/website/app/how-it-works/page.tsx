import type { Metadata } from "next";
import {
    BarChart3,
    CheckCircle2,
    Link as LinkIcon,
    MessageSquare,
    ShoppingCart,
    Sparkles,
    Users,
} from "lucide-react";
import ButtonLink from "@/components/shared/ButtonLink";
import { howItWorksPageContent } from "@/lib/marketing-content";

export const metadata: Metadata = howItWorksPageContent.metadata;

const stepIcons = {
    "shopping-cart": ShoppingCart,
    users: Users,
    link: LinkIcon,
    "message-square": MessageSquare,
    "check-circle-2": CheckCircle2,
    "bar-chart-3": BarChart3,
} as const;

export default function HowItWorksPage() {
    const { hero, timeline, steps, cta } = howItWorksPageContent;

    return (
        <div>
            <section className="relative overflow-hidden">
                <img
                    src={hero.image}
                    alt={hero.imageAlt}
                    className="w-full h-[420px] sm:h-[500px] object-cover"
                    loading="eager"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-[#07080a]/85 via-[#07080a]/70 to-transparent" />
                <div className="absolute inset-0 flex items-center">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
                        <div className="max-w-2xl">
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-300 bg-white/10 backdrop-blur border border-white/20 px-3 py-1.5 rounded-full mb-5">
                                <Sparkles className="w-3.5 h-3.5" />
                                {hero.eyebrow}
                            </span>
                            <h1 className="mt-3 text-4xl sm:text-6xl font-extrabold text-white tracking-tight leading-tight">
                                {hero.titleLead}{" "}
                                <span className="bg-gradient-to-r from-emerald-300 to-blue-300 bg-clip-text text-transparent">
                                    {hero.titleAccent}
                                </span>
                            </h1>
                            <p className="mt-5 text-xl text-slate-300 leading-relaxed">{hero.description}</p>
                        </div>
                    </div>
                </div>
            </section>

            <div className="bg-[var(--canvas)] border-b border-[var(--hairline)]">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-wrap justify-center gap-8 text-center">
                    {timeline.map((item) => (
                        <div key={item.label} className="flex items-center gap-3">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                            <span className="text-[var(--mute)] text-sm">{item.label}</span>
                            <span className="text-[var(--ink)] font-semibold text-sm">{item.time}</span>
                        </div>
                    ))}
                </div>
            </div>

            <section className="py-24">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="space-y-16">
                        {steps.map((step, index) => {
                            const StepIcon = stepIcons[step.icon];
                            const isEven = index % 2 === 1;

                            return (
                                <div key={step.number} className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
                                    <div className={isEven ? "lg:order-2" : ""}>
                                        <div className="flex items-center gap-3 mb-4">
                                            <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${step.gradient} flex items-center justify-center shadow-lg`}>
                                                <StepIcon className="w-5 h-5 text-white" />
                                            </div>
                                            <span className="text-xs font-bold text-[var(--ash)] font-mono uppercase tracking-widest">
                                                Step {step.number}
                                            </span>
                                        </div>
                                        <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)] mb-4">{step.title}</h2>
                                        <p className="text-[var(--mute)] leading-relaxed mb-5">{step.description}</p>
                                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--accent-green)] bg-[var(--accent-green)]/10 border border-[var(--accent-green)]/20 px-3 py-1.5 rounded-full">
                                            {step.detail}
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
                        <div className="absolute inset-0 bg-[var(--canvas)] border border-[var(--hairline)]" />
                        <div className="relative py-14 px-10 text-center">
                            <h3 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)] mb-3">{cta.title}</h3>
                            <p className="text-[var(--mute)] mb-6">{cta.description}</p>
                            <ButtonLink href={cta.primary.href} size="lg">
                                {cta.primary.label}
                            </ButtonLink>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
