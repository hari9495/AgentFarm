import type { PrismaClient } from '@prisma/client';
import type { SalesAgentConfigRecord, MarketSignal } from '@agentfarm/shared-types';

const NEWS_API_URL = 'https://newsapi.org/v2/everything';

type PrismaWithMarket = {
    salesActivity: {
        create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }>;
    };
};

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

export interface MarketResearchParams {
    tenantId: string;
    botId: string;
    config: SalesAgentConfigRecord;
    keywords?: string[];
    industry?: string;
    limit?: number;
}

export interface MarketResearchResult {
    signalsFound: number;
    signals: MarketSignal[];
    query: string;
    error?: string;
}

export async function runMarketResearch(
    params: MarketResearchParams,
    prisma?: PrismaClient,
): Promise<MarketResearchResult> {
    const { tenantId, botId, config, keywords, industry, limit = 10 } = params;

    const newsApiKey = config.newsApiKey ?? process.env['NEWS_API_KEY'];
    if (!newsApiKey) {
        return {
            signalsFound: 0,
            signals: [],
            query: '',
            error: 'newsApiKey not configured. Set config.newsApiKey or NEWS_API_KEY env var.',
        };
    }

    // Build search query: prefer explicit keywords, fall back to extracting from ICP + productDescription
    const baseTerms = keywords?.length
        ? keywords
        : [
            ...config.icp.split(/[\s,]+/).filter(w => w.length > 3).slice(0, 3),
            ...config.productDescription.split(/[\s,]+/).filter(w => w.length > 3).slice(0, 2),
        ];

    const allTerms = industry
        ? [...new Set([industry, ...baseTerms])]
        : [...new Set(baseTerms)];

    const query = allTerms.slice(0, 5).join(' OR ');

    const url = new URL(NEWS_API_URL);
    url.searchParams.set('q', query);
    url.searchParams.set('sortBy', 'publishedAt');
    url.searchParams.set('pageSize', String(Math.min(limit, 20)));
    url.searchParams.set('language', 'en');
    url.searchParams.set('apiKey', newsApiKey);

    let articles: NewsArticle[] = [];
    try {
        const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15_000) });
        if (!res.ok) {
            return { signalsFound: 0, signals: [], query, error: `NewsAPI HTTP ${res.status}` };
        }
        const data = await res.json() as NewsApiResponse;
        if (data.status !== 'ok') {
            return { signalsFound: 0, signals: [], query, error: data.message ?? 'NewsAPI returned non-ok status' };
        }
        articles = data.articles ?? [];
    } catch (err) {
        return { signalsFound: 0, signals: [], query, error: String(err) };
    }

    const db = prisma ? (prisma as unknown as PrismaWithMarket) : null;
    const signals: MarketSignal[] = [];

    for (const article of articles.slice(0, limit)) {
        const signal: MarketSignal = {
            signalType: 'news',
            title: article.title,
            summary: article.description ?? article.title,
            url: article.url,
            publishedAt: article.publishedAt,
            source: article.source.name,
        };
        signals.push(signal);

        if (db) {
            await db.salesActivity.create({
                data: {
                    tenantId,
                    botId,
                    prospectId: '',
                    activityType: 'market_signal',
                    subject: `Market signal: ${article.title.slice(0, 120)}`,
                    body: JSON.stringify(signal),
                    outcome: 'captured',
                    completedAt: new Date(),
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
            }).catch(() => undefined);
        }
    }

    return { signalsFound: signals.length, signals, query };
}
