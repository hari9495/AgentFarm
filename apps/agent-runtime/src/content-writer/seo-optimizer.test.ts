import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { optimizeForSeo } from './seo-optimizer.js';
import type { SeoInput } from './seo-optimizer.js';

describe('optimizeForSeo', () => {
    test('extracts focus keyword from key messages', () => {
        const input: SeoInput = {
            draftBody:
                '## TypeScript benefits\n\nTypeScript improves productivity. TypeScript improves productivity by catching errors early.',
            keyMessages: ['TypeScript improves productivity', 'Strong typing reduces bugs'],
            audience: 'developers',
            format: 'blog_post',
        };
        const result = optimizeForSeo(input);
        assert.ok(result.focusKeyword !== null);
        assert.ok(result.focusKeyword!.includes('typescript'));
    });

    test('returns null focusKeyword when no key messages', () => {
        const input: SeoInput = {
            draftBody: 'Some random content here.',
            keyMessages: [],
            audience: null,
            format: null,
        };
        const result = optimizeForSeo(input);
        assert.equal(result.focusKeyword, null);
        assert.ok(result.suggestions.some((s) => s.includes('focus keyword')));
    });

    test('metaTitle clamps to 60 characters', () => {
        const input: SeoInput = {
            draftBody: 'Content body here.',
            keyMessages: ['a very long keyword phrase that exceeds the limit by quite a lot of characters'],
            audience: 'software engineering developers in large enterprise organizations',
            format: 'blog_post',
        };
        const result = optimizeForSeo(input);
        assert.ok(result.metaTitle.length <= 60);
    });

    test('metaDescription clamps to 160 characters', () => {
        const input: SeoInput = {
            draftBody:
                'This is a very long first sentence that goes on and on about many different topics and should definitely be truncated because it exceeds the meta description character limit of one hundred and sixty characters.',
            keyMessages: ['keyword'],
            audience: null,
            format: null,
        };
        const result = optimizeForSeo(input);
        assert.ok(result.metaDescription.length <= 160);
    });

    test('detects keyword in first paragraph', () => {
        const input: SeoInput = {
            draftBody: 'TypeScript is great for large projects.\n\nOther paragraph.',
            keyMessages: ['typescript'],
            audience: null,
            format: null,
        };
        const result = optimizeForSeo(input);
        assert.equal(result.keywordInFirstParagraph, true);
    });

    test('detects keyword in headings', () => {
        const input: SeoInput = {
            draftBody:
                '## Benefits of TypeScript\n\nDetails here.\n\nSecond paragraph.',
            keyMessages: ['typescript'],
            audience: null,
            format: null,
        };
        const result = optimizeForSeo(input);
        assert.equal(result.keywordInHeadings, true);
    });

    test('assigns easy readability for short sentences', () => {
        // Short sentence body
        const input: SeoInput = {
            draftBody: 'Code ships fast. Tests pass. Bugs are rare.',
            keyMessages: [],
            audience: null,
            format: null,
        };
        const result = optimizeForSeo(input);
        assert.equal(result.readabilityGrade, 'easy');
    });

    test('assigns difficult readability for long sentences', () => {
        const longSentence =
            'In the rapidly evolving landscape of modern software engineering practices and methodologies, ' +
            'the adoption of strongly typed languages such as TypeScript has demonstrated a remarkable capacity ' +
            'to reduce the incidence of runtime type errors that would otherwise only manifest in production environments.';
        const input: SeoInput = {
            draftBody: longSentence,
            keyMessages: [],
            audience: null,
            format: null,
        };
        const result = optimizeForSeo(input);
        assert.equal(result.readabilityGrade, 'difficult');
    });

    test('suggests adding keyword to first paragraph when absent', () => {
        const input: SeoInput = {
            draftBody:
                'Introduction paragraph without the keyword.\n\n## Heading\n\nBody text with typescript here.',
            keyMessages: ['typescript'],
            audience: null,
            format: null,
        };
        const result = optimizeForSeo(input);
        assert.ok(result.suggestions.some((s) => s.includes('first paragraph')));
    });
});

// ---------------------------------------------------------------------------
// Flesch Reading Ease tests
// ---------------------------------------------------------------------------

describe('optimizeForSeo — Flesch Reading Ease', () => {
    test('returns a numeric score between 0 and 100', () => {
        const input: SeoInput = {
            draftBody: 'TypeScript is fast. Code ships well.',
            keyMessages: [],
            audience: null,
            format: null,
        };
        const { fleschReadingEase } = optimizeForSeo(input);
        assert.ok(fleschReadingEase >= 0 && fleschReadingEase <= 100, `score ${fleschReadingEase} out of range`);
    });

    test('easy short-word text scores higher than complex academic text', () => {
        const easyInput: SeoInput = {
            draftBody: 'The cat sat. The dog ran. It was fun.',
            keyMessages: [],
            audience: null,
            format: null,
        };
        const hardInput: SeoInput = {
            draftBody:
                'Epistemological considerations regarding the multidimensional interrelationships ' +
                'between socioeconomic stratification and educational achievement demonstrate ' +
                'substantive correlative phenomenological interdependencies across heterogeneous populations.',
            keyMessages: [],
            audience: null,
            format: null,
        };
        const easyScore = optimizeForSeo(easyInput).fleschReadingEase;
        const hardScore = optimizeForSeo(hardInput).fleschReadingEase;
        assert.ok(easyScore > hardScore, `expected easy (${easyScore}) > hard (${hardScore})`);
    });

    test('adds suggestion when Flesch score is very low', () => {
        const complexBody =
            'Epistemological considerations regarding multidimensional socioeconomic ' +
            'stratification demonstrate phenomenological interdependencies across heterogeneous populations.';
        const input: SeoInput = { draftBody: complexBody, keyMessages: [], audience: null, format: null };
        const result = optimizeForSeo(input);
        if (result.fleschReadingEase < 30) {
            assert.ok(result.suggestions.some((s) => s.includes('Flesch')));
        }
    });
});

// ---------------------------------------------------------------------------
// Word count tests
// ---------------------------------------------------------------------------

describe('optimizeForSeo — word count', () => {
    test('returns correct word count', () => {
        const input: SeoInput = {
            draftBody: 'one two three four five',
            keyMessages: [],
            audience: null,
            format: null,
        };
        assert.equal(optimizeForSeo(input).wordCount, 5);
    });

    test('suggests more content when article is under 300 words', () => {
        const input: SeoInput = {
            draftBody: 'Short article.',
            keyMessages: [],
            audience: null,
            format: null,
        };
        const result = optimizeForSeo(input);
        assert.ok(result.suggestions.some((s) => s.includes('300 words')));
    });

    test('no word-count suggestion for adequately-long article', () => {
        const words = Array.from({ length: 320 }, (_, i) => `word${i}`).join(' ');
        const input: SeoInput = { draftBody: words, keyMessages: [], audience: null, format: null };
        const result = optimizeForSeo(input);
        assert.ok(!result.suggestions.some((s) => s.includes('300 words')));
    });
});

// ---------------------------------------------------------------------------
// Link count tests
// ---------------------------------------------------------------------------

describe('optimizeForSeo — link counts', () => {
    test('counts external markdown links', () => {
        const input: SeoInput = {
            draftBody: 'See [MDN](https://developer.mozilla.org) and [TS](https://typescriptlang.org).',
            keyMessages: [],
            audience: null,
            format: null,
        };
        const result = optimizeForSeo(input);
        assert.equal(result.externalLinkCount, 2);
        assert.equal(result.internalLinkCount, 0);
    });

    test('counts internal markdown links', () => {
        const input: SeoInput = {
            draftBody: 'See [related post](/blog/related) and [home](/).',
            keyMessages: [],
            audience: null,
            format: null,
        };
        const result = optimizeForSeo(input);
        assert.equal(result.internalLinkCount, 2);
        assert.equal(result.externalLinkCount, 0);
    });

    test('counts HTML anchor tags', () => {
        const input: SeoInput = {
            draftBody: '<a href="https://example.com">Example</a> and <a href="/internal">Local</a>.',
            keyMessages: [],
            audience: null,
            format: null,
        };
        const result = optimizeForSeo(input);
        assert.equal(result.externalLinkCount, 1);
        assert.equal(result.internalLinkCount, 1);
    });

    test('suggests adding external link when none present', () => {
        const input: SeoInput = {
            draftBody: 'Content with no links at all.',
            keyMessages: [],
            audience: null,
            format: null,
        };
        const result = optimizeForSeo(input);
        assert.ok(result.suggestions.some((s) => s.includes('external link')));
    });

    test('suggests adding internal link when none present', () => {
        const input: SeoInput = {
            draftBody: 'Content with only an [external link](https://example.com).',
            keyMessages: [],
            audience: null,
            format: null,
        };
        const result = optimizeForSeo(input);
        assert.ok(result.suggestions.some((s) => s.includes('internal link')));
    });

    test('no link suggestions when both link types are present', () => {
        const body = Array.from({ length: 320 }, (_, i) => `word${i}`).join(' ') +
            ' [ext](https://example.com) [int](/page)';
        const input: SeoInput = { draftBody: body, keyMessages: [], audience: null, format: null };
        const result = optimizeForSeo(input);
        assert.ok(!result.suggestions.some((s) => s.includes('external link')));
        assert.ok(!result.suggestions.some((s) => s.includes('internal link')));
    });
});
