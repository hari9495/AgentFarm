import type { Metadata } from 'next';
import { CheckCircle2 } from 'lucide-react';
import MarketplaceGrid from '@/components/marketplace/MarketplaceGrid';
import SubPageHero from '@/components/shared/SubPageHero';
import SharedCTA from '@/components/shared/SharedCTA';
import { marketplaceItemListSchema, aggregateRatingSchema, breadcrumbSchema } from '@/lib/seo-schemas';

export const metadata: Metadata = {
  title: 'AI Worker Marketplace — 13 Specialist Roles | AgentFarms',
  description:
    'Browse and hire AI workers across 13 specialist roles — Backend Developer, QA Engineer, Sales Rep, Customer Support, Project Manager, and more. Deploy in under 10 minutes.',
  keywords: [
    'AI worker marketplace', 'hire AI agents', 'AI backend developer',
    'AI QA engineer', 'AI sales rep', 'AI customer support agent',
    'AI project manager', 'AI content writer', 'AI recruiter',
    'AI marketing specialist', 'buy AI worker India', 'AI staffing marketplace',
  ],
  alternates: { canonical: 'https://agentfarms.in/marketplace' },
  openGraph: {
    title: 'AI Worker Marketplace — 13 Specialist Roles | AgentFarms',
    description: 'Browse 13 governed AI worker roles. Deploy in under 10 minutes with human approval gates.',
    url: 'https://agentfarms.in/marketplace',
    type: 'website',
  },
};

const stats = [
  { label: 'AI worker roles', value: '13' },
  { label: 'Avg hire time', value: '< 10 min' },
  { label: 'Actions audited', value: '100%' },
  { label: 'Departments', value: '8' },
];

const launchPaths = [
  { label: 'Start with Engineering & QA', detail: 'Deploy a Backend Developer and QA Engineer pair. PRs open automatically, CI runs, failures fix themselves — engineers review, not babysit.' },
  { label: 'Add Sales & Marketing', detail: 'Sales Rep and Marketing Specialist handle outreach, CRM hygiene, campaign drafts, and follow-up sequences with full human approval on every send.' },
  { label: 'Cover Operations & Support', detail: 'Corporate Assistant, Customer Support, and Project Manager workers for every recurring task that currently eats up your most capable people.' },
];

const trustPoints = [
  '14-day free trial, no card required',
  'Deploy in under 10 minutes',
  'Human approval on every high-risk action',
  'Full audit trail — every task, every decision',
];

const pageSchemas = [
  marketplaceItemListSchema,
  aggregateRatingSchema,
  breadcrumbSchema([
    { name: 'Home', url: 'https://agentfarms.in' },
    { name: 'Marketplace', url: 'https://agentfarms.in/marketplace' },
  ]),
];

export default function MarketplacePage() {
  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pageSchemas) }} />

      {/* Hero — shared SubPageHero (21st.dev: felipemenezes098/hero-02) */}
      <SubPageHero
        eyebrow="Agent marketplace"
        titleLead="Hire an AI worker for every"
        titleAccent="role in your company"
        description="13 specialist AI workers across engineering, sales, marketing, support, and operations. Real tool access, approval gates on every high-stakes action, full evidence trail."
        primary={{ label: 'Start free trial', href: '/get-started' }}
        secondary={{ label: 'Book a live demo', href: '/book-demo' }}
        visual={
          <div className="mx-auto w-full max-w-sm rounded-2xl p-6" style={{ background: 'var(--op-paper)', border: '1px solid var(--op-line)', boxShadow: '0 24px 50px -28px rgba(16,24,40,0.22)' }}>
            <p className="mb-4 font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.14em]" style={{ color: 'var(--op-muted)' }}>Marketplace at a glance</p>
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

      {/* Trust + launch paths */}
      <section className="op-soft" style={{ paddingTop: 56, paddingBottom: 56 }}>
        <div className="op-wrap-wide">
          <ul className="mb-8 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {trustPoints.map((t) => (
              <li key={t} className="flex items-center gap-2 text-[14px]" style={{ color: 'var(--op-ink-soft)' }}>
                <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: 'var(--op-indigo)' }} />
                {t}
              </li>
            ))}
          </ul>
          <div className="grid gap-4 md:grid-cols-3">
            {launchPaths.map((p) => (
              <div key={p.label} className="op-lift rounded-2xl p-5" style={{ border: '1px solid var(--op-line)', background: 'var(--op-paper)' }}>
                <p className="mb-2 text-[15px] font-semibold" style={{ letterSpacing: '-0.015em', color: 'var(--op-ink)' }}>{p.label}</p>
                <p className="text-[13px]" style={{ lineHeight: 1.5, color: 'var(--op-muted)' }}>{p.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Worker catalog — functional grid (search / filter / cart), op palette */}
      <section className="op-light" style={{ paddingTop: 56, paddingBottom: 80 }}>
        <div className="op-wrap-wide">
          <div className="mb-8">
            <h2 className="font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ letterSpacing: '-0.025em', color: 'var(--op-ink)' }}>Browse all workers</h2>
            <p className="mt-2 text-[15px]" style={{ color: 'var(--op-muted)' }}>Filter by department, plan, or search by skill.</p>
          </div>
          <MarketplaceGrid />
        </div>
      </section>

      {/* CTA — shared SharedCTA (21st.dev: shadcnblocks/cta11) */}
      <section className="op-soft" style={{ paddingTop: 88, paddingBottom: 88 }}>
        <SharedCTA
          badge="14-day free trial · no card required"
          heading="Build your first AI team today"
          description="Pick the roles that hurt most, deploy in minutes, and keep a human on every risky move."
          primary={{ label: 'Start free trial', href: '/get-started' }}
          secondary={{ label: 'Book a live demo', href: '/book-demo' }}
          trustItems={['Deploy in under 10 minutes', 'Approval gates by default', 'Full evidence trail']}
        />
      </section>
    </div>
  );
}
