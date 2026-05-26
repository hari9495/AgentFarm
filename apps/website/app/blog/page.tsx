import type { Metadata } from "next";
import Link from "next/link";
import { blogListingContent, blogPostsContent } from "@/lib/marketing-content";

export const metadata: Metadata = blogListingContent.metadata;

const categoryColors: Record<string, string> = {
    Product: "bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] border border-[var(--accent-blue)]/20",
    Engineering: "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20",
    Insights: "bg-[var(--accent-green)]/10 text-[var(--accent-green)] border border-[var(--accent-green)]/20",
};

const featuredPost = blogPostsContent[0];

export default function BlogPage() {
    const { hero } = blogListingContent;

    return (
        <div>
            <section className="relative overflow-hidden">
                <img
                    src={hero.image}
                    alt={hero.imageAlt}
                    className="w-full h-[360px] sm:h-[440px] object-cover"
                    loading="eager"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-[#07080a]/90 via-[#07080a]/60 to-transparent" />
                <div className="absolute inset-0 flex items-center">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
                        <div className="max-w-2xl">
                            <span className="chip chip-accent mb-5">{hero.eyebrow}</span>
                            <h1 className="mt-3 text-4xl sm:text-6xl font-semibold text-white tracking-[-0.03em]">
                                {hero.titleLead}{" "}
                                <span className="bg-gradient-to-r from-[var(--accent-blue)] to-indigo-300 bg-clip-text text-transparent">
                                    {hero.titleAccent}
                                </span>
                            </h1>
                            <p className="mt-5 text-xl text-slate-300 max-w-2xl leading-relaxed">{hero.description}</p>
                        </div>
                    </div>
                </div>
            </section>

            <section className="py-12 border-b border-[var(--hairline)]">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <p className="chip chip-accent mb-4">{blogListingContent.featuredLabel}</p>
                    <Link
                        href={`/blog/${featuredPost.slug}`}
                        className="group flex flex-col md:flex-row gap-6 rounded-2xl border border-[var(--hairline)] bg-[var(--surface-card)] overflow-hidden hover:-translate-y-0.5 hover:border-[var(--accent-blue)]/30 transition-all"
                    >
                        <div className="relative md:w-2/5 h-52 md:h-auto overflow-hidden shrink-0">
                            <img
                                src={featuredPost.image}
                                alt={featuredPost.title}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                loading="eager"
                            />
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent to-black/20" />
                        </div>
                        <div className="flex flex-col justify-center px-6 py-6 md:py-8 flex-1">
                            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full self-start mb-3 ${categoryColors[featuredPost.category]}`}>
                                {featuredPost.category}
                            </span>
                            <h2 className="text-xl font-semibold text-[var(--ink)] leading-snug mb-3 group-hover:text-[var(--accent-blue)] transition-colors">
                                {featuredPost.title}
                            </h2>
                            <p className="text-sm text-[var(--mute)] leading-relaxed mb-5">{featuredPost.excerpt}</p>
                            <div className="flex items-center gap-3">
                                <span className="text-xs text-[var(--ash)]">
                                    {featuredPost.date} | {featuredPost.readTime}
                                </span>
                                <span className="text-xs font-semibold text-[var(--accent-blue)] group-hover:underline">
                                    {blogListingContent.readNowLabel}
                                </span>
                            </div>
                        </div>
                    </Link>
                </div>
            </section>

            <section className="py-24">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <p className="chip chip-accent mb-8">{blogListingContent.allPostsLabel}</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {blogPostsContent.map((post) => (
                            <Link
                                key={post.slug}
                                href={`/blog/${post.slug}`}
                                className="group border border-[var(--hairline)] rounded-2xl overflow-hidden hover:-translate-y-1 hover:border-[var(--accent-blue)]/30 transition-all flex flex-col bg-[var(--surface-card)]"
                            >
                                <div className="relative h-44 overflow-hidden">
                                    <img
                                        src={post.image}
                                        alt={post.title}
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                        loading="lazy"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                                    <div className="absolute bottom-3 left-3 flex items-center gap-2">
                                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${categoryColors[post.category]}`}>
                                            {post.category}
                                        </span>
                                        {post.slug === blogListingContent.trendingSlug && (
                                            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-rose-500 text-white">
                                                {blogListingContent.trendingLabel}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="p-6 flex flex-col flex-1">
                                    <h2 className="font-semibold text-[var(--ink)] mb-3 leading-snug group-hover:text-[var(--accent-blue)] transition-colors">
                                        {post.title}
                                    </h2>
                                    <p className="text-sm text-[var(--mute)] leading-relaxed flex-1">{post.excerpt}</p>
                                    <div className="mt-5 pt-4 border-t border-[var(--hairline)] flex items-center justify-between">
                                        <p className="text-xs text-[var(--ash)]">
                                            {post.date} | {post.readTime}
                                        </p>
                                        <span className="text-xs font-semibold text-[var(--accent-blue)] group-hover:underline">
                                            {blogListingContent.readLabel}
                                        </span>
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>
            </section>
        </div>
    );
}
