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
  if (v === "no") return <XCircle className="w-5 h-5 text-slate-300 mx-auto" />;
  return <MinusCircle className="w-5 h-5 text-yellow-400 mx-auto" />;
}

export default function ComparePage() {
  return (
    <div className="site-shell">
      {/* Hero with photo */}
      <section className="relative overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=1800&q=80"
          alt="Team comparing options at a whiteboard"
          className="w-full h-[360px] sm:h-[420px] object-cover"
          loading="eager"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-blue-900/90 via-slate-900/70 to-transparent" />
        <div className="absolute inset-0 flex items-center">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
            <div className="max-w-2xl">
              <span className="inline-flex text-xs font-semibold uppercase tracking-wider text-blue-300 bg-white/10 backdrop-blur border border-white/20 px-3 py-1.5 rounded-full mb-5">
                Compare
              </span>
              <h1 className="mt-3 text-4xl sm:text-6xl font-extrabold text-white tracking-tight">
                AgentFarm vs{" "}
                <span className="bg-gradient-to-r from-blue-300 to-indigo-300 bg-clip-text text-transparent">
                  the alternatives
                </span>
              </h1>
              <p className="mt-5 text-xl text-slate-300 max-w-2xl leading-relaxed">
                Copilot suggests code. Contractors take weeks to hire. Traditional hires
                take months. AgentFarm just ships.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Comparison table */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b-2 border-slate-200 dark:border-slate-700">
                <th className="text-left py-4 pr-6 font-semibold text-slate-500 dark:text-slate-400 w-1/3">
                  Capability
                </th>
                <th className="py-4 px-4 text-center font-bold text-slate-900 dark:text-slate-100 bg-gradient-to-b from-blue-50 to-blue-50/50 dark:from-blue-950/50 dark:to-blue-950/20 rounded-t-xl">
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
                      <span className="text-white font-extrabold text-xs">AF</span>
                    </div>
                    <span className="text-blue-600">AgentFarm</span>
                  </div>
                </th>
                <th className="py-4 px-4 text-center font-semibold text-slate-500 dark:text-slate-400">
                  GitHub Copilot
                </th>
                <th className="py-4 px-4 text-center font-semibold text-slate-500 dark:text-slate-400">
                  Contractor
                </th>
                <th className="py-4 px-4 text-center font-semibold text-slate-500 dark:text-slate-400">
                  Full-time Hire
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={row.feature}
                  className={`border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors ${i % 2 === 0 ? "" : "bg-slate-50/30 dark:bg-slate-800/10"}`}
                >
                  <td className="py-3.5 pr-6 text-slate-700 dark:text-slate-300">{row.feature}</td>
                  <td className="py-3.5 px-4 bg-blue-50/50 dark:bg-blue-950/30 text-center">
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
          <div className="mt-6 flex flex-wrap items-center gap-5 text-xs text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1.5"><CheckCircle className="w-4 h-4 text-green-500" /> Full support</span>
            <span className="flex items-center gap-1.5"><MinusCircle className="w-4 h-4 text-yellow-400" /> Partial / limited</span>
            <span className="flex items-center gap-1.5"><XCircle className="w-4 h-4 text-slate-300" /> Not supported</span>
          </div>
        </div>
      </section>

      {/* Cost comparison */}
      <section className="bg-slate-50 dark:bg-slate-900/50 py-20 border-t border-slate-100 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 text-center mb-12">
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
                  : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm"
                  }`}
              >
                <p className={`text-3xl font-extrabold ${item.highlight ? "text-white" : "text-slate-900 dark:text-slate-100"}`}>
                  {item.cost}
                </p>
                <p className={`text-xs mt-1 font-semibold ${item.highlight ? "text-blue-100" : "text-slate-500 dark:text-slate-400"}`}>
                  {item.label}
                </p>
                <p className={`text-xs mt-1 ${item.highlight ? "text-blue-200" : "text-slate-400 dark:text-slate-500"}`}>
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
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-3">
            Ready to switch to autonomous AI workers?
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mb-8">The most capable, most affordable option. By far.</p>
          <ButtonLink href="/#waitlist" size="lg">
            Join the Waitlist
          </ButtonLink>
        </div>
      </section>
    </div>
  );
}



