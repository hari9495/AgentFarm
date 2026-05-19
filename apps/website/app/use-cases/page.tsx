import type { Metadata } from "next";
import { Code2, Megaphone, HeadphonesIcon, Users, ShieldCheck, CheckCircle2, Briefcase, BarChart3 } from "lucide-react";
import ButtonLink from "@/components/shared/ButtonLink";


export const metadata: Metadata = {
  title: "Use Cases — AgentFarm",
  description: "Real-world examples of how companies across every department use AgentFarm AI workers to ship faster with full human oversight.",
};

const cases = [
  {
    icon: Code2,
    audience: "Engineering Teams",
    headline: "Ship features without drowning in PR overhead",
    story:
      "A 20-person engineering team deployed a Developer Agent and Tester Agent pair. The Developer opens PRs, the Tester runs CI and fixes failures — engineers focus on architecture and review. Every action logged, every PR approval-gated.",
    results: [
      "PR cycle time cut by 60%",
      "CI failures resolved automatically",
      "Full audit trail per release",
      "Engineers focus on design, not drudgery",
    ],
    color: "blue",
    image: "https://images.unsplash.com/photo-1518773553398-650c184e0bb3?auto=format&fit=crop&w=800&q=80",
  },
  {
    icon: Megaphone,
    audience: "Sales & Marketing",
    headline: "Outreach that never misses a follow-up",
    story:
      "A Series B SaaS company deployed a Sales Rep Agent and Marketing Specialist Agent. The Sales Rep manages CRM updates, follow-up emails, and meeting prep — the Marketing Specialist drafts campaigns, schedules posts, and tracks results. Human reps approve every send.",
    results: [
      "Pipeline coverage up 3×",
      "Zero missed follow-ups",
      "Campaigns launched 5× faster",
      "Every outbound approved before send",
    ],
    color: "orange",
    image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=800&q=80",
  },
  {
    icon: HeadphonesIcon,
    audience: "Customer Support",
    headline: "24/7 support without a 24/7 headcount",
    story:
      "A consumer fintech deployed a Customer Support Executive Agent that handles Tier 1 tickets via email and chat — checking order status, processing refunds, drafting complex replies for human review. Escalations route to humans in real time.",
    results: [
      "Tier 1 tickets resolved in <2 min",
      "Support team handles 3× more volume",
      "Escalations flagged instantly",
      "Full ticket history in the audit trail",
    ],
    color: "green",
    image: "https://images.unsplash.com/photo-1611532736597-de2d4265fba3?auto=format&fit=crop&w=800&q=80",
  },
  {
    icon: Briefcase,
    audience: "Operations & Admin",
    headline: "Every recurring task handled, every deadline met",
    story:
      "An operations-heavy company deployed a Corporate Assistant Agent that manages calendar invites, meeting notes, vendor follow-ups, and internal report compilation. The team stopped losing hours to scheduling and copy-paste work.",
    results: [
      "15 hrs/week saved per ops manager",
      "Zero missed scheduling conflicts",
      "Reports generated automatically",
      "All actions logged for review",
    ],
    color: "purple",
    image: "https://images.unsplash.com/photo-1516116216624-53e697fedbea?auto=format&fit=crop&w=800&q=80",
  },
  {
    icon: Users,
    audience: "HR & Recruiting",
    headline: "Source, screen, and schedule without the overhead",
    story:
      "A fast-growing startup deployed a Recruiter Agent that sourced candidates, screened CVs, scheduled interviews, and drafted offer letters — all under HR team oversight. Human recruiters handled final calls and decisions.",
    results: [
      "Time-to-screen cut from days to hours",
      "Hiring pipeline 2× more candidates",
      "Offer letters drafted in minutes",
      "Every decision logged with rationale",
    ],
    color: "pink",
    image: "https://images.unsplash.com/photo-1521791136064-7986c2920216?auto=format&fit=crop&w=800&q=80",
  },
  {
    icon: ShieldCheck,
    audience: "Enterprise & Regulated Industries",
    headline: "Autonomous execution with enterprise-grade governance",
    story:
      "A regulated enterprise deployed AI workers across Engineering, Legal, and Finance — each with role-scoped tool access and a strict approval policy. LOW-risk tasks auto-execute. HIGH-risk changes pause for human sign-off via Teams. Every action is logged in the evidence plane.",
    results: [
      "Full audit trail for every agent action",
      "Approval gates on all high-risk changes",
      "Teams notifications for escalations",
      "Compliance evidence exported on demand",
    ],
    color: "teal",
    image: "https://images.unsplash.com/photo-1555949963-ff9fe0c870eb?auto=format&fit=crop&w=800&q=80",
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
              <h1 className="mt-3 text-4xl sm:text-6xl font-semibold text-white tracking-[-0.03em]">
                Built for{" "}
                <span className="bg-gradient-to-r from-[var(--accent-red)] via-[#ff6161] to-pink-400 bg-clip-text text-transparent">
                  every department
                </span>
              </h1>
              <p className="mt-5 text-xl text-slate-300 max-w-2xl leading-relaxed">
                From solo founders to enterprise teams — see how AgentFarm AI workers handle real work across Engineering, Sales, Support, Ops, HR, and more.
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
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">How much could your company save?</h2>
            <p className="text-[var(--mute)] text-sm mt-2 max-w-lg mx-auto">Based on median outcomes across AgentFarm customers. Actual results vary by role and workflow.</p>
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              { tier: "1–3 AI workers", hours: "15–25 hrs/wk", cost: "$24k–$40k/yr", note: "Equivalent to replacing 40% of a full-time role" },
              { tier: "4–10 AI workers", hours: "80–150 hrs/wk", cost: "$128k–$240k/yr", note: "Equivalent to 2–3 full-time headcount" },
              { tier: "10+ AI workers", hours: "300–600 hrs/wk", cost: "$480k–$960k/yr", note: "Equivalent to 7–15 full-time employees" },
            ].map(({ tier, hours, cost, note }) => (
              <div key={tier} className="rounded-2xl border border-[var(--hairline)] bg-[var(--surface-card)] p-5">
                <p className="text-xs font-semibold text-[var(--mute)] mb-3">{tier}</p>
                <p className="text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)] leading-none">{hours}</p>
                <p className="text-xs text-[var(--accent-blue)] font-semibold mt-1">{cost} saved</p>
                <p className="text-xs text-[var(--ash)] mt-2 leading-snug">{note}</p>
              </div>
            ))}
          </div>
          <p className="text-center text-[11px] text-[var(--ash)] mt-5">Estimate based on $80/hr blended labor cost across all role types and median AgentFarm automation rates.</p>
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
                Which departments would you staff first?
              </h2>
              <p className="text-slate-300 mb-8 max-w-xl mx-auto">
                Join the waitlist and we&apos;ll help you deploy the right AI workers for your specific team and workflow.
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


