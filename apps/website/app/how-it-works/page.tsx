import type { Metadata } from 'next';
import { ArrowRight, Check } from 'lucide-react';
import Link from 'next/link';
import { howItWorksPageContent as C } from '@/lib/marketing-content';
import { howItWorksHowToSchema, breadcrumbSchema } from '@/lib/seo-schemas';
import FeatureStepsShowcase from '@/components/how-it-works/FeatureStepsShowcase';
import StepMock from '@/components/how-it-works/StepMock';
import SharedCTA from '@/components/shared/SharedCTA';
import SubPageHero from '@/components/shared/SubPageHero';

export const metadata: Metadata = {
  ...C.metadata,
  openGraph: {
    title: C.metadata.title,
    description: C.metadata.description,
    url: 'https://agentfarms.in/how-it-works',
    type: 'website',
  },
};

const pageSchemas = [
  howItWorksHowToSchema,
  breadcrumbSchema([
    { name: 'Home', url: 'https://agentfarms.in' },
    { name: 'How it works', url: 'https://agentfarms.in/how-it-works' },
  ]),
];

export default function HowItWorksPage() {
  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pageSchemas) }} />

      {/* Hero — shared SubPageHero (21st.dev: felipemenezes098/hero-02) */}
      <SubPageHero
        eyebrow={C.hero.eyebrow}
        titleLead={C.hero.titleLead}
        titleAccent={C.hero.titleAccent}
        description={C.hero.description}
        primary={{ label: 'Start free trial', href: '/#waitlist' }}
        secondary={{ label: 'See pricing', href: '/pricing' }}
        visual={<StepMock index={4} />}
      />

      {/* Quick timeline band */}
      <section className="op-soft" style={{ paddingTop: 28, paddingBottom: 28 }}>
        <div className="op-wrap">
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-3">
            {C.timeline.map((item, i) => (
              <div key={item.label} className="flex items-center gap-3">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white" style={{ background: 'var(--op-indigo)' }}>{i + 1}</span>
                <span className="text-[14px]" style={{ color: 'var(--op-muted)' }}>{item.label}</span>
                <span className="text-[14px] font-semibold" style={{ color: 'var(--op-indigo)' }}>{item.time}</span>
                {i < C.timeline.length - 1 && <ArrowRight className="hidden h-3.5 w-3.5 sm:block" style={{ color: 'var(--op-line-strong, #aeb6b4)' }} />}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Steps — interactive showcase (Option A) with relevant product mocks */}
      <section className="op-light" style={{ paddingTop: 80, paddingBottom: 80 }}>
        <FeatureStepsShowcase />
      </section>

      {/* CTA (21st.dev: shadcnblocks/cta11) */}
      <section className="op-soft" style={{ paddingTop: 88, paddingBottom: 88 }}>
        <SharedCTA
          badge="14-day free trial · no card required"
          heading={C.cta.title}
          description={C.cta.description}
          primary={{ label: C.cta.primary.label, href: C.cta.primary.href }}
          secondary={{ label: 'Book a demo', href: '/book-demo' }}
          trustItems={['Policy-aware approvals', 'Tenant-isolated runtime', 'Full evidence trail']}
        />
      </section>
    </div>
  );
}
