import type { Metadata } from "next";
import { Code2, TestTube2, Server, Layout, Rocket, Users, PenLine, DollarSign, UserCheck, MessageCircle, ShieldCheck, Database, CheckCircle2 } from "lucide-react";
import ButtonLink from "@/components/shared/ButtonLink";

export const metadata: Metadata = {
  title: "Use Cases — AgentFarm",
  description: "Real-world examples of how engineering teams use AgentFarm AI workers to ship faster.",
};

const cases = [
  {
    icon: Rocket,
    audience: "Solo Founders",
    headline: "Ship an MVP in days, not months",
    story:
      "A solo founder with a design background and no engineering team hired a AgentFarm Backend Developer and Frontend Developer. Within 6 days they had a working MVP with authentication, a REST API, and a React dashboard — shipped to production.",
    results: [
      "MVP shipped in 6 days",
      "Zero engineers hired",
      "~$200 total cost",
      "37 PRs merged autonomously",
    ],
    color: "blue",
    image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=800&q=80",
  },
  {
    icon: TestTube2,
    audience: "Startups (5–20 engineers)",
    headline: "Replace your QA contractor with an AI QA Engineer",
    story:
      "A 10-person Series A startup was spending $7,500/month on a part-time QA contractor. They replaced them with AgentFarm's QA Engineer. Test coverage went from 61% to 94% in 3 weeks, and every PR now has automated regression tests.",
    results: [
      "Coverage: 61% → 94%",
      "Saved $7,500/month",
      "Every PR tested automatically",
      "0 regressions shipped since",
    ],
    color: "green",
    image: "https://images.unsplash.com/photo-1516116216624-53e697fedbea?auto=format&fit=crop&w=800&q=80",
  },
  {
    icon: Code2,
    audience: "Scale-ups (20–100 engineers)",
    headline: "Double velocity without doubling headcount",
    story:
      "A 30-person engineering team was struggling with feature backlog. They deployed 5 AI Backend Developers to handle boilerplate feature work — CRUD endpoints, data migrations, webhook handlers. Their human engineers now focus entirely on architecture and product.",
    results: [
      "Feature velocity ×2.1",
      "Backlog cleared in 8 weeks",
      "5 AI workers, not 5 hires",
      "$49,500/yr vs $900,000/yr",
    ],
    color: "purple",
    image: "https://images.unsplash.com/photo-1518773553398-650c184e0bb3?auto=format&fit=crop&w=800&q=80",
  },
  {
    icon: Server,
    audience: "DevOps-heavy teams",
    headline: "Automate on-call and infrastructure toil",
    story:
      "A cloud-native company's DevOps team was drowning in Terraform drift alerts, pipeline failures, and Kubernetes incidents. Their AI DevOps Engineer now auto-triages 80% of alerts, fixes common Terraform drift, and restarts failed pods — before a human even wakes up.",
    results: [
      "80% of alerts auto-resolved",
      "Mean time to recovery: -70%",
      "MTTR from 45min to 9min",
      "On-call stress dramatically reduced",
    ],
    color: "orange",
    image: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=800&q=80",
  },
  {
    icon: Layout,
    audience: "Design-led teams",
    headline: "Turn Figma designs into working components — same day",
    story:
      "A product team with strong design but a small frontend team struggled to convert Figma mockups into React components fast enough. Their AI Frontend Developer translates design specs into Tailwind-styled, accessible React components in hours, not sprint cycles.",
    results: [
      "Design-to-code: days → hours",
      "Fully accessible components",
      "Storybook stories auto-generated",
      "Design debt cleared in 2 sprints",
    ],
    color: "pink",
    image: "https://images.unsplash.com/photo-1547658719-da2b51169166?auto=format&fit=crop&w=800&q=80",
  },
  {
    icon: Users,
    audience: "Agencies & Consultancies",
    headline: "Scale client delivery without scaling headcount",
    story:
      "A 15-person dev agency uses AgentFarm to staff AI workers on client projects. They can take on 3× more projects with the same team, using AI workers for backend APIs and test suites while human engineers handle architecture and client relationships.",
    results: [
      "3× client capacity",
      "Same headcount",
      "Per-project AI staffing",
      "Margin improved significantly",
    ],
    color: "teal",
    image: "https://images.unsplash.com/photo-1600880292203-757bb62b4baf?auto=format&fit=crop&w=800&q=80",
  },
  {
    icon: PenLine,
    audience: "Marketing Teams",
    headline: "Ship more content without burning out your team",
    story:
      "A growth-stage SaaS company's 3-person marketing team was struggling to keep up with blog posts, email campaigns, and SEO work. They deployed an AI Content Writer and AI SEO Specialist. Content output tripled, organic traffic grew 58% in 90 days, and the team finally had time for strategy.",
    results: [
      "Content output ×3",
      "Organic traffic +58%",
      "Email open rate +22%",
      "Team focused on strategy",
    ],
    color: "pink",
    image: "https://images.unsplash.com/photo-1533750516457-a7f992034fec?auto=format&fit=crop&w=800&q=80",
  },
  {
    icon: DollarSign,
    audience: "Finance & Ops Teams",
    headline: "Automate reporting and spend analysis",
    story:
      "A mid-market company's finance team was spending 12 hours a week building manual spend reports in Excel. Their AI Finance Analyst now pulls data from QuickBooks, builds variance reports, flags budget overruns automatically, and drafts the CFO board packet every quarter.",
    results: [
      "12hrs/week reclaimed",
      "CFO reports auto-drafted",
      "Budget overruns caught early",
      "Audit-ready trail",
    ],
    color: "green",
    image: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=800&q=80",
  },
  {
    icon: UserCheck,
    audience: "HR & People Teams",
    headline: "Hire faster without compromising on fit",
    story:
      "A fast-growing startup was taking 8 weeks to fill senior engineer roles. Their AI Technical Recruiter screens inbound applications, schedules first-round calls, writes structured feedback notes, and drafts offer letters — cutting time-to-hire from 8 weeks to 18 days.",
    results: [
      "Time-to-hire: 8 wks → 18 days",
      "100% of applicants screened",
      "Offer letters in minutes",
      "HR focuses on top candidates",
    ],
    color: "blue",
    image: "https://images.unsplash.com/photo-1521791136064-7986c2920216?auto=format&fit=crop&w=800&q=80",
  },
  {
    icon: MessageCircle,
    audience: "Customer Success Teams",
    headline: "Scale support without scaling headcount",
    story:
      "A B2B SaaS company with 500 customers was managing support through a 2-person team. They deployed an AI Customer Support Agent to handle tier-1 issues and an AI Customer Success Manager to run quarterly business reviews. CSAT went from 72 to 91.",
    results: [
      "CSAT: 72 → 91",
      "Tier-1 tickets auto-resolved",
      "QBRs run automatically",
      "Churn rate down 31%",
    ],
    color: "orange",
    image: "https://images.unsplash.com/photo-1556740749-887f6717d7e4?auto=format&fit=crop&w=800&q=80",
  },
  {
    icon: ShieldCheck,
    audience: "Security-conscious teams",
    headline: "Catch vulnerabilities before they ship",
    story:
      "A fintech team was relying on quarterly pen tests to find security issues. Their AI Security Engineer now runs OWASP scans on every PR, tracks vulnerable dependencies daily, and generates security regression tests — shifting security left so issues are caught in seconds, not months.",
    results: [
      "OWASP scan every PR",
      "Critical vulns down 94%",
      "Dependency alerts automated",
      "Security test coverage ×4",
    ],
    color: "purple",
    image: "https://images.unsplash.com/photo-1555949963-ff9fe0c870eb?auto=format&fit=crop&w=800&q=80",
  },
  {
    icon: Database,
    audience: "Data teams",
    headline: "Turn raw data into decisions, automatically",
    story:
      "A mid-stage startup's data team was bottlenecked: analysts spent 60% of their time writing ad-hoc SQL queries for stakeholders. Their AI Data Analyst now handles routine reporting queries, builds Looker dashboards from specs, and auto-generates weekly business health reports.",
    results: [
      "60% of ad-hoc queries automated",
      "Weekly reports auto-generated",
      "Analysts focus on insights",
      "Stakeholder SLA: 2 days → 2 hours",
    ],
    color: "teal",
    image: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=800&q=80",
  },
];

const colorMap: Record<string, { bg: string; icon: string; badge: string }> = {
  blue: { bg: "bg-blue-50", icon: "text-blue-600", badge: "bg-blue-100 text-blue-700" },
  green: { bg: "bg-green-50", icon: "text-green-600", badge: "bg-green-100 text-green-700" },
  purple: { bg: "bg-purple-50", icon: "text-purple-600", badge: "bg-purple-100 text-purple-700" },
  orange: { bg: "bg-orange-50", icon: "text-orange-600", badge: "bg-orange-100 text-orange-700" },
  pink: { bg: "bg-pink-50", icon: "text-pink-600", badge: "bg-pink-100 text-pink-700" },
  teal: { bg: "bg-teal-50", icon: "text-teal-600", badge: "bg-teal-100 text-teal-700" },
  red: { bg: "bg-red-50", icon: "text-red-600", badge: "bg-red-100 text-red-700" },
};

export default function UseCasesPage() {
  return (
    <div className="site-shell">
      {/* Hero with real photo */}
      <section className="relative overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1800&q=80"
          alt="Engineering teams collaborating across company stages"
          className="w-full h-[400px] sm:h-[480px] object-cover"
          loading="eager"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-orange-900/85 via-slate-900/70 to-transparent" />
        <div className="absolute inset-0 flex items-center">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
            <div className="max-w-2xl">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-orange-300 bg-white/10 backdrop-blur border border-white/20 px-3 py-1.5 rounded-full mb-5">
                Use Cases
              </span>
              <h1 className="mt-3 text-4xl sm:text-6xl font-extrabold text-white tracking-tight">
                Built for every{" "}
                <span className="bg-gradient-to-r from-orange-300 via-red-300 to-pink-300 bg-clip-text text-transparent">
                  stage of growth
                </span>
              </h1>
              <p className="mt-5 text-xl text-slate-300 max-w-2xl leading-relaxed">
                From solo founders to 100-person engineering teams — see exactly
                how AgentFarm fits your workflow and the results teams are getting.
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
                  className="border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all bg-white dark:bg-slate-900"
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
                    <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-3">{headline}</h2>
                    <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed mb-5">{story}</p>
                    <div className="grid grid-cols-2 gap-2">
                      {results.map((r) => (
                        <div key={r} className="flex items-start gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                          <p className="text-xs text-slate-600 dark:text-slate-300">{r}</p>
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


