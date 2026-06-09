import type { MetadataRoute } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://agentfarms.in";
const NOW = new Date();

// ─── Static marketing routes ──────────────────────────────────────────────────
const STATIC_ROUTES: Array<{
    path: string;
    priority: number;
    changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
    lastModified?: Date;
}> = [
    // Top-level conversion pages (highest priority)
    { path: "/",                    priority: 1.0,  changeFrequency: "weekly" },
    { path: "/get-started",         priority: 0.95, changeFrequency: "monthly" },
    { path: "/pricing",             priority: 0.95, changeFrequency: "weekly" },
    { path: "/marketplace",         priority: 0.90, changeFrequency: "weekly" },
    { path: "/book-demo",           priority: 0.85, changeFrequency: "monthly" },

    // Product pages
    { path: "/product",             priority: 0.85, changeFrequency: "monthly" },
    { path: "/how-it-works",        priority: 0.80, changeFrequency: "monthly" },
    { path: "/integrations",        priority: 0.80, changeFrequency: "monthly" },
    { path: "/use-cases",           priority: 0.80, changeFrequency: "monthly" },
    { path: "/compare",             priority: 0.75, changeFrequency: "monthly" },
    { path: "/customers",           priority: 0.75, changeFrequency: "monthly" },
    { path: "/security",            priority: 0.75, changeFrequency: "monthly" },

    // Company pages
    { path: "/about",               priority: 0.70, changeFrequency: "monthly" },
    { path: "/careers",             priority: 0.70, changeFrequency: "weekly" },
    { path: "/contact",             priority: 0.65, changeFrequency: "yearly" },

    // Content / resources
    { path: "/blog",                priority: 0.70, changeFrequency: "daily" },
    { path: "/changelog",           priority: 0.65, changeFrequency: "weekly" },
    { path: "/docs",                priority: 0.70, changeFrequency: "weekly" },
    { path: "/docs/quickstart",     priority: 0.70, changeFrequency: "weekly" },
    { path: "/docs/concepts",       priority: 0.65, changeFrequency: "monthly" },
    { path: "/docs/api-reference",  priority: 0.65, changeFrequency: "weekly" },
    { path: "/status",              priority: 0.40, changeFrequency: "daily" },

    // Legal (low priority)
    { path: "/privacy",             priority: 0.30, changeFrequency: "yearly" },
    { path: "/terms",               priority: 0.30, changeFrequency: "yearly" },
    { path: "/cookies",             priority: 0.30, changeFrequency: "yearly" },
];

// ─── Individual marketplace agent pages ───────────────────────────────────────
const MARKETPLACE_SLUGS = [
    "ai-backend-developer",
    "ai-full-stack-developer",
    "ai-qa-engineer",
    "ai-technical-writer",
    "ai-business-analyst",
    "ai-technical-recruiter",
    "ai-content-writer",
    "ai-sales-rep",
    "ai-marketing-specialist",
    "ai-corporate-assistant",
    "ai-customer-support-agent",
    "ai-project-manager",
];

// ─── Blog post slugs ──────────────────────────────────────────────────────────
const BLOG_SLUGS = [
    "introducing-agentfarms",
    "isolated-robot-runtimes",
    "developer-shortage-2026",
    "agentfarms-github-integration",
    "task-queue-architecture",
    "measuring-ai-worker-output",
    "engineer-time-allocation-2026",
    "scale-without-hiring",
    "gitops-ai-bots-2026",
    "security-bots-vs-manual-review",
];

// ─── Changelog version slugs ──────────────────────────────────────────────────
const CHANGELOG_SLUGS = [
    "v1-0", "v0-9", "v0-8", "v0-7", "v0-6", "v0-5",
];

export default function sitemap(): MetadataRoute.Sitemap {
    const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map(
        ({ path, priority, changeFrequency }) => ({
            url: `${BASE_URL}${path}`,
            lastModified: NOW,
            changeFrequency,
            priority,
        })
    );

    const marketplaceEntries: MetadataRoute.Sitemap = MARKETPLACE_SLUGS.map((slug) => ({
        url: `${BASE_URL}/marketplace/${slug}`,
        lastModified: NOW,
        changeFrequency: "monthly" as const,
        priority: 0.80,
    }));

    const blogEntries: MetadataRoute.Sitemap = BLOG_SLUGS.map((slug) => ({
        url: `${BASE_URL}/blog/${slug}`,
        lastModified: NOW,
        changeFrequency: "monthly" as const,
        priority: 0.60,
    }));

    const changelogEntries: MetadataRoute.Sitemap = CHANGELOG_SLUGS.map((slug) => ({
        url: `${BASE_URL}/changelog/${slug}`,
        lastModified: NOW,
        changeFrequency: "yearly" as const,
        priority: 0.45,
    }));

    return [
        ...staticEntries,
        ...marketplaceEntries,
        ...blogEntries,
        ...changelogEntries,
    ];
}
