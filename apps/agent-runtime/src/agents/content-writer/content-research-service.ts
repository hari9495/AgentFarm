/**
 * Content Research Service
 *
 * Fetches background research for a content topic from content-appropriate
 * sources. This is separate from web-research-service.ts which targets
 * developer documentation (npm, MDN, GitHub issues).
 *
 * Sources:
 *   - Wikipedia summary API (always attempted when topic is non-empty)
 *   - Hacker News Algolia search API (always attempted; no API key required)
 *   - Reddit search API (always attempted; no API key required)
 *   - RSS news feed (only when MCP_NEWS_RSS_URL env var is set)
 *
 * Security posture:
 *   - Wikipedia URLs are constructed only from the sanitised topic string —
 *     no caller-supplied URLs are passed to fetch().
 *   - RSS feeds require explicit MCP_NEWS_RSS_URL env var — not enabled by default.
 *   - All responses are truncated to MAX_SNIPPET_CHARS.
 *   - JSON parsing is wrapped; malformed responses return null rather than throwing.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ContentResearchSource = 'wikipedia' | 'hacker_news' | 'reddit' | 'news_rss';

export interface ResearchSnippet {
    source: ContentResearchSource;
    url: string;
    text: string;
}

export interface ContentResearchResult {
    topic: string;
    snippets: ResearchSnippet[];
    fetchedAt: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_SNIPPET_CHARS = 1_200;
const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php';
const HN_ALGOLIA_API = 'https://hn.algolia.com/api/v1/search';
const REDDIT_SEARCH_API = 'https://www.reddit.com/search.json';

// ---------------------------------------------------------------------------
// Fetch abstraction (injectable for tests)
// ---------------------------------------------------------------------------

export type ResearchFetchFn = (
    url: string,
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

// ---------------------------------------------------------------------------
// Wikipedia helper
// ---------------------------------------------------------------------------

/**
 * Sanitise a topic string for use in a Wikipedia API query.
 * Strips characters that could alter the query URL semantics.
 */
function sanitiseTopic(topic: string): string {
    return topic.replace(/[^a-zA-Z0-9 _-]/g, '').trim().slice(0, 120);
}

type WikiResponse = {
    query?: {
        pages?: Record<string, { extract?: string; missing?: string }>;
    };
};

async function fetchWikipediaSummary(
    topic: string,
    fetchFn: ResearchFetchFn,
): Promise<ResearchSnippet | null> {
    const safeTopic = sanitiseTopic(topic);
    if (!safeTopic) return null;

    const params = new URLSearchParams({
        action: 'query',
        prop: 'extracts',
        exintro: '1',
        explaintext: '1',
        titles: safeTopic,
        format: 'json',
        origin: '*',
    });

    const url = `${WIKIPEDIA_API}?${params.toString()}`;

    try {
        const response = await fetchFn(url);
        if (!response.ok) return null;

        const raw = await response.text();
        const parsed = JSON.parse(raw) as WikiResponse;
        const pages = parsed.query?.pages ?? {};
        const page = Object.values(pages)[0];
        if (!page || page.missing !== undefined || !page.extract) return null;

        return {
            source: 'wikipedia',
            url: `https://en.wikipedia.org/wiki/${encodeURIComponent(safeTopic.replace(/ /g, '_'))}`,
            text: page.extract.slice(0, MAX_SNIPPET_CHARS),
        };
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------
// Hacker News helper
// ---------------------------------------------------------------------------

type HnAlgoliaResponse = {
    hits?: Array<{ title?: string; url?: string; objectID?: string; points?: number }>;
};

async function fetchHackerNewsStories(
    topic: string,
    fetchFn: ResearchFetchFn,
): Promise<ResearchSnippet[]> {
    const safeTopic = sanitiseTopic(topic);
    if (!safeTopic) return [];

    const params = new URLSearchParams({
        query: safeTopic,
        tags: 'story',
        hitsPerPage: '5',
    });
    const url = `${HN_ALGOLIA_API}?${params.toString()}`;

    try {
        const response = await fetchFn(url);
        if (!response.ok) return [];

        const parsed = JSON.parse(await response.text()) as HnAlgoliaResponse;
        return (parsed.hits ?? [])
            .filter((h) => h.title)
            .map((h): ResearchSnippet => ({
                source: 'hacker_news',
                url: h.url ?? `https://news.ycombinator.com/item?id=${h.objectID ?? ''}`,
                text: `${h.title ?? ''}${h.points !== undefined ? ` (${h.points} points)` : ''}`.slice(0, MAX_SNIPPET_CHARS),
            }));
    } catch {
        return [];
    }
}

// ---------------------------------------------------------------------------
// Reddit helper
// ---------------------------------------------------------------------------

type RedditSearchResponse = {
    data?: {
        children?: Array<{ data?: { title?: string; url?: string; subreddit?: string } }>;
    };
};

async function fetchRedditPosts(
    topic: string,
    fetchFn: ResearchFetchFn,
): Promise<ResearchSnippet[]> {
    const safeTopic = sanitiseTopic(topic);
    if (!safeTopic) return [];

    const params = new URLSearchParams({
        q: safeTopic,
        sort: 'top',
        limit: '5',
        t: 'year',
    });
    const url = `${REDDIT_SEARCH_API}?${params.toString()}`;

    try {
        const response = await fetchFn(url);
        if (!response.ok) return [];

        const parsed = JSON.parse(await response.text()) as RedditSearchResponse;
        return (parsed.data?.children ?? [])
            .filter((c) => c.data?.title)
            .map((c): ResearchSnippet => ({
                source: 'reddit',
                url: c.data?.url ?? `https://www.reddit.com/search/?q=${encodeURIComponent(safeTopic)}`,
                text: `r/${c.data?.subreddit ?? 'unknown'}: ${c.data?.title ?? ''}`.slice(0, MAX_SNIPPET_CHARS),
            }));
    } catch {
        return [];
    }
}

// ---------------------------------------------------------------------------
// RSS news helper
// ---------------------------------------------------------------------------

async function fetchNewsRssHeadlines(
    fetchFn: ResearchFetchFn,
): Promise<ResearchSnippet[]> {
    const rssUrl = (process.env['MCP_NEWS_RSS_URL'] ?? '').trim();
    // Require the URL to exist and start with http/https
    if (!rssUrl || !/^https?:\/\//.test(rssUrl)) return [];

    try {
        const response = await fetchFn(rssUrl);
        if (!response.ok) return [];

        const raw = await response.text();
        // Extract the first 5 <item> blocks from the RSS XML
        const items = [...raw.matchAll(/<item>[\s\S]*?<\/item>/g)].slice(0, 5);

        return items.map((match): ResearchSnippet => {
            const titleMatch = /<title><!\[CDATA\[(.*?)\]\]>|<title>(.*?)<\/title>/i.exec(match[0]);
            const descMatch =
                /<description><!\[CDATA\[(.*?)\]\]>|<description>(.*?)<\/description>/i.exec(
                    match[0],
                );
            const linkMatch = /<link>(.*?)<\/link>/i.exec(match[0]);

            const title = (titleMatch?.[1] ?? titleMatch?.[2] ?? '').trim();
            const desc = (descMatch?.[1] ?? descMatch?.[2] ?? '').trim();
            const link = (linkMatch?.[1] ?? '').trim();

            return {
                source: 'news_rss',
                url: link || rssUrl,
                text: `${title}${desc ? ': ' + desc : ''}`.slice(0, MAX_SNIPPET_CHARS),
            };
        }).filter((s) => s.text.length > 0);
    } catch {
        return [];
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Research a content topic by fetching background snippets.
 *
 * Attempts Wikipedia and (if configured) RSS news in parallel.
 * Never throws — returns an empty snippets array on complete failure.
 */
export async function researchContentTopic(
    topic: string,
    fetchFn: ResearchFetchFn = (url) =>
        fetch(url) as unknown as ReturnType<ResearchFetchFn>,
): Promise<ContentResearchResult> {
    if (!topic.trim()) {
        return { topic, snippets: [], fetchedAt: new Date().toISOString() };
    }

    const [wikiSnippet, hnSnippets, redditSnippets, newsSnippets] = await Promise.all([
        fetchWikipediaSummary(topic, fetchFn),
        fetchHackerNewsStories(topic, fetchFn),
        fetchRedditPosts(topic, fetchFn),
        fetchNewsRssHeadlines(fetchFn),
    ]);

    const snippets: ResearchSnippet[] = [];
    if (wikiSnippet) snippets.push(wikiSnippet);
    snippets.push(...hnSnippets, ...redditSnippets, ...newsSnippets);

    return { topic, snippets, fetchedAt: new Date().toISOString() };
}
