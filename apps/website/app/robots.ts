import type { MetadataRoute } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://agentfarms.in";

/**
 * robots.txt — AgentFarms
 *
 * AI crawlers are explicitly allowed to index all public marketing content.
 * This helps with GEO (Generative Engine Optimization) so AgentFarms appears
 * in AI-generated answers in ChatGPT, Perplexity, Gemini, Claude, and Bing Copilot.
 *
 * Admin, dashboard, API, and portal routes are blocked for all bots.
 */
export default function robots(): MetadataRoute.Robots {
    const BLOCKED_PATHS = [
        "/admin/",
        "/dashboard/",
        "/api/",
        "/portal/",
        "/auth/",
        "/contract/",
        "/_next/",
        "/checkout/billing/",
    ];

    return {
        rules: [
            // ── Standard crawlers ──────────────────────────────────────────────
            {
                userAgent: "*",
                allow: "/",
                disallow: BLOCKED_PATHS,
            },

            // ── Google AI (Gemini training / Search Generative Experience) ─────
            {
                userAgent: "Google-Extended",
                allow: "/",
                disallow: BLOCKED_PATHS,
            },

            // ── OpenAI / ChatGPT ───────────────────────────────────────────────
            {
                userAgent: "GPTBot",
                allow: "/",
                disallow: BLOCKED_PATHS,
            },
            {
                userAgent: "ChatGPT-User",
                allow: "/",
                disallow: BLOCKED_PATHS,
            },
            {
                userAgent: "OAI-SearchBot",
                allow: "/",
                disallow: BLOCKED_PATHS,
            },

            // ── Anthropic / Claude ─────────────────────────────────────────────
            {
                userAgent: "ClaudeBot",
                allow: "/",
                disallow: BLOCKED_PATHS,
            },
            {
                userAgent: "Claude-Web",
                allow: "/",
                disallow: BLOCKED_PATHS,
            },
            {
                userAgent: "anthropic-ai",
                allow: "/",
                disallow: BLOCKED_PATHS,
            },

            // ── Perplexity AI ──────────────────────────────────────────────────
            {
                userAgent: "PerplexityBot",
                allow: "/",
                disallow: BLOCKED_PATHS,
            },

            // ── Microsoft Copilot / Bing ───────────────────────────────────────
            {
                userAgent: "Bingbot",
                allow: "/",
                disallow: BLOCKED_PATHS,
            },
            {
                userAgent: "BingPreview",
                allow: "/",
                disallow: BLOCKED_PATHS,
            },

            // ── Cohere ────────────────────────────────────────────────────────
            {
                userAgent: "cohere-ai",
                allow: "/",
                disallow: BLOCKED_PATHS,
            },

            // ── Meta AI ───────────────────────────────────────────────────────
            {
                userAgent: "FacebookBot",
                allow: "/",
                disallow: BLOCKED_PATHS,
            },

            // ── Apple (Siri, Spotlight) ────────────────────────────────────────
            {
                userAgent: "Applebot",
                allow: "/",
                disallow: BLOCKED_PATHS,
            },

            // ── DuckDuckGo AI ──────────────────────────────────────────────────
            {
                userAgent: "DuckAssistBot",
                allow: "/",
                disallow: BLOCKED_PATHS,
            },

            // ── AI2 / Allen Institute ──────────────────────────────────────────
            {
                userAgent: "AI2Bot",
                allow: "/",
                disallow: BLOCKED_PATHS,
            },

            // ── Common Research Crawlers ───────────────────────────────────────
            {
                userAgent: "CCBot",
                allow: "/",
                disallow: BLOCKED_PATHS,
            },
        ],
        sitemap: `${BASE_URL}/sitemap.xml`,
        host: BASE_URL,
    };
}
