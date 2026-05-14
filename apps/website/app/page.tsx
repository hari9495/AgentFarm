import type { Metadata } from "next";
import dynamic from "next/dynamic";
import Link from "next/link";
import { marketplaceBots } from "@/lib/bots";
import Hero from "@/components/home/Hero";
import LogosStrip from "@/components/home/LogosStrip";
import Problem from "@/components/home/Problem";
import Solution from "@/components/home/Solution";
import Features from "@/components/home/Features";

// Lazy-load below-the-fold sections — improves initial page load
const DemoSection = dynamic(() => import("@/components/home/DemoSection"));
const HowItWorks = dynamic(() => import("@/components/home/HowItWorks"));
const Integrations = dynamic(() => import("@/components/home/Integrations"));
const RobotTypes = dynamic(() => import("@/components/home/RobotTypes"));
const TeamBuilderWizard = dynamic(() => import("@/components/home/TeamBuilderWizard"));
const StatsCounter = dynamic(() => import("@/components/home/StatsCounter"));
const Testimonials = dynamic(() => import("@/components/home/Testimonials"));
const PricingSection = dynamic(() => import("@/components/home/PricingSection"));
const FAQ = dynamic(() => import("@/components/home/FAQ"));
const CallToAction = dynamic(() => import("@/components/home/CallToAction"));
const SocialProofBar = dynamic(() => import("@/components/home/SocialProofBar"));
const MetricsTicker = dynamic(() => import("@/components/home/MetricsTicker"));
const NewsletterCapture = dynamic(() => import("@/components/home/NewsletterCapture"));

export const metadata: Metadata = {
  title: "AgentFarm - Trusted AI Teammates for Engineering Teams",
  description:
    "Increase engineering throughput with secure AI teammates that ship review-ready work into your existing workflow.",
};

export default function Home() {
  const availableRoles = marketplaceBots.filter((bot) => bot.available).length;
  const departmentCoverage = new Set(marketplaceBots.map((bot) => bot.department)).size;

  return (
    <main className="home-choreo" aria-label="AgentFarm home content">
      <Hero />
      <SocialProofBar />
      {/* Conversion Snapshot */}
      <section className="py-6 sm:py-8 bg-[var(--surface)] border-y border-[var(--hairline)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-[var(--accent-blue)] font-semibold">Conversion Snapshot</p>
              <p className="mt-2 text-base sm:text-lg text-[var(--body-color)]">
                Launch from{" "}
                <span className="font-semibold text-[var(--ink)]">{availableRoles} live roles</span>{" "}
                across{" "}
                <span className="font-semibold text-[var(--ink)]">{departmentCoverage} departments</span>
                , with approval and audit controls from day one.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/marketplace"
                className="px-5 py-2.5 text-sm font-semibold text-black bg-white rounded-lg hover:bg-[#e8e8e8] transition-colors"
              >
                Explore Marketplace
              </Link>
              <Link
                href="/pricing"
                className="px-5 py-2.5 text-sm font-medium text-[var(--mute)] border border-[var(--hairline)] rounded-lg hover:text-[var(--ink)] hover:border-[rgba(255,255,255,0.15)] hover:bg-white/[0.04] transition-colors"
              >
                See Pricing
              </Link>
            </div>
          </div>
        </div>
      </section>
      <LogosStrip />
      <Problem />
      <Solution />
      <Features />
      <DemoSection />
      <HowItWorks />
      <Integrations />
      <RobotTypes />
      <TeamBuilderWizard />
      <StatsCounter />
      <MetricsTicker />
      <Testimonials />
      <PricingSection />
      <FAQ />
      <NewsletterCapture />
      <CallToAction />
    </main>
  );
}

