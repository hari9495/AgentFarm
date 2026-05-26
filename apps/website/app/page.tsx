import type { Metadata } from "next";
import dynamic from "next/dynamic";
import Hero from "@/components/home/Hero";
import LogosStrip from "@/components/home/LogosStrip";
import Problem from "@/components/home/Problem";
import Solution from "@/components/home/Solution";
import Features from "@/components/home/Features";

const Testimonials = dynamic(() => import("@/components/home/Testimonials"));
const PricingSection = dynamic(() => import("@/components/home/PricingSection"));
const FAQ = dynamic(() => import("@/components/home/FAQ"));
const CallToAction = dynamic(() => import("@/components/home/CallToAction"));

export const metadata: Metadata = {
  title: "AgentFarm — AI Workers for Engineering Teams",
  description:
    "Give every department a dedicated AI worker with real tool access, role-scoped skills, and human oversight on every decision that matters.",
};

export default function Home() {
  return (
    <main aria-label="AgentFarm home">
      <Hero />
      <LogosStrip />
      <Problem />
      <Solution />
      <Features />
      <Testimonials />
      <PricingSection />
      <FAQ />
      <CallToAction />
    </main>
  );
}
