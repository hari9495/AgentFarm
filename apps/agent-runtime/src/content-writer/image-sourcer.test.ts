import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { suggestImages } from './image-sourcer.js';
import type { ImageFetchFn } from './image-sourcer.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const draftWithHeadings = `# TypeScript for Teams
TypeScript improves large codebases.

## Type Safety Benefits
Catch errors at compile time.

## Migration Strategy
Incremental adoption is easiest.`;

const draftNoHeadings = 'TypeScript is a great language for building scalable apps.';

function makeUnsplashFetch(photoUrl: string): ImageFetchFn {
    return async () => ({
        ok: true,
        status: 200,
        json: async () => ({
            results: [
                {
                    id: 'photo-abc',
                    urls: { regular: photoUrl },
                    user: { name: 'Jane Doe', links: { html: 'https://unsplash.com/@jane' } },
                    alt_description: 'Programming desk setup',
                },
            ],
        }),
    });
}

function makeFailFetch(): ImageFetchFn {
    return async () => ({ ok: false, status: 401, json: async () => ({}) });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('suggestImages', () => {
    test('returns suggestions from headings without API key', async () => {
        delete process.env['UNSPLASH_ACCESS_KEY'];
        const suggestions = await suggestImages(draftWithHeadings, []);
        assert.ok(suggestions.length > 0, 'Should return at least one suggestion');
    });

    test('returns max 3 suggestions', async () => {
        delete process.env['UNSPLASH_ACCESS_KEY'];
        const suggestions = await suggestImages(draftWithHeadings, ['more key message', 'another one', 'yet another']);
        assert.ok(suggestions.length <= 3);
    });

    test('suggestions without API key have null photoUrl and attribution', async () => {
        delete process.env['UNSPLASH_ACCESS_KEY'];
        const suggestions = await suggestImages(draftWithHeadings, []);
        for (const s of suggestions) {
            assert.equal(s.photoUrl, null);
            assert.equal(s.attribution, null);
        }
    });

    test('unsplashSearchUrl is a valid Unsplash URL', async () => {
        delete process.env['UNSPLASH_ACCESS_KEY'];
        const suggestions = await suggestImages(draftWithHeadings, []);
        for (const s of suggestions) {
            assert.ok(s.unsplashSearchUrl.startsWith('https://unsplash.com/s/photos/'));
        }
    });

    test('with API key, returns photoUrl and attribution from fetch response', async () => {
        process.env['UNSPLASH_ACCESS_KEY'] = 'test-key-123';
        const photoUrl = 'https://images.unsplash.com/photo-abc';
        const suggestions = await suggestImages(
            draftWithHeadings,
            [],
            makeUnsplashFetch(photoUrl),
        );
        assert.ok(suggestions.length > 0);
        assert.equal(suggestions[0]!.photoUrl, photoUrl);
        assert.ok(suggestions[0]!.attribution?.includes('Jane Doe'));
        delete process.env['UNSPLASH_ACCESS_KEY'];
    });

    test('with API key but HTTP failure, falls back to null photoUrl', async () => {
        process.env['UNSPLASH_ACCESS_KEY'] = 'test-key-456';
        const suggestions = await suggestImages(draftWithHeadings, [], makeFailFetch());
        assert.ok(suggestions.length > 0);
        assert.equal(suggestions[0]!.photoUrl, null);
        delete process.env['UNSPLASH_ACCESS_KEY'];
    });

    test('returns empty array for draft with no headings and no key messages', async () => {
        delete process.env['UNSPLASH_ACCESS_KEY'];
        const suggestions = await suggestImages(draftNoHeadings, []);
        assert.equal(suggestions.length, 0);
    });

    test('uses key messages when draft has no headings', async () => {
        delete process.env['UNSPLASH_ACCESS_KEY'];
        const suggestions = await suggestImages(draftNoHeadings, ['TypeScript adoption', 'developer productivity']);
        assert.ok(suggestions.length > 0);
    });
});

// ---------------------------------------------------------------------------
// embedImagesIntoDraft tests
// ---------------------------------------------------------------------------

import { embedImagesIntoDraft } from './image-sourcer.js';
import type { ImageSuggestion } from './image-sourcer.js';

describe('embedImagesIntoDraft', () => {
    const suggestionWithUrl: ImageSuggestion = {
        query: 'TypeScript teams',
        altText: 'TypeScript developer team',
        photoUrl: 'https://images.unsplash.com/photo-abc',
        attribution: 'Photo by Jane Doe on Unsplash',
        unsplashSearchUrl: 'https://unsplash.com/s/photos/typescript',
    };

    const suggestionNoUrl: ImageSuggestion = {
        query: 'TypeScript teams',
        altText: 'TypeScript developer team',
        photoUrl: null,
        attribution: null,
        unsplashSearchUrl: 'https://unsplash.com/s/photos/typescript',
    };

    test('embeds markdown image after first non-title heading', () => {
        const body = draftWithHeadings;
        const result = embedImagesIntoDraft(body, [suggestionWithUrl]);
        assert.ok(result.includes('![TypeScript developer team](https://images.unsplash.com/photo-abc)'));
    });

    test('skips suggestions with null photoUrl', () => {
        const result = embedImagesIntoDraft(draftWithHeadings, [suggestionNoUrl]);
        assert.ok(!result.includes('!['), 'no image markdown should be embedded when photoUrl is null');
        assert.equal(result, draftWithHeadings);
    });

    test('appends image at end when body has no headings', () => {
        const body = 'TypeScript is great.';
        const result = embedImagesIntoDraft(body, [suggestionWithUrl]);
        assert.ok(result.includes('![TypeScript developer team]'), 'image should be appended when no headings');
    });

    test('includes attribution when present', () => {
        const result = embedImagesIntoDraft(draftWithHeadings, [suggestionWithUrl]);
        assert.ok(result.includes('Photo by Jane Doe on Unsplash'), 'attribution should be included');
    });

    test('returns original body unchanged when suggestions array is empty', () => {
        const result = embedImagesIntoDraft(draftWithHeadings, []);
        assert.equal(result, draftWithHeadings);
    });
});
