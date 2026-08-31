import type { Metadata } from 'next';
import { Target, Zap, Users } from 'lucide-react';
import { aboutPageContent } from '@/lib/marketing-content';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { organizationSchema, breadcrumbSchema } from '@/lib/seo-schemas';
import SubPageHero from '@/components/shared/SubPageHero';
import SharedCTA from '@/components/shared/SharedCTA';
import TeamCards from '@/components/about/TeamCards';

export const metadata: Metadata = {
  ...aboutPageContent.metadata,
  keywords: [
    'AgentFarms about', 'AI worker platform company', 'governed AI company India',
    'AI staffing platform founders', 'AgentFarms team', 'AI automation startup',
  ],
  alternates: { canonical: 'https://agentfarms.in/about' },
  openGraph: {
    title: aboutPageContent.metadata.title,
    description: aboutPageContent.metadata.description,
    url: 'https://agentfarms.in/about',
    type: 'website',
  },
};

const valueIcons = { target: Target, zap: Zap, users: Users } as const;

const pageSchemas = [
  organizationSchema,
  breadcrumbSchema([
    { name: 'Home', url: 'https://agentfarms.in' },
    { name: 'About', url: 'https://agentfarms.in/about' },
  ]),
];

export default function AboutPage() {
  const { hero, stats, mission, values, teamIntro, team, backers, cta } = aboutPageContent;

  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pageSchemas) }} />

      {/* Hero — shared SubPageHero (21st.dev: felipemenezes098/hero-02) */}
      <SubPageHero
        eyebrow={hero.eyebrow}
        titleLead={hero.titleLead}
        titleAccent={hero.titleAccent}
        description={hero.description}
        primary={{ label: 'Get early access', href: '/#waitlist' }}
        secondary={{ label: 'Get in touch', href: '/contact' }}
        visual={
          <div className="mx-auto w-full max-w-sm rounded-2xl p-6" style={{ background: 'var(--op-paper)', border: '1px solid var(--op-line)', boxShadow: '0 24px 50px -28px rgba(16,24,40,0.22)' }}>
            <p className="mb-4 font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.14em]" style={{ color: 'var(--op-muted)' }}>Company snapshot</p>
            <div className="grid grid-cols-2 gap-3">
              {stats.map((s) => (
                <div key={s.label} className="rounded-xl p-4" style={{ background: 'var(--op-paper-2)', border: '1px solid var(--op-line)' }}>
                  <p className="font-[family-name:var(--font-display)] text-xl font-extrabold" style={{ color: 'var(--op-ink)', letterSpacing: '-0.02em' }}>{s.value}</p>
                  <p className="mt-1 text-[12px]" style={{ color: 'var(--op-muted)' }}>{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        }
      />

      {/* Mission — split content */}
      <section className="op-light" style={{ paddingTop: 80, paddingBottom: 80 }}>
        <div className="op-wrap">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <p className="op-eyebrow">{mission.eyebrow}</p>
              <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ lineHeight: 1.07, color: 'var(--op-ink)' }}>{mission.title}</h2>
              <p className="mt-4 text-[17px]" style={{ lineHeight: 1.47, color: 'var(--op-ink-soft)' }}>{mission.description}</p>
              <div className="mt-6 grid grid-cols-2 gap-3">
                {mission.callouts.map((c) => (
                  <div key={c.label} className="rounded-2xl p-4" style={{ border: '1px solid var(--op-line)', background: 'var(--op-paper-2)' }}>
                    <p className="font-[family-name:var(--font-display)] text-2xl font-extrabold" style={{ color: 'var(--op-ink)', letterSpacing: '-0.025em' }}>{c.value}</p>
                    <p className="mt-0.5 text-[13px]" style={{ color: 'var(--op-muted)' }}>{c.label}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="overflow-hidden rounded-2xl" style={{ border: '1px solid var(--op-line)', boxShadow: '0 24px 56px -24px rgba(16,24,40,0.2)' }}>
              <img src={mission.image} alt={mission.imageAlt} className="h-72 w-full object-cover" loading="lazy" />
              <div className="px-5 py-4" style={{ background: 'var(--op-paper-2)', borderTop: '1px solid var(--op-line)' }}>
                <p className="text-[15px] font-semibold" style={{ color: 'var(--op-ink)' }}>{mission.imageCaptionTitle}</p>
                <p className="mt-0.5 text-[13px]" style={{ color: 'var(--op-muted)' }}>{mission.imageCaptionBody}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="op-soft" style={{ paddingTop: 80, paddingBottom: 80 }}>
        <div className="op-wrap">
          <h2 className="font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ letterSpacing: '-0.025em', color: 'var(--op-ink)' }}>What we believe</h2>
          <p className="mt-3 max-w-2xl text-[17px]" style={{ lineHeight: 1.5, color: 'var(--op-muted)' }}>{teamIntro}</p>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {values.map((v) => {
              const Icon = valueIcons[v.icon];
              return (
                <div key={v.title} className="op-lift rounded-2xl p-6" style={{ background: 'var(--op-paper)', border: '1px solid var(--op-line)' }}>
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-[10px]" style={{ background: 'var(--op-indigo-soft)' }}>
                    <Icon className="h-5 w-5" style={{ color: 'var(--op-indigo)' }} />
                  </div>
                  <h3 className="mb-2 text-[17px] font-semibold" style={{ letterSpacing: '-0.018em', color: 'var(--op-ink)' }}>{v.title}</h3>
                  <p className="text-[15px]" style={{ lineHeight: 1.5, color: 'var(--op-muted)' }}>{v.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Team — pulled TeamCards (21st.dev: ravikatiyar162/team-section-1) */}
      <section className="op-light" style={{ paddingTop: 80, paddingBottom: 80 }}>
        <div className="op-wrap mb-10 text-center">
          <p className="op-eyebrow">The team</p>
          <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ letterSpacing: '-0.025em', color: 'var(--op-ink)' }}>Builders behind AgentFarms</h2>
        </div>
        <TeamCards members={team.map((m) => ({ name: m.name, role: m.role, bio: m.bio, photo: m.photo, social: { linkedin: '#' } }))} />
      </section>

      {/* Backers */}
      <section className="op-soft text-center" style={{ paddingTop: 64, paddingBottom: 64 }}>
        <div className="op-wrap">
          <p className="mb-8 text-[12px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--op-muted)' }}>Backed by builders who care about durable systems</p>
          <div className="flex flex-wrap justify-center gap-3">
            {backers.map((b) => (
              <span key={b} className="rounded-full px-5 py-2.5 text-[15px] font-semibold" style={{ background: 'var(--op-paper)', border: '1px solid var(--op-line)', color: 'var(--op-ink)' }}>{b}</span>
            ))}
          </div>
        </div>
      </section>

      {/* CTA — shared SharedCTA (21st.dev: shadcnblocks/cta11) */}
      <section className="op-light" style={{ paddingTop: 88, paddingBottom: 88 }}>
        <SharedCTA
          badge="Now onboarding early teams"
          heading={cta.title}
          description={cta.description}
          primary={{ label: cta.primary.label, href: cta.primary.href }}
          secondary={{ label: cta.secondary.label, href: cta.secondary.href }}
        />
      </section>
    </div>
  );
}
