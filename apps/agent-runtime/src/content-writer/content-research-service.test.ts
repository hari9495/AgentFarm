import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { researchContentTopic } from './content-research-service.js';
import type { ResearchFetchFn, ContentResearchSource } from './content-research-service.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function makeWikiFetch(extract: string): ResearchFetchFn {
    return async () => ({
        ok: true,
        status: 200,
        text: async () =>
            JSON.stringify({
                query: {
                    pages: {
                        '12345': { extract },
                    },
                },
            }),
    });
}

function makeFailFetch(): ResearchFetchFn {
    return async () => ({ ok: false, status: 500, text: async () => '' });
}

function makeThrowFetch(): ResearchFetchFn {
    return async () => {
        throw new Error('Network error');
    };
}

function makeMissingFetch(): ResearchFetchFn {
    return async () => ({
        ok: true,
        status: 200,
        text: async () =>
            JSON.stringify({
                query: { pages: { '-1': { missing: '' } } },
            }),
    });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('researchContentTopic', () => {
    test('returns wikipedia snippet when page exists', async () => {
        const result = await researchContentTopic(
            'TypeScript',
            makeWikiFetch('TypeScript is a strongly typed language.'),
        );
        assert.equal(result.topic, 'TypeScript');
        assert.equal(result.snippets.length, 1);
        assert.equal(result.snippets[0]?.source, 'wikipedia');
        assert.ok(result.snippets[0]?.text.includes('TypeScript is a strongly typed'));
    });

    test('returns empty snippets on HTTP failure', async () => {
        const result = await researchContentTopic('TypeScript', makeFailFetch());
        assert.equal(result.snippets.length, 0);
    });

    test('returns empty snippets on network throw', async () => {
        const result = await researchContentTopic('TypeScript', makeThrowFetch());
        assert.equal(result.snippets.length, 0);
    });

    test('returns empty snippets when Wikipedia page is missing', async () => {
        const result = await researchContentTopic('TypeScript', makeMissingFetch());
        assert.equal(result.snippets.length, 0);
    });

    test('returns empty snippets for empty topic', async () => {
        const result = await researchContentTopic(
            '',
            makeWikiFetch('Should not be fetched.'),
        );
        assert.equal(result.snippets.length, 0);
    });

    test('strips unsafe characters from topic before constructing URL', async () => {
        const fetchedUrls: string[] = [];
        const captureFetch: ResearchFetchFn = async (url) => {
            fetchedUrls.push(url);
            return {
                ok: true,
                status: 200,
                text: async () =>
                    JSON.stringify({
                        query: { pages: { '1': { extract: 'safe content' } } },
                    }),
            };
        };

        await researchContentTopic('Hello <script>alert("xss")</script> World', captureFetch);
        // Only the safe characters should appear in the fetched URL
        const wikiUrl = fetchedUrls.find((u) => u.includes('wikipedia'));
        assert.ok(wikiUrl, 'Wikipedia URL should have been constructed');
        assert.ok(!wikiUrl.includes('<script>'), 'XSS payload must be stripped');
        assert.ok(wikiUrl.includes('Hello') || wikiUrl.includes('World'));
    });

    test('includes fetchedAt ISO timestamp', async () => {
        const before = Date.now();
        const result = await researchContentTopic('topic', makeFailFetch());
        const after = Date.now();
        const ts = new Date(result.fetchedAt).getTime();
        assert.ok(ts >= before && ts <= after, 'fetchedAt should be within the test window');
    });
});

// ---------------------------------------------------------------------------
// Helpers for multi-source routing
// ---------------------------------------------------------------------------

function makeRoutedFetch(routes: Record<string, string | null>): ResearchFetchFn {
    return async (url) => {
        for (const [pattern, body] of Object.entries(routes)) {
            if (url.includes(pattern)) {
                if (body === null) return { ok: false, status: 500, text: async () => '' };
                return { ok: true, status: 200, text: async () => body };
            }
        }
        return { ok: false, status: 404, text: async () => '' };
    };
}

function hnPayload(hits: Array<{ title: string; url: string; objectID: string; points?: number }>) {
    return JSON.stringify({ hits });
}

function redditPayload(posts: Array<{ title: string; url: string; subreddit: string }>) {
    return JSON.stringify({ data: { children: posts.map((p) => ({ data: p })) } });
}

// ---------------------------------------------------------------------------
// Hacker News tests
// ---------------------------------------------------------------------------

describe('researchContentTopic — Hacker News', () => {
    test('returns hacker_news snippets when Algolia responds', async () => {
        const fetchFn = makeRoutedFetch({
            'hn.algolia.com': hnPayload([
                { title: 'TypeScript 5.0 Ships', url: 'https://hn.co/item/1', objectID: '1', points: 500 },
            ]),
            'wikipedia.org': JSON.stringify({ query: { pages: { '-1': { missing: '' } } } }),
            'reddit.com': redditPayload([]),
        });
        const result = await researchContentTopic('TypeScript', fetchFn);
        const hnSnippets = result.snippets.filter((s) => s.source === 'hacker_news');
        assert.equal(hnSnippets.length, 1);
        assert.ok(hnSnippets[0]?.text.includes('TypeScript 5.0 Ships'));
        assert.ok(hnSnippets[0]?.text.includes('500 points'));
        assert.equal(hnSnippets[0]?.url, 'https://hn.co/item/1');
    });

    test('returns empty on HN HTTP failure', async () => {
        const fetchFn = makeRoutedFetch({
            'hn.algolia.com': null,
            'wikipedia.org': JSON.stringify({ query: { pages: { '-1': { missing: '' } } } }),
            'reddit.com': redditPayload([]),
        });
        const result = await researchContentTopic('TypeScript', fetchFn);
        assert.equal(result.snippets.filter((s) => s.source === 'hacker_news').length, 0);
    });

    test('sanitises topic in HN URL', async () => {
        const urls: string[] = [];
        const fetchFn: ResearchFetchFn = async (url) => {
            urls.push(url);
            return { ok: false, status: 404, text: async () => '' };
        };
        await researchContentTopic('Hello <script>!</script>', fetchFn);
        const hnUrl = urls.find((u) => u.includes('hn.algolia.com')) ?? '';
        assert.ok(!hnUrl.includes('<script>'), 'XSS payload must be stripped from HN URL');
    });

    test('falls back to HN item URL when hit has no url field', async () => {
        const fetchFn = makeRoutedFetch({
            'hn.algolia.com': JSON.stringify({ hits: [{ title: 'No URL Post', objectID: '9999' }] }),
            'wikipedia.org': JSON.stringify({ query: { pages: { '-1': { missing: '' } } } }),
            'reddit.com': redditPayload([]),
        });
        const result = await researchContentTopic('TypeScript', fetchFn);
        const hn = result.snippets.find((s) => s.source === 'hacker_news');
        assert.ok(hn?.url.includes('news.ycombinator.com'));
    });
});

// ---------------------------------------------------------------------------
// Reddit tests
// ---------------------------------------------------------------------------

describe('researchContentTopic — Reddit', () => {
    test('returns reddit snippets when API responds', async () => {
        const fetchFn = makeRoutedFetch({
            'reddit.com': redditPayload([
                { title: 'Best TS patterns in 2024', url: 'https://reddit.com/r/typescript/1', subreddit: 'typescript' },
            ]),
            'wikipedia.org': JSON.stringify({ query: { pages: { '-1': { missing: '' } } } }),
            'hn.algolia.com': hnPayload([]),
        });
        const result = await researchContentTopic('TypeScript', fetchFn);
        const redditSnippets = result.snippets.filter((s) => s.source === 'reddit');
        assert.equal(redditSnippets.length, 1);
        assert.ok(redditSnippets[0]?.text.includes('typescript'));
        assert.ok(redditSnippets[0]?.text.includes('Best TS patterns'));
    });

    test('returns empty on Reddit HTTP failure', async () => {
        const fetchFn = makeRoutedFetch({
            'reddit.com': null,
            'wikipedia.org': JSON.stringify({ query: { pages: { '-1': { missing: '' } } } }),
            'hn.algolia.com': hnPayload([]),
        });
        const result = await researchContentTopic('TypeScript', fetchFn);
        assert.equal(result.snippets.filter((s) => s.source === 'reddit').length, 0);
    });

    test('sanitises topic in Reddit URL', async () => {
        const urls: string[] = [];
        const fetchFn: ResearchFetchFn = async (url) => {
            urls.push(url);
            return { ok: false, status: 404, text: async () => '' };
        };
        await researchContentTopic('Hello <b>world</b>', fetchFn);
        const redditUrl = urls.find((u) => u.includes('reddit.com')) ?? '';
        assert.ok(!redditUrl.includes('<b>'), 'HTML tags must be stripped from Reddit URL');
    });
});

// ---------------------------------------------------------------------------
// Combined sources test
// ---------------------------------------------------------------------------

describe('researchContentTopic — combined sources', () => {
    test('returns snippets from all available sources', async () => {
        const fetchFn = makeRoutedFetch({
            'wikipedia.org': JSON.stringify({ query: { pages: { '1': { extract: 'TypeScript is typed JS.' } } } }),
            'hn.algolia.com': hnPayload([{ title: 'HN story', url: 'https://hn.co/1', objectID: '1' }]),
            'reddit.com': redditPayload([{ title: 'Reddit post', url: 'https://reddit.com/r/ts/1', subreddit: 'typescript' }]),
        });
        const result = await researchContentTopic('TypeScript', fetchFn);
        const sources: ContentResearchSource[] = result.snippets.map((s) => s.source);
        assert.ok(sources.includes('wikipedia'));
        assert.ok(sources.includes('hacker_news'));
        assert.ok(sources.includes('reddit'));
    });

    test('still returns partial results when some sources fail', async () => {
        const fetchFn = makeRoutedFetch({
            'wikipedia.org': JSON.stringify({ query: { pages: { '1': { extract: 'TypeScript is typed JS.' } } } }),
            'hn.algolia.com': null,
            'reddit.com': null,
        });
        const result = await researchContentTopic('TypeScript', fetchFn);
        assert.equal(result.snippets.filter((s) => s.source === 'wikipedia').length, 1);
        assert.equal(result.snippets.filter((s) => s.source === 'hacker_news').length, 0);
        assert.equal(result.snippets.filter((s) => s.source === 'reddit').length, 0);
    });
});
