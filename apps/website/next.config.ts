import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    transpilePackages: ['@agentfarm/connector-contracts'],
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
            // Avoid intermittent filesystem cache corruption on Windows during hot reload.
            config.cache = false;
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

