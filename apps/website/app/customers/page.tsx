import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Bot, Building2, Quote, Star, TrendingUp } from "lucide-react";

export const metadata: Metadata = {
    title: "Customers - AgentFarm",
    description: "See how engineering teams are shipping more with AI workers from AgentFarm.",
};

const logos = [
    { name: "Acme Corp", initials: "AC" },
    { name: "Verdo AI", initials: "VA" },
    { name: "Stack Labs", initials: "SL" },
    { name: "Qubit IO", initials: "QI" },
    { name: "Folio Inc", initials: "FI" },
    { name: "Nexar", initials: "NX" },
    { name: "PulseDB", initials: "PD" },
    { name: "Crafter", initials: "CF" },
];

const stats = [
    { value: "40–60%", label: "More features shipped per quarter" },
    { value: "8.2×", label: "Faster vulnerability detection" },
    { value: "78%", label: "First-pass acceptance rate" },
    { value: "< 10 min", label: "Time to deploy first agent" },
];

const caseStudies = [
    {
        company: "Stack Labs",
        initials: "SL",
        accentBg: "bg-[var(--accent-blue)]/10",
        accentColor: "text-[var(--accent-blue)]",
        tagline: "API platform · 24 engineers",
        challenge: "Stack Labs was drowning in security backlog. Their two-person security team couldn't keep up with CVE triage, dependency audits, and IAM reviews across 40+ services.",
        outcome: "After deploying AgentFarm's security engineer, mean time to vulnerability detection dropped from 11 days to 4 hours. The human security engineers shifted entirely to threat modelling and architecture review.",
        metrics: [
            { label: "Detection time", before: "11 days", after: "4 hours" },
            { label: "CVEs resolved/month", before: "8", after: "47" },
            { label: "Sec team hours on triage", before: "60%", after: "10%" },
        ],
        quote: "Our security engineers stopped being CVE janitors and started doing actual security work. That alone justified the cost.",
        quoteAuthor: "Head of Security, Stack Labs",
        pdfLabel: "Stack Labs case study",
    },
    {
        company: "Qubit IO",
        initials: "QI",
        accentBg: "bg-[var(--accent-green)]/10",
        accentColor: "text-[var(--accent-green)]",
        tagline: "Data platform · 11 engineers",
        challenge: "Qubit IO needed to triple their test coverage before a Series B due diligence review. Their team had six weeks and zero capacity — every engineer was heads-down on features.",
        outcome: "The QA agent wrote 2,400 new tests over five weeks, bringing coverage from 31% to 89%. 94% of those tests passed human review without changes.",
        metrics: [
            { label: "Test coverage", before: "31%", after: "89%" },
            { label: "Tests authored", before: "—", after: "2,400" },
            { label: "Human rework needed", before: "—", after: "6%" },
        ],
        quote: "We hit our due diligence targets without distracting a single engineer from the roadmap. The agent worked nights and weekends.",
        quoteAuthor: "CTO, Qubit IO",
        pdfLabel: "Qubit IO case study",
    },
    {
        company: "Verdo AI",
        initials: "VA",
        accentBg: "bg-purple-500/10",
        accentColor: "text-purple-400",
        tagline: "ML infrastructure · 19 engineers",
        challenge: "Verdo AI's deployment pipeline was a bottleneck. Manual deploys took 3-4 hours each, required a DevOps engineer on-call, and had a 15% rollback rate.",
        outcome: "The DevOps agent automated 80% of routine deploys, reduced average deploy time to 22 minutes, and cut the rollback rate to 3%.",
        metrics: [
            { label: "Deploy time", before: "3-4 hours", after: "22 minutes" },
            { label: "Rollback rate", before: "15%", after: "3%" },
            { label: "Deploys/week", before: "4", after: "27" },
        ],
        quote: "We went from 4 deploys a week to 27 without any increase in incidents. The agent handles the routine deploys and escalates anything unusual.",
        quoteAuthor: "VP Engineering, Verdo AI",
        pdfLabel: "Verdo AI case study",
    },
];

const testimonials = [
    {
        text: "I was sceptical that AI agents could really act like teammates. After two months with AgentFarm, I've stopped being sceptical.",
        author: "Staff Engineer",
        company: "Series B SaaS company",
        initials: "SE",
    },
    {
        text: "The approvals system is what made this safe to deploy. Agents do the work; humans control the risk. That's the right tradeoff.",
        author: "Head of Platform",
        company: "Fintech startup",
        initials: "HP",
    },
    {
        text: "We were planning to hire 3 QA engineers. We deployed the QA agent instead. That's 3 headcount we can invest elsewhere.",
        author: "Engineering Manager",
        company: "Developer tools company",
        initials: "EM",
    },
];

export default function CustomersPage() {
    return (
        <div className="min-h-screen">

            {/* Hero */}
            <div className="bg-[var(--canvas)] border-b border-[var(--hairline)]">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
                    <div className="chip chip-accent mb-6">
                        <Building2 className="w-3.5 h-3.5" /> Customer stories
                    </div>
                    <h1 className="text-4xl sm:text-5xl font-semibold tracking-[-0.03em] text-[var(--ink)] mb-6 leading-tight">
                        Engineering teams shipping<br className="hidden sm:block" />
                        <span className="bg-gradient-to-r from-[var(--accent-blue)] to-[var(--accent-green)] bg-clip-text text-transparent"> more with AgentFarm</span>
                    </h1>
                    <p className="text-lg text-[var(--mute)] max-w-2xl mx-auto mb-10">
                        From security backlogs to deployment velocity, see how teams are using AI workers to multiply output without multiplying headcount.
                    </p>
                    <Link href="/signup" className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-[var(--accent-blue)] text-[#07080a] font-semibold text-sm hover:bg-[#8dd7ff] transition-all">
                        Start free trial <ArrowRight className="w-4 h-4" />
                    </Link>
                </div>
            </div>

            {/* Stats bar */}
            <div className="bg-[var(--canvas)] border-b border-[var(--hairline)]">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-2 sm:grid-cols-4 gap-8">
                    {stats.map((s) => (
                        <div key={s.label} className="text-center">
                            <p className="text-2xl font-bold text-[var(--ink)] mb-1">{s.value}</p>
                            <p className="text-xs text-[var(--ash)]">{s.label}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Logo wall */}
            <div className="py-14 border-b border-[var(--hairline)]">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                    <p className="chip chip-accent mx-auto w-fit mb-8">Trusted by engineering teams</p>
                    <div className="flex flex-wrap justify-center gap-4">
                        {logos.map((logo) => (
                            <div key={logo.name} className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--hairline)] bg-[var(--surface-card)]">
                                <div className="h-6 w-6 rounded-md bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center text-[9px] font-bold text-white">
                                    {logo.initials}
                                </div>
                                <span className="text-sm font-semibold text-[var(--body-color)]">{logo.name}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Case studies */}
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-12">
                <div className="text-center mb-4">
                    <div className="chip chip-accent mb-4">
                        <TrendingUp className="w-3.5 h-3.5" /> Case studies
                    </div>
                    <h2 className="text-3xl font-semibold tracking-[-0.03em] text-[var(--ink)]">Real outcomes, real teams</h2>
                </div>

                {caseStudies.map((cs) => (
                    <div key={cs.company} className="bg-[var(--surface-card)] rounded-3xl border border-[var(--hairline)] overflow-hidden">
                        <div className="p-8 md:p-10">
                            <div className="flex items-center gap-3 mb-6">
                                <div className={`h-12 w-12 rounded-2xl ${cs.accentBg} flex items-center justify-center text-sm font-bold ${cs.accentColor}`}>
                                    {cs.initials}
                                </div>
                                <div>
                                    <p className="text-lg font-semibold text-[var(--ink)]">{cs.company}</p>
                                    <p className="text-xs text-[var(--ash)]">{cs.tagline}</p>
                                </div>
                            </div>

                            <div className="grid md:grid-cols-2 gap-8 mb-8">
                                <div>
                                    <p className="text-xs font-bold uppercase tracking-wide text-[var(--ash)] mb-2">Challenge</p>
                                    <p className="text-sm text-[var(--mute)] leading-relaxed">{cs.challenge}</p>
                                </div>
                                <div>
                                    <p className="text-xs font-bold uppercase tracking-wide text-[var(--ash)] mb-2">Outcome</p>
                                    <p className="text-sm text-[var(--mute)] leading-relaxed">{cs.outcome}</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-4 mb-8">
                                {cs.metrics.map((m) => (
                                    <div key={m.label} className="text-center p-4 rounded-xl bg-[var(--surface-el)]">
                                        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ash)] mb-2">{m.label}</p>
                                        <div className="flex items-center justify-center gap-2">
                                            <span className="text-xs text-[var(--ash)] line-through">{m.before}</span>
                                            {m.before !== "—" && <ArrowRight className="w-3 h-3 text-[var(--ash)]" />}
                                            <span className="text-sm font-bold text-[var(--accent-green)]">{m.after}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="flex items-start gap-3 p-4 rounded-2xl bg-[var(--surface-el)]">
                                <Quote className="w-5 h-5 text-[var(--hairline)] shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-sm text-[var(--body-color)] italic leading-relaxed mb-2">"{cs.quote}"</p>
                                    <p className="text-xs font-semibold text-[var(--ash)]">{cs.quoteAuthor}</p>
                                </div>
                            </div>

                            {cs.pdfLabel && (
                                <div className="mt-4">
                                    <a
                                        href={`/downloads/${cs.company.toLowerCase().replace(/\s+/g, "-")}-case-study.pdf`}
                                        download
                                        className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--body-color)] border border-[var(--hairline)] rounded-lg px-3 py-2 hover:bg-[var(--surface-el)] transition-colors"
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M8 12l4 4m0 0l4-4m-4 4V4" /></svg>
                                        Download {cs.pdfLabel} (PDF)
                                    </a>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Testimonials */}
            <div className="bg-[var(--surface)] border-y border-[var(--hairline)] py-16">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                    <p className="chip chip-accent mx-auto w-fit mb-10">What teams are saying</p>
                    <div className="grid md:grid-cols-3 gap-6">
                        {testimonials.map((t) => (
                            <div key={t.author} className="bg-[var(--surface-card)] rounded-2xl border border-[var(--hairline)] p-6">
                                <div className="flex gap-0.5 mb-4">
                                    {[...Array(5)].map((_, i) => <Star key={i} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />)}
                                </div>
                                <p className="text-sm text-[var(--body-color)] leading-relaxed mb-4 italic">"{t.text}"</p>
                                <div className="flex items-center gap-2">
                                    <div className="h-7 w-7 rounded-full bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center text-[9px] font-bold text-white">
                                        {t.initials}
                                    </div>
                                    <div>
                                        <p className="text-xs font-semibold text-[var(--ink)]">{t.author}</p>
                                        <p className="text-[10px] text-[var(--ash)]">{t.company}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* CTA */}
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
                <Bot className="w-10 h-10 mx-auto mb-4 text-[var(--accent-blue)]" />
                <h2 className="text-3xl font-semibold tracking-[-0.03em] text-[var(--ink)] mb-4">Ready to see what your team can do?</h2>
                <p className="text-[var(--mute)] mb-8 max-w-xl mx-auto">Deploy your first AI engineer in under 10 minutes. No credit card required.</p>
                <div className="flex flex-wrap justify-center gap-4">
                    <Link href="/signup" className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-[var(--accent-blue)] text-[#07080a] font-semibold text-sm hover:bg-[#8dd7ff] transition-all">
                        Start free trial <ArrowRight className="w-4 h-4" />
                    </Link>
                    <Link href="/contact" className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl border border-[var(--hairline)] text-[var(--body-color)] font-semibold text-sm hover:bg-[var(--surface-el)] transition-all">
                        Talk to sales
                    </Link>
                </div>
            </div>
        </div>
    );
}
