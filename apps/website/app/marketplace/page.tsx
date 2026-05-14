import type { Metadata } from "next";
import Link from "next/link";
import MarketplaceGrid from "@/components/marketplace/MarketplaceGrid";

export const metadata: Metadata = {
  title: "Skill Marketplace – AgentFarm",
  description:
    "Browse and deploy 21 developer-agent skills for real engineering work: PR creation, CI fixes, code review, security scanning, and more.",
};

const launchPaths = [
  {
    label: "Start with Core Developer Skills",
    detail: "Deploy Create PR, Run CI Checks, and Fix Test Failures for immediate sprint impact.",
  },
  {
    label: "Add Code Intelligence Skills",
    detail: "Explain Code, Refactor Plan, Semantic Search, and Diff Preview for deeper productivity.",
  },
  {
    label: "Enable Compliance & Governance",
    detail: "Audit Export, Approval Status, and Policy Preflight for enterprise-ready operations.",
  },
];

export default function MarketplacePage() {
  return (
    <div className="marketplace-shell">
      <section className="marketplace-hero-wrap">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <div className="marketplace-hero-card">
            <div>
              <p className="marketplace-eyebrow">Agent Marketplace</p>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-semibold text-[var(--ink)] tracking-[-0.03em]">
                Skill Marketplace: 21 developer skills, ready to ship work
              </h1>
              <p className="mt-4 max-w-3xl text-[var(--mute)] text-base sm:text-lg">
                Each skill gives your Developer Agent a new capability — from creating PRs and fixing CI failures
                to explaining code, generating release notes, and exporting audit evidence. Install only what your team needs.
              </p>
              <div className="mt-6 flex flex-col sm:flex-row gap-3">
                <Link
                  href="/checkout"
                  className="inline-flex items-center justify-center rounded-xl bg-[var(--ink)] px-5 py-2.5 text-sm font-semibold text-[var(--canvas)] hover:opacity-90 transition-colors"
                >
                  Review selected team
                </Link>
                <Link
                  href="/get-started"
                  className="inline-flex items-center justify-center rounded-xl border border-[var(--hairline)] px-5 py-2.5 text-sm font-semibold text-[var(--body-color)] hover:bg-[var(--surface-el)] transition-colors"
                >
                  Talk to onboarding
                </Link>
                <Link
                  href="/marketplace/listings"
                  className="inline-flex items-center justify-center rounded-xl border border-[var(--hairline)] px-5 py-2.5 text-sm font-semibold text-[var(--body-color)] hover:bg-[var(--surface-el)] transition-colors"
                >
                  View live skill registry →
                </Link>
              </div>
            </div>
            <div className="marketplace-stat-grid" aria-label="Marketplace trust metrics">
              <article>
                <p className="label">Developer skills</p>
                <p className="value">21</p>
              </article>
              <article>
                <p className="label">Avg deploy</p>
                <p className="value">&lt; 10 min</p>
              </article>
              <article>
                <p className="label">Actions audited</p>
                <p className="value">100%</p>
              </article>
              <article>
                <p className="label">LLM providers</p>
                <p className="value">10</p>
              </article>
            </div>
          </div>

          <div className="marketplace-chip-row" aria-label="Marketplace value highlights">
            <span>21 developer skills</span>
            <span>Approval-driven safety</span>
            <span>Transparent pricing</span>
            <span>Human approval controls</span>
            <span>Audit-ready operations</span>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {launchPaths.map((path) => (
              <article
                key={path.label}
                className="rounded-2xl border border-[var(--hairline)] bg-[var(--surface-card)] p-5"
              >
                <p className="text-sm font-semibold text-[var(--ink)]">{path.label}</p>
                <p className="mt-2 text-sm text-[var(--mute)]">{path.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <MarketplaceGrid />
    </div>
  );
}


