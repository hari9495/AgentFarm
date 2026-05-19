import type { Metadata } from "next";
import MarketplaceGrid from "@/components/marketplace/MarketplaceGrid";

export const metadata: Metadata = {
  title: "Agent Marketplace – AgentFarm",
  description:
    "Browse and hire AI workers across 12 roles and every department — from Developer and Sales Rep to Customer Support, Recruiter, and more.",
};

const launchPaths = [
  {
    label: "Start with Engineering & QA",
    detail: "Deploy a Developer + Tester agent pair to ship code faster with automated PR review, CI fixes, and test coverage.",
  },
  {
    label: "Add Sales & Marketing Roles",
    detail: "Sales Rep and Marketing Specialist agents that manage outreach, CRM updates, and campaign execution automatically.",
  },
  {
    label: "Cover Operations & Support",
    detail: "Corporate Assistant, Customer Support Executive, and Project Manager agents for every recurring operational task.",
  },
];

export default function MarketplacePage() {
  return (
    <div className="marketplace-shell">
      <section className="magic-canvas relative overflow-hidden">
        <div aria-hidden className="aurora-bg">
          <div className="orb orb-3" />
          <div className="orb orb-4" />
          <div className="cyber-grid" />
          <div className="magic-grain" />
        </div>
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
          <div className="grid lg:grid-cols-[1fr_auto] gap-10 items-start">
            <div>
              <div className="reveal-up mb-5 flex flex-wrap gap-2">
                <span className="neon-chip neon-chip-cyan"><span className="dot" aria-hidden />Agent Marketplace</span>
                <span className="neon-chip neon-chip-mint"><span className="dot" aria-hidden />12 AI worker roles</span>
              </div>
              <h1 className="reveal-up delay-1 text-[clamp(2rem,4.5vw,3.6rem)] font-black text-[var(--m-ink)] tracking-[-0.03em] leading-[1.05]">
                Hire an AI worker{" "}
                <span className="holo-text">for every role</span> in your company
              </h1>
              <p className="reveal-up delay-2 mt-4 max-w-3xl text-[var(--m-ink-muted)] text-base sm:text-lg">
                Browse 12 AI worker roles across every department — Engineering, Sales, Marketing, Customer Support, Operations, and more.
                Each agent ships real work with real tools, human approval on every high-stakes decision.
              </p>
              <div className="reveal-up delay-3 mt-6 flex flex-col sm:flex-row gap-3">
                <a href="/checkout" className="magic-btn magic-btn-primary">Browse all roles</a>
                <a href="/get-started" className="magic-btn magic-btn-ghost">Talk to onboarding</a>
                <a href="/book-demo" className="magic-btn magic-btn-ghost">See a live demo →</a>
              </div>
            </div>

            <div className="reveal-up delay-2 grid grid-cols-2 gap-3 min-w-[280px]" aria-label="Marketplace trust metrics">
              {[
                { label: "AI worker roles", value: "12" },
                { label: "Avg hire time", value: "< 10 min" },
                { label: "Actions audited", value: "100%" },
                { label: "Departments covered", value: "16" },
              ].map((s) => (
                <article key={s.label} className="glass-card holo-edge p-5 flex flex-col gap-1">
                  <p className="text-[0.6rem] font-bold uppercase tracking-[0.14em] text-[var(--m-ink-faint)]">{s.label}</p>
                  <p className="text-3xl font-black text-[var(--m-ink)] holo-text-tight tracking-tight leading-none">{s.value}</p>
                </article>
              ))}
            </div>
          </div>

          <div className="reveal-up delay-4 mt-8 flex flex-wrap gap-2" aria-label="Marketplace value highlights">
            {["12 AI worker roles", "Every department covered", "Approval-driven safety", "Human oversight built in", "Audit-ready operations"].map((label) => (
              <span key={label} className="neon-chip neon-chip-violet">{label}</span>
            ))}
          </div>

          <div className="mt-7 grid gap-4 md:grid-cols-3">
            {launchPaths.map((path, i) => (
              <article key={path.label} className={`glass-card holo-edge reveal-up delay-${i + 1} p-5`}>
                <p className="text-sm font-bold text-[var(--m-ink)]">{path.label}</p>
                <p className="mt-2 text-sm text-[var(--m-ink-muted)]">{path.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <MarketplaceGrid />
    </div>
  );
}


