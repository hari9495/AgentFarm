import type { Metadata } from 'next';
import Link from 'next/link';
import { blogListingContent, blogPostsContent } from '@/lib/marketing-content';
import BlogGridClean from '@/components/blog/BlogGridClean';
import SubPageHero from '@/components/shared/SubPageHero';
import SharedCTA from '@/components/shared/SharedCTA';

export const metadata: Metadata = blogListingContent.metadata;

export default function BlogPage() {
  const { hero } = blogListingContent;
  const featured = blogPostsContent[0];

  return (
    <div>
      {/* Hero — shared SubPageHero (21st.dev: felipemenezes098/hero-02) */}
      <SubPageHero
        eyebrow={hero.eyebrow}
        titleLead={hero.titleLead}
        titleAccent={hero.titleAccent}
        description={hero.description}
        primary={{ label: 'Start free trial', href: '/get-started' }}
        secondary={{ label: 'View changelog', href: '/changelog' }}
        visual={
          <Link href={`/blog/${featured.slug}`} className="op-lift mx-auto block w-full max-w-sm overflow-hidden rounded-2xl" style={{ background: 'var(--op-paper)', border: '1px solid var(--op-line)', boxShadow: '0 24px 50px -28px rgba(16,24,40,0.22)' }}>
            <div className="overflow-hidden" style={{ aspectRatio: '16 / 9' }}>
              <img src={featured.image} alt={featured.title} className="h-full w-full object-cover" loading="eager" />
            </div>
            <div className="p-5">
              <span className="text-[12px] font-semibold" style={{ color: 'var(--op-indigo)' }}>{blogListingContent.featuredLabel} · {featured.category}</span>
              <p className="mt-2 text-[15px] font-semibold leading-snug" style={{ color: 'var(--op-ink)' }}>{featured.title}</p>
              <p className="mt-1 text-[12px]" style={{ color: 'var(--op-muted)' }}>{featured.date} · {featured.readTime}</p>
            </div>
          </Link>
        }
      />

      {/* Post grid — pulled BlogGridClean (21st.dev: efferd/blog-section) */}
      <section className="op-light" style={{ paddingTop: 40, paddingBottom: 80 }}>
        <BlogGridClean posts={[...blogPostsContent]} />
      </section>

      {/* CTA — shared SharedCTA (21st.dev: shadcnblocks/cta11) */}
      <section className="op-soft" style={{ paddingTop: 88, paddingBottom: 88 }}>
        <SharedCTA
          badge="14-day free trial · no card required"
          heading="Ready to see a worker in action?"
          description="Start free — no credit card needed — and deploy your first governed AI worker in minutes."
          primary={{ label: 'Start free trial', href: '/get-started' }}
          secondary={{ label: 'View changelog', href: '/changelog' }}
        />
      </section>
    </div>
  );
}
