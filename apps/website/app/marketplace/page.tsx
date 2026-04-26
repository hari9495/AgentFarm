import type { Metadata } from "next";
import Link from "next/link";
import MarketplaceGrid from "@/components/marketplace/MarketplaceGrid";

export const metadata: Metadata = {
  title: "Robot Marketplace – AgentFarm",
  description:
    "Browse and hire AI workers for every engineering role. Deploy in minutes.",
};

export default function MarketplacePage() {
  return (
    <div className="marketplace-shell">
      <section className="marketplace-hero-wrap">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <div className="marketplace-hero-card">
            <div>
              <p className="marketplace-eyebrow">Agent Marketplace</p>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                Build a production-ready AI team in one hiring sprint
              </h1>
              <p className="mt-4 max-w-3xl text-slate-600 dark:text-slate-300 text-base sm:text-lg">
                Curated agents for engineering, operations, and business workflows. Compare capabilities,
                launch role by role, and scale your automation stack with clear ownership.
              </p>
              <div className="mt-6 flex flex-col sm:flex-row gap-3">
                <Link
                  href="/checkout"
                  className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200 transition-colors"
                >
                  Review selected team
                </Link>
                <Link
                  href="/get-started"
                  className="inline-flex items-center justify-center rounded-xl border border-slate-300 dark:border-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-white/70 dark:hover:bg-slate-800 transition-colors"
                >
                  Talk to onboarding
                </Link>
              </div>
            </div>
            <div className="marketplace-stat-grid" aria-label="Marketplace trust metrics">
              <article>
                <p className="label">Live roles</p>
                <p className="value">120+</p>
              </article>
              <article>
                <p className="label">Avg deploy</p>
                <p className="value">&lt; 10 min</p>
              </article>
              <article>
                <p className="label">Top teams</p>
                <p className="value">2,000+</p>
              </article>
              <article>
                <p className="label">Satisfaction</p>
                <p className="value">4.8/5</p>
              </article>
            </div>
          </div>

          <div className="marketplace-chip-row" aria-label="Marketplace value highlights">
            <span>Role-scoped onboarding</span>
            <span>Department bundles</span>
            <span>Transparent pricing</span>
            <span>Human approval controls</span>
            <span>Audit-ready operations</span>
          </div>
        </div>
      </section>
      <MarketplaceGrid />
    </div>
  );
}


