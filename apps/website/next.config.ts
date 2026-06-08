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

    // Exclude packages from the server bundle that are either:
    //   a) Only needed at build time (sharp)
    //   b) Too heavy to inline and safely loadable as Workers modules
    // NOTE: these still need to be available in the deployment environment.
    // @opennextjs/cloudflare handles this via the assets layer.
    serverExternalPackages: ['sharp'],

    webpack: (config, { dev, isServer }) => {
        if (dev) {
            // Use webpack's in-memory cache instead of the filesystem cache to
            // avoid chunk hash churn on Windows during hot reload.
            config.cache = { type: 'memory' };
        }

        // node:* built-ins (e.g. node:sqlite, node:crypto) are passed through
        // to Node.js / the Workers nodejs_compat runtime — webpack must not try
        // to bundle them.
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

        // Server-side production build: enable module concatenation (scope
        // hoisting) for better tree-shaking and a smaller output bundle.
        if (isServer && !dev) {
            config.optimization = {
                ...config.optimization,
                concatenateModules: true,
            };
        }

        return config;
    },
    // Turbopack config (used by `next dev --turbopack`).
    turbopack: {},
};

export default nextConfig;
