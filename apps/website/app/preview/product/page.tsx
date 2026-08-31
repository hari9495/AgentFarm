import { ArrowRight, Check, Play } from 'lucide-react';
import Link from 'next/link';
import { productPageContent as C } from '@/lib/marketing-content';
import HowItWorksSteps from '@/components/product/HowItWorksSteps';
import ProductFeaturesGrid from '@/components/product/ProductFeaturesGrid';

export const metadata = { title: 'Product page preview' };

export default function Page() {
  return (
    <div>
      {/* Hero — centered */}
      <section className="op-light relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(55% 45% at 50% 0%, var(--op-indigo-soft), transparent 65%)' }} />
        <div className="op-wrap-narrow relative text-center" style={{ paddingTop: 88, paddingBottom: 64 }}>
          <p className="op-eyebrow">{C.hero.badge}</p>
          <h1 className="mt-4 mx-auto max-w-3xl font-[family-name:var(--font-display)] font-extrabold" style={{ fontSize: 'clamp(2.5rem, 5vw, 3.8rem)', letterSpacing: '-0.03em', lineHeight: 1.04, color: 'var(--op-ink)' }}>
            {C.hero.titleLead} <span style={{ color: 'var(--op-indigo)' }}>{C.hero.titleAccent}</span>
          </h1>
          <p className="mt-5 mx-auto max-w-xl text-[1.075rem] leading-relaxed" style={{ color: 'var(--op-muted)' }}>{C.hero.description}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href={C.hero.primaryCta.href} className="inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold text-white" style={{ background: 'var(--op-indigo)' }}>{C.hero.primaryCta.label} <ArrowRight className="h-4 w-4" /></Link>
            <Link href={C.hero.secondaryCta.href} className="inline-flex h-11 items-center rounded-xl px-5 text-sm font-semibold" style={{ border: '1px solid var(--op-line)', color: 'var(--op-ink)' }}>{C.hero.secondaryCta.label}</Link>
          </div>
          <div className="mt-9 grid gap-x-8 gap-y-2.5 text-left sm:grid-cols-2 max-w-2xl mx-auto">
            {C.outcomes.map((o) => (
              <div key={o} className="flex items-start gap-2.5 text-[14px]" style={{ color: 'var(--op-ink-soft)' }}>
                <Check className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.4} style={{ color: 'var(--op-approved)' }} /> <span>{o}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works — 21st.dev: 7ovr/how-it-works-1 */}
      <section className="op-soft" style={{ paddingTop: 80, paddingBottom: 80 }}>
        <HowItWorksSteps />
      </section>

      {/* Features grid — 21st.dev: gooseui/features-grid */}
      <section className="op-light" style={{ paddingTop: 80, paddingBottom: 80 }}>
        <ProductFeaturesGrid />
      </section>

      {/* Demo — framed product film */}
      <section className="op-soft" style={{ paddingTop: 80, paddingBottom: 80 }}>
        <div className="op-wrap-narrow text-center">
          <p className="op-eyebrow">{C.demo.badge}</p>
          <h2 className="mt-4 font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ lineHeight: 1.05, color: 'var(--op-ink)' }}>{C.demo.title}</h2>
          <p className="mt-4 mx-auto max-w-xl text-[1.075rem]" style={{ color: 'var(--op-muted)' }}>{C.demo.description}</p>
        </div>
        <div className="op-wrap mt-10">
          <div className="mx-auto max-w-4xl overflow-hidden rounded-2xl" style={{ border: '1px solid var(--op-line)', background: 'var(--op-paper)', boxShadow: '0 30px 60px -30px rgba(16,24,40,0.25)' }}>
            <div className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: 'var(--op-line)' }}>
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#e1483d' }} /><span className="h-2.5 w-2.5 rounded-full" style={{ background: '#d98a00' }} /><span className="h-2.5 w-2.5 rounded-full" style={{ background: '#0ea968' }} />
              <span className="ml-2 font-[family-name:var(--font-mono)] text-[11px]" style={{ color: 'var(--op-muted)' }}>agentfarm · worker run</span>
            </div>
            <div className="flex flex-col items-center justify-center gap-8" style={{ minHeight: 360, padding: '48px 24px', background: 'linear-gradient(160deg, var(--op-indigo-soft), var(--op-paper-2) 70%)' }}>
              <button className="flex h-16 w-16 items-center justify-center rounded-full text-white shadow-lg transition-transform hover:scale-105" style={{ background: 'var(--op-indigo)' }} aria-label="Play demo">
                <Play className="ml-0.5 h-6 w-6" fill="currentColor" />
              </button>
              <div className="flex flex-wrap items-center justify-center gap-3 text-center">
                {['Intake', 'Working', 'Approval', 'Delivered'].map((s, i) => (
                  <div key={s} className="flex items-center gap-3">
                    <div className="rounded-xl px-4 py-2.5" style={{ background: 'var(--op-paper)', border: '1px solid var(--op-line)' }}>
                      <span className="text-[13px] font-semibold" style={{ color: i === 2 ? 'var(--op-pending)' : 'var(--op-ink)' }}>{s}</span>
                    </div>
                    {i < 3 && <ArrowRight className="h-4 w-4" style={{ color: 'var(--op-muted)' }} />}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="op-light text-center" style={{ paddingTop: 88, paddingBottom: 88 }}>
        <div className="op-wrap-narrow">
          <span className="inline-flex items-center rounded-full px-3 py-1 text-[12px] font-semibold" style={{ background: 'var(--op-indigo-soft)', color: 'var(--op-indigo)' }}>14-day free trial · no card required</span>
          <h2 className="mx-auto mt-5 font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight sm:text-5xl" style={{ lineHeight: 1.04, color: 'var(--op-ink)' }}>{C.cta.title}</h2>
          <p className="mt-4 mx-auto max-w-xl text-[1.075rem]" style={{ color: 'var(--op-muted)' }}>{C.cta.description}</p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href={C.cta.button.href} className="inline-flex h-11 items-center gap-2 rounded-xl px-6 text-[15px] font-semibold text-white" style={{ background: 'var(--op-indigo)' }}>{C.cta.button.label} <ArrowRight className="h-4 w-4" /></Link>
            <Link href="/how-it-works" className="inline-flex h-11 items-center rounded-xl px-6 text-[15px] font-semibold" style={{ border: '1px solid var(--op-line)', color: 'var(--op-ink)' }}>How it works</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
