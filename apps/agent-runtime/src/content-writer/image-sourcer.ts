/**
 * Image Sourcer
 *
 * Suggests relevant images for a content draft.
 *
 * Behaviour:
 *   - If the UNSPLASH_ACCESS_KEY env var is set: calls the Unsplash Search API
 *     and returns photo metadata with alt text and attribution.
 *   - If no key is set: returns search URL suggestions only — the human must
 *     open the links and choose images manually.
 *
 * The agent NEVER embeds images directly into content. It only returns
 * suggestions that a human must review and confirm before use.
 *
 * Security notes:
 *   - Query params are URL-encoded before use.
 *   - Access key is read from env — never hardcoded.
 *   - fetchFn is injectable so tests never make real HTTP calls.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ImageSuggestion {
    /** The search query used to find this image. */
    query: string;
    /** Unsplash search URL a human can open to browse options. */
    unsplashSearchUrl: string;
    /** Suggested alt text derived from the query. */
    altText: string;
    /**
     * Attribution string when a specific photo was fetched via API.
     * null when only a search URL is returned (no API key).
     */
    attribution: string | null;
    /** Unsplash photo URL (null when no API key or API error). */
    photoUrl: string | null;
}

/**
 * Injectable fetch abstraction. The default implementation uses global fetch.
 */
export type ImageFetchFn = (
    url: string,
    headers: Record<string, string>,
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract topic keywords from headings and key messages. */
function extractTopicQueries(draftBody: string, keyMessages: string[]): string[] {
    const queries: string[] = [];

    // Pull text from markdown headings (## Heading)
    const headingMatches = draftBody.match(/^#{1,6}\s+(.+)$/gm) ?? [];
    for (const heading of headingMatches) {
        const text = heading.replace(/^#{1,6}\s+/, '').trim();
        if (text.length > 3) {
            queries.push(text);
        }
    }

    // Add key messages (first 5 words only to keep queries concise)
    for (const msg of keyMessages) {
        const shortMsg = msg.split(/\s+/).slice(0, 5).join(' ');
        if (shortMsg.length > 3) {
            queries.push(shortMsg);
        }
    }

    // Deduplicate, keep top 3
    return [...new Set(queries)].slice(0, 3);
}

function buildUnsplashSearchUrl(query: string): string {
    return `https://unsplash.com/s/photos/${encodeURIComponent(query.toLowerCase())}`;
}

function buildUnsplashApiUrl(query: string): string {
    return `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`;
}

// ---------------------------------------------------------------------------
// Default fetch adapter
// ---------------------------------------------------------------------------

const defaultFetch: ImageFetchFn = async (url, headers) => {
    const response = await fetch(url, { headers });
    return {
        ok: response.ok,
        status: response.status,
        json: () => response.json() as Promise<unknown>,
    };
};

// ---------------------------------------------------------------------------
// API-backed suggestion
// ---------------------------------------------------------------------------

interface UnsplashPhoto {
    id?: string;
    urls?: { regular?: string };
    user?: { name?: string; links?: { html?: string } };
    alt_description?: string | null;
}

interface UnsplashSearchResponse {
    results?: UnsplashPhoto[];
}

async function fetchUnsplashPhoto(
    query: string,
    accessKey: string,
    fetchFn: ImageFetchFn,
): Promise<{ photoUrl: string | null; attribution: string | null }> {
    try {
        const apiUrl = buildUnsplashApiUrl(query);
        const response = await fetchFn(apiUrl, {
            Authorization: `Client-ID ${accessKey}`,
        });

        if (!response.ok) {
            return { photoUrl: null, attribution: null };
        }

        const data = (await response.json()) as UnsplashSearchResponse;
        const photo = data.results?.[0];
        if (!photo) return { photoUrl: null, attribution: null };

        const photoUrl = photo.urls?.regular ?? null;
        const artistName = photo.user?.name ?? 'Unknown';
        const artistUrl = photo.user?.links?.html ?? 'https://unsplash.com';
        const attribution = `Photo by ${artistName} on Unsplash (${artistUrl})`;

        return { photoUrl, attribution };
    } catch {
        return { photoUrl: null, attribution: null };
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Suggest images for a content draft.
 *
 * @param draftBody   The draft content body (used to extract headings).
 * @param keyMessages Key messages from the content brief.
 * @param fetchFn     Optional injectable fetch function (defaults to global fetch).
 * @returns           Array of ImageSuggestion — always returns suggestions even without an API key.
 */
export async function suggestImages(
    draftBody: string,
    keyMessages: string[],
    fetchFn: ImageFetchFn = defaultFetch,
): Promise<ImageSuggestion[]> {
    const queries = extractTopicQueries(draftBody, keyMessages);

    if (queries.length === 0) {
        return [];
    }

    const accessKey = process.env['UNSPLASH_ACCESS_KEY'];
    const suggestions: ImageSuggestion[] = [];

    for (const query of queries) {
        const unsplashSearchUrl = buildUnsplashSearchUrl(query);
        const altText = `Image illustrating: ${query}`;

        if (accessKey) {
            const { photoUrl, attribution } = await fetchUnsplashPhoto(query, accessKey, fetchFn);
            suggestions.push({
                query,
                unsplashSearchUrl,
                altText,
                attribution,
                photoUrl,
            });
        } else {
            suggestions.push({
                query,
                unsplashSearchUrl,
                altText,
                attribution: null,
                photoUrl: null,
            });
        }
    }

    return suggestions;
}

// ---------------------------------------------------------------------------
// Embed helper
// ---------------------------------------------------------------------------

/**
 * Insert embed-ready image markdown into a draft body.
 *
 * Each suggestion that has a resolved photoUrl is embedded as
 * `![alt text](photoUrl)` after the first matching heading in the body.
 * If no heading match is found, images are appended at the end.
 *
 * Only suggestions with `photoUrl !== null` are embedded.
 */
export function embedImagesIntoDraft(
    body: string,
    suggestions: ImageSuggestion[],
): string {
    const embeddable = suggestions.filter((s) => s.photoUrl !== null);
    if (embeddable.length === 0) return body;

    const lines = body.split('\n');
    const result: string[] = [];
    let embedIndex = 0;

    for (let i = 0; i < lines.length; i++) {
        result.push(lines[i]);
        // Embed after the first heading line (skip the very first line which may be the title)
        if (embedIndex < embeddable.length && /^#{1,6}\s/.test(lines[i]) && i > 0) {
            const img = embeddable[embedIndex];
            const embedLine = `\n![${img.altText}](${img.photoUrl!})`;
            const attrLine = img.attribution ? `*${img.attribution}*` : null;
            result.push(embedLine);
            if (attrLine) result.push(attrLine);
            embedIndex++;
        }
    }

    // Append any remaining embeddable images that had no heading to attach to
    for (; embedIndex < embeddable.length; embedIndex++) {
        const img = embeddable[embedIndex];
        result.push(`\n![${img.altText}](${img.photoUrl!})`);
        if (img.attribution) result.push(`*${img.attribution}*`);
    }

    return result.join('\n');
}
