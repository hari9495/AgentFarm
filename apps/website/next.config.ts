import type { NextConfig } from "next";
import path from "path";
import { setupDevPlatform } from "@cloudflare/next-on-pages/next-dev";

if (process.env.NODE_ENV === "development") {
    await setupDevPlatform();
}

const nextConfig: NextConfig = {
    transpilePackages: ['@agentfarm/connector-contracts'],
    outputFileTracingRoot: path.join(process.cwd(), "../.."),
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

        return config;
    },
};

export default nextConfig;

