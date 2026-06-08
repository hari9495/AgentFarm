import type { NextConfig } from "next";

// @cloudflare/next-on-pages requires the dev platform to be set up
// in development so that bindings (D1, KV, etc.) are available locally.
// This import is a no-op in production builds.
const { setupDevPlatform } =
    process.env.NODE_ENV === "development"
        ? await import("@cloudflare/next-on-pages/next-dev")
        : { setupDevPlatform: async () => {} };

await setupDevPlatform();

const securityHeaders = [
    { key: 'X-DNS-Prefetch-Control', value: 'on' },
    { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-XSS-Protection', value: '1; mode=block' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'geolocation=(), microphone=(), camera=()' },
];

const nextConfig: NextConfig = {

    async headers() {
        return [
            { source: '/(.*)', headers: securityHeaders },
            {
                source: '/_next/static/(.*)',
                headers: [{ key: 'Cache-Control', value: process.env.NODE_ENV === 'development' ? 'no-store' : 'public, max-age=31536000, immutable' }],
            },
            {
                source: '/_next/image(.*)',
                headers: [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' }],
            },
            {
                source: '/theme-init.js',
                headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
            },
        ];
    },
    eslint: {
        ignoreDuringBuilds: true,
    },
    images: {
        remotePatterns: [
            {
                protocol: "https",
                hostname: "api.dicebear.com",
            },
        ],
    },
    webpack: (config, { dev }) => {
        if (dev) {
            config.cache = { type: 'memory' };
        }

        // node:* built-ins are externalized so webpack doesn't try to bundle them.
        // In production (Cloudflare Pages + nodejs_compat), these are provided
        // by the Workers runtime — no polyfills needed.
        const existingExternals = Array.isArray(config.externals)
            ? config.externals
            : config.externals != null ? [config.externals] : [];
        config.externals = [
            ...existingExternals,
            (ctx: { request?: string }, callback: (err?: Error | null, result?: string) => void) => {
                if (ctx.request?.startsWith('node:')) {
                    return callback(null, `commonjs ${ctx.request}`);
                }
                callback();
            },
        ];

        return config;
    },
    turbopack: {},
};

export default nextConfig;
