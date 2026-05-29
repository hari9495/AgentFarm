import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Shield, ShieldCheck, Globe, FileLock2, Lock, Server, Eye, KeyRound, Zap, RefreshCw } from "lucide-react";
import { securityPageContent } from "@/lib/marketing-content";
import { breadcrumbSchema } from "@/lib/seo-schemas";

export const metadata: Metadata = {
    ...securityPageContent.metadata,
    keywords: [
        "AgentFarms security", "AI platform SOC 2", "governed AI GDPR",
        "AI worker data isolation", "enterprise AI security India",
        "AI platform compliance", "HIPAA ready AI platform", "AI audit trail",
        "tenant isolated AI runtime", "secure AI workers",
    ],
    alternates: { canonical: "https://agentfarms.in/security" },
    openGraph: {
        title: securityPageContent.metadata.title,
        description: securityPageContent.metadata.description,
        url: "https://agentfarms.in/security",
        type: "website",
    },
};

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

const pageSchemas = [
    breadcrumbSchema([
        { name: "Home", url: "https://agentfarms.in" },
        { name: "Security", url: "https://agentfarms.in/security" },
    ]),
];

export default function SecurityPage() {
    const { hero, certifications, features, faqs, checklist, cta } = securityPageContent;

    return (
        <div style={{ background: "#ffffff" }}>
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pageSchemas) }} />

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
                    <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
                        <Link href={hero.primary.href} className="btn-primary">
                            {hero.primary.label} <ArrowRight className="w-4 h-4" />
                        </Link>
                        <a href={hero.secondary.href} className="btn-secondary">{hero.secondary.label}</a>
                    </div>
                </div>
            </section>

            {/* Certifications */}
            <section className="af-tile af-tile-parchment">
                <div className="af-container">
                    <p className="text-center text-[12px] font-semibold uppercase tracking-[0.08em] text-[#6e6e73] mb-10">
                        {securityPageContent.certificationsTitle}
                    </p>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {certifications.map((cert) => {
                            const Icon = iconMap[cert.icon as keyof typeof iconMap] ?? Shield;
                            return (
                                <div key={cert.name} className="rounded-[18px] p-6 text-center" style={{ background: "#ffffff", border: "1px solid #d2d2d7" }}>
                                    <div className="w-12 h-12 rounded-[12px] flex items-center justify-center mx-auto mb-4" style={{ background: "rgba(0,102,204,0.08)" }}>
                                        <Icon className="w-6 h-6 text-[#0066cc]" />
                                    </div>
                                    <p className="font-semibold text-[15px] text-[#1d1d1f] mb-2">{cert.name}</p>
                                    <p className="text-[13px] text-[#6e6e73]" style={{ lineHeight: 1.5 }}>{cert.description}</p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* Architecture features — dark */}
            <section className="af-tile af-tile-dark">
                <div className="af-container">
                    <div className="text-center mb-12">
                        <h2 className="font-semibold text-white" style={{ fontSize: "clamp(1.9rem, 3.5vw, 2.8rem)", letterSpacing: "-0.028em", lineHeight: 1.07 }}>
                            {securityPageContent.architectureTitle}
                        </h2>
                        <p className="mt-3 text-[17px] text-[#98989d] mx-auto max-w-lg" style={{ lineHeight: 1.47 }}>
                            {securityPageContent.architectureSubtitle}
                        </p>
                    </div>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {features.map((feature) => {
                            const Icon = iconMap[feature.icon as keyof typeof iconMap] ?? Shield;
                            return (
                                <div key={feature.title} className="rounded-[18px] p-5" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
                                    <div className="w-9 h-9 rounded-[8px] flex items-center justify-center mb-4" style={{ background: "rgba(41,151,255,0.15)" }}>
                                        <Icon className="w-5 h-5 text-[#2997ff]" />
                                    </div>
                                    <h3 className="font-semibold text-[15px] text-white mb-3" style={{ letterSpacing: "-0.015em" }}>{feature.title}</h3>
                                    <ul className="space-y-1.5">
                                        {feature.items.map((item) => (
                                            <li key={item} className="flex items-start gap-2">
                                                <span className="w-1 h-1 rounded-full mt-2 shrink-0" style={{ background: "#2997ff" }} />
                                                <span className="text-[13px] text-[#98989d]" style={{ lineHeight: 1.5 }}>{item}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* Security checklist */}
            <section className="af-tile af-tile-white">
                <div className="af-container">
                    <div className="text-center mb-10">
                        <p className="af-eyebrow mb-3">{checklist.eyebrow}</p>
                        <h2 className="font-semibold text-[#1d1d1f]" style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.4rem)", letterSpacing: "-0.025em" }}>
                            {checklist.title}
                        </h2>
                        <p className="mt-3 text-[17px] text-[#6e6e73] max-w-md mx-auto" style={{ lineHeight: 1.47 }}>
                            {checklist.description}
                        </p>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-3 max-w-[800px] mx-auto mb-8">
                        {checklist.items.map((item) => (
                            <div key={item} className="flex items-start gap-2.5 rounded-[14px] px-5 py-4" style={{ border: "1px solid #d2d2d7" }}>
                                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-[#0066cc]" />
                                <span className="text-[14px] text-[#1d1d1f]" style={{ lineHeight: 1.5 }}>{item}</span>
                            </div>
                        ))}
                    </div>
                    <div className="text-center">
                        <a
                            href={checklist.buttonHref}
                            className="inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-[15px] font-medium text-white"
                            style={{ background: "#0066cc" }}
                        >
                            {checklist.buttonLabel} <ArrowRight className="w-4 h-4" />
                        </a>
                    </div>
                </div>
            </section>

            {/* FAQ */}
            <section className="af-tile af-tile-parchment">
                <div className="af-container-narrow">
                    <h2 className="font-semibold text-[#1d1d1f] mb-10 text-center" style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.4rem)", letterSpacing: "-0.025em" }}>
                        Security FAQ
                    </h2>
                    <div className="rounded-[18px] overflow-hidden" style={{ border: "1px solid #d2d2d7", background: "#ffffff" }}>
                        {faqs.map(({ question, answer }, i) => (
                            <div key={question} className="px-6 py-5" style={{ borderBottom: i < faqs.length - 1 ? "1px solid #e8e8ed" : "none" }}>
                                <h3 className="font-semibold text-[#1d1d1f] mb-2" style={{ fontSize: "15px", letterSpacing: "-0.015em" }}>{question}</h3>
                                <p className="text-[14px] text-[#6e6e73]" style={{ lineHeight: 1.6 }}>{answer}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA */}
            <section className="af-tile af-tile-dark text-center">
                <div className="af-container-narrow">
                    <h2 className="font-semibold text-white" style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.6rem)", letterSpacing: "-0.025em", lineHeight: 1.1 }}>
                        {cta.title}
                    </h2>
                    <p className="mt-4 text-[17px] text-[#98989d]" style={{ lineHeight: 1.47 }}>{cta.description}</p>
                    <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
                        <a href={cta.primary.href} className="px-6 py-3 rounded-full text-[17px] font-medium text-white transition-colors" style={{ background: "#0066cc" }}>
                            {cta.primary.label}
                        </a>
                        <Link href={cta.secondary.href} className="px-6 py-3 rounded-full text-[17px] font-medium text-white transition-colors" style={{ border: "1px solid rgba(255,255,255,0.25)" }}>
                            {cta.secondary.label}
                        </Link>
                    </div>
                </div>
            </section>
        </div>
    );
}
