import type { Metadata } from "next";
import { CheckCircle, XCircle, MinusCircle, ArrowRight } from "lucide-react";
import Link from "next/link";

export const metadata: Metadata = {
    title: "AgentFarms vs Alternatives — AI Workers vs Copilot",
    description: "Compare AgentFarms against GitHub Copilot, contractors, and full-time hires. Governed AI workers execute tasks end-to-end — see the key differences.",
};

type Value = "yes" | "no" | "partial";

const rows: { feature: string; AgentFarms: Value; copilot: Value; contractor: Value; hiring: Value }[] = [
    { feature: "Executes tasks autonomously", AgentFarms: "yes", copilot: "no", contractor: "yes", hiring: "yes" },
    { feature: "Opens GitHub PRs automatically", AgentFarms: "yes", copilot: "no", contractor: "yes", hiring: "yes" },
    { feature: "Works 24/7 without breaks", AgentFarms: "yes", copilot: "partial", contractor: "no", hiring: "no" },
    { feature: "Risk-classified approval gates", AgentFarms: "yes", copilot: "no", contractor: "no", hiring: "partial" },
    { feature: "Jira & Linear integration", AgentFarms: "yes", copilot: "no", contractor: "partial", hiring: "yes" },
    { feature: "Day-one productivity", AgentFarms: "yes", copilot: "yes", contractor: "partial", hiring: "no" },
    { feature: "Runs CI checks & fixes failures", AgentFarms: "yes", copilot: "partial", contractor: "partial", hiring: "yes" },
    { feature: "Full audit trail", AgentFarms: "yes", copilot: "no", contractor: "no", hiring: "partial" },
    { feature: "Cost under $500/mo per worker", AgentFarms: "yes", copilot: "yes", contractor: "no", hiring: "no" },
    { feature: "No hiring / onboarding time", AgentFarms: "yes", copilot: "yes", contractor: "partial", hiring: "no" },
    { feature: "Scales instantly", AgentFarms: "yes", copilot: "yes", contractor: "no", hiring: "no" },
    { feature: "Understands full codebase context", AgentFarms: "yes", copilot: "partial", contractor: "partial", hiring: "yes" },
    { feature: "12 AI worker roles available", AgentFarms: "yes", copilot: "no", contractor: "partial", hiring: "partial" },
    { feature: "OWASP / security scanning per PR", AgentFarms: "yes", copilot: "no", contractor: "no", hiring: "partial" },
    { feature: "Test coverage delta tracked per PR", AgentFarms: "yes", copilot: "no", contractor: "no", hiring: "partial" },
    { feature: "Per-skill analytics dashboard", AgentFarms: "yes", copilot: "no", contractor: "no", hiring: "no" },
    { feature: "Iterate on PR review comments", AgentFarms: "yes", copilot: "partial", contractor: "yes", hiring: "yes" },
    { feature: "Cancel & reassign tasks instantly", AgentFarms: "yes", copilot: "yes", contractor: "no", hiring: "no" },
    { feature: "Tenant-isolated Azure runtime", AgentFarms: "yes", copilot: "no", contractor: "no", hiring: "no" },
    { feature: "Microsoft Teams task assignment", AgentFarms: "yes", copilot: "no", contractor: "no", hiring: "yes" },
];

function Cell({ v }: { v: Value }) {
    if (v === "yes") return <CheckCircle className="w-5 h-5 text-[#0066cc] mx-auto" />;
    if (v === "no") return <XCircle className="w-5 h-5 text-[#d2d2d7] mx-auto" />;
    return <MinusCircle className="w-5 h-5 text-[#ff9f0a] mx-auto" />;
}

const cols = [
    { key: "AgentFarms", label: "AgentFarms", highlight: true },
    { key: "copilot", label: "Copilot / Cursor", highlight: false },
    { key: "contractor", label: "Contractor", highlight: false },
    { key: "hiring", label: "Full-time hire", highlight: false },
];

export default function ComparePage() {
    return (
        <div style={{ background: "#ffffff" }}>

            {/* Hero */}
            <section className="af-tile af-tile-white text-center" style={{ paddingTop: 80, paddingBottom: 64 }}>
                <div className="af-container-narrow">
                    <p className="af-eyebrow mb-4">Compare</p>
                    <h1 className="font-semibold text-[#1d1d1f]" style={{ fontSize: "clamp(2.4rem, 5vw, 3.6rem)", letterSpacing: "-0.03em", lineHeight: 1.07 }}>
                        AgentFarms vs the alternatives
                    </h1>
                    <p className="mt-5 text-[17px] text-[#424245] max-w-lg mx-auto" style={{ lineHeight: 1.47, letterSpacing: "-0.022em" }}>
                        Copilots suggest. Contractors bill by the hour. Full-time hires take months to onboard. AgentFarms workers execute with accountability from day one.
                    </p>
                </div>
            </section>

            {/* Comparison table — parchment */}
            <section className="af-tile af-tile-parchment" style={{ paddingTop: 0, paddingBottom: 64 }}>
                <div className="af-container-wide">
                    <div className="rounded-[18px] overflow-hidden" style={{ border: "1px solid #d2d2d7" }}>
                        {/* Header */}
                        <div className="grid grid-cols-5 bg-[#ffffff]" style={{ borderBottom: "1px solid #d2d2d7" }}>
                            <div className="px-5 py-4">
                                <span className="text-[13px] font-semibold text-[#6e6e73]">Feature</span>
                            </div>
                            {cols.map((col) => (
                                <div
                                    key={col.key}
                                    className="px-4 py-4 text-center"
                                    style={{ background: col.highlight ? "rgba(0,102,204,0.04)" : undefined }}
                                >
                                    <span
                                        className="text-[13px] font-semibold"
                                        style={{ color: col.highlight ? "#0066cc" : "#6e6e73" }}
                                    >
                                        {col.label}
                                    </span>
                                </div>
                            ))}
                        </div>
                        {/* Rows */}
                        {rows.map((row, i) => (
                            <div
                                key={row.feature}
                                className="grid grid-cols-5"
                                style={{
                                    borderBottom: i < rows.length - 1 ? "1px solid #e8e8ed" : "none",
                                    background: i % 2 === 0 ? "#ffffff" : "#fafafa",
                                }}
                            >
                                <div className="px-5 py-3 flex items-center">
                                    <span className="text-[14px] text-[#1d1d1f]">{row.feature}</span>
                                </div>
                                {cols.map((col) => (
                                    <div
                                        key={col.key}
                                        className="py-3 flex items-center justify-center"
                                        style={{ background: col.highlight ? "rgba(0,102,204,0.02)" : undefined }}
                                    >
                                        <Cell v={row[col.key as keyof typeof row] as Value} />
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>

                    {/* Legend */}
                    <div className="mt-4 flex flex-wrap items-center gap-5 justify-center">
                        <span className="flex items-center gap-1.5 text-[13px] text-[#6e6e73]">
                            <CheckCircle className="w-4 h-4 text-[#0066cc]" /> Yes / Supported
                        </span>
                        <span className="flex items-center gap-1.5 text-[13px] text-[#6e6e73]">
                            <MinusCircle className="w-4 h-4 text-[#ff9f0a]" /> Partial / Limited
                        </span>
                        <span className="flex items-center gap-1.5 text-[13px] text-[#6e6e73]">
                            <XCircle className="w-4 h-4 text-[#d2d2d7]" /> Not supported
                        </span>
                    </div>
                </div>
            </section>

            {/* CTA — dark */}
            <section className="af-tile af-tile-dark text-center">
                <div className="af-container-narrow">
                    <h2 className="font-semibold text-white" style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.6rem)", letterSpacing: "-0.025em", lineHeight: 1.1 }}>
                        Ready to see the difference?
                    </h2>
                    <p className="mt-4 text-[17px] text-[#98989d]" style={{ lineHeight: 1.47 }}>
                        Start with one workflow, see real output within hours.
                    </p>
                    <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
                        <Link href="/get-started" className="px-6 py-3 rounded-full text-[17px] font-medium text-white transition-colors" style={{ background: "#0066cc" }}>
                            Start free trial <ArrowRight className="inline w-4 h-4 ml-1" />
                        </Link>
                        <Link href="/pricing" className="px-6 py-3 rounded-full text-[17px] font-medium text-white transition-colors" style={{ border: "1px solid rgba(255,255,255,0.25)" }}>
                            View pricing
                        </Link>
                    </div>
                </div>
            </section>
        </div>
    );
}
