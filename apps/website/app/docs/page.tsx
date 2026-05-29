import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { docsOverviewContent } from "@/lib/marketing-content";

export const metadata: Metadata = docsOverviewContent.metadata;

const methodColors: Record<string, { bg: string; color: string }> = {
    GET: { bg: "rgba(52,199,89,0.1)", color: "#1a7a4a" },
    POST: { bg: "rgba(0,102,204,0.1)", color: "#0066cc" },
    PATCH: { bg: "rgba(255,159,10,0.1)", color: "#b86800" },
    DELETE: { bg: "rgba(255,59,48,0.1)", color: "#c4161c" },
};

export default function DocsPage() {
    const { hero, cards, quickstartTitle, quickstartSteps, conceptsTitle, concepts, apiTitle, apiEndpoints, popularTopics, apiLink } = docsOverviewContent;

    return (
        <div style={{ background: "#ffffff" }}>

            {/* Hero */}
            <section className="af-tile af-tile-dark text-center" style={{ paddingTop: 80, paddingBottom: 72 }}>
                <div className="af-container-narrow">
                    <h1 className="font-semibold text-white" style={{ fontSize: "clamp(2.4rem, 5vw, 3.6rem)", letterSpacing: "-0.03em", lineHeight: 1.07 }}>
                        {hero.title}
                    </h1>
                    <p className="mt-5 text-[17px] text-[#98989d] max-w-lg mx-auto" style={{ lineHeight: 1.47, letterSpacing: "-0.022em" }}>
                        {hero.description}
                    </p>
                    <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
                        <Link href="/docs/quickstart" className="px-6 py-3 rounded-full text-[17px] font-medium text-white transition-colors" style={{ background: "#0066cc" }}>
                            Quickstart guide
                        </Link>
                        <Link href="/docs/api-reference" className="px-6 py-3 rounded-full text-[17px] font-medium text-white transition-colors" style={{ border: "1px solid rgba(255,255,255,0.25)" }}>
                            API Reference
                        </Link>
                    </div>
                </div>
            </section>

            {/* Quick nav cards — white */}
            <section className="af-tile af-tile-white">
                <div className="af-container">
                    <div className="grid sm:grid-cols-3 gap-4">
                        {cards.map((card) => (
                            <Link
                                key={card.title}
                                href={card.href}
                                className="group rounded-[18px] p-6 flex flex-col gap-3 transition-all hover:-translate-y-1 hover:shadow-md"
                                style={{ border: "1px solid #d2d2d7" }}
                            >
                                <div className="w-9 h-9 rounded-[8px] flex items-center justify-center shrink-0" style={{ background: "rgba(0,102,204,0.08)" }}>
                                    <span className="text-[#0066cc] font-bold text-[14px]">{card.title.slice(0, 1)}</span>
                                </div>
                                <h3 className="font-semibold text-[17px] text-[#1d1d1f] group-hover:text-[#0066cc] transition-colors" style={{ letterSpacing: "-0.018em" }}>
                                    {card.title}
                                </h3>
                                <p className="text-[14px] text-[#6e6e73] flex-1" style={{ lineHeight: 1.5 }}>{card.description}</p>
                                <span className="text-[13px] font-medium text-[#0066cc] flex items-center gap-1">
                                    {card.cta} <ArrowRight className="w-3.5 h-3.5" />
                                </span>
                            </Link>
                        ))}
                    </div>
                </div>
            </section>

            {/* Quickstart steps — parchment */}
            <section className="af-tile af-tile-parchment">
                <div className="af-container-narrow">
                    <h2 className="font-semibold text-[#1d1d1f] mb-10" style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.4rem)", letterSpacing: "-0.025em" }}>
                        {quickstartTitle}
                    </h2>
                    <div className="space-y-4">
                        {quickstartSteps.map((step, i) => (
                            <div key={step.label} className="rounded-[18px] p-6" style={{ background: "#ffffff", border: "1px solid #d2d2d7" }}>
                                <div className="flex items-start gap-4">
                                    <span
                                        className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[13px] font-semibold text-white mt-0.5"
                                        style={{ background: "#0066cc" }}
                                    >
                                        {i + 1}
                                    </span>
                                    <div className="flex-1">
                                        <h3 className="font-semibold text-[15px] text-[#1d1d1f] mb-2" style={{ letterSpacing: "-0.015em" }}>{step.title}</h3>
                                        <p className="text-[14px] text-[#6e6e73]" style={{ lineHeight: 1.5 }}>{step.description}</p>
                                        {step.code && (
                                            <pre
                                                className="mt-3 rounded-[11px] px-4 py-3 text-[12px] font-mono overflow-x-auto"
                                                style={{ background: "#1a1a1c", color: "#98989d" }}
                                            >
                                                {step.code}
                                            </pre>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Core concepts — dark */}
            <section className="af-tile af-tile-dark">
                <div className="af-container">
                    <h2 className="font-semibold text-white mb-10" style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.4rem)", letterSpacing: "-0.025em" }}>
                        {conceptsTitle}
                    </h2>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {concepts.map((concept) => (
                            <Link
                                key={concept.title}
                                href={concept.href}
                                className="group rounded-[18px] p-5 transition-all hover:bg-white/[0.08]"
                                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
                            >
                                <h3 className="font-semibold text-[15px] text-white mb-2 group-hover:text-[#2997ff] transition-colors" style={{ letterSpacing: "-0.015em" }}>
                                    {concept.title}
                                </h3>
                                <p className="text-[13px] text-[#98989d]" style={{ lineHeight: 1.5 }}>{concept.description}</p>
                            </Link>
                        ))}
                    </div>
                </div>
            </section>

            {/* API reference — white */}
            <section className="af-tile af-tile-white">
                <div className="af-container">
                    <div className="flex items-baseline justify-between mb-8">
                        <h2 className="font-semibold text-[#1d1d1f]" style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.4rem)", letterSpacing: "-0.025em" }}>
                            {apiTitle}
                        </h2>
                        <Link href={apiLink.href} className="text-[14px] font-medium text-[#0066cc] hover:text-[#0071e3] transition-colors">
                            {apiLink.label} →
                        </Link>
                    </div>
                    <div className="rounded-[18px] overflow-hidden" style={{ border: "1px solid #d2d2d7" }}>
                        {apiEndpoints.map((ep, i) => {
                            const mc = methodColors[ep.method] ?? { bg: "rgba(0,102,204,0.1)", color: "#0066cc" };
                            return (
                                <div
                                    key={`${ep.method}-${ep.path}`}
                                    className="px-5 py-4 flex items-center gap-4"
                                    style={{ borderBottom: i < apiEndpoints.length - 1 ? "1px solid #e8e8ed" : "none", background: i % 2 === 0 ? "#ffffff" : "#fafafa" }}
                                >
                                    <span
                                        className="text-[11px] font-semibold font-mono px-2 py-0.5 rounded shrink-0"
                                        style={{ background: mc.bg, color: mc.color, minWidth: 44, textAlign: "center" }}
                                    >
                                        {ep.method}
                                    </span>
                                    <code className="text-[13px] font-mono text-[#1d1d1f] shrink-0">{ep.path}</code>
                                    <span className="text-[13px] text-[#6e6e73] hidden sm:block" style={{ lineHeight: 1.4 }}>{ep.description}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* Popular topics — parchment */}
            <section className="af-tile af-tile-parchment" style={{ paddingTop: 48, paddingBottom: 64 }}>
                <div className="af-container">
                    <h2 className="font-semibold text-[#1d1d1f] mb-6" style={{ fontSize: "1.2rem", letterSpacing: "-0.018em" }}>
                        Popular topics
                    </h2>
                    <div className="flex flex-wrap gap-2">
                        {popularTopics.map((topic) => (
                            <Link
                                key={topic.label}
                                href={topic.href}
                                className="rounded-full px-4 py-2 text-[14px] font-medium text-[#1d1d1f] hover:text-[#0066cc] hover:border-[#0066cc] transition-colors"
                                style={{ border: "1px solid #d2d2d7", background: "#ffffff" }}
                            >
                                {topic.label}
                            </Link>
                        ))}
                    </div>
                </div>
            </section>
        </div>
    );
}
