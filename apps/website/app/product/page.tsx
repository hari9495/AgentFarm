import type { Metadata } from "next";
import { ArrowRight, CheckCircle2, Code2, Zap, Shield, Server, TestTube2, Activity, GitBranch, Layout } from "lucide-react";
import Link from "next/link";
import { productPageContent } from "@/lib/marketing-content";

export const metadata: Metadata = {
    title: productPageContent.metadata.title,
    description: productPageContent.metadata.description,
};

const featureIcons = [Code2, Zap, Shield, Server, TestTube2, Activity, GitBranch, Layout];

export default function ProductPage() {
    return (
        <div style={{ background: "#ffffff" }}>

            {/* Hero — white */}
            <section className="af-tile af-tile-white" style={{ paddingTop: 80, paddingBottom: 80 }}>
                <div className="af-container">
                    <div className="grid lg:grid-cols-2 gap-12 items-center">
                        <div>
                            <p className="af-eyebrow mb-4">{productPageContent.hero.badge}</p>
                            <h1
                                className="font-semibold text-[#1d1d1f]"
                                style={{ fontSize: "clamp(2.4rem, 4.5vw, 3.4rem)", letterSpacing: "-0.03em", lineHeight: 1.07 }}
                            >
                                {productPageContent.hero.titleLead}{" "}
                                <span className="text-[#0066cc]">{productPageContent.hero.titleAccent}</span>
                            </h1>
                            <p className="mt-5 text-[17px] text-[#424245] max-w-lg" style={{ lineHeight: 1.47, letterSpacing: "-0.022em" }}>
                                {productPageContent.hero.description}
                            </p>
                            <ul className="mt-6 space-y-2.5">
                                {productPageContent.outcomes.map((o) => (
                                    <li key={o} className="flex items-start gap-2.5 text-[15px] text-[#424245]">
                                        <CheckCircle2 className="mt-0.5 w-4 h-4 shrink-0 text-[#0066cc]" />
                                        <span style={{ lineHeight: 1.5 }}>{o}</span>
                                    </li>
                                ))}
                            </ul>
                            <div className="mt-8 flex flex-col sm:flex-row gap-3">
                                <Link href={productPageContent.hero.primaryCta.href} className="btn-primary">
                                    {productPageContent.hero.primaryCta.label}
                                    <ArrowRight className="w-4 h-4" />
                                </Link>
                                <Link href={productPageContent.hero.secondaryCta.href} className="btn-secondary">
                                    {productPageContent.hero.secondaryCta.label}
                                </Link>
                            </div>
                        </div>

                        {/* Right — execution flow preview */}
                        <div
                            className="rounded-[18px] overflow-hidden"
                            style={{ border: "1px solid #d2d2d7", boxShadow: "0 24px 56px -20px rgba(0,0,0,0.12)" }}
                        >
                            <div className="px-5 py-4" style={{ background: "#f5f5f7", borderBottom: "1px solid #e8e8ed" }}>
                                <p className="text-[12px] font-semibold text-[#1d1d1f]">Execution flow</p>
                            </div>
                            <div className="p-4 space-y-2" style={{ background: "#ffffff" }}>
                                {productPageContent.executionFlow.map((step) => (
                                    <div
                                        key={step.step}
                                        className="rounded-[11px] p-4 flex gap-4"
                                        style={{ border: "1px solid #e8e8ed", background: "#fafafa" }}
                                    >
                                        <span
                                            className="font-mono text-[11px] font-semibold shrink-0 mt-0.5 text-[#0066cc]"
                                        >
                                            {step.step}
                                        </span>
                                        <div>
                                            <p className="text-[13px] font-semibold text-[#1d1d1f]" style={{ letterSpacing: "-0.01em" }}>{step.title}</p>
                                            <p className="mt-0.5 text-[12px] text-[#6e6e73]" style={{ lineHeight: 1.5 }}>{step.detail}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Features grid — parchment */}
            <section className="af-tile af-tile-parchment">
                <div className="af-container">
                    <div className="text-center mb-12">
                        <h2
                            className="font-semibold text-[#1d1d1f]"
                            style={{ fontSize: "clamp(1.9rem, 3.5vw, 2.8rem)", letterSpacing: "-0.028em", lineHeight: 1.07 }}
                        >
                            {productPageContent.featuresHeader.title}
                        </h2>
                        <p className="mt-3 mx-auto max-w-lg text-[17px] text-[#424245]" style={{ lineHeight: 1.47, letterSpacing: "-0.022em" }}>
                            {productPageContent.featuresHeader.description}
                        </p>
                    </div>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {productPageContent.features.map((feature, i) => {
                            const Icon = featureIcons[i] ?? Zap;
                            return (
                                <div
                                    key={feature.title}
                                    className="rounded-[18px] p-5"
                                    style={{ background: "#ffffff", border: "1px solid #d2d2d7" }}
                                >
                                    <div
                                        className="w-9 h-9 rounded-[8px] flex items-center justify-center mb-3"
                                        style={{ background: "rgba(0,102,204,0.08)" }}
                                    >
                                        <Icon className="w-5 h-5 text-[#0066cc]" />
                                    </div>
                                    <h3 className="font-semibold text-[15px] text-[#1d1d1f] mb-1.5" style={{ letterSpacing: "-0.015em" }}>
                                        {feature.title}
                                    </h3>
                                    <p className="text-[13px] text-[#6e6e73]" style={{ lineHeight: 1.5 }}>
                                        {feature.description}
                                    </p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* Demo section — dark */}
            <section className="af-tile af-tile-dark text-center">
                <div className="af-container-narrow">
                    <p className="af-eyebrow mb-4">{productPageContent.demo.badge}</p>
                    <h2
                        className="font-semibold text-white"
                        style={{ fontSize: "clamp(1.9rem, 3.5vw, 2.8rem)", letterSpacing: "-0.028em", lineHeight: 1.07 }}
                    >
                        {productPageContent.demo.title}
                    </h2>
                    <p className="mt-4 text-[17px] text-[#98989d]" style={{ lineHeight: 1.47, letterSpacing: "-0.022em" }}>
                        {productPageContent.demo.description}
                    </p>
                    {/* Video placeholder */}
                    <div
                        className="mt-10 mx-auto rounded-[18px] overflow-hidden flex items-center justify-center"
                        style={{ maxWidth: 720, aspectRatio: "16/9", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}
                    >
                        <Link
                            href="/book-demo"
                            className="flex flex-col items-center gap-3 text-[#98989d] hover:text-white transition-colors"
                        >
                            <div
                                className="w-14 h-14 rounded-full flex items-center justify-center"
                                style={{ background: "rgba(0,102,204,0.25)", border: "1px solid rgba(41,151,255,0.3)" }}
                            >
                                <span className="text-[#2997ff] text-xl ml-1">▶</span>
                            </div>
                            <span className="text-[15px]">Book a live demo</span>
                        </Link>
                    </div>
                </div>
            </section>

            {/* CTA — white */}
            <section className="af-tile af-tile-white text-center">
                <div className="af-container-narrow">
                    <h2
                        className="font-semibold text-[#1d1d1f]"
                        style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.6rem)", letterSpacing: "-0.025em", lineHeight: 1.1 }}
                    >
                        {productPageContent.cta.title}
                    </h2>
                    <p className="mt-4 text-[17px] text-[#6e6e73]" style={{ lineHeight: 1.47 }}>
                        {productPageContent.cta.description}
                    </p>
                    <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
                        <Link href="/get-started" className="btn-primary">
                            Start free trial
                            <ArrowRight className="w-4 h-4" />
                        </Link>
                        <Link href="/how-it-works" className="btn-secondary">
                            See how it works
                        </Link>
                    </div>
                </div>
            </section>
        </div>
    );
}
