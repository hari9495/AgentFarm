import type { NextConfig } from "next";

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
        // The repository currently has broad legacy lint debt; keep build signal focused on compile/type health.
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
            // Use webpack's in-memory cache instead of the filesystem cache: the filesystem
            // cache is what corrupts intermittently on Windows during hot reload, but fully
            // disabling caching forces a from-scratch rebuild of shared chunks (e.g.
            // app/layout.js) on every route compile, which churns their content hashes mid-session
            // and causes the browser to fetch a stale chunk URL -> "ChunkLoadError: Loading
            // chunk app/layout failed (timeout)". In-memory caching keeps shared chunk hashes
            // stable across navigations within a dev server run while avoiding the filesystem cache.
            config.cache = { type: 'memory' };
        }

        // node:* built-ins (e.g. node:sqlite, node:fs) are used in instrumentation.ts
        // for the local D1 fallback. Webpack cannot bundle them — pass through to Node.js.
        // Note: Turbopack handles node:* externals automatically; this block applies to
        // production builds (next build / opennextjs-cloudflare) which still use webpack.
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
    // Turbopack config (used by `next dev --turbopack`).
    // node:* built-ins are automatically externalized by Turbopack; no explicit config needed.
    turbopack: {},
};

export default nextConfig;

