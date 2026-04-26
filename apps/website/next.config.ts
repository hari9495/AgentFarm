import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
    transpilePackages: ['@agentfarm/connector-contracts'],
    outputFileTracingRoot: path.join(process.cwd(), "../.."),
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

