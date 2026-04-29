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
    Product: "bg-blue-50 text-blue-700 border border-blue-100",
    Engineering: "bg-violet-50 text-violet-700 border border-violet-100",
    Insights: "bg-emerald-50 text-emerald-700 border border-emerald-100",
};

export default function BlogPage() {
    return (
        <div className="site-shell">
            {/* Hero with photo */}
            <section className="relative overflow-hidden">
                <img
                    src="https://images.unsplash.com/photo-1504639725590-34d0984388bd?auto=format&fit=crop&w=1800&q=80"
                    alt="Engineer reading technical content on laptop"
                    className="w-full h-[360px] sm:h-[440px] object-cover"
                    loading="eager"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-slate-900/90 via-slate-900/60 to-transparent" />
                <div className="absolute inset-0 flex items-center">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
                        <div className="max-w-2xl">
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-blue-300 bg-white/10 backdrop-blur border border-white/20 px-3 py-1.5 rounded-full mb-5">
                                Blog
                            </span>
                            <h1 className="mt-3 text-4xl sm:text-6xl font-extrabold text-white tracking-tight">
                                Insights on{" "}
                                <span className="bg-gradient-to-r from-blue-300 to-violet-300 bg-clip-text text-transparent">AI &amp; Engineering</span>
                            </h1>
                            <p className="mt-5 text-xl text-slate-300 max-w-2xl leading-relaxed">
                                Deep dives on building trusted AI teammate systems, autonomous agents, and the
                                future of software development.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Post grid with cover images */}
            <section className="py-24">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {posts.map((post) => (
                            <Link
                                key={post.title}
                                href={`/blog/${post.slug}`}
                                className="group border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all flex flex-col bg-white dark:bg-slate-900"
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
                                    <div className="absolute bottom-3 left-3">
                                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${categoryColors[post.category]}`}>
                                            {post.category}
                                        </span>
                                    </div>
                                </div>
                                <div className="p-6 flex flex-col flex-1">
                                    <h2 className="font-semibold text-slate-900 dark:text-slate-100 mb-3 leading-snug group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                        {post.title}
                                    </h2>
                                    <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed flex-1">{post.excerpt}</p>
                                    <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                                        <p className="text-xs text-slate-400">{post.date} · {post.readTime}</p>
                                        <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 group-hover:underline">Read →</span>
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
