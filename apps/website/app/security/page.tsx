import type { Metadata } from "next";
import Link from "next/link";
import {
    ArrowRight,
    Bot,
    CheckCircle2,
    Eye,
    FileLock2,
    Globe,
    KeyRound,
    Lock,
    RefreshCw,
    Server,
    Shield,
    ShieldCheck,
    Zap,
} from "lucide-react";
import { securityPageContent } from "@/lib/marketing-content";

export const metadata: Metadata = securityPageContent.metadata;

const iconMap = {
    shield: Shield,
    "shield-check": ShieldCheck,
    globe: Globe,
    "file-lock-2": FileLock2,
    lock: Lock,
    server: Server,
    eye: Eye,
    "key-round": KeyRound,
    zap: Zap,
    "refresh-cw": RefreshCw,
} as const;

export default function SecurityPage() {
    const { hero, certifications, features, faqs, checklist, cta } = securityPageContent;

    return (
        <div className="min-h-screen">
            <div className="bg-[var(--canvas)] text-[var(--ink)]">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-24 text-center">
                    <div className="chip chip-accent mb-6">
                        <Shield className="w-3.5 h-3.5" /> {hero.eyebrow}
                    </div>
                    <h1 className="text-4xl sm:text-5xl font-semibold tracking-[-0.03em] text-[var(--ink)] mb-6 leading-tight">
                        {hero.titleLead}
                        <br className="hidden sm:block" />
                        <span className="bg-gradient-to-r from-[var(--accent-blue)] to-[var(--accent-green)] bg-clip-text text-transparent">
                            {" "}{hero.titleAccent}
                        </span>
                    </h1>
                    <p className="text-lg text-[var(--mute)] max-w-2xl mx-auto mb-10">{hero.description}</p>
                    <div className="flex flex-wrap justify-center gap-4">
                        <Link
                            href={hero.primary.href}
                            className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-[var(--accent-blue)] text-[#07080a] font-semibold text-sm hover:bg-[#8dd7ff] transition-all"
                        >
                            {hero.primary.label} <ArrowRight className="w-4 h-4" />
                        </Link>
                        <a
                            href={hero.secondary.href}
                            className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl border border-[var(--hairline)] text-[var(--body-color)] font-semibold text-sm hover:bg-[var(--surface-el)] transition-all"
                        >
                            {hero.secondary.label}
                        </a>
                    </div>
                </div>
            </div>

            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
                <p className="text-center text-xs font-bold uppercase tracking-widest text-[var(--ash)] mb-10">
                    {securityPageContent.certificationsTitle}
                </p>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
                    {certifications.map((cert) => {
                        const Icon = iconMap[cert.icon];
                        return (
                            <div
                                key={cert.name}
                                className="bg-[var(--surface-card)] rounded-2xl border border-[var(--hairline)] p-6 text-center hover:shadow-md transition-shadow"
                            >
                                <div className={`h-12 w-12 rounded-2xl ${cert.iconBg} flex items-center justify-center mx-auto mb-4`}>
                                    <Icon className={`w-6 h-6 ${cert.iconColor}`} />
                                </div>
                                <p className="text-sm font-semibold text-[var(--ink)] mb-2">{cert.name}</p>
                                <p className="text-xs text-[var(--mute)] leading-relaxed">{cert.description}</p>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="bg-[var(--surface)] border-y border-[var(--hairline)] py-16">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                    <p className="text-center text-xs font-bold uppercase tracking-widest text-[var(--ash)] mb-3">
                        {securityPageContent.architectureTitle}
                    </p>
                    <h2 className="text-3xl font-semibold tracking-[-0.03em] text-[var(--ink)] text-center mb-12">
                        {securityPageContent.architectureSubtitle}
                    </h2>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {features.map((feature) => {
                            const Icon = iconMap[feature.icon];
                            return (
                                <div key={feature.title} className="bg-[var(--surface-card)] rounded-2xl border border-[var(--hairline)] p-6">
                                    <div className={`h-10 w-10 rounded-xl ${feature.iconBg} flex items-center justify-center mb-4`}>
                                        <Icon className={`w-5 h-5 ${feature.iconColor}`} />
                                    </div>
                                    <h3 className="text-sm font-semibold text-[var(--ink)] mb-3">{feature.title}</h3>
                                    <ul className="space-y-2">
                                        {feature.items.map((item) => (
                                            <li key={item} className="flex items-start gap-2 text-xs text-[var(--body-color)]">
                                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                                                {item}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
                <p className="text-center text-xs font-bold uppercase tracking-widest text-[var(--ash)] mb-3">FAQ</p>
                <h2 className="text-3xl font-semibold tracking-[-0.03em] text-[var(--ink)] text-center mb-10">Security questions</h2>
                <div className="space-y-4">
                    {faqs.map((faq) => (
                        <div key={faq.question} className="bg-[var(--surface-card)] rounded-2xl border border-[var(--hairline)] p-6">
                            <p className="text-sm font-semibold text-[var(--ink)] mb-2">{faq.question}</p>
                            <p className="text-sm text-[var(--body-color)] leading-relaxed">{faq.answer}</p>
                        </div>
                    ))}
                </div>
            </div>

            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <div className="rounded-2xl border border-[var(--hairline)] bg-[var(--surface-card)] overflow-hidden">
                    <div className="grid md:grid-cols-2">
                        <div className="p-8">
                            <span className="chip chip-accent mb-4">{checklist.eyebrow}</span>
                            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)] mb-3">{checklist.title}</h2>
                            <p className="text-sm text-[var(--mute)] leading-relaxed mb-6">{checklist.description}</p>
                            <a
                                href={checklist.buttonHref}
                                className="inline-flex items-center gap-2 rounded-xl bg-[var(--ink)] text-[var(--canvas)] px-5 py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity"
                            >
                                <CheckCircle2 className="w-4 h-4" /> {checklist.buttonLabel}
                            </a>
                        </div>
                        <div className="bg-[var(--surface-el)] p-8 border-t md:border-t-0 md:border-l border-[var(--hairline)]">
                            <p className="text-xs font-bold uppercase tracking-wider text-[var(--ash)] mb-5">Checklist covers</p>
                            <ul className="space-y-3">
                                {checklist.items.map((item) => (
                                    <li key={item} className="flex items-start gap-2 text-xs text-[var(--body-color)]">
                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                                        {item}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-[var(--surface)] border-t border-[var(--hairline)] py-20 text-center">
                <Bot className="w-10 h-10 mx-auto mb-4 text-[var(--accent-blue)]" />
                <h2 className="text-3xl font-semibold tracking-[-0.03em] text-[var(--ink)] mb-4">{cta.title}</h2>
                <p className="text-[var(--mute)] mb-8 max-w-xl mx-auto text-sm">{cta.description}</p>
                <div className="flex flex-wrap justify-center gap-4">
                    <a
                        href={cta.primary.href}
                        className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-[var(--accent-blue)] text-[#07080a] font-semibold text-sm hover:bg-[#8dd7ff] transition-all"
                    >
                        {cta.primary.label} <ArrowRight className="w-4 h-4" />
                    </a>
                    <Link
                        href={cta.secondary.href}
                        className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl border border-[var(--hairline)] text-[var(--body-color)] font-semibold text-sm hover:bg-[var(--surface-el)] transition-all"
                    >
                        {cta.secondary.label}
                    </Link>
                </div>
            </div>
        </div>
    );
}
