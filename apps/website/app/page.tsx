import type { Metadata } from "next";
import ButtonLink from "@/components/shared/ButtonLink";
import { marketplaceBots } from "@/lib/bots";
import Hero from "@/components/home/Hero";
import LogosStrip from "@/components/home/LogosStrip";
import Problem from "@/components/home/Problem";
import Solution from "@/components/home/Solution";
import DemoSection from "@/components/home/DemoSection";
import HowItWorks from "@/components/home/HowItWorks";
import Integrations from "@/components/home/Integrations";
import RobotTypes from "@/components/home/RobotTypes";
import TeamBuilderWizard from "@/components/home/TeamBuilderWizard";
import StatsCounter from "@/components/home/StatsCounter";
import Architecture from "@/components/home/Architecture";
import Testimonials from "@/components/home/Testimonials";
import PricingSection from "@/components/home/PricingSection";
import FAQ from "@/components/home/FAQ";
import CallToAction from "@/components/home/CallToAction";

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
      <section className="py-6 sm:py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="site-section-shell rounded-3xl bg-white/85 dark:bg-slate-900/80 backdrop-blur px-5 py-5 sm:px-8 sm:py-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-sky-700 dark:text-sky-300 font-semibold">Conversion Snapshot</p>
              <p className="mt-2 text-base sm:text-lg text-slate-700 dark:text-slate-200">
                Launch from <span className="font-semibold text-slate-900 dark:text-slate-100">{availableRoles} live roles</span> across <span className="font-semibold text-slate-900 dark:text-slate-100">{departmentCoverage} departments</span>, with approval and audit controls from day one.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <ButtonLink href="/marketplace">Explore Marketplace</ButtonLink>
              <ButtonLink href="/pricing" variant="outline">See Pricing</ButtonLink>
            </div>
          </div>
        </div>
      </section>
      <LogosStrip />
      <Problem />
      <Solution />
      <DemoSection />
      <HowItWorks />
      <Integrations />
      <RobotTypes />
      <TeamBuilderWizard />
      <StatsCounter />
      <Architecture />
      <Testimonials />
      <PricingSection />
      <FAQ />
      <CallToAction />
    </main>
  );
}


