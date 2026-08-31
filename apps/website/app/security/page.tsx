import type { Metadata } from 'next';
import { ArrowRight, CheckCircle2, Shield } from 'lucide-react';
import { securityPageContent } from '@/lib/marketing-content';
import { breadcrumbSchema } from '@/lib/seo-schemas';
import { securityIconMap } from '@/components/security/security-icons';
import SecurityFeaturesCards from '@/components/security/SecurityFeaturesCards';
import SubPageHero from '@/components/shared/SubPageHero';
import SharedFAQ from '@/components/shared/SharedFAQ';
import SharedCTA from '@/components/shared/SharedCTA';

export const metadata: Metadata = {
  ...securityPageContent.metadata,
  keywords: [
    'AgentFarms security', 'AI platform SOC 2', 'governed AI GDPR',
    'AI worker data isolation', 'enterprise AI security India',
    'AI platform compliance', 'HIPAA ready AI platform', 'AI audit trail',
    'tenant isolated AI runtime', 'secure AI workers',
  ],
  alternates: { canonical: 'https://agentfarms.in/security' },
  openGraph: {
    title: securityPageContent.metadata.title,
    description: securityPageContent.metadata.description,
    url: 'https://agentfarms.in/security',
    type: 'website',
  },
};

const pageSchemas = [
  breadcrumbSchema([
    { name: 'Home', url: 'https://agentfarms.in' },
    { name: 'Security', url: 'https://agentfarms.in/security' },
  ]),
];

export default function SecurityPage() {
  const { hero, certifications, certificationsTitle, architectureTitle, architectureSubtitle, features, checklist, faqs, cta } = securityPageContent;

  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pageSchemas) }} />

      {/* Hero — shared SubPageHero (21st.dev: felipemenezes098/hero-02) */}
      <SubPageHero
        eyebrow={hero.eyebrow}
        titleLead={hero.titleLead}
        titleAccent={hero.titleAccent}
        description={hero.description}
        primary={{ label: hero.primary.label, href: hero.primary.href }}
        secondary={{ label: hero.secondary.label, href: hero.secondary.href }}
        visual={
          <div className="mx-auto w-full max-w-sm rounded-2xl p-6" style={{ background: 'var(--op-paper)', border: '1px solid var(--op-line)', boxShadow: '0 24px 50px -28px rgba(16,24,40,0.22)' }}>
            <p className="mb-4 font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.14em]" style={{ color: 'var(--op-muted)' }}>Compliance posture</p>
            <div className="space-y-2.5">
              {certifications.map((cert) => {
                const Icon = securityIconMap[cert.icon] ?? Shield;
                return (
                  <div key={cert.name} className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: 'var(--op-paper-2)', border: '1px solid var(--op-line)' }}>
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: 'var(--op-indigo-soft)' }}>
                      <Icon className="h-4 w-4" style={{ color: 'var(--op-indigo)' }} />
                    </span>
                    <span className="text-[13px] font-semibold" style={{ color: 'var(--op-ink)' }}>{cert.name}</span>
                  </div>
                );
              })}
            </div>
          </div>
        }
      />

      {/* Certifications */}
      <section className="op-soft" style={{ paddingTop: 64, paddingBottom: 64 }}>
        <div className="op-wrap">
          <p className="mb-10 text-center text-[12px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--op-muted)' }}>{certificationsTitle}</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {certifications.map((cert) => {
              const Icon = securityIconMap[cert.icon] ?? Shield;
              return (
                <div key={cert.name} className="op-lift rounded-2xl p-6 text-center" style={{ background: 'var(--op-paper)', border: '1px solid var(--op-line)' }}>
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-[12px]" style={{ background: 'var(--op-indigo-soft)' }}>
                    <Icon className="h-6 w-6" style={{ color: 'var(--op-indigo)' }} />
                  </div>
                  <p className="mb-2 text-[15px] font-semibold" style={{ color: 'var(--op-ink)' }}>{cert.name}</p>
                  <p className="text-[13px]" style={{ lineHeight: 1.5, color: 'var(--op-muted)' }}>{cert.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Architecture features — pulled SecurityFeaturesCards (21st.dev: gooseui icon cards) */}
      <section className="op-light" style={{ paddingTop: 80, paddingBottom: 80 }}>
        <SecurityFeaturesCards title={architectureTitle} subtitle={architectureSubtitle} features={features} />
      </section>

      {/* Security checklist */}
      <section className="op-soft" style={{ paddingTop: 80, paddingBottom: 80 }}>
        <div className="op-wrap">
          <div className="mb-10 text-center">
            <p className="op-eyebrow">{checklist.eyebrow}</p>
            <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ letterSpacing: '-0.025em', color: 'var(--op-ink)' }}>{checklist.title}</h2>
            <p className="mx-auto mt-3 max-w-md text-[17px]" style={{ lineHeight: 1.47, color: 'var(--op-muted)' }}>{checklist.description}</p>
          </div>
          <div className="mx-auto mb-8 grid max-w-[800px] gap-3 sm:grid-cols-2">
            {checklist.items.map((item) => (
              <div key={item} className="flex items-start gap-2.5 rounded-2xl px-5 py-4" style={{ border: '1px solid var(--op-line)', background: 'var(--op-paper)' }}>
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--op-indigo)' }} />
                <span className="text-[14px]" style={{ lineHeight: 1.5, color: 'var(--op-ink)' }}>{item}</span>
              </div>
            ))}
          </div>
          <div className="text-center">
            <a href={checklist.buttonHref} className="inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-[15px] font-medium text-white" style={{ background: 'var(--op-indigo)' }}>
              {checklist.buttonLabel} <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </section>

      {/* FAQ — shared SharedFAQ (21st.dev: moumensoliman/faq-section) */}
      <section className="op-light" style={{ paddingTop: 80, paddingBottom: 80 }}>
        <SharedFAQ heading="Security FAQ" faqs={faqs.map((f) => ({ question: f.question, answer: f.answer }))} />
      </section>

      {/* CTA — shared SharedCTA (21st.dev: shadcnblocks/cta11) */}
      <section className="op-soft" style={{ paddingTop: 88, paddingBottom: 88 }}>
        <SharedCTA
          badge="Enterprise-grade by default"
          heading={cta.title}
          description={cta.description}
          primary={{ label: cta.primary.label, href: cta.primary.href }}
          secondary={{ label: cta.secondary.label, href: cta.secondary.href }}
        />
      </section>
    </div>
  );
}
