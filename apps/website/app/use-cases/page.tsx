import type { Metadata } from "next";
import { Code2, TestTube2, Server, Rocket, Users, ShieldCheck, CheckCircle2 } from "lucide-react";
import ButtonLink from "@/components/shared/ButtonLink";


export const metadata: Metadata = {
  title: "Use Cases — AgentFarm",
  description: "Real-world examples of how engineering teams use AgentFarm's Developer Agent to ship faster, safer, and with a full audit trail.",
};

const cases = [
  {
    icon: Rocket,
    audience: "Solo Founders",
    headline: "Ship an MVP in days, not months",
    story:
      "A solo founder with no engineering background activated the Developer Agent and installed Create PR, Run CI Checks, and Fix Test Failures skills. Within 6 days they had a working REST API and dashboard shipped to production — every change approved and logged.",
    results: [
      "MVP shipped in 6 days",
      "No additional headcount needed",
      "All changes reviewed and approved",
      "Full evidence trail from day one",
    ],
    color: "blue",
    image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=800&q=80",
  },
  {
    icon: TestTube2,
    audience: "Startups (5–20 engineers)",
    headline: "Stop losing hours to CI failures and flaky tests",
    story:
      "A 10-person Series A startup was spending 3+ hours per week diagnosing CI failures. With the Run CI Checks and Fix Test Failures skills, the Developer Agent identifies failures, diagnoses root cause, and pushes a targeted fix — before the developer even refreshes the PR.",
    results: [
      "CI failure resolution: hours → minutes",
      "Test coverage improved across repos",
      "Every PR gated automatically",
      "Developers stop babysitting CI",
    ],
    color: "green",
    image: "https://images.unsplash.com/photo-1516116216624-53e697fedbea?auto=format&fit=crop&w=800&q=80",
  },
  {
    icon: Code2,
    audience: "Scale-ups (20–100 engineers)",
    headline: "PR review and release notes without the bottleneck",
    story:
      "A 30-person engineering team was bottlenecked on PR reviews and release documentation. With PR Review Prepare and Release Notes Generate skills, the Developer Agent creates structured review summaries and auto-generates CHANGELOG entries from every merged PR.",
    results: [
      "PR review time cut by 40%",
      "Release notes generated automatically",
      "Every release audit-ready",
      "Reviewer fatigue dramatically reduced",
    ],
    color: "purple",
    image: "https://images.unsplash.com/photo-1518773553398-650c184e0bb3?auto=format&fit=crop&w=800&q=80",
  },
  {
    icon: Server,
    audience: "DevOps-heavy teams",
    headline: "Automate dependency upgrades and incident patches",
    story:
      "A cloud-native company's DevOps team was drowning in dependency alerts and incident patch work. With the Dependency Upgrade Plan and Incident Patch Pack skills, the Developer Agent generates upgrade plans and patch PRs — humans review and approve before anything merges.",
    results: [
      "Dependency backlog cleared in 2 weeks",
      "Incident patch packs auto-generated",
      "Human approval required before merge",
      "Full audit log for every change",
    ],
    color: "orange",
    image: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=800&q=80",
  },
  {
    icon: ShieldCheck,
    audience: "Security-conscious teams",
    headline: "Catch vulnerabilities before they ship",
    story:
      "A fintech team was relying on quarterly pen tests to find security issues. With the Security Fix Suggest and Dependency Upgrade Plan skills, the agent flags vulnerable dependencies and generates targeted security patches on every PR — shifting security left to seconds, not months.",
    results: [
      "Security check on every PR",
      "Dependency alerts automated",
      "Vulnerable deps patched same sprint",
      "Audit evidence exported per release",
    ],
    color: "pink",
    image: "https://images.unsplash.com/photo-1555949963-ff9fe0c870eb?auto=format&fit=crop&w=800&q=80",
  },
  {
    icon: Users,
    audience: "Enterprise engineering teams",
    headline: "Autonomous execution with enterprise-grade governance",
    story:
      "A regulated enterprise needed AI assistance but couldn't accept uncontrolled code changes. AgentFarm's risk-classification model gives them exactly that: LOW-risk actions auto-execute, HIGH-risk changes pause for human approval via Microsoft Teams. Every action is logged in the evidence plane for compliance.",
    results: [
      "Full audit trail for every agent action",
      "Approval gates on all high-risk changes",
      "Teams notifications for approvals",
      "Compliance evidence exported on demand",
    ],
    color: "teal",
    image: "https://images.unsplash.com/photo-1521791136064-7986c2920216?auto=format&fit=crop&w=800&q=80",
  },
];

const colorMap: Record<string, { bg: string; icon: string; badge: string }> = {
  blue: { bg: "bg-[var(--accent-blue)]/10", icon: "text-[var(--accent-blue)]", badge: "bg-[var(--accent-blue)]/10 text-[var(--accent-blue)]" },
  green: { bg: "bg-[var(--accent-green)]/10", icon: "text-[var(--accent-green)]", badge: "bg-[var(--accent-green)]/10 text-[var(--accent-green)]" },
  purple: { bg: "bg-purple-500/10", icon: "text-purple-400", badge: "bg-purple-500/10 text-purple-400" },
  orange: { bg: "bg-orange-500/10", icon: "text-orange-400", badge: "bg-orange-500/10 text-orange-400" },
  pink: { bg: "bg-pink-500/10", icon: "text-pink-400", badge: "bg-pink-500/10 text-pink-400" },
  teal: { bg: "bg-teal-500/10", icon: "text-teal-400", badge: "bg-teal-500/10 text-teal-400" },
  red: { bg: "bg-red-500/10", icon: "text-red-400", badge: "bg-red-500/10 text-red-400" },
};

export default function UseCasesPage() {
  return (
    <div>
      {/* Hero with real photo */}
      <section className="relative overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1800&q=80"
          alt="Engineering teams collaborating across company stages"
          className="w-full h-[400px] sm:h-[480px] object-cover"
          loading="eager"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#07080a]/85 via-[#07080a]/70 to-transparent" />
        <div className="absolute inset-0 flex items-center">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
            <div className="max-w-2xl">
              <span className="chip chip-accent mb-5">
                Use Cases
              </span>
              <h1 className="mt-3 text-4xl sm:text-6xl font-semibold text-[var(--ink)] tracking-[-0.03em]">
                Built for{" "}
                <span className="bg-gradient-to-r from-[var(--accent-red)] via-[#ff6161] to-pink-400 bg-clip-text text-transparent">
                  engineering teams
                </span>
              </h1>
              <p className="mt-5 text-xl text-[var(--mute)] max-w-2xl leading-relaxed">
                From solo founders to 100-person engineering orgs — see how AgentFarm's Developer Agent ships real work with approval gates and a full audit trail.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Cases with images */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {cases.map(({ icon: Icon, audience, headline, story, results, color, image }) => {
              const c = colorMap[color];
              return (
                <div
                  key={headline}
                  className="border border-[var(--hairline)] rounded-2xl overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all bg-[var(--surface-card)]"
                >
                  {/* Cover image */}
                  <div className="relative h-44 overflow-hidden">
                    <img
                      src={image}
                      alt={headline}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    <div className="absolute bottom-3 left-4 flex items-center gap-2">
                      <div className={`w-9 h-9 rounded-xl ${c.bg} flex items-center justify-center`}>
                        <Icon className={`w-5 h-5 ${c.icon}`} />
                      </div>
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${c.badge}`}>
                        {audience}
                      </span>
                    </div>
                  </div>
                  <div className="p-6">
                    <h2 className="text-xl font-semibold text-[var(--ink)] mb-3">{headline}</h2>
                    <p className="text-[var(--mute)] text-sm leading-relaxed mb-5">{story}</p>
                    <div className="grid grid-cols-2 gap-2">
                      {results.map((r) => (
                        <div key={r} className="flex items-start gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                          <p className="text-xs text-[var(--body-color)]">{r}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ROI Calculator */}
      <section className="py-16 bg-[var(--surface)] border-y border-[var(--hairline)]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <p className="text-xs font-semibold uppercase tracking-widest text-[var(--accent-blue)] mb-2">ROI estimate</p>
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">How much could your team save?</h2>
            <p className="text-[var(--mute)] text-sm mt-2 max-w-lg mx-auto">Based on median outcomes across AgentFarm customers. Actual results vary by workflow.</p>
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              { tier: "Solo / 1–3 engineers", hours: "15–25 hrs/wk", cost: "$24k–$40k/yr", note: "Equivalent to 40% of a full-time junior engineer" },
              { tier: "Startup / 5–20 engineers", hours: "60–100 hrs/wk", cost: "$96k–$160k/yr", note: "Equivalent to 1.5–2.5 full-time engineers" },
              { tier: "Scale-up / 25–100 engineers", hours: "200–350 hrs/wk", cost: "$320k–$560k/yr", note: "Equivalent to 5–9 full-time engineers" },
            ].map(({ tier, hours, cost, note }) => (
              <div key={tier} className="rounded-2xl border border-[var(--hairline)] bg-[var(--surface-card)] p-5">
                <p className="text-xs font-semibold text-[var(--mute)] mb-3">{tier}</p>
                <p className="text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)] leading-none">{hours}</p>
                <p className="text-xs text-[var(--accent-blue)] font-semibold mt-1">{cost} saved</p>
                <p className="text-xs text-[var(--ash)] mt-2 leading-snug">{note}</p>
              </div>
            ))}
          </div>
          <p className="text-center text-[11px] text-[var(--ash)] mt-5">Estimate based on $80/hr blended engineering cost and median AgentFarm task automation rates.</p>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl">
            <img
              src="https://images.unsplash.com/photo-1542744173-8e7e53415bb0?auto=format&fit=crop&w=1800&q=80"
              alt="Team strategizing together"
              className="absolute inset-0 w-full h-full object-cover"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-br from-slate-900/90 via-blue-900/85 to-slate-900/90" />
            <div className="relative py-20 px-10 text-center text-white">
              <h2 className="text-3xl font-extrabold mb-4">
                Which use case fits you?
              </h2>
              <p className="text-slate-300 mb-8 max-w-xl mx-auto">
                Join the waitlist and we&apos;ll set up the right AI workers for your specific team and workflow.
              </p>
              <ButtonLink href="/#waitlist" size="lg">
                Join the Waitlist
              </ButtonLink>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}


