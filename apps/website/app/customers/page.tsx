import type { Metadata } from 'next';
import { customersPageContent as C } from '@/lib/marketing-content';
import SubPageHero from '@/components/shared/SubPageHero';
import SharedCTA from '@/components/shared/SharedCTA';
import CustomerClientsStack from '@/components/customers/CustomerClientsStack';

export const metadata: Metadata = C.metadata;

const featured = C.caseStudies[0];

export default function CustomersPage() {
  return (
    <div>
      <SubPageHero
        eyebrow={C.hero.eyebrow}
        titleLead={C.hero.titleLead}
        titleAccent={C.hero.titleAccent}
        description={C.hero.description}
        primary={{ label: C.hero.primary.label, href: C.hero.primary.href }}
        secondary={{ label: 'View pricing', href: '/pricing' }}
        visual={
          <div className="mx-auto w-full max-w-sm rounded-2xl p-6" style={{ background: 'var(--op-paper)', border: '1px solid var(--op-line)', boxShadow: '0 24px 50px -28px rgba(16,24,40,0.22)' }}>
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl text-sm font-bold text-white" style={{ background: 'var(--op-indigo)' }}>{featured.initials}</span>
              <div>
                <p className="text-[14px] font-semibold" style={{ color: 'var(--op-ink)' }}>{featured.company}</p>
                <p className="text-[12px]" style={{ color: 'var(--op-muted)' }}>{featured.tagline}</p>
              </div>
            </div>
            <div className="space-y-2">
              {featured.metrics.slice(0, 3).map((m) => (
                <div key={m.label} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: 'var(--op-paper-2)', border: '1px solid var(--op-line)' }}>
                  <span className="text-[12px]" style={{ color: 'var(--op-ink-soft)' }}>{m.label}</span>
                  <span className="flex items-center gap-1.5 text-[12px]"><span style={{ color: 'var(--op-muted)', textDecoration: 'line-through' }}>{m.before}</span><span className="font-bold" style={{ color: 'var(--op-indigo)' }}>→ {m.after}</span></span>
                </div>
              ))}
            </div>
          </div>
        }
      />

      {/* Logo strip */}
      <section className="op-soft" style={{ paddingTop: 40, paddingBottom: 40 }}>
        <div className="op-wrap text-center">
          <p className="mb-8 text-[13px]" style={{ color: 'var(--op-muted)' }}>{C.logosTitle}</p>
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
            {C.logos.map((l) => (
              <span key={l.name} className="inline-flex items-center gap-2 text-[15px] font-semibold" style={{ color: 'var(--op-muted)' }}>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg text-[11px] font-bold" style={{ background: 'var(--op-paper-3)', color: 'var(--op-ink-soft)' }}>{l.initials}</span>
                {l.name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Stats + case studies (21st.dev: ravikatiyar162/testimonial-card) */}
      <section className="op-light" style={{ paddingTop: 72, paddingBottom: 72 }}>
        <CustomerClientsStack />
      </section>

      {/* CTA (21st.dev: shadcnblocks/cta11) */}
      <section className="op-soft" style={{ paddingTop: 88, paddingBottom: 88 }}>
        <SharedCTA
          badge="14-day free trial · no card required"
          heading={C.cta.title}
          description={C.cta.description}
          primary={{ label: C.cta.primary.label, href: C.cta.primary.href }}
          secondary={{ label: 'Talk to sales', href: '/book-demo' }}
          trustItems={['Policy-aware approvals', 'Tenant-isolated runtime', 'Full evidence trail']}
        />
      </section>
    </div>
  );
}
