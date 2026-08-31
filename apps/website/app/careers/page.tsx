import type { Metadata } from 'next';
import { openRoles, values, perks } from '@/components/careers/careers-data';
import CareersCards from '@/components/careers/CareersCards';
import SubPageHero from '@/components/shared/SubPageHero';
import SharedCTA from '@/components/shared/SharedCTA';

export const metadata: Metadata = {
  title: 'Join AgentFarms — Careers at the Governed AI Platform',
  description:
    'Join the team building the governed execution layer for AI work. Small team, direct impact — making AI workers trustworthy for real-world business operations.',
};

export default function CareersPage() {
  const deptCount = new Set(openRoles.map((r) => r.department)).size;

  return (
    <div>
      {/* Hero — shared SubPageHero (21st.dev: felipemenezes098/hero-02) */}
      <SubPageHero
        eyebrow="Careers"
        titleLead="Build the future of"
        titleAccent="governed AI work"
        description="We are a small, focused team making AI workers trustworthy enough for real business operations. If you care about output, governance, and shipping work that matters, we would like to hear from you."
        primary={{ label: 'See open roles', href: '#open-roles' }}
        secondary={{ label: 'About AgentFarms', href: '/about' }}
        visual={
          <div className="mx-auto w-full max-w-sm rounded-2xl p-6" style={{ background: 'var(--op-paper)', border: '1px solid var(--op-line)', boxShadow: '0 24px 50px -28px rgba(16,24,40,0.22)' }}>
            <p className="mb-4 font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.14em]" style={{ color: 'var(--op-muted)' }}>We&apos;re hiring</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl p-4" style={{ background: 'var(--op-paper-2)', border: '1px solid var(--op-line)' }}>
                <p className="font-[family-name:var(--font-display)] text-2xl font-extrabold" style={{ color: 'var(--op-ink)' }}>{openRoles.length}</p>
                <p className="mt-1 text-[12px]" style={{ color: 'var(--op-muted)' }}>Open roles</p>
              </div>
              <div className="rounded-xl p-4" style={{ background: 'var(--op-paper-2)', border: '1px solid var(--op-line)' }}>
                <p className="font-[family-name:var(--font-display)] text-2xl font-extrabold" style={{ color: 'var(--op-ink)' }}>{deptCount}</p>
                <p className="mt-1 text-[12px]" style={{ color: 'var(--op-muted)' }}>Teams</p>
              </div>
              <div className="col-span-2 rounded-xl p-4" style={{ background: 'var(--op-indigo-soft)' }}>
                <p className="text-[13px] font-semibold" style={{ color: 'var(--op-indigo-ink)' }}>Fully remote · async-first</p>
                <p className="mt-0.5 text-[12px]" style={{ color: 'var(--op-indigo)' }}>Competitive salary + equity</p>
              </div>
            </div>
          </div>
        }
      />

      {/* How we work */}
      <section className="op-soft" style={{ paddingTop: 80, paddingBottom: 80 }}>
        <div className="op-wrap">
          <h2 className="mb-12 text-center font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ letterSpacing: '-0.025em', color: 'var(--op-ink)' }}>How we work</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {values.map((v) => {
              const Icon = v.icon;
              return (
                <div key={v.title} className="op-lift rounded-2xl p-6" style={{ background: 'var(--op-paper)', border: '1px solid var(--op-line)' }}>
                  <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-[8px]" style={{ background: 'var(--op-indigo-soft)' }}>
                    <Icon className="h-5 w-5" style={{ color: 'var(--op-indigo)' }} />
                  </div>
                  <h3 className="mb-2 text-[15px] font-semibold" style={{ letterSpacing: '-0.015em', color: 'var(--op-ink)' }}>{v.title}</h3>
                  <p className="text-[14px]" style={{ lineHeight: 1.5, color: 'var(--op-muted)' }}>{v.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Open roles — pulled CareersCards (21st.dev: educalvolpz/job-listing) */}
      <section id="open-roles" className="op-light" style={{ paddingTop: 80, paddingBottom: 80 }}>
        <div className="op-wrap-narrow mb-8">
          <h2 className="font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ letterSpacing: '-0.025em', color: 'var(--op-ink)' }}>Open roles</h2>
          <p className="mt-2 text-[15px]" style={{ color: 'var(--op-muted)' }}>{openRoles.length} positions currently open — click a role for details.</p>
        </div>
        <CareersCards roles={openRoles} />
        <div className="op-wrap-narrow mt-8">
          <div className="rounded-2xl p-6 text-center" style={{ border: '1px solid var(--op-line)', background: 'var(--op-paper-2)' }}>
            <p className="mb-3 text-[15px]" style={{ color: 'var(--op-muted)' }}>Don&apos;t see a role that fits? We hire for people before roles.</p>
            <a href="/contact" className="text-[15px] font-medium transition-colors" style={{ color: 'var(--op-indigo)' }}>Send us a general application &rarr;</a>
          </div>
        </div>
      </section>

      {/* Perks */}
      <section className="op-soft" style={{ paddingTop: 80, paddingBottom: 80 }}>
        <div className="op-wrap">
          <h2 className="mb-10 text-center font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ letterSpacing: '-0.025em', color: 'var(--op-ink)' }}>Benefits &amp; perks</h2>
          <div className="mx-auto grid max-w-[860px] gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {perks.map((perk) => (
              <div key={perk} className="op-lift flex items-center gap-3 rounded-2xl px-5 py-4" style={{ background: 'var(--op-paper)', border: '1px solid var(--op-line)' }}>
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: 'var(--op-indigo)' }} />
                <span className="text-[14px]" style={{ letterSpacing: '-0.01em', color: 'var(--op-ink)' }}>{perk}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA — shared SharedCTA (21st.dev: shadcnblocks/cta11) */}
      <section className="op-light" style={{ paddingTop: 88, paddingBottom: 88 }}>
        <SharedCTA
          badge="We hire for people before roles"
          heading="Ready to join the team?"
          description="Browse open roles above or send us a note directly — we read every application."
          primary={{ label: 'See open roles', href: '#open-roles' }}
          secondary={{ label: 'Get in touch', href: '/contact' }}
        />
      </section>
    </div>
  );
}
