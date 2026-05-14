import type { Metadata } from "next";
import { CheckCircle, XCircle, MinusCircle } from "lucide-react";
import ButtonLink from "@/components/shared/ButtonLink";

export const metadata: Metadata = {
  title: "AgentFarm vs Alternatives — Compare",
  description: "See how AgentFarm compares to GitHub Copilot, hiring a contractor, and traditional hiring.",
};

type Value = "yes" | "no" | "partial";

interface Row {
  feature: string;
  AgentFarm: Value;
  copilot: Value;
  contractor: Value;
  hiring: Value;
}

const rows: Row[] = [
  { feature: "Executes tasks autonomously", AgentFarm: "yes", copilot: "no", contractor: "yes", hiring: "yes" },
  { feature: "Opens GitHub PRs automatically", AgentFarm: "yes", copilot: "no", contractor: "yes", hiring: "yes" },
  { feature: "Works 24/7 without breaks", AgentFarm: "yes", copilot: "partial", contractor: "no", hiring: "no" },
  { feature: "Microsoft Teams task assignment", AgentFarm: "yes", copilot: "no", contractor: "no", hiring: "yes" },
  { feature: "Jira integration", AgentFarm: "yes", copilot: "no", contractor: "partial", hiring: "yes" },
  { feature: "Day-one productivity", AgentFarm: "yes", copilot: "yes", contractor: "partial", hiring: "no" },
  { feature: "Runs CI checks & fixes failures", AgentFarm: "yes", copilot: "partial", contractor: "partial", hiring: "yes" },
  { feature: "Full audit trail", AgentFarm: "yes", copilot: "no", contractor: "no", hiring: "partial" },
  { feature: "Cost under $500/mo per worker", AgentFarm: "yes", copilot: "yes", contractor: "no", hiring: "no" },
  { feature: "No hiring / onboarding time", AgentFarm: "yes", copilot: "yes", contractor: "partial", hiring: "no" },
  { feature: "Scales instantly", AgentFarm: "yes", copilot: "yes", contractor: "no", hiring: "no" },
  { feature: "Understands full codebase context", AgentFarm: "yes", copilot: "partial", contractor: "partial", hiring: "yes" },
  { feature: "21 developer skills available", AgentFarm: "yes", copilot: "no", contractor: "partial", hiring: "partial" },
  { feature: "Risk-classified approval gates", AgentFarm: "yes", copilot: "no", contractor: "no", hiring: "partial" },
  { feature: "OWASP / security scanning on every PR", AgentFarm: "yes", copilot: "no", contractor: "no", hiring: "partial" },
  { feature: "Test coverage delta tracked per PR", AgentFarm: "yes", copilot: "no", contractor: "no", hiring: "partial" },
  { feature: "Per-skill analytics dashboard", AgentFarm: "yes", copilot: "no", contractor: "no", hiring: "no" },
  { feature: "Iterate on PR review comments", AgentFarm: "yes", copilot: "partial", contractor: "yes", hiring: "yes" },
  { feature: "Cancel & reassign tasks instantly", AgentFarm: "yes", copilot: "yes", contractor: "no", hiring: "no" },
  { feature: "Tenant-isolated Azure runtime", AgentFarm: "yes", copilot: "no", contractor: "no", hiring: "no" },
];

function Cell({ v }: { v: Value }) {
  if (v === "yes") return <CheckCircle className="w-5 h-5 text-green-500 mx-auto" />;
  if (v === "no") return <XCircle className="w-5 h-5 text-[var(--hairline)] mx-auto" />;
  return <MinusCircle className="w-5 h-5 text-yellow-400 mx-auto" />;
}

export default function ComparePage() {
  return (
    <div>
      {/* Hero with photo */}
      <section className="relative overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=1800&q=80"
          alt="Team comparing options at a whiteboard"
          className="w-full h-[360px] sm:h-[420px] object-cover"
          loading="eager"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#07080a]/90 via-[#07080a]/70 to-transparent" />
        <div className="absolute inset-0 flex items-center">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
            <div className="max-w-2xl">
              <span className="chip chip-accent mb-5">
                Compare
              </span>
              <h1 className="mt-3 text-4xl sm:text-6xl font-semibold text-[var(--ink)] tracking-[-0.03em]">
                AgentFarm vs{" "}
                <span className="bg-gradient-to-r from-[var(--accent-blue)] to-[#8dd7ff] bg-clip-text text-transparent">
                  the alternatives
                </span>
              </h1>
              <p className="mt-5 text-xl text-[var(--body-color)] max-w-2xl leading-relaxed">
                Copilot suggests code. Contractors take weeks to hire. Traditional hires
                take months. AgentFarm just ships.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* M2: Score summary cards */}
      <section className="border-b border-[var(--hairline)] bg-[var(--surface)] py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-xs font-semibold uppercase tracking-widest text-[var(--ash)] mb-6">Feature coverage score (out of 20)</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
            {[
              { label: "AgentFarm", score: 20, pct: 100, highlight: true },
              { label: "Full-time Hire", score: 12, pct: 60, highlight: false },
              { label: "Contractor", score: 10, pct: 50, highlight: false },
              { label: "GitHub Copilot", score: 8, pct: 40, highlight: false },
            ].map((item) => (
              <div key={item.label} className={`rounded-2xl p-4 text-center ${item.highlight ? "bg-blue-600 text-white shadow-lg" : "border border-[var(--hairline)] bg-[var(--surface-card)]"}`}>
                <p className={`text-3xl font-bold tabular-nums ${item.highlight ? "text-white" : "text-[var(--ink)]"}`}>{item.score}<span className={`text-sm font-normal ${item.highlight ? "text-blue-200" : "text-[var(--ash)]"}`}>/20</span></p>
                <div className={`mt-2 w-full h-1.5 rounded-full ${item.highlight ? "bg-blue-500/50" : "bg-[var(--surface-el)]"}`}>
                  <div className={`h-1.5 rounded-full ${item.highlight ? "bg-white" : "bg-[var(--mute)]"}`} style={{ width: `${item.pct}%` }} />
                </div>
                <p className={`mt-2 text-xs font-semibold ${item.highlight ? "text-blue-100" : "text-[var(--body-color)]"}`}>{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison table */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b-2 border-[var(--hairline)]">
                <th className="text-left py-4 pr-6 font-semibold text-[var(--mute)] w-1/3">
                  Capability
                </th>
                <th className="py-4 px-4 text-center font-bold text-[var(--ink)] bg-[var(--accent-blue)]/5 rounded-t-xl">
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
                      <span className="text-white font-extrabold text-xs">AF</span>
                    </div>
                    <span className="text-[var(--accent-blue)]">AgentFarm</span>
                  </div>
                </th>
                <th className="py-4 px-4 text-center font-semibold text-[var(--mute)]">
                  GitHub Copilot
                </th>
                <th className="py-4 px-4 text-center font-semibold text-[var(--mute)]">
                  Contractor
                </th>
                <th className="py-4 px-4 text-center font-semibold text-[var(--mute)]">
                  Full-time Hire
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={row.feature}
                  className={`border-b border-[var(--hairline)] hover:bg-[var(--surface-el)] transition-colors ${i % 2 === 0 ? "" : ""}`}
                >
                  <td className="py-3.5 pr-6 text-[var(--body-color)]">{row.feature}</td>
                  <td className="py-3.5 px-4 bg-[var(--accent-blue)]/5 text-center">
                    <Cell v={row.AgentFarm} />
                  </td>
                  <td className="py-3.5 px-4 text-center"><Cell v={row.copilot} /></td>
                  <td className="py-3.5 px-4 text-center"><Cell v={row.contractor} /></td>
                  <td className="py-3.5 px-4 text-center"><Cell v={row.hiring} /></td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Legend */}
          <div className="mt-6 flex flex-wrap items-center gap-5 text-xs text-[var(--mute)]">
            <span className="flex items-center gap-1.5"><CheckCircle className="w-4 h-4 text-green-500" /> Full support</span>
            <span className="flex items-center gap-1.5"><MinusCircle className="w-4 h-4 text-yellow-400" /> Partial / limited</span>
            <span className="flex items-center gap-1.5"><XCircle className="w-4 h-4 text-[var(--ash)]" /> Not supported</span>
          </div>
        </div>
      </section>

      {/* Cost comparison */}
      <section className="bg-[var(--surface)] py-20 border-t border-[var(--hairline)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)] text-center mb-12">
            Annual cost per engineering resource
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
            {[
              { label: "AgentFarm AI Worker", cost: "$1,188", sub: "$99/mo × 12", highlight: true },
              { label: "GitHub Copilot", cost: "$228", sub: "suggest-only, no execution" },
              { label: "Contractor", cost: "$80,000+", sub: "part-time, varies widely" },
              { label: "Senior SWE Hire", cost: "$180,000+", sub: "salary + benefits + equity" },
            ].map((item) => (
              <div
                key={item.label}
                className={`rounded-2xl p-5 text-center hover:-translate-y-1 transition-all ${item.highlight
                  ? "bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-xl ring-2 ring-blue-400"
                  : "bg-[var(--surface-card)] border border-[var(--hairline)]"
                  }`}
              >
                <p className={`text-3xl font-extrabold ${item.highlight ? "text-white" : "text-[var(--ink)]"}`}>
                  {item.cost}
                </p>
                <p className={`text-xs mt-1 font-semibold ${item.highlight ? "text-blue-100" : "text-[var(--mute)]"}`}>
                  {item.label}
                </p>
                <p className={`text-xs mt-1 ${item.highlight ? "text-blue-200" : "text-[var(--ash)]"}`}>
                  {item.sub}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)] mb-3">
            Ready to switch to autonomous AI workers?
          </h2>
          <p className="text-[var(--mute)] mb-8">The most capable, most affordable option. By far.</p>
          <ButtonLink href="/#waitlist" size="lg">
            Join the Waitlist
          </ButtonLink>
        </div>
      </section>
    </div>
  );
}



