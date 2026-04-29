#!/usr/bin/env node

const args = process.argv.slice(2);

const getArgValue = (name) => {
    const idx = args.findIndex((arg) => arg === `--${name}`);
    if (idx === -1) return undefined;
    return args[idx + 1];
};

const baseUrlInput = getArgValue('url') ?? process.env.WEBSITE_BASE_URL;
const reportPath = getArgValue('report') ?? 'operations/quality/7.1-website-swa-verification.json';

if (!baseUrlInput) {
    console.error('Missing website URL. Provide --url https://<host> or set WEBSITE_BASE_URL.');
    process.exit(1);
}

let base;
try {
    base = new URL(baseUrlInput);
} catch {
    console.error(`Invalid URL: ${baseUrlInput}`);
    process.exit(1);
}

if (base.protocol !== 'https:') {
    console.error(`Expected HTTPS URL, received: ${base.href}`);
    process.exit(1);
}

const checks = [];

const addResult = (name, pass, details) => {
    checks.push({ name, pass, details, at: new Date().toISOString() });
};

const checkRoute = async (route) => {
    const url = new URL(route, base).toString();
    try {
        const res = await fetch(url, { redirect: 'follow' });
        addResult(`route:${route}`, res.ok, `status=${res.status}`);
        return res;
    } catch (err) {
        addResult(`route:${route}`, false, err instanceof Error ? err.message : 'request failed');
        return null;
    }
};

const checkSecurityHeaders = (res) => {
    if (!res) return;
    const wanted = ['x-content-type-options', 'x-frame-options'];
    for (const key of wanted) {
        const value = res.headers.get(key);
        addResult(`header:${key}`, Boolean(value), value ?? 'missing');
    }
};

const checkStaticAssetCaching = async (homeHtml) => {
    const match = homeHtml.match(/\/_next\/static\/[^"']+/);
    if (!match) {
        addResult('asset:discover-next-static', false, 'No _next/static asset reference found on home page');
        return;
    }

    const assetPath = match[0];
    const assetUrl = new URL(assetPath, base).toString();
    try {
        const res = await fetch(assetUrl, { redirect: 'follow' });
        if (!res.ok) {
            addResult('asset:fetch-next-static', false, `status=${res.status}`);
            return;
        }

        const cacheControl = res.headers.get('cache-control') ?? '';
        const hasCaching = /max-age|s-maxage|immutable/i.test(cacheControl);
        addResult('asset:cache-control', hasCaching, cacheControl || 'missing');
    } catch (err) {
        addResult('asset:cache-control', false, err instanceof Error ? err.message : 'request failed');
    }
};

const run = async () => {
    const homeRes = await checkRoute('/');
    await checkRoute('/signup');
    await checkRoute('/target');
    await checkRoute('/robots.txt');
    await checkRoute('/sitemap.xml');

    checkSecurityHeaders(homeRes);

    if (homeRes && homeRes.ok) {
        const html = await homeRes.text();
        await checkStaticAssetCaching(html);
    }

    const fs = await import('node:fs/promises');
    const path = await import('node:path');

    const report = {
        baseUrl: base.toString(),
        generatedAt: new Date().toISOString(),
        checks,
        pass: checks.every((c) => c.pass),
    };

    const outPath = path.resolve(reportPath);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, JSON.stringify(report, null, 2), 'utf8');

    const failed = checks.filter((c) => !c.pass);
    if (failed.length === 0) {
        console.log(`Website verification passed (${checks.length} checks).`);
        console.log(`Report written: ${reportPath}`);
        process.exit(0);
    }

    console.error(`Website verification failed (${failed.length}/${checks.length} checks failed).`);
    for (const item of failed) {
        console.error(`- ${item.name}: ${item.details}`);
    }
    console.error(`Report written: ${reportPath}`);
    process.exit(1);
};

void run();
