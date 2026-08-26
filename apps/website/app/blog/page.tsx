import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { blogListingContent, blogPostsContent } from "@/lib/marketing-content";

export const metadata: Metadata = blogListingContent.metadata;

const featuredPost = blogPostsContent[0];
const otherPosts = blogPostsContent.slice(1);

const categoryColors: Record<string, { bg: string; text: string }> = {
    Product: { bg: "rgba(37,99,235,0.08)", text: "var(--op-indigo)" },
    Engineering: { bg: "rgba(88,86,214,0.08)", text: "#5856d6" },
    Insights: { bg: "rgba(52,199,89,0.08)", text: "#1a7a4a" },
};

function categoryStyle(cat: string) {
    return categoryColors[cat] ?? { bg: "rgba(37,99,235,0.08)", text: "var(--op-indigo)" };
}

export default function BlogPage() {
    const { hero } = blogListingContent;

    return (
        <div style={{ background: "#ffffff" }}>

            {/* Hero */}
            <section className="af-tile af-tile-white text-center" style={{ paddingTop: 80, paddingBottom: 56 }}>
                <div className="af-container-narrow">
                    <p className="af-eyebrow mb-4">{hero.eyebrow}</p>
                    <h1 className="font-semibold text-[var(--op-ink)]" style={{ fontSize: "clamp(2.4rem, 5vw, 3.6rem)", letterSpacing: "-0.03em", lineHeight: 1.07 }}>
                        {hero.titleLead}{" "}
                        <span className="text-[var(--op-indigo)]">{hero.titleAccent}</span>
                    </h1>
                    <p className="mt-5 text-[17px] text-[var(--op-ink-soft)] max-w-lg mx-auto" style={{ lineHeight: 1.47 }}>{hero.description}</p>
                </div>
            </section>

            {/* Featured post — parchment */}
            <section className="af-tile af-tile-parchment" style={{ paddingTop: 0, paddingBottom: 56 }}>
                <div className="af-container-wide">
                    <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--op-muted)] mb-5">
                        {blogListingContent.featuredLabel}
                    </p>
                    <Link
                        href={`/blog/${featuredPost.slug}`}
                        className="group flex flex-col md:flex-row gap-0 rounded-[18px] overflow-hidden transition-all hover:shadow-xl"
                        style={{ border: "1px solid var(--op-line)", boxShadow: "0 8px 24px -12px rgba(0,0,0,0.1)" }}
                    >
                        <div className="md:w-2/5 h-56 md:h-auto overflow-hidden shrink-0">
                            <img
                                src={featuredPost.image}
                                alt={featuredPost.title}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                loading="eager"
                            />
                        </div>
                        <div className="flex flex-col justify-center px-7 py-8 flex-1" style={{ background: "#ffffff" }}>
                            <span
                                className="self-start text-[11px] font-semibold uppercase tracking-[0.06em] px-2.5 py-1 rounded-full mb-3"
                                style={{ background: categoryStyle(featuredPost.category).bg, color: categoryStyle(featuredPost.category).text }}
                            >
                                {featuredPost.category}
                            </span>
                            <h2 className="font-semibold text-[var(--op-ink)] mb-3 group-hover:text-[var(--op-indigo)] transition-colors" style={{ fontSize: "clamp(1.3rem, 2.5vw, 1.6rem)", letterSpacing: "-0.02em", lineHeight: 1.2 }}>
                                {featuredPost.title}
                            </h2>
                            <p className="text-[15px] text-[var(--op-muted)] mb-5" style={{ lineHeight: 1.6 }}>{featuredPost.excerpt}</p>
                            <div className="flex items-center gap-3">
                                <span className="text-[13px] text-[var(--op-muted)]">{featuredPost.date} · {featuredPost.readTime}</span>
                                <span className="flex items-center gap-1 text-[13px] font-medium text-[var(--op-indigo)]">
                                    {blogListingContent.readNowLabel} <ArrowRight className="w-3.5 h-3.5" />
                                </span>
                            </div>
                        </div>
                    </Link>
                </div>
            </section>

            {/* Post grid — white */}
            <section className="af-tile af-tile-white">
                <div className="af-container-wide">
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                        {otherPosts.map((post) => (
                            <Link
                                key={post.slug}
                                href={`/blog/${post.slug}`}
                                className="group rounded-[18px] overflow-hidden flex flex-col transition-all hover:-translate-y-1 hover:shadow-lg"
                                style={{ border: "1px solid var(--op-line)" }}
                            >
                                <div className="h-44 overflow-hidden">
                                    <img
                                        src={post.image}
                                        alt={post.title}
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                        loading="lazy"
                                    />
                                </div>
                                <div className="flex flex-col flex-1 p-5">
                                    <span
                                        className="self-start text-[11px] font-semibold uppercase tracking-[0.06em] px-2.5 py-1 rounded-full mb-3"
                                        style={{ background: categoryStyle(post.category).bg, color: categoryStyle(post.category).text }}
                                    >
                                        {post.category}
                                    </span>
                                    <h3 className="font-semibold text-[var(--op-ink)] mb-2 flex-1 group-hover:text-[var(--op-indigo)] transition-colors" style={{ fontSize: "15px", letterSpacing: "-0.015em", lineHeight: 1.4 }}>
                                        {post.title}
                                    </h3>
                                    <p className="text-[13px] text-[var(--op-muted)] mb-4" style={{ lineHeight: 1.5 }}>{post.excerpt}</p>
                                    <div className="flex items-center justify-between">
                                        <span className="text-[12px] text-[var(--op-muted)]">{post.date} · {post.readTime}</span>
                                        <span className="text-[12px] font-medium text-[var(--op-indigo)]">Read →</span>
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA — dark */}
            <section className="af-tile af-tile-dark text-center">
                <div className="af-container-narrow">
                    <h2 className="font-semibold text-[color:var(--op-ink)]" style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.6rem)", letterSpacing: "-0.025em", lineHeight: 1.1 }}>
                        Ready to see a worker in action?
                    </h2>
                    <p className="mt-4 text-[17px] text-[var(--op-muted)]" style={{ lineHeight: 1.47 }}>
                        Start free, no credit card needed.
                    </p>
                    <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
                        <Link href="/get-started" className="px-6 py-3 rounded-full text-[17px] font-medium text-white transition-colors" style={{ background: "var(--op-indigo)" }}>
                            Start free trial
                        </Link>
                        <Link href="/changelog" className="px-6 py-3 rounded-full text-[17px] font-medium text-[color:var(--op-ink)] transition-colors" style={{ border: "1px solid var(--op-line)" }}>
                            View changelog
                        </Link>
                    </div>
                </div>
            </section>
        </div>
    );
}
