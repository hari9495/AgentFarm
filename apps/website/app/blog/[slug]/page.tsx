import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Bot, Calendar, Clock, Tag } from "lucide-react";
import { blogListingContent, blogPostsContent } from "@/lib/marketing-content";

const categoryColors: Record<string, string> = {
    Product: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",
    Engineering: "bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300",
    Insights: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300",
};

export function generateStaticParams() {
    return blogPostsContent.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
    const { slug } = await params;
    const post = blogPostsContent.find((entry) => entry.slug === slug);

    if (!post) {
        return blogListingContent.metadata;
    }

    return {
        title: `${post.title} - AgentFarms`,
        description: post.excerpt,
    };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const post = blogPostsContent.find((entry) => entry.slug === slug);

    if (!post) {
        notFound();
    }

    const related = blogPostsContent.filter((entry) => entry.slug !== post.slug && entry.category === post.category).slice(0, 2);

    return (
        <article className="site-shell min-h-screen">
            <div className="bg-gradient-to-br from-slate-50 to-sky-50/30 dark:from-slate-900 dark:to-sky-900/10 border-b border-slate-200 dark:border-slate-800">
                <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
                    <Link
                        href="/blog"
                        className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 mb-8 transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4" /> All posts
                    </Link>

                    <div className="flex flex-wrap items-center gap-3 mb-5">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${categoryColors[post.category]}`}>
                            <Tag className="w-3 h-3" /> {post.category}
                        </span>
                        <span className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                            <Calendar className="w-3.5 h-3.5" /> {post.date}
                        </span>
                        <span className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                            <Clock className="w-3.5 h-3.5" /> {post.readTime}
                        </span>
                    </div>

                    <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-slate-100 leading-tight mb-6">{post.title}</h1>
                    <p className="text-lg text-slate-600 dark:text-slate-300 leading-relaxed mb-8">{post.excerpt}</p>

                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-sky-500 via-blue-600 to-emerald-500 flex items-center justify-center text-xs font-bold text-white shrink-0">
                            {post.author.initials}
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{post.author.name}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">{post.author.role}</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
                <div className="prose prose-slate dark:prose-invert max-w-none">
                    {post.body.map((paragraph) => (
                        <p key={paragraph} className="text-base text-slate-700 dark:text-slate-300 leading-relaxed mb-6 last:mb-0">
                            {paragraph}
                        </p>
                    ))}
                </div>

                <hr className="my-12 border-slate-200 dark:border-slate-800" />

                {related.length > 0 && (
                    <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-5">
                            More in {post.category}
                        </p>
                        <div className="grid sm:grid-cols-2 gap-4">
                            {related.map((entry) => (
                                <Link
                                    key={entry.slug}
                                    href={`/blog/${entry.slug}`}
                                    className="group block p-5 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-sky-300 dark:hover:border-sky-700 bg-slate-50 dark:bg-slate-900 hover:bg-sky-50/30 dark:hover:bg-sky-900/10 transition-all"
                                >
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold mb-3 ${categoryColors[entry.category]}`}>
                                        {entry.category}
                                    </span>
                                    <p className="text-sm font-bold text-slate-900 dark:text-slate-100 group-hover:text-sky-700 dark:group-hover:text-sky-300 transition-colors leading-snug mb-2">
                                        {entry.title}
                                    </p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                        {entry.readTime} | {entry.date}
                                    </p>
                                </Link>
                            ))}
                        </div>
                    </div>
                )}

                <div className="mt-12 p-8 rounded-3xl bg-gradient-to-br from-sky-500 via-blue-600 to-emerald-500 text-center">
                    <Bot className="w-8 h-8 text-white/80 mx-auto mb-3" />
                    <h3 className="text-lg font-bold text-white mb-2">{blogListingContent.postCta.title}</h3>
                    <p className="text-sm text-white/80 mb-5">{blogListingContent.postCta.description}</p>
                    <Link
                        href={blogListingContent.postCta.buttonHref}
                        className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-sky-700 font-semibold text-sm hover:bg-slate-50 transition-colors shadow-lg"
                    >
                        {blogListingContent.postCta.buttonLabel}
                    </Link>
                </div>
            </div>
        </article>
    );
}
