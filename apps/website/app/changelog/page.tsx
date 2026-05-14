"use client";
import Link from "next/link";
import { useState } from "react";
import { CheckCircle, Circle, Clock } from "lucide-react";

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
    date: "May 2026",
    version: "v1.0",
    title: "Skill Marketplace GA — 21 developer skills shipped",
    description:
      "The Skill Marketplace reaches general availability with all 21 developer-agent skills live. New REST endpoint: POST /runtime/marketplace/invoke. Architecture Decision Record ADR-015 published. 299 tests passing, 0 failing.",
    status: "shipped",
    tags: ["Marketplace", "Milestone", "API"],
  },
  {
    date: "May 2026",
    version: "v0.9",
    title: "Tier 10: Code Intelligence + Observability skills",
    description:
      "Shipped 10 new skills: workspace_connector_test, workspace_pr_auto_assign, workspace_ci_watch, workspace_explain_code, workspace_add_docstring, workspace_refactor_plan, workspace_semantic_search, workspace_diff_preview, workspace_approval_status, workspace_audit_export. Test suite: 190 passing.",
    status: "shipped",
    tags: ["Skills", "Code Intelligence", "Tier 10"],
  },
  {
    date: "April 2026",
    version: "v0.8",
    title: "Tier 9: Developer Productivity Wave",
    description:
      "Shipped 11 skills: workspace_create_pr, workspace_run_ci_checks, workspace_fix_test_failures, workspace_security_fix_suggest, workspace_pr_review_prepare, workspace_dependency_upgrade_plan, workspace_release_notes_generate, workspace_incident_patch_pack, workspace_memory_profile, workspace_autonomous_plan_execute, workspace_policy_preflight. All 179/179 tests passing.",
    status: "shipped",
    tags: ["Skills", "Developer Productivity", "Tier 9"],
  },
  {
    date: "April 2026",
    version: "v0.7",
    title: "Azure Isolated Runtime + Docker Lifecycle",
    description:
      "Each tenant now runs in a dedicated, isolated Azure VM. Docker lifecycle management for agent containers including provisioning, health monitoring, and graceful teardown. Evidence plane shipping audit logs for every action.",
    status: "shipped",
    tags: ["Infrastructure", "Azure", "Runtime"],
  },
  {
    date: "April 2026",
    version: "v0.6",
    title: "Connector Auth: GitHub, Jira, Teams, Email",
    description:
      "OAuth connector auth shipped for all 4 native connectors — GitHub (PRs, branch management), Jira (ticket tracking), Microsoft Teams (messaging, approval requests), and Email/Outlook. Token refresh, health monitoring, and least-privilege scopes enforced across all connectors.",
    status: "shipped",
    tags: ["Connectors", "Auth", "OAuth"],
  },
  {
    date: "March 2026",
    version: "v0.5",
    title: "Approval Workflow + Risk Classification",
    description:
      "Every agent action is now classified as LOW, MEDIUM, or HIGH risk before execution. LOW actions auto-execute. MEDIUM and HIGH actions pause and send approval requests via Teams or email. Full approval audit trail in the evidence plane.",
    status: "shipped",
    tags: ["Approvals", "Safety", "Core"],
  },
  {
    date: "March 2026",
    version: "v0.4",
    title: "Agent Dashboard + Provisioning Service",
    description:
      "Launched the unified agent dashboard for task assignment, approval review, and skill management. Provisioning service handles workspace setup, connector linking, and runtime health checks.",
    status: "shipped",
    tags: ["Dashboard", "Provisioning"],
  },
  {
    date: "Q3 2026",
    title: "GitLab connector",
    description:
      "Full GitLab integration with merge request management, CI/CD pipeline triggers, and GitLab Issues support. Mirrors the GitHub connector's feature set.",
    status: "planned",
    tags: ["Integration", "GitLab"],
  },
  {
    date: "Q3 2026",
    title: "Confluence + Linear connectors",
    description:
      "Enable the agent to read Confluence docs for context, create Confluence pages from release notes, and sync Linear issues for teams not using Jira.",
    status: "planned",
    tags: ["Integration", "Confluence", "Linear"],
  },
  {
    date: "Q3 2026",
    title: "Multi-tenant team accounts",
    description:
      "Invite teammates, assign roles (admin / developer / viewer), and share skill configurations and approval policies across your engineering organisation.",
    status: "planned",
    tags: ["Teams", "Auth", "Enterprise"],
  },
  {
    date: "Q3 2026",
    title: "Custom approval policy rules",
    description:
      "Build no-code approval rules: 'When action risk is HIGH and touches /src/payments, require 2 approvers from the security team.'",
    status: "planned",
    tags: ["Approvals", "Policy", "Enterprise"],
  },
  {
    date: "Q4 2026",
    title: "SSO / SAML",
    description:
      "Enterprise single sign-on with Okta, Azure AD, and Google Workspace. Team provisioning via SCIM.",
    status: "planned",
    tags: ["Enterprise", "Security"],
  },
  {
    date: "Q4 2026",
    title: "On-premises deployment",
    description: "Run AgentFarm entirely in your own VPC. Full data residency, no external network calls.",
    status: "planned",
    tags: ["Enterprise", "Infrastructure"],
  },
];

const statusConfig = {
  shipped: {
    icon: CheckCircle,
    label: "Shipped",
    iconClass: "text-[var(--accent-green)]",
    bg: "bg-[var(--accent-green)]/10",
    text: "text-[var(--accent-green)]",
  },
  "in-progress": {
    icon: Clock,
    label: "In Progress",
    iconClass: "text-[var(--accent-blue)]",
    bg: "bg-[var(--accent-blue)]/10",
    text: "text-[var(--accent-blue)]",
  },
  planned: {
    icon: Circle,
    label: "Planned",
    iconClass: "text-[var(--ash)]",
    bg: "bg-[var(--surface-el)]",
    text: "text-[var(--mute)]",
  },
};

function toVersionSlug(version?: string) {
  if (!version) return null;
  return version.toLowerCase().replace(/\./g, "-");
}

const ALL_FILTERS = ["All", "Shipped", "In Progress", "Planned"] as const;
type FilterLabel = (typeof ALL_FILTERS)[number];

export default function ChangelogPage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterLabel>("All");

  const filteredEntries = entries.filter((e) => {
    const matchesFilter =
      filter === "All" ||
      (filter === "Shipped" && e.status === "shipped") ||
      (filter === "In Progress" && e.status === "in-progress") ||
      (filter === "Planned" && e.status === "planned");
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      e.title.toLowerCase().includes(q) ||
      e.description.toLowerCase().includes(q) ||
      e.tags.some((t) => t.toLowerCase().includes(q));
    return matchesFilter && matchesSearch;
  });

  const shipped = filteredEntries.filter((e) => e.status === "shipped");
  const upcoming = filteredEntries.filter((e) => e.status !== "shipped");

  return (
    <div>
      {/* Hero */}
      <section className="relative py-24 border-b border-[var(--hairline)] overflow-hidden">
        <div className="absolute inset-0 bg-[var(--canvas)] pointer-events-none" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <span className="chip chip-accent mb-4">
            Changelog
          </span>
          <h1 className="mt-3 text-4xl sm:text-6xl font-semibold text-[var(--ink)] tracking-[-0.03em]">
            What we&apos;ve built.{" "}
            <span className="bg-gradient-to-r from-[var(--accent-green)] to-[var(--accent-blue)] bg-clip-text text-transparent">
              What&apos;s next.
            </span>
          </h1>
          <p className="mt-5 text-xl text-[var(--mute)] max-w-2xl leading-relaxed">
            A live record of every shipped feature and our public roadmap — no surprises,
            no vaporware.
          </p>
        </div>
      </section>

      {/* Filter bar */}
      <div className="border-b border-[var(--hairline)] bg-[var(--canvas)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            {ALL_FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${filter === f ? "bg-[var(--ink)] text-[var(--canvas)] border-[var(--ink)]" : "border-[var(--hairline)] text-[var(--mute)] hover:border-[var(--ash)]"}`}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="sm:ml-auto">
            <input
              type="search"
              placeholder="Search entries…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="text-xs rounded-lg border border-[var(--hairline)] bg-[var(--surface-el)] text-[var(--ink)] px-3 py-2 w-52 placeholder:text-[var(--ash)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-blue)]"
            />
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <div className="max-w-3xl mx-auto space-y-20">
          {/* Shipped */}
          <div>
            <h2 className="text-xl font-semibold text-[var(--ink)] mb-8 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" /> Shipped
            </h2>
            <div className="space-y-8 border-l-2 border-[var(--hairline)] pl-6">
              {shipped.map((entry) => {
                const s = statusConfig[entry.status];
                return (
                  <div key={entry.title} className="relative">
                    <div className="absolute -left-[31px] w-4 h-4 rounded-full border-2 border-[var(--accent-green)] bg-[var(--canvas)]" />
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      {entry.version && (
                        <span className="text-xs font-bold bg-[var(--surface-el)] text-[var(--body-color)] px-2 py-0.5 rounded-md">
                          {entry.version}
                        </span>
                      )}
                      <span className="text-xs text-[var(--ash)]">{entry.date}</span>
                      {entry.tags.map((tag) => (
                        <span key={tag} className="text-xs bg-[var(--surface-el)] border border-[var(--hairline)] text-[var(--mute)] px-2 py-0.5 rounded-md">
                          {tag}
                        </span>
                      ))}
                    </div>
                    <h3 className="font-semibold text-[var(--ink)] mb-1">{entry.title}</h3>
                    <p className="text-sm text-[var(--mute)] leading-relaxed">{entry.description}</p>
                    {entry.version && (
                      <Link
                        href={`/changelog/${toVersionSlug(entry.version)}`}
                        className="mt-2 inline-block text-xs font-semibold text-[var(--accent-blue)] hover:underline"
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
            <h2 className="text-xl font-semibold text-[var(--ink)] mb-8 flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-500" /> Roadmap
            </h2>
            <div className="space-y-8 border-l-2 border-dashed border-[var(--hairline)] pl-6">
              {upcoming.map((entry) => {
                const s = statusConfig[entry.status];
                const Icon = s.icon;
                return (
                  <div key={entry.title} className="relative">
                    <div className="absolute -left-[31px] w-4 h-4 rounded-full border-2 border-[var(--ash)] bg-[var(--canvas)]" />
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${s.bg} ${s.text}`}>
                        {s.label}
                      </span>
                      <span className="text-xs text-[var(--ash)]">{entry.date}</span>
                      {entry.tags.map((tag) => (
                        <span key={tag} className="text-xs bg-[var(--surface-el)] border border-[var(--hairline)] text-[var(--mute)] px-2 py-0.5 rounded-md">
                          {tag}
                        </span>
                      ))}
                    </div>
                    <h3 className="font-semibold text-[var(--ink)] mb-1">{entry.title}</h3>
                    <p className="text-sm text-[var(--mute)] leading-relaxed">{entry.description}</p>
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



