import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle, Circle, Clock } from "lucide-react";

export const metadata: Metadata = {
  title: "Changelog & Roadmap — AgentFarm",
  description: "What we've shipped, what's in progress, and what's coming next.",
};

type Status = "shipped" | "in-progress" | "planned";

interface Entry {
  date: string;
  version?: string;
  title: string;
  description: string;
  status: Status;
  tags: string[];
}

const entries: Entry[] = [
  {
    date: "March 2026",
    version: "v0.5",
    title: "32-role marketplace with department filters",
    description:
      "Expanded the marketplace to 32 AI worker roles across 14 departments — from Engineering and DevOps to Marketing, Finance, HR, and Customer Success. New department & availability filters make it easy to find the right worker.",
    status: "shipped",
    tags: ["Marketplace", "UX", "Roles"],
  },
  {
    date: "March 2026",
    version: "v0.4.2",
    title: "Analytics dashboard",
    description:
      "New dashboard analytics page showing task volume trends, PR merge rates, per-bot performance tables, and estimated monthly cost savings vs equivalent contractors.",
    status: "shipped",
    tags: ["Dashboard", "Analytics"],
  },
  {
    date: "March 2026",
    version: "v0.4.1",
    title: "Bot config & task history (database-backed)",
    description:
      "Bot configuration and task logs are now persisted in a Prisma/SQLite database. Config survives page reloads; task history shows status, timestamps, and output across sessions.",
    status: "shipped",
    tags: ["Dashboard", "Core", "Database"],
  },
  {
    date: "March 2026",
    version: "v0.4",
    title: "Robot Marketplace launch",
    description:
      "Browse, hire, and configure AI workers from the marketplace. 4 roles available at launch: Backend Dev, Frontend Dev, QA Engineer, DevOps Engineer.",
    status: "shipped",
    tags: ["Marketplace", "UX"],
  },
  {
    date: "March 2026",
    version: "v0.3",
    title: "Jira integration",
    description:
      "AI workers can now receive task assignments directly from Jira tickets. Supports Jira Cloud with project-level scoping.",
    status: "shipped",
    tags: ["Integration", "Jira"],
  },
  {
    date: "February 2026",
    version: "v0.2",
    title: "Slack task assignment",
    description:
      "Assign tasks to AI workers by mentioning them in any Slack channel. Workers reply with progress updates and PR links.",
    status: "shipped",
    tags: ["Integration", "Slack"],
  },
  {
    date: "January 2026",
    version: "v0.1",
    title: "Initial GitHub integration",
    description:
      "Connect repositories via GitHub OAuth. AI workers can read, write, and open pull requests with full branch management.",
    status: "shipped",
    tags: ["Integration", "GitHub", "Launch"],
  },
  {
    date: "Q2 2026",
    title: "AI Security Engineer",
    description:
      "Automated OWASP scanning on every PR, dependency vulnerability tracking, and security test generation.",
    status: "in-progress",
    tags: ["Security", "New Role"],
  },
  {
    date: "Q2 2026",
    title: "AI Database Administrator",
    description:
      "Slow query analysis, schema migration assistance, and index health monitoring across PostgreSQL and MySQL.",
    status: "in-progress",
    tags: ["Database", "New Role"],
  },
  {
    date: "Q2 2026",
    title: "Team accounts & multi-user workspaces",
    description:
      "Invite teammates, assign roles (admin / developer / viewer), and share bot configurations across your organisation.",
    status: "in-progress",
    tags: ["Teams", "Auth"],
  },
  {
    date: "Q2 2026",
    title: "Stripe billing integration",
    description:
      "Full subscription management with Stripe: plan upgrades, seat-based pricing, invoices, and usage-based overages.",
    status: "in-progress",
    tags: ["Billing", "Stripe"],
  },
  {
    date: "Q2 2026",
    title: "Dashboard v1",
    description:
      "Full web dashboard: assign tasks, view worker status, review PRs, and track metrics in one place. Includes team management.",
    status: "planned",
    tags: ["Dashboard", "Core"],
  },
  {
    date: "Q2 2026",
    title: "AI Analytics dashboard (advanced)",
    description:
      "Advanced analytics: custom date ranges, export to CSV, per-project breakdown, and anomaly detection for bot task failures.",
    status: "planned",
    tags: ["Analytics", "Dashboard"],
  },
  {
    date: "Q3 2026",
    title: "GitLab support",
    description: "Full GitLab integration with merge request management, CI/CD pipeline triggers, and GitLab Issues.",
    status: "planned",
    tags: ["Integration", "GitLab"],
  },
  {
    date: "Q3 2026",
    title: "AI ML Engineer",
    description:
      "Automated model training pipelines, evaluation dashboards, and cloud deployment for ML/AI projects.",
    status: "planned",
    tags: ["ML", "New Role"],
  },
  {
    date: "Q3 2026",
    title: "Custom workflow rules",
    description:
      "Build no-code automation rules: 'When a Jira ticket is moved to In Progress, assign to backend-dev-01 and notify in Slack.'",
    status: "planned",
    tags: ["Automation", "Pro"],
  },
  {
    date: "Q3 2026",
    title: "HubSpot & Salesforce integration",
    description:
      "Let AI Marketing and Customer Success workers sync task outcomes directly into CRM records.",
    status: "planned",
    tags: ["Integration", "CRM"],
  },
  {
    date: "Q4 2026",
    title: "On-premises deployment",
    description: "Run AgentFarm entirely in your own VPC. Full data residency, no external network calls.",
    status: "planned",
    tags: ["Enterprise"],
  },
  {
    date: "Q4 2026",
    title: "SSO / SAML",
    description:
      "Enterprise single sign-on with Okta, Azure AD, and Google Workspace. Team provisioning via SCIM.",
    status: "planned",
    tags: ["Enterprise", "Security"],
  },
];

const statusConfig = {
  shipped: {
    icon: CheckCircle,
    label: "Shipped",
    iconClass: "text-green-500",
    bg: "bg-green-50",
    text: "text-green-700",
  },
  "in-progress": {
    icon: Clock,
    label: "In Progress",
    iconClass: "text-blue-500",
    bg: "bg-blue-50",
    text: "text-blue-700",
  },
  planned: {
    icon: Circle,
    label: "Planned",
    iconClass: "text-slate-300",
    bg: "bg-slate-100",
    text: "text-slate-500",
  },
};

function toVersionSlug(version?: string) {
  if (!version) return null;
  return version.toLowerCase().replace(/\./g, "-");
}

export default function ChangelogPage() {
  const shipped = entries.filter((e) => e.status === "shipped");
  const upcoming = entries.filter((e) => e.status !== "shipped");

  return (
    <div className="site-shell">
      {/* Hero */}
      <section className="relative py-24 border-b border-slate-100 dark:border-slate-800 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-50/60 via-white to-blue-50/40 dark:from-emerald-950/20 dark:via-slate-950 dark:to-blue-950/20 pointer-events-none" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/40 px-3 py-1.5 rounded-full border border-emerald-100 dark:border-emerald-800 mb-4">
            Changelog
          </span>
          <h1 className="mt-3 text-4xl sm:text-6xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
            What we&apos;ve built.{" "}
            <span className="bg-gradient-to-r from-emerald-600 to-blue-600 bg-clip-text text-transparent">
              What&apos;s next.
            </span>
          </h1>
          <p className="mt-5 text-xl text-slate-500 dark:text-slate-400 max-w-2xl leading-relaxed">
            A live record of every shipped feature and our public roadmap — no surprises,
            no vaporware.
          </p>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <div className="max-w-3xl mx-auto space-y-20">
          {/* Shipped */}
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-8 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" /> Shipped
            </h2>
            <div className="space-y-8 border-l-2 border-slate-200 dark:border-slate-700 pl-6">
              {shipped.map((entry) => {
                const s = statusConfig[entry.status];
                return (
                  <div key={entry.title} className="relative">
                    <div className="absolute -left-[31px] w-4 h-4 rounded-full border-2 border-green-500 bg-white dark:bg-slate-950" />
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      {entry.version && (
                        <span className="text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-md">
                          {entry.version}
                        </span>
                      )}
                      <span className="text-xs text-slate-400">{entry.date}</span>
                      {entry.tags.map((tag) => (
                        <span key={tag} className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-md">
                          {tag}
                        </span>
                      ))}
                    </div>
                    <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">{entry.title}</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{entry.description}</p>
                    {entry.version && (
                      <Link
                        href={`/changelog/${toVersionSlug(entry.version)}`}
                        className="mt-2 inline-block text-xs font-semibold text-sky-600 dark:text-sky-400 hover:underline"
                      >
                        View entry
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Roadmap */}
          <div>
            <h2 className="text-xl font-bold text-slate-900 mb-8 flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-500" /> Roadmap
            </h2>
            <div className="space-y-8 border-l-2 border-dashed border-slate-200 pl-6">
              {upcoming.map((entry) => {
                const s = statusConfig[entry.status];
                const Icon = s.icon;
                return (
                  <div key={entry.title} className="relative">
                    <div className="absolute -left-[31px] w-4 h-4 rounded-full border-2 border-slate-300 bg-white dark:bg-slate-950" />
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${s.bg} ${s.text}`}>
                        {s.label}
                      </span>
                      <span className="text-xs text-slate-400">{entry.date}</span>
                      {entry.tags.map((tag) => (
                        <span key={tag} className="text-xs bg-slate-50 border border-slate-200 text-slate-500 px-2 py-0.5 rounded-md">
                          {tag}
                        </span>
                      ))}
                    </div>
                    <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">{entry.title}</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{entry.description}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}



