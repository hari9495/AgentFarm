import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
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

const stats = [
  { label: "AI worker roles", value: "12" },
  { label: "Avg hire time", value: "< 10 min" },
  { label: "Actions audited", value: "100%" },
  { label: "Departments covered", value: "16" },
];

export default function MarketplacePage() {
  return (
    <div className="bg-[var(--canvas)]">
      {/* Hero */}
      <section className="relative border-b border-[var(--hairline)] overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[400px]"
          style={{
            background: "radial-gradient(ellipse 70% 40% at 50% -5%, rgba(89,212,153,0.06) 0%, transparent 70%)",
          }}
        />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28">
          <div className="grid lg:grid-cols-[1fr_auto] gap-12 items-start">

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--accent-green)] mb-5">
                Agent Marketplace
              </p>
              <h1 className="text-[clamp(2rem,4.5vw,3.6rem)] font-black text-[var(--ink)] tracking-[-0.03em] leading-[1.05]">
                Hire an AI worker for every role in your company
              </h1>
              <p className="mt-4 max-w-2xl text-[var(--body-color)] text-base sm:text-lg leading-relaxed">
                Browse 12 AI worker roles across every department — Engineering, Sales, Marketing,
                Customer Support, Operations, and more. Each agent ships real work with real tools,
                human approval on every high-stakes decision.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <a href="/checkout" className="btn-primary">
                  Browse all roles
                  <ArrowRight className="w-4 h-4" />
                </a>
                <a href="/book-demo" className="btn-secondary">See a live demo</a>
              </div>
            </div>

            {/* Trust metrics */}
            <div className="grid grid-cols-2 gap-3 min-w-[280px]" aria-label="Marketplace metrics">
              {stats.map((s) => (
                <article
                  key={s.label}
                  className="bg-[var(--surface-card)] border border-[var(--hairline)] rounded-xl p-5 flex flex-col gap-1"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ash)]">{s.label}</p>
                  <p className="text-3xl font-black text-[var(--ink)] tracking-tight leading-none">{s.value}</p>
                </article>
              ))}
            </div>
          </div>

          {/* Launch paths */}
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {launchPaths.map((path) => (
              <article
                key={path.label}
                className="bg-[var(--surface-card)] border border-[var(--hairline)] rounded-xl p-5"
              >
                <p className="text-sm font-bold text-[var(--ink)]">{path.label}</p>
                <p className="mt-2 text-sm text-[var(--mute)] leading-relaxed">{path.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <MarketplaceGrid />
    </div>
  );
}
