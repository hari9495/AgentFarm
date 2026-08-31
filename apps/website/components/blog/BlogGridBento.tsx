/**
 * Option A — blog listing adapted from 21st.dev `aymanch-03/blog-posts`:
 * a bento grid where the first post is a large primary tile and the rest are
 * smaller, each a full-bleed image with a gradient overlay and text on top.
 * Operations Console palette; rating/views swapped for category + date + read time.
 */

import Link from 'next/link';
import { MoveRight } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface BlogPost { slug: string; title: string; excerpt: string; category: string; date: string; readTime: string; image: string }

export default function BlogGridBento({ posts }: { posts: BlogPost[] }) {
  return (
    <div className="op-wrap-wide">
      <div className="grid h-auto grid-cols-1 gap-5 md:h-[640px] md:grid-cols-2 lg:grid-cols-[1fr_0.5fr]">
        {posts.slice(0, 5).map((post, index) => {
          const isPrimary = index === 0;
          return (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              style={{ backgroundImage: `url(${post.image})` }}
              className={cn(
                'group relative row-span-1 flex size-full flex-col justify-end overflow-hidden rounded-[20px] bg-cover bg-center bg-no-repeat p-5 text-white transition-all duration-300 hover:scale-[0.985] max-md:h-[280px]',
                isPrimary && 'md:col-span-2 md:row-span-2 lg:col-span-1',
              )}
            >
              <div className="absolute inset-0 -z-0 h-[130%] w-full bg-gradient-to-t from-black/80 to-transparent transition-all duration-500 group-hover:h-full" />
              <article className="relative z-0 flex items-end">
                <div className="flex flex-1 flex-col gap-3">
                  <h2 className={cn('font-semibold leading-tight', isPrimary ? 'text-3xl md:text-4xl' : 'text-xl')}>{post.title}</h2>
                  <div className="flex flex-col gap-2">
                    <span className="w-fit rounded-md bg-white/25 px-2 py-px text-[12px] font-medium capitalize text-white backdrop-blur-md">{post.category}</span>
                    <span className="text-[13px] font-light text-white/85">{post.date} · {post.readTime}</span>
                  </div>
                </div>
                <MoveRight className="shrink-0 transition-all duration-300 group-hover:translate-x-2" color="white" width={isPrimary ? 40 : 28} height={isPrimary ? 40 : 28} strokeWidth={1.25} />
              </article>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
