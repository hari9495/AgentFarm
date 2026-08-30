import type { Metadata } from "next";
import dynamic from "next/dynamic";
import Hero from "@/components/home/HeroSwitch";
import Problem from "@/components/home/Problem";
import Solution from "@/components/home/Solution";
import Features from "@/components/home/Features";
import { siteMarketingMetadata } from "@/lib/marketing-content";
import { homeFAQSchema, homeSpeakableSchema, aggregateRatingSchema } from "@/lib/seo-schemas";

const Testimonials = dynamic(() => import("@/components/home/Testimonials"));
const PricingSection = dynamic(() => import("@/components/home/PricingSection"));
const FAQ = dynamic(() => import("@/components/home/FAQ"));
const CallToAction = dynamic(() => import("@/components/home/CallToAction"));

export const metadata: Metadata = {
  title: siteMarketingMetadata.homeTitle,
  description: siteMarketingMetadata.homeDescription,
  keywords: [
    "AI workers platform", "governed AI agents", "AI automation software",
    "AI backend developer", "AI QA engineer", "AI staffing tool",
    "deploy AI workers", "human in the loop AI", "AI approval gates",
    "AgentFarms", "AI worker marketplace India",
  ],
  alternates: { canonical: "https://agentfarms.in" },
  openGraph: {
    title: siteMarketingMetadata.homeTitle,
    description: siteMarketingMetadata.homeDescription,
    url: "https://agentfarms.in",
    type: "website",
  },
};

const pageSchemas = [homeFAQSchema, homeSpeakableSchema, aggregateRatingSchema];

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pageSchemas) }}
      />
      <main aria-label="AgentFarms home">
        <Hero />
        <Problem />
        <Solution />
        <Features />
        <Testimonials />
        <PricingSection />
        <FAQ />
        <CallToAction />
      </main>
    </>
  );
}
