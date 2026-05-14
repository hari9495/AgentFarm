import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
    title: "Blog — AgentFarm",
    description: "Insights on AI engineering, autonomous agents, and the future of software development.",
};

const posts = [
    {
        slug: "introducing-agentfarm",
        category: "Product",
        title: "Introducing AgentFarm: AI Teammates for Engineering Teams",
        excerpt:
            "Today we're announcing AgentFarm - a trusted AI teammate platform built natively for software development workflows.",
        date: "March 1, 2026",
        readTime: "5 min read",
        image: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=800&q=80",
    },
    {
        slug: "isolated-robot-runtimes",
        category: "Engineering",
        title: "How We Built Isolated Robot Runtimes at Scale",
        excerpt:
            "A deep dive into the container architecture that lets thousands of AI teammates execute simultaneously without interference.",
        date: "March 6, 2026",
        readTime: "8 min read",
        image: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=800&q=80",
    },
    {
        slug: "developer-shortage-2026",
        category: "Insights",
        title: "The Developer Shortage Is Real — Here's What We Can Do About It",
        excerpt:
            "By 2030, the global shortage of software engineers could exceed 4 million. AI teammates are part of the answer.",
        date: "March 10, 2026",
        readTime: "6 min read",
        image: "https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=800&q=80",
    },
    {
        slug: "agentfarm-github-integration",
        category: "Product",
        title: "AgentFarm + GitHub: A Deep Integration Guide",
        excerpt:
            "Walk through every GitHub integration touchpoint — from repo access scoping to PR authoring and review.",
        date: "March 18, 2026",
        readTime: "7 min read",
        image: "https://images.unsplash.com/photo-1556075798-4825dfaaf498?auto=format&fit=crop&w=800&q=80",
    },
    {
        slug: "task-queue-architecture",
        category: "Engineering",
        title: "Designing Task Queues for AI Agents",
        excerpt:
            "The engineering decisions behind AgentFarm's task queue that ensures AI teammates never block each other.",
        date: "March 22, 2026",
        readTime: "9 min read",
        image: "https://images.unsplash.com/photo-1518773553398-650c184e0bb3?auto=format&fit=crop&w=800&q=80",
    },
    {
        slug: "measuring-ai-worker-output",
        category: "Insights",
        title: "Measuring AI Teammate Output: The Metrics That Matter",
        excerpt:
            "PR velocity, test coverage delta, code churn - the metrics we use to evaluate AI teammate productivity.",
        date: "March 27, 2026",
        readTime: "5 min read",
        image: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=800&q=80",
    },
    {
        slug: "engineer-time-allocation-2026",
        category: "Insights",
        title: "Why Your Engineers Spend 60% of Their Time Not Engineering",
        excerpt:
            "Most engineering teams are shocked when they measure it: the majority of an engineer's week has nothing to do with writing code.",
        date: "April 2, 2026",
        readTime: "6 min read",
        image: "https://images.unsplash.com/photo-1600880292203-757bb62b4baf?auto=format&fit=crop&w=800&q=80",
    },
    {
        slug: "scale-without-hiring",
        category: "Insights",
        title: "How to Scale Your Engineering Team Without Hiring",
        excerpt:
            "Headcount growth is slow, expensive, and hard to reverse. Here's how high-growth teams are expanding capacity without adding people.",
        date: "April 7, 2026",
        readTime: "7 min read",
        image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=800&q=80",
    },
    {
        slug: "gitops-ai-bots-2026",
        category: "Engineering",
        title: "GitOps + AI Bots: Automated Review Cycles That Don't Break at 2am",
        excerpt:
            "Combining GitOps principles with AI-powered review creates a feedback loop that catches issues before they reach production.",
        date: "April 12, 2026",
        readTime: "8 min read",
        image: "https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=800&q=80",
    },
    {
        slug: "security-bots-vs-manual-review",
        category: "Insights",
        title: "Security Bots vs. Manual Code Review: A Cost Comparison for 2026",
        excerpt:
            "A vulnerability found in code review costs hundreds of dollars to fix. The same vulnerability found in production costs hundreds of thousands.",
        date: "April 17, 2026",
        readTime: "6 min read",
        image: "https://images.unsplash.com/photo-1555949963-ff9fe0c870eb?auto=format&fit=crop&w=800&q=80",
    },
];

const categoryColors: Record<string, string> = {
    Product: "bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] border border-[var(--accent-blue)]/20",
    Engineering: "bg-purple-500/10 text-purple-400 border border-purple-500/20",
    Insights: "bg-[var(--accent-green)]/10 text-[var(--accent-green)] border border-[var(--accent-green)]/20",
};

const featuredPost = posts[0];
const trendingSlug = posts[2].slug;

export default function BlogPage() {
    return (
        <div>
            {/* Hero with photo */}
            <section className="relative overflow-hidden">
                <img
                    src="https://images.unsplash.com/photo-1504639725590-34d0984388bd?auto=format&fit=crop&w=1800&q=80"
                    alt="Engineer reading technical content on laptop"
                    className="w-full h-[360px] sm:h-[440px] object-cover"
                    loading="eager"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-[#07080a]/90 via-[#07080a]/60 to-transparent" />
                <div className="absolute inset-0 flex items-center">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
                        <div className="max-w-2xl">
                            <span className="chip chip-accent mb-5">
                                Blog
                            </span>
                            <h1 className="mt-3 text-4xl sm:text-6xl font-semibold text-[var(--ink)] tracking-[-0.03em]">
                                Insights on{" "}
                                <span className="bg-gradient-to-r from-[var(--accent-blue)] to-purple-400 bg-clip-text text-transparent">AI &amp; Engineering</span>
                            </h1>
                            <p className="mt-5 text-xl text-[var(--mute)] max-w-2xl leading-relaxed">
                                Deep dives on building trusted AI teammate systems, autonomous agents, and the
                                future of software development.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Featured post */}
            <section className="py-12 border-b border-[var(--hairline)]">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <p className="chip chip-accent mb-4">Featured post</p>
                    <Link href={`/blog/${featuredPost.slug}`} className="group flex flex-col md:flex-row gap-6 rounded-2xl border border-[var(--hairline)] bg-[var(--surface-card)] overflow-hidden hover:-translate-y-0.5 hover:border-[var(--accent-blue)]/30 transition-all">
                        <div className="relative md:w-2/5 h-52 md:h-auto overflow-hidden shrink-0">
                            <img src={featuredPost.image} alt={featuredPost.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="eager" />
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent to-black/20" />
                        </div>
                        <div className="flex flex-col justify-center px-6 py-6 md:py-8 flex-1">
                            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full self-start mb-3 ${categoryColors[featuredPost.category]}`}>{featuredPost.category}</span>
                            <h2 className="text-xl font-semibold text-[var(--ink)] leading-snug mb-3 group-hover:text-[var(--accent-blue)] transition-colors">{featuredPost.title}</h2>
                            <p className="text-sm text-[var(--mute)] leading-relaxed mb-5">{featuredPost.excerpt}</p>
                            <div className="flex items-center gap-3">
                                <span className="text-xs text-[var(--ash)]">{featuredPost.date} · {featuredPost.readTime}</span>
                                <span className="text-xs font-semibold text-[var(--accent-blue)] group-hover:underline">Read now →</span>
                            </div>
                        </div>
                    </Link>
                </div>
            </section>

            {/* Post grid with cover images */}
            <section className="py-24">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <p className="chip chip-accent mb-8">All posts</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {posts.map((post) => (
                            <Link
                                key={post.title}
                                href={`/blog/${post.slug}`}
                                className="group border border-[var(--hairline)] rounded-2xl overflow-hidden hover:-translate-y-1 hover:border-[var(--accent-blue)]/30 transition-all flex flex-col bg-[var(--surface-card)]"
                            >
                                {/* Cover image */}
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
                                        {post.slug === trendingSlug && (
                                            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-rose-500 text-white">Trending</span>
                                        )}
                                    </div>
                                </div>
                                <div className="p-6 flex flex-col flex-1">
                                    <h2 className="font-semibold text-[var(--ink)] mb-3 leading-snug group-hover:text-[var(--accent-blue)] transition-colors">
                                        {post.title}
                                    </h2>
                                    <p className="text-sm text-[var(--mute)] leading-relaxed flex-1">{post.excerpt}</p>
                                    <div className="mt-5 pt-4 border-t border-[var(--hairline)] flex items-center justify-between">
                                        <p className="text-xs text-[var(--ash)]">{post.date} · {post.readTime}</p>
                                        <span className="text-xs font-semibold text-[var(--accent-blue)] group-hover:underline">Read →</span>
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
