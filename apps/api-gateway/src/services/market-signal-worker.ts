/**
 * market-signal-worker.ts
 *
 * Background sweep that runs market research for every active sales config
 * with marketResearchEnabled = true. Fetches industry news via NewsAPI and
 * logs signals as SalesActivity records for the agent to act on.
 *
 * Follows the same lifecycle pattern as sales-sequence-worker.ts.
 *
 * Environment variables:
 *   MARKET_SIGNAL_SWEEP_INTERVAL_MS — sweep cadence in ms (default: 3_600_000 = 1 h)
 *   NEWS_API_KEY                    — global fallback if config.newsApiKey is not set
 */

import type { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../lib/db.js';

const NEWS_API_URL = 'https://newsapi.org/v2/everything';

interface ActiveConfig {
    id: string;
    tenantId: string;
    botId: string;
    icp: string;
    productDescription: string;
    newsApiKey: string | null;
    marketResearchEnabled: boolean;
}

interface NewsArticle {
    title: string;
    description: string | null;
    url: string;
    publishedAt: string;
    source: { name: string };
}

interface NewsApiResponse {
    status: string;
    articles?: NewsArticle[];
    message?: string;
}

type PrismaWithMarket = {
    salesAgentConfig: {
        findMany: (args: { where: Record<string, unknown> }) => Promise<ActiveConfig[]>;
    };
    salesActivity: {
        create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }>;
    };
};

// ---------------------------------------------------------------------------
// Core sweep
// ---------------------------------------------------------------------------

export async function runMarketSignalSweep(
    prisma: PrismaClient,
): Promise<{ processed: number; signalsFound: number }> {
    const db = prisma as unknown as PrismaWithMarket;

    const configs = await db.salesAgentConfig.findMany({
        where: { active: true, marketResearchEnabled: true },
    });

    let processed = 0;
    let signalsFound = 0;

    for (const config of configs) {
        const newsApiKey = config.newsApiKey ?? process.env['NEWS_API_KEY'];
        if (!newsApiKey) continue;

        const baseTerms = [
            ...config.icp.split(/[\s,]+/).filter((w: string) => w.length > 3).slice(0, 3),
            ...config.productDescription.split(/[\s,]+/).filter((w: string) => w.length > 3).slice(0, 2),
        ];
        const query = [...new Set(baseTerms)].slice(0, 5).join(' OR ');

        const url = new URL(NEWS_API_URL);
        url.searchParams.set('q', query);
        url.searchParams.set('sortBy', 'publishedAt');
        url.searchParams.set('pageSize', '10');
        url.searchParams.set('language', 'en');
        url.searchParams.set('apiKey', newsApiKey);

        let articles: NewsArticle[] = [];
        try {
            const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15_000) });
            if (!res.ok) continue;
            const data = await res.json() as NewsApiResponse;
            if (data.status !== 'ok') continue;
            articles = data.articles ?? [];
        } catch {
            continue;
        }

        for (const article of articles.slice(0, 10)) {
            await db.salesActivity.create({
                data: {
                    tenantId: config.tenantId,
                    botId: config.botId,
                    prospectId: '',
                    activityType: 'market_signal',
                    subject: `Market signal: ${article.title.slice(0, 120)}`,
                    body: JSON.stringify({
                        signalType: 'news',
                        title: article.title,
                        summary: article.description ?? article.title,
                        url: article.url,
                        publishedAt: article.publishedAt,
                        source: article.source.name,
                    }),
                    outcome: 'captured',
                    completedAt: new Date(),
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
            }).catch(() => undefined);

            signalsFound++;
        }

        processed++;
    }

    return { processed, signalsFound };
}

// ---------------------------------------------------------------------------
// Worker lifecycle
// ---------------------------------------------------------------------------

const SWEEP_INTERVAL_MS = (): number =>
    parseInt(process.env['MARKET_SIGNAL_SWEEP_INTERVAL_MS'] ?? '3600000', 10) || 3_600_000;

const logger = {
    info: (msg: string) => console.log(`[market-signal-worker] ${msg}`),
    error: (msg: string, err?: unknown) => console.error(`[market-signal-worker] ${msg}`, err),
};

let workerTimer: NodeJS.Timeout | null = null;
let workerStopping = false;
let inFlightSweep = false;

function scheduleNext(prisma: PrismaClient, delayMs: number): void {
    if (workerStopping) return;

    workerTimer = setTimeout(async () => {
        if (workerStopping) return;
        if (inFlightSweep) {
            scheduleNext(prisma, SWEEP_INTERVAL_MS());
            return;
        }

        inFlightSweep = true;
        try {
            const result = await runMarketSignalSweep(prisma);
            logger.info(`sweep complete — ${result.processed} configs, ${result.signalsFound} signals`);
            scheduleNext(prisma, SWEEP_INTERVAL_MS());
        } catch (err) {
            logger.error('sweep failed', err);
            scheduleNext(prisma, SWEEP_INTERVAL_MS());
        } finally {
            inFlightSweep = false;
        }
    }, delayMs);
}

export function startMarketSignalWorker(prisma: PrismaClient = defaultPrisma): void {
    if (workerTimer) {
        logger.info('market signal worker already running');
        return;
    }
    workerStopping = false;
    scheduleNext(prisma, 10_000); // first sweep shortly after startup
    logger.info('market signal worker started');
}

export function stopMarketSignalWorker(): void {
    workerStopping = true;
    if (workerTimer) {
        clearTimeout(workerTimer);
        workerTimer = null;
    }
}
