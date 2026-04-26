import type { MetadataRoute } from "next";
import { getAllSlugs } from "@/lib/bots";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://AgentFarm.ai";

// Static public routes
const STATIC_ROUTES = [
    { path: "/", priority: 1.0, changeFrequency: "weekly" as const },
    { path: "/about", priority: 0.8, changeFrequency: "monthly" as const },
    { path: "/pricing", priority: 0.9, changeFrequency: "weekly" as const },
    { path: "/product", priority: 0.8, changeFrequency: "monthly" as const },
    { path: "/how-it-works", priority: 0.8, changeFrequency: "monthly" as const },
    { path: "/marketplace", priority: 0.9, changeFrequency: "weekly" as const },
    { path: "/bots", priority: 0.8, changeFrequency: "weekly" as const },
    { path: "/use-cases", priority: 0.8, changeFrequency: "monthly" as const },
    { path: "/compare", priority: 0.7, changeFrequency: "monthly" as const },
    { path: "/changelog", priority: 0.7, changeFrequency: "weekly" as const },
    { path: "/docs", priority: 0.7, changeFrequency: "weekly" as const },
    { path: "/docs/quickstart", priority: 0.7, changeFrequency: "weekly" as const },
    { path: "/docs/concepts", priority: 0.6, changeFrequency: "monthly" as const },
    { path: "/docs/api-reference", priority: 0.7, changeFrequency: "weekly" as const },
    { path: "/blog", priority: 0.7, changeFrequency: "daily" as const },
    { path: "/contact", priority: 0.6, changeFrequency: "yearly" as const },
    { path: "/get-started", priority: 0.9, changeFrequency: "monthly" as const },
    { path: "/book-demo", priority: 0.8, changeFrequency: "monthly" as const },
    { path: "/login", priority: 0.4, changeFrequency: "yearly" as const },
];

// Blog post slugs (static — not auto-generated)
const BLOG_SLUGS = [
    "introducing-AgentFarm",
    "isolated-robot-runtimes",
    "developer-shortage-2026",
    "AgentFarm-github-integration",
    "task-queue-architecture",
    "measuring-ai-worker-output",
    "engineer-time-allocation-2026",
    "scale-without-hiring",
    "gitops-ai-bots-2026",
    "security-bots-vs-manual-review",
];

export default function sitemap(): MetadataRoute.Sitemap {
    const botSlugs = getAllSlugs();

    const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map(({ path, priority, changeFrequency }) => ({
        url: `${BASE_URL}${path}`,
        lastModified: new Date(),
        changeFrequency,
        priority,
    }));

    // /bots/[slug] canonical pages
    const botEntries: MetadataRoute.Sitemap = botSlugs.map((slug) => ({
        url: `${BASE_URL}/bots/${slug}`,
        lastModified: new Date(),
        changeFrequency: "monthly" as const,
        priority: 0.7,
    }));

    // /marketplace/[slug] detail pages (same content, separate URL)
    const marketplaceEntries: MetadataRoute.Sitemap = botSlugs.map((slug) => ({
        url: `${BASE_URL}/marketplace/${slug}`,
        lastModified: new Date(),
        changeFrequency: "monthly" as const,
        priority: 0.8,
    }));

    const blogEntries: MetadataRoute.Sitemap = BLOG_SLUGS.map((slug) => ({
        url: `${BASE_URL}/blog/${slug}`,
        lastModified: new Date(),
        changeFrequency: "monthly" as const,
        priority: 0.6,
    }));

    return [...staticEntries, ...botEntries, ...marketplaceEntries, ...blogEntries];
}

