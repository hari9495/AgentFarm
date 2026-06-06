import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: false,
    outputFileTracingRoot: path.join(__dirname, '../../'),
    devIndicators: false,
    eslint: {
        ignoreDuringBuilds: true,
    },
    webpack(config) {
        config.resolve.alias = {
            ...config.resolve.alias,
            '@': __dirname,
        };
        return config;
    },
};

export default nextConfig;
