import type { Metadata } from "next";
import { Bot, Sparkles, Target, Users, Zap } from "lucide-react";
import ButtonLink from "@/components/shared/ButtonLink";
import { aboutPageContent } from "@/lib/marketing-content";

export const metadata: Metadata = aboutPageContent.metadata;

const valueIcons = {
    target: Target,
    zap: Zap,
    users: Users,
} as const;

const gradients = [
    "from-blue-500 to-blue-600",
    "from-violet-500 to-violet-600",
    "from-emerald-500 to-emerald-600",
] as const;

export default function AboutPage() {
    const { hero, stats, mission, values, team, backers, cta } = aboutPageContent;

    return (
        <div>
            <section className="relative overflow-hidden">
                <img
                    src={hero.image}
                    alt={hero.imageAlt}
                    className="w-full h-[420px] sm:h-[520px] object-cover"
                    loading="eager"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#07080a]/85 via-[#07080a]/40 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-14">
                    <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur border border-white/20 text-white text-xs font-semibold px-4 py-1.5 rounded-full mb-5">
                        <Bot className="w-3.5 h-3.5" />
                        {hero.eyebrow}
                    </div>
                    <h1 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight leading-tight">
                        {hero.titleLead}
                        <br className="hidden sm:block" />
                        <span className="bg-gradient-to-r from-sky-300 via-blue-300 to-violet-300 bg-clip-text text-transparent">
                            {hero.titleAccent}
                        </span>
                    </h1>
                    <p className="mt-4 text-lg text-slate-300 max-w-2xl leading-relaxed">{hero.description}</p>
                </div>
            </section>

            <div className="bg-[var(--canvas)] border-b border-[var(--hairline)]">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
                    {stats.map((stat) => (
                        <div key={stat.label}>
                            <p className="text-xl font-bold text-[var(--ink)]">{stat.value}</p>
                            <p className="text-xs text-[var(--ash)] mt-0.5">{stat.label}</p>
                        </div>
                    ))}
                </div>
            </div>

            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
                <div className="mb-20 grid lg:grid-cols-2 gap-10 items-center">
                    <div className="relative bg-gradient-to-br from-blue-600 to-violet-600 rounded-3xl p-10 text-white overflow-hidden">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl pointer-events-none" />
                        <Sparkles className="w-8 h-8 mb-4 text-white/80" />
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-100/80 mb-3">{mission.eyebrow}</p>
                        <h2 className="text-2xl font-bold mb-4">{mission.title}</h2>
                        <p className="text-lg text-blue-100 leading-relaxed">{mission.description}</p>
                        <div className="mt-6 grid grid-cols-2 gap-4">
                            {mission.callouts.map((callout) => (
                                <div key={callout.label} className="bg-white/15 rounded-xl p-3 text-center">
                                    <p className="text-sm font-bold">{callout.value}</p>
                                    <p className="text-xs text-blue-200">{callout.label}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="relative rounded-3xl overflow-hidden shadow-xl">
                        <img
                            src={mission.image}
                            alt={mission.imageAlt}
                            className="w-full h-72 object-cover"
                            loading="lazy"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#07080a]/60 to-transparent" />
                        <div className="absolute bottom-4 left-4 right-4 text-white">
                            <p className="text-sm font-semibold">{mission.imageCaptionTitle}</p>
                            <p className="text-xs text-slate-300">{mission.imageCaptionBody}</p>
                        </div>
                    </div>
                </div>

                <div className="mb-20">
                    <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)] mb-3">What we believe</h2>
                    <p className="text-[var(--mute)] mb-8 max-w-2xl">{aboutPageContent.teamIntro}</p>
                    <div className="grid sm:grid-cols-3 gap-6">
                        {values.map((value, index) => {
                            const Icon = valueIcons[value.icon];
                            return (
                                <div
                                    key={value.title}
                                    className="p-6 rounded-2xl border border-[var(--hairline)] bg-[var(--surface-card)] hover:-translate-y-1 hover:border-[var(--accent-blue)]/30 transition-all"
                                >
                                    <div className="mb-4">
                                        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradients[index % gradients.length]} flex items-center justify-center`}>
                                            <Icon className="w-5 h-5 text-white" />
                                        </div>
                                    </div>
                                    <h3 className="font-semibold text-[var(--ink)] mb-2">{value.title}</h3>
                                    <p className="text-sm text-[var(--mute)] leading-relaxed">{value.description}</p>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="mb-20">
                    <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)] mb-3">The team</h2>
                    <p className="text-[var(--mute)] mb-8">{aboutPageContent.teamIntro}</p>
                    <div className="grid sm:grid-cols-2 gap-6">
                        {team.map((member) => (
                            <div
                                key={member.name}
                                className="rounded-2xl border border-[var(--hairline)] bg-[var(--surface-card)] hover:-translate-y-1 transition-all overflow-hidden"
                            >
                                <img
                                    src={member.photo}
                                    alt={member.name}
                                    className="w-full h-48 object-cover object-top"
                                    loading="lazy"
                                />
                                <div className="p-5">
                                    <p className="font-semibold text-[var(--ink)]">{member.name}</p>
                                    <p className="text-sm text-[var(--accent-blue)] mb-2 font-medium">{member.role}</p>
                                    <p className="text-sm text-[var(--mute)] leading-relaxed">{member.bio}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="mb-20 text-center">
                    <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ash)] mb-6">Backed by builders who care about durable systems</p>
                    <div className="flex flex-wrap justify-center gap-8 text-slate-400 font-semibold text-sm">
                        {backers.map((backer) => (
                            <span
                                key={backer}
                                className="px-4 py-2 bg-[var(--surface-el)] rounded-xl border border-[var(--hairline)] text-[var(--body-color)]"
                            >
                                {backer}
                            </span>
                        ))}
                    </div>
                </div>

                <div className="relative text-center bg-[var(--surface-card)] border border-[var(--hairline)] rounded-3xl p-10 overflow-hidden">
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(59,130,246,0.2)_0%,_transparent_70%)] pointer-events-none" />
                    <div className="relative">
                        <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)] mb-3">{cta.title}</h2>
                        <p className="text-[var(--mute)] mb-6">{cta.description}</p>
                        <div className="flex flex-col sm:flex-row gap-3 justify-center">
                            <ButtonLink href={cta.primary.href}>{cta.primary.label}</ButtonLink>
                            <ButtonLink href={cta.secondary.href} variant="outline">
                                {cta.secondary.label}
                            </ButtonLink>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
