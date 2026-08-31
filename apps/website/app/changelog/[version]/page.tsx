import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, CalendarDays, Tag } from 'lucide-react';
import { changelogEntriesContent, changelogListingContent } from '@/lib/marketing-content';
import { statusStyle } from '@/components/changelog/changelog-shared';
import SharedCTA from '@/components/shared/SharedCTA';

type VersionedEntry = (typeof changelogEntriesContent)[number] & {
  version: string;
  versionSlug: string;
  summary: string;
  highlights: readonly string[];
};

const versionedEntries = changelogEntriesContent.filter(
  (entry): entry is VersionedEntry => 'versionSlug' in entry,
);

export function generateStaticParams() {
  return versionedEntries.map((entry) => ({ version: entry.versionSlug }));
}

export async function generateMetadata({ params }: { params: Promise<{ version: string }> }): Promise<Metadata> {
  const { version } = await params;
  const entry = versionedEntries.find((item) => item.versionSlug === version);
  if (!entry) return changelogListingContent.metadata;
  return {
    title: `${entry.version} — ${entry.title} — AgentFarms`,
    description: entry.summary,
    openGraph: { title: `${entry.version} — ${entry.title}`, description: entry.summary, url: `https://agentfarms.in/changelog/${entry.versionSlug}`, type: 'article' },
  };
}

export default async function ChangelogVersionPage({ params }: { params: Promise<{ version: string }> }) {
  const { version } = await params;
  const entry = versionedEntries.find((item) => item.versionSlug === version);
  if (!entry) notFound();

  const sc = statusStyle[entry.status] ?? statusStyle.planned;

  return (
    <article>
      <section className="op-light" style={{ paddingTop: 56, paddingBottom: 72 }}>
        <div className="op-wrap-narrow">
          <Link href="/changelog" className="inline-flex items-center gap-1.5 text-sm transition-colors" style={{ color: 'var(--op-muted)' }}>
            <ArrowLeft className="h-4 w-4" /> Back to changelog
          </Link>

          <div className="mt-8 rounded-3xl p-8" style={{ background: 'var(--op-paper)', border: '1px solid var(--op-line)', boxShadow: '0 24px 56px -34px rgba(16,24,40,0.18)' }}>
            <div className="flex flex-wrap items-center gap-2 text-[12px]">
              <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-[family-name:var(--font-mono)] font-semibold" style={{ background: 'var(--op-indigo-soft)', color: 'var(--op-indigo)' }}>
                <Tag className="h-3.5 w-3.5" /> {entry.version}
              </span>
              <span className="inline-flex items-center rounded-full px-2.5 py-0.5 font-semibold" style={{ background: sc.bg, color: sc.color }}>{sc.label}</span>
              <span className="inline-flex items-center gap-1" style={{ color: 'var(--op-muted)' }}><CalendarDays className="h-3.5 w-3.5" /> {entry.date}</span>
            </div>

            <h1 className="mt-4 font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight" style={{ letterSpacing: '-0.025em', color: 'var(--op-ink)' }}>{entry.title}</h1>
            <p className="mt-4" style={{ lineHeight: 1.7, color: 'var(--op-ink-soft)' }}>{entry.summary}</p>

            <h2 className="mt-8 text-[12px] font-bold uppercase tracking-[0.1em]" style={{ color: 'var(--op-muted)' }}>Highlights</h2>
            <ul className="mt-3 space-y-2">
              {entry.highlights.map((highlight) => (
                <li key={highlight} className="flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-[14px]" style={{ border: '1px solid var(--op-line)', background: 'var(--op-paper-2)', color: 'var(--op-ink-soft)' }}>
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full" style={{ background: 'var(--op-indigo)' }} />
                  <span style={{ lineHeight: 1.5 }}>{highlight}</span>
                </li>
              ))}
            </ul>

            {entry.tags && entry.tags.length > 0 && (
              <div className="mt-6 flex flex-wrap gap-1.5">
                {entry.tags.map((tag) => <span key={tag} className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: 'var(--op-indigo-soft)', color: 'var(--op-indigo)' }}>{tag}</span>)}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* CTA — shared SharedCTA (21st.dev: shadcnblocks/cta11) */}
      <section className="op-soft" style={{ paddingTop: 80, paddingBottom: 80 }}>
        <SharedCTA
          badge="Shipped weekly"
          heading="Get every improvement automatically"
          description="Deploy a governed AI worker and every release lands for you — no migrations, no upgrades to manage."
          primary={{ label: 'Start free trial', href: '/get-started' }}
          secondary={{ label: 'Back to changelog', href: '/changelog' }}
        />
      </section>
    </article>
  );
}
