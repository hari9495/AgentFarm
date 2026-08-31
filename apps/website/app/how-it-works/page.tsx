import type { Metadata } from 'next';
import { ArrowRight, Check } from 'lucide-react';
import Link from 'next/link';
import { howItWorksPageContent as C } from '@/lib/marketing-content';
import { howItWorksHowToSchema, breadcrumbSchema } from '@/lib/seo-schemas';
import FeatureStepsShowcase from '@/components/how-it-works/FeatureStepsShowcase';
import StepMock from '@/components/how-it-works/StepMock';

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

      {/* Hero — standard sub-page split */}
      <section className="op-light relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(60% 45% at 15% 0%, var(--op-indigo-soft), transparent 60%)' }} />
        <div className="op-wrap relative grid items-center gap-12 md:grid-cols-2" style={{ paddingTop: 80, paddingBottom: 72 }}>
          <div>
            <p className="op-eyebrow">{C.hero.eyebrow}</p>
            <h1 className="mt-4 font-[family-name:var(--font-display)] font-extrabold" style={{ fontSize: 'clamp(2.4rem, 4.6vw, 3.6rem)', letterSpacing: '-0.03em', lineHeight: 1.04, color: 'var(--op-ink)' }}>
              {C.hero.titleLead} <span style={{ color: 'var(--op-indigo)' }}>{C.hero.titleAccent}</span>
            </h1>
            <p className="mt-5 max-w-lg text-[1.075rem] leading-relaxed" style={{ color: 'var(--op-muted)' }}>{C.hero.description}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/#waitlist" className="inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold text-white" style={{ background: 'var(--op-indigo)' }}>Start free trial <ArrowRight className="h-4 w-4" /></Link>
              <Link href="/pricing" className="inline-flex h-11 items-center rounded-xl px-5 text-sm font-semibold" style={{ border: '1px solid var(--op-line)', color: 'var(--op-ink)' }}>See pricing</Link>
            </div>
          </div>
          <div className="flex items-center justify-center rounded-2xl p-8" style={{ background: 'linear-gradient(160deg, var(--op-indigo-soft), var(--op-paper-2) 65%)', outline: '1px solid rgba(16,24,40,0.06)' }}>
            <StepMock index={4} />
          </div>
        </div>
      </section>

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

      {/* CTA */}
      <section className="op-soft text-center" style={{ paddingTop: 88, paddingBottom: 88 }}>
        <div className="op-wrap-narrow">
          <span className="inline-flex items-center rounded-full px-3 py-1 text-[12px] font-semibold" style={{ background: 'var(--op-indigo-soft)', color: 'var(--op-indigo)' }}>14-day free trial · no card required</span>
          <h2 className="mx-auto mt-5 font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight sm:text-5xl" style={{ lineHeight: 1.04, color: 'var(--op-ink)' }}>{C.cta.title}</h2>
          <p className="mt-4 mx-auto max-w-xl text-[1.075rem]" style={{ color: 'var(--op-muted)' }}>{C.cta.description}</p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href={C.cta.primary.href} className="inline-flex h-11 items-center gap-2 rounded-xl px-6 text-[15px] font-semibold text-white" style={{ background: 'var(--op-indigo)' }}>{C.cta.primary.label} <ArrowRight className="h-4 w-4" /></Link>
            <Link href="/book-demo" className="inline-flex h-11 items-center rounded-xl px-6 text-[15px] font-semibold" style={{ border: '1px solid var(--op-line)', color: 'var(--op-ink)' }}>Book a demo</Link>
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            {['Policy-aware approvals', 'Tenant-isolated runtime', 'Full evidence trail'].map((t) => (
              <span key={t} className="inline-flex items-center gap-1.5 text-[13px]" style={{ color: 'var(--op-ink-soft)' }}>
                <Check className="h-3.5 w-3.5" strokeWidth={2.6} style={{ color: 'var(--op-indigo)' }} /> {t}
              </span>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
