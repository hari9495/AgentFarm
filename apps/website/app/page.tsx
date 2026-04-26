import type { Metadata } from "next";
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
  title: "AgentFarm - AI Workforce for Engineering Teams",
  description:
    "Deploy AI developers, QA engineers, and DevOps agents that ship work directly into your workflow.",
};

export default function Home() {
  return (
    <main className="home-choreo" aria-label="AgentFarm home content">
      <Hero />
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


