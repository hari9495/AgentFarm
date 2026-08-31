import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Calendar, Clock, Tag } from 'lucide-react';
import { blogListingContent, blogPostsContent } from '@/lib/marketing-content';
import SharedCTA from '@/components/shared/SharedCTA';

export function generateStaticParams() {
  return blogPostsContent.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = blogPostsContent.find((entry) => entry.slug === slug);
  if (!post) return blogListingContent.metadata;
  return {
    title: `${post.title} — AgentFarms`,
    description: post.excerpt,
    openGraph: { title: post.title, description: post.excerpt, url: `https://agentfarms.in/blog/${post.slug}`, type: 'article', images: post.image ? [post.image] : undefined },
  };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = blogPostsContent.find((entry) => entry.slug === slug);
  if (!post) notFound();

  const related = blogPostsContent.filter((entry) => entry.slug !== post.slug && entry.category === post.category).slice(0, 2);

  return (
    <article>
      {/* Header */}
      <section className="op-light" style={{ paddingTop: 56, paddingBottom: 40 }}>
        <div className="op-wrap-narrow">
          <Link href="/blog" className="mb-8 inline-flex items-center gap-1.5 text-sm transition-colors" style={{ color: 'var(--op-muted)' }}>
            <ArrowLeft className="h-4 w-4" /> All posts
          </Link>

          <div className="mb-5 flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold" style={{ background: 'var(--op-indigo-soft)', color: 'var(--op-indigo)' }}>
              <Tag className="h-3 w-3" /> {post.category}
            </span>
            <span className="flex items-center gap-1.5 text-[12px]" style={{ color: 'var(--op-muted)' }}><Calendar className="h-3.5 w-3.5" /> {post.date}</span>
            <span className="flex items-center gap-1.5 text-[12px]" style={{ color: 'var(--op-muted)' }}><Clock className="h-3.5 w-3.5" /> {post.readTime}</span>
          </div>

          <h1 className="mb-6 font-[family-name:var(--font-display)] text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl" style={{ letterSpacing: '-0.03em', color: 'var(--op-ink)' }}>{post.title}</h1>
          <p className="mb-8 text-[18px]" style={{ lineHeight: 1.6, color: 'var(--op-ink-soft)' }}>{post.excerpt}</p>

          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: 'var(--op-indigo)' }}>{post.author.initials}</div>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--op-ink)' }}>{post.author.name}</p>
              <p className="text-xs" style={{ color: 'var(--op-muted)' }}>{post.author.role}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Cover image */}
      {post.image && (
        <div className="op-wrap-narrow" style={{ marginBottom: 8 }}>
          <div className="overflow-hidden rounded-2xl" style={{ border: '1px solid var(--op-line)', aspectRatio: '16 / 9' }}>
            <img src={post.image} alt={post.title} className="h-full w-full object-cover" />
          </div>
        </div>
      )}

      {/* Body */}
      <section className="op-light" style={{ paddingTop: 40, paddingBottom: 72 }}>
        <div className="op-wrap-narrow">
          <div className="max-w-none">
            {post.body.map((paragraph) => (
              <p key={paragraph} className="mb-6 text-[16px] last:mb-0" style={{ lineHeight: 1.75, color: 'var(--op-ink-soft)' }}>{paragraph}</p>
            ))}
          </div>

          {related.length > 0 && (
            <>
              <hr className="my-12" style={{ border: 'none', borderTop: '1px solid var(--op-line)' }} />
              <p className="mb-5 text-[12px] font-semibold uppercase tracking-[0.1em]" style={{ color: 'var(--op-muted)' }}>More in {post.category}</p>
              <div className="grid gap-4 sm:grid-cols-2">
                {related.map((entry) => (
                  <Link key={entry.slug} href={`/blog/${entry.slug}`} className="op-lift group block rounded-2xl p-5" style={{ background: 'var(--op-paper)', border: '1px solid var(--op-line)' }}>
                    <span className="mb-3 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: 'var(--op-indigo-soft)', color: 'var(--op-indigo)' }}>{entry.category}</span>
                    <p className="mb-2 text-sm font-bold leading-snug transition-colors group-hover:text-[color:var(--op-indigo)]" style={{ color: 'var(--op-ink)' }}>{entry.title}</p>
                    <p className="text-xs" style={{ color: 'var(--op-muted)' }}>{entry.readTime} · {entry.date}</p>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      {/* CTA — shared SharedCTA (21st.dev: shadcnblocks/cta11) */}
      <section className="op-soft" style={{ paddingTop: 80, paddingBottom: 80 }}>
        <SharedCTA
          badge="14-day free trial · no card required"
          heading={blogListingContent.postCta.title}
          description={blogListingContent.postCta.description}
          primary={{ label: blogListingContent.postCta.buttonLabel, href: blogListingContent.postCta.buttonHref }}
          secondary={{ label: 'Read more posts', href: '/blog' }}
        />
      </section>
    </article>
  );
}
