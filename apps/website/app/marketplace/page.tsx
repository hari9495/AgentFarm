import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
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
    label: "Add Sales & Marketing",
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
    <div style={{ background: "#ffffff" }}>

      {/* Hero tile */}
      <section className="af-tile af-tile-white" style={{ paddingTop: 80, paddingBottom: 64 }}>
        <div className="af-container-wide">
          <div className="grid lg:grid-cols-[1fr_auto] gap-12 items-start">

            <div>
              <p className="af-eyebrow mb-5">Agent Marketplace</p>
              <h1
                className="font-semibold text-[#1d1d1f]"
                style={{ fontSize: "clamp(2.2rem, 4.5vw, 3.4rem)", letterSpacing: "-0.03em", lineHeight: 1.07 }}
              >
                Hire an AI worker for every role in your company
              </h1>
              <p className="mt-4 max-w-xl text-[17px] text-[#424245]" style={{ lineHeight: 1.47, letterSpacing: "-0.022em" }}>
                Browse 12 AI worker roles across every department — Engineering, Sales, Marketing,
                Customer Support, Operations, and more. Each agent ships real work with real tools,
                human approval on every high-stakes decision.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <Link href="/checkout" className="btn-primary">
                  Browse all roles
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link href="/book-demo" className="btn-secondary">
                  See a live demo
                </Link>
              </div>
            </div>

            {/* Stat tiles */}
            <div className="grid grid-cols-2 gap-3 min-w-[280px]" aria-label="Marketplace metrics">
              {stats.map((s) => (
                <div
                  key={s.label}
                  className="rounded-[14px] p-5 flex flex-col gap-1"
                  style={{ border: "1px solid #d2d2d7", background: "#f5f5f7" }}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#aeaeb2]">{s.label}</p>
                  <p
                    className="font-semibold text-[#1d1d1f]"
                    style={{ fontSize: "2rem", letterSpacing: "-0.03em", lineHeight: 1 }}
                  >
                    {s.value}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Launch paths */}
          <div className="mt-10 grid md:grid-cols-3 gap-4">
            {launchPaths.map((path) => (
              <div
                key={path.label}
                className="rounded-[14px] p-5"
                style={{ border: "1px solid #d2d2d7", background: "#f5f5f7" }}
              >
                <p className="font-semibold text-[15px] text-[#1d1d1f] mb-2" style={{ letterSpacing: "-0.015em" }}>
                  {path.label}
                </p>
                <p className="text-[14px] text-[#6e6e73]" style={{ lineHeight: 1.5 }}>{path.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Agent grid */}
      <section className="af-tile af-tile-parchment" style={{ paddingTop: 48 }}>
        <div className="af-container-wide">
          <MarketplaceGrid />
        </div>
      </section>
    </div>
  );
}
