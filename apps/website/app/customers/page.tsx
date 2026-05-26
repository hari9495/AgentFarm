import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Bot, Building2, Quote, Star, TrendingUp } from "lucide-react";
import { customersPageContent } from "@/lib/marketing-content";

export const metadata: Metadata = customersPageContent.metadata;

export default function CustomersPage() {
    const { hero, stats, logos, caseStudies, testimonials, cta } = customersPageContent;

    return (
        <div className="min-h-screen">
            <div className="bg-[var(--canvas)] border-b border-[var(--hairline)]">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
                    <div className="chip chip-accent mb-6">
                        <Building2 className="w-3.5 h-3.5" /> {hero.eyebrow}
                    </div>
                    <h1 className="text-4xl sm:text-5xl font-semibold tracking-[-0.03em] text-[var(--ink)] mb-6 leading-tight">
                        {hero.titleLead}
                        <br className="hidden sm:block" />
                        <span className="bg-gradient-to-r from-[var(--accent-blue)] to-[var(--accent-green)] bg-clip-text text-transparent">
                            {" "}{hero.titleAccent}
                        </span>
                    </h1>
                    <p className="text-lg text-[var(--mute)] max-w-2xl mx-auto mb-10">{hero.description}</p>
                    <Link
                        href={hero.primary.href}
                        className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-[var(--accent-blue)] text-[#07080a] font-semibold text-sm hover:bg-[#8dd7ff] transition-all"
                    >
                        {hero.primary.label} <ArrowRight className="w-4 h-4" />
                    </Link>
                </div>
            </div>

            <div className="bg-[var(--canvas)] border-b border-[var(--hairline)]">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-2 sm:grid-cols-4 gap-8">
                    {stats.map((stat) => (
                        <div key={stat.label} className="text-center">
                            <p className="text-2xl font-bold text-[var(--ink)] mb-1">{stat.value}</p>
                            <p className="text-xs text-[var(--ash)]">{stat.label}</p>
                        </div>
                    ))}
                </div>
            </div>

            <div className="py-14 border-b border-[var(--hairline)]">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                    <p className="chip chip-accent mx-auto w-fit mb-8">{customersPageContent.logosTitle}</p>
                    <div className="flex flex-wrap justify-center gap-4">
                        {logos.map((logo) => (
                            <div
                                key={logo.name}
                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--hairline)] bg-[var(--surface-card)]"
                            >
                                <div className="h-6 w-6 rounded-md bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center text-[9px] font-bold text-white">
                                    {logo.initials}
                                </div>
                                <span className="text-sm font-semibold text-[var(--body-color)]">{logo.name}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-12">
                <div className="text-center mb-4">
                    <div className="chip chip-accent mb-4">
                        <TrendingUp className="w-3.5 h-3.5" /> Case studies
                    </div>
                    <h2 className="text-3xl font-semibold tracking-[-0.03em] text-[var(--ink)] mb-4">
                        {customersPageContent.caseStudiesTitle}
                    </h2>
                </div>

                {caseStudies.map((study) => (
                    <div key={study.company} className="bg-[var(--surface-card)] rounded-3xl border border-[var(--hairline)] overflow-hidden">
                        <div className="p-8 md:p-10">
                            <div className="flex items-center gap-3 mb-6">
                                <div className={`h-12 w-12 rounded-2xl ${study.accentBg} flex items-center justify-center text-sm font-bold ${study.accentColor}`}>
                                    {study.initials}
                                </div>
                                <div>
                                    <p className="text-lg font-semibold text-[var(--ink)]">{study.company}</p>
                                    <p className="text-xs text-[var(--ash)]">{study.tagline}</p>
                                </div>
                            </div>

                            <div className="grid md:grid-cols-2 gap-8 mb-8">
                                <div>
                                    <p className="text-xs font-bold uppercase tracking-wide text-[var(--ash)] mb-2">Challenge</p>
                                    <p className="text-sm text-[var(--mute)] leading-relaxed">{study.challenge}</p>
                                </div>
                                <div>
                                    <p className="text-xs font-bold uppercase tracking-wide text-[var(--ash)] mb-2">Outcome</p>
                                    <p className="text-sm text-[var(--mute)] leading-relaxed">{study.outcome}</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                                {study.metrics.map((metric) => (
                                    <div key={metric.label} className="text-center p-4 rounded-xl bg-[var(--surface-el)]">
                                        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ash)] mb-2">{metric.label}</p>
                                        <div className="flex items-center justify-center gap-2">
                                            <span className="text-xs text-[var(--ash)] line-through">{metric.before}</span>
                                            {metric.before !== "-" && <ArrowRight className="w-3 h-3 text-[var(--ash)]" />}
                                            <span className="text-sm font-bold text-[var(--accent-green)]">{metric.after}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="flex items-start gap-3 p-4 rounded-2xl bg-[var(--surface-el)]">
                                <Quote className="w-5 h-5 text-[var(--hairline)] shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-sm text-[var(--body-color)] italic leading-relaxed mb-2">"{study.quote}"</p>
                                    <p className="text-xs font-semibold text-[var(--ash)]">{study.quoteAuthor}</p>
                                </div>
                            </div>

                            <div className="mt-4">
                                <a
                                    href={`/downloads/${study.company.toLowerCase().replace(/\s+/g, "-")}-case-study.pdf`}
                                    download
                                    className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--body-color)] border border-[var(--hairline)] rounded-lg px-3 py-2 hover:bg-[var(--surface-el)] transition-colors"
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M8 12l4 4m0 0l4-4m-4 4V4" />
                                    </svg>
                                    Download {study.pdfLabel} (PDF)
                                </a>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="bg-[var(--surface)] border-y border-[var(--hairline)] py-16">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                    <p className="chip chip-accent mx-auto w-fit mb-10">{customersPageContent.testimonialsTitle}</p>
                    <div className="grid md:grid-cols-3 gap-6">
                        {testimonials.map((testimonial) => (
                            <div key={testimonial.author} className="bg-[var(--surface-card)] rounded-2xl border border-[var(--hairline)] p-6">
                                <div className="flex gap-0.5 mb-4">
                                    {[0, 1, 2, 3, 4].map((star) => (
                                        <Star key={star} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                                    ))}
                                </div>
                                <p className="text-sm text-[var(--body-color)] leading-relaxed mb-4 italic">"{testimonial.text}"</p>
                                <div className="flex items-center gap-2">
                                    <div className="h-7 w-7 rounded-full bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center text-[9px] font-bold text-white">
                                        {testimonial.initials}
                                    </div>
                                    <div>
                                        <p className="text-xs font-semibold text-[var(--ink)]">{testimonial.author}</p>
                                        <p className="text-[10px] text-[var(--ash)]">{testimonial.company}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
                <Bot className="w-10 h-10 mx-auto mb-4 text-[var(--accent-blue)]" />
                <h2 className="text-3xl font-semibold tracking-[-0.03em] text-[var(--ink)] mb-4">{cta.title}</h2>
                <p className="text-[var(--mute)] mb-8 max-w-xl mx-auto">{cta.description}</p>
                <div className="flex flex-wrap justify-center gap-4">
                    <Link
                        href={cta.primary.href}
                        className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-[var(--accent-blue)] text-[#07080a] font-semibold text-sm hover:bg-[#8dd7ff] transition-all"
                    >
                        {cta.primary.label} <ArrowRight className="w-4 h-4" />
                    </Link>
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
