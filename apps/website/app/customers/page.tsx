import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Star } from "lucide-react";
import { customersPageContent } from "@/lib/marketing-content";

export const metadata: Metadata = customersPageContent.metadata;

export default function CustomersPage() {
    const { hero, stats, logos, caseStudies, testimonials, cta } = customersPageContent;

    return (
        <div style={{ background: "#ffffff" }}>

            {/* Hero */}
            <section className="af-tile af-tile-white text-center" style={{ paddingTop: 80, paddingBottom: 64 }}>
                <div className="af-container-narrow">
                    <p className="af-eyebrow mb-4">{hero.eyebrow}</p>
                    <h1 className="font-semibold text-[#1d1d1f]" style={{ fontSize: "clamp(2.4rem, 5vw, 3.6rem)", letterSpacing: "-0.03em", lineHeight: 1.07 }}>
                        {hero.titleLead}{" "}
                        <span className="text-[#0066cc]">{hero.titleAccent}</span>
                    </h1>
                    <p className="mt-5 text-[17px] text-[#424245] max-w-lg mx-auto" style={{ lineHeight: 1.47, letterSpacing: "-0.022em" }}>
                        {hero.description}
                    </p>
                    <div className="mt-8">
                        <Link href={hero.primary.href} className="btn-primary">
                            {hero.primary.label} <ArrowRight className="w-4 h-4" />
                        </Link>
                    </div>
                </div>
            </section>

            {/* Stats */}
            <section className="af-tile af-tile-parchment" style={{ paddingTop: 40, paddingBottom: 40 }}>
                <div className="af-container-narrow">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
                        {stats.map((stat) => (
                            <div key={stat.label}>
                                <p className="font-semibold text-[#1d1d1f]" style={{ fontSize: "2rem", letterSpacing: "-0.03em", lineHeight: 1 }}>{stat.value}</p>
                                <p className="mt-1.5 text-[13px] text-[#6e6e73]">{stat.label}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Logo strip */}
            <section className="af-tile af-tile-white" style={{ paddingTop: 48, paddingBottom: 48 }}>
                <div className="af-container-wide">
                    <p className="text-center text-[12px] font-semibold uppercase tracking-[0.08em] text-[#6e6e73] mb-8">
                        {customersPageContent.logosTitle}
                    </p>
                    <div className="flex flex-wrap justify-center gap-3">
                        {logos.map((logo) => (
                            <span key={logo.name} className="flex items-center gap-2 rounded-full px-5 py-2.5" style={{ border: "1px solid #d2d2d7" }}>
                                <span className="w-6 h-6 rounded-full text-[11px] font-bold text-white flex items-center justify-center shrink-0" style={{ background: "#0066cc" }}>
                                    {logo.initials}
                                </span>
                                <span className="text-[14px] font-medium text-[#1d1d1f]">{logo.name}</span>
                            </span>
                        ))}
                    </div>
                </div>
            </section>

            {/* Case studies */}
            <section className="af-tile af-tile-parchment">
                <div className="af-container">
                    <h2 className="font-semibold text-[#1d1d1f] mb-12 text-center" style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.4rem)", letterSpacing: "-0.025em" }}>
                        {customersPageContent.caseStudiesTitle}
                    </h2>
                    <div className="space-y-5">
                        {caseStudies.map((cs) => (
                            <div key={cs.company} className="rounded-[18px] p-7" style={{ background: "#ffffff", border: "1px solid #d2d2d7" }}>
                                <div className="grid lg:grid-cols-[1fr_1fr] gap-8">
                                    <div>
                                        <div className="flex items-center gap-3 mb-4">
                                            <div className="w-10 h-10 rounded-full text-[13px] font-bold text-white flex items-center justify-center shrink-0" style={{ background: "#0066cc" }}>
                                                {cs.initials}
                                            </div>
                                            <div>
                                                <p className="font-semibold text-[15px] text-[#1d1d1f]">{cs.company}</p>
                                                <p className="text-[12px] text-[#6e6e73]">{cs.tagline}</p>
                                            </div>
                                        </div>
                                        <p className="text-[14px] text-[#6e6e73] mb-3" style={{ lineHeight: 1.6 }}>
                                            <strong className="text-[#1d1d1f]">Challenge:</strong> {cs.challenge}
                                        </p>
                                        <p className="text-[14px] text-[#6e6e73]" style={{ lineHeight: 1.6 }}>
                                            <strong className="text-[#1d1d1f]">Outcome:</strong> {cs.outcome}
                                        </p>
                                    </div>
                                    <div>
                                        <div className="rounded-[14px] overflow-hidden mb-4" style={{ border: "1px solid #e8e8ed" }}>
                                            <div className="px-4 py-2.5 grid grid-cols-3 text-[12px] font-semibold text-[#6e6e73]" style={{ background: "#f5f5f7", borderBottom: "1px solid #e8e8ed" }}>
                                                <span>Metric</span><span className="text-center">Before</span><span className="text-center">After</span>
                                            </div>
                                            {cs.metrics.map((m) => (
                                                <div key={m.label} className="px-4 py-3 grid grid-cols-3 text-[13px]" style={{ borderBottom: "1px solid #f0f0f0" }}>
                                                    <span className="text-[#6e6e73]">{m.label}</span>
                                                    <span className="text-center text-[#aeaeb2]">{m.before}</span>
                                                    <span className="text-center font-semibold text-[#0066cc]">{m.after}</span>
                                                </div>
                                            ))}
                                        </div>
                                        <blockquote className="italic text-[14px] text-[#424245]" style={{ lineHeight: 1.6 }}>
                                            &ldquo;{cs.quote}&rdquo;
                                            <footer className="mt-2 text-[12px] text-[#aeaeb2] not-italic">{cs.quoteAuthor}</footer>
                                        </blockquote>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Testimonials */}
            <section className="af-tile af-tile-dark">
                <div className="af-container">
                    <h2 className="font-semibold text-white text-center mb-12" style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.4rem)", letterSpacing: "-0.025em" }}>
                        {customersPageContent.testimonialsTitle}
                    </h2>
                    <div className="grid sm:grid-cols-3 gap-4">
                        {testimonials.map((t, i) => (
                            <div key={i} className="rounded-[18px] p-6 flex flex-col gap-3" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
                                <div className="flex gap-0.5">
                                    {[1,2,3,4,5].map((s) => <Star key={s} className="w-3.5 h-3.5 fill-[#2997ff] text-[#2997ff]" />)}
                                </div>
                                <p className="text-[15px] text-[#e5e5ea] flex-1 italic" style={{ lineHeight: 1.6 }}>&ldquo;{t.text}&rdquo;</p>
                                <div className="flex items-center gap-2.5 pt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-semibold text-white shrink-0" style={{ background: "#0066cc" }}>
                                        {t.initials}
                                    </div>
                                    <div>
                                        <p className="text-[14px] font-semibold text-white">{t.author}</p>
                                        <p className="text-[12px] text-[#98989d]">{t.company}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA */}
            <section className="af-tile af-tile-white text-center">
                <div className="af-container-narrow">
                    <h2 className="font-semibold text-[#1d1d1f]" style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.6rem)", letterSpacing: "-0.025em", lineHeight: 1.1 }}>{cta.title}</h2>
                    <p className="mt-4 text-[17px] text-[#6e6e73]" style={{ lineHeight: 1.47 }}>{cta.description}</p>
                    <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
                        <Link href={cta.primary.href} className="btn-primary">{cta.primary.label} <ArrowRight className="w-4 h-4" /></Link>
                        <Link href={cta.secondary.href} className="btn-secondary">{cta.secondary.label}</Link>
                    </div>
                </div>
            </section>
        </div>
    );
}
