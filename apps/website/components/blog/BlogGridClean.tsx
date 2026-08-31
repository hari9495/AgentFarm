/**
 * Option B — blog listing adapted from 21st.dev `efferd/blog-section`: a clean
 * uniform grid, each card = 16:9 image + meta row (category · date · read time) +
 * title + excerpt, with a soft hover surface. Operations Console palette; the
 * component's LazyImage (radix aspect-ratio + framer-motion) reduced to a native
 * <img> with CSS aspect-ratio — no extra deps.
 */

import Link from 'next/link';
import type { BlogPost } from './BlogGridBento';

export default function BlogGridClean({ posts }: { posts: BlogPost[] }) {
  return (
    <div className="op-wrap-wide">
      <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
        {posts.map((post) => (
          <Link key={post.slug} href={`/blog/${post.slug}`} className="op-lift group flex flex-col gap-2 rounded-xl p-2">
            <div className="overflow-hidden rounded-lg" style={{ border: '1px solid var(--op-line)', aspectRatio: '16 / 9' }}>
              <img src={post.image} alt={post.title} loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
            </div>
            <div className="space-y-2 px-2 pb-2">
              <div className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--op-muted)' }}>
                <span style={{ color: 'var(--op-indigo)' }}>{post.category}</span>
                <span className="h-1 w-1 rounded-full" style={{ background: 'var(--op-muted)' }} />
                <span>{post.date}</span>
                <span className="h-1 w-1 rounded-full" style={{ background: 'var(--op-muted)' }} />
                <span>{post.readTime}</span>
              </div>
              <h2 className="line-clamp-2 text-[17px] font-semibold leading-snug tracking-tight transition-colors group-hover:text-[color:var(--op-indigo)]" style={{ color: 'var(--op-ink)' }}>{post.title}</h2>
              <p className="line-clamp-3 text-[13px]" style={{ lineHeight: 1.55, color: 'var(--op-muted)' }}>{post.excerpt}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
