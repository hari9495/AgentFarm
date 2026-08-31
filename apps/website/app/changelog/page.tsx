import type { Metadata } from 'next';
import { changelogEntriesContent, changelogListingContent } from '@/lib/marketing-content';
import ChangelogTimeline from '@/components/changelog/ChangelogTimeline';
import SubPageHero from '@/components/shared/SubPageHero';
import SharedCTA from '@/components/shared/SharedCTA';

export const metadata: Metadata = {
  ...changelogListingContent.metadata,
  alternates: { canonical: 'https://agentfarms.in/changelog' },
  openGraph: {
    title: changelogListingContent.metadata.title,
    description: changelogListingContent.metadata.description,
    url: 'https://agentfarms.in/changelog',
    type: 'website',
  },
};

export default function ChangelogPage() {
  const { hero } = changelogListingContent;
  const shipped = changelogEntriesContent.filter((e) => e.status === 'shipped').length;
  const planned = changelogEntriesContent.filter((e) => e.status !== 'shipped').length;

  return (
    <div>
      {/* Hero — shared SubPageHero (21st.dev: felipemenezes098/hero-02) */}
      <SubPageHero
        eyebrow={hero.eyebrow}
        titleLead={hero.titleLead}
        titleAccent={hero.titleAccent}
        description={hero.description}
        primary={{ label: 'Start free trial', href: '/get-started' }}
        secondary={{ label: 'Read the blog', href: '/blog' }}
        visual={
          <div className="mx-auto w-full max-w-sm rounded-2xl p-6" style={{ background: 'var(--op-paper)', border: '1px solid var(--op-line)', boxShadow: '0 24px 50px -28px rgba(16,24,40,0.22)' }}>
            <p className="mb-4 font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.14em]" style={{ color: 'var(--op-muted)' }}>Release cadence</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl p-4" style={{ background: 'var(--op-approved-soft, #e7f6ee)' }}>
                <p className="font-[family-name:var(--font-display)] text-2xl font-extrabold" style={{ color: 'var(--op-approved)' }}>{shipped}</p>
                <p className="mt-1 text-[12px]" style={{ color: 'var(--op-muted)' }}>Shipped</p>
              </div>
              <div className="rounded-xl p-4" style={{ background: 'var(--op-pending-soft, #fdf3e2)' }}>
                <p className="font-[family-name:var(--font-display)] text-2xl font-extrabold" style={{ color: 'var(--op-pending)' }}>{planned}</p>
                <p className="mt-1 text-[12px]" style={{ color: 'var(--op-muted)' }}>In progress / planned</p>
              </div>
            </div>
          </div>
        }
      />

      {/* Entries — pulled ChangelogTimeline (21st.dev: shadcnblocks/changelog-1) */}
      <section className="op-light" style={{ paddingTop: 56, paddingBottom: 80 }}>
        <ChangelogTimeline entries={changelogEntriesContent} filters={changelogListingContent.filters} />
      </section>

      {/* CTA — shared SharedCTA (21st.dev: shadcnblocks/cta11) */}
      <section className="op-soft" style={{ paddingTop: 88, paddingBottom: 88 }}>
        <SharedCTA
          badge="Shipped weekly"
          heading="Want these updates as they land?"
          description="Deploy a worker today and get every improvement automatically — no migrations, no upgrades to manage."
          primary={{ label: 'Start free trial', href: '/get-started' }}
          secondary={{ label: 'Read the blog', href: '/blog' }}
        />
      </section>
    </div>
  );
}
