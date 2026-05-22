import { describe, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { parseContentBrief } from './brief-parser.js';

describe('parseContentBrief', () => {
    test('well-formed brief extracts all required fields', () => {
        const brief = `
Audience: SaaS startup founders
Tone: Conversational and confident
Format: Blog post
Word count: 800 words
Key messages: AI can replace manual processes; ROI is measurable within 90 days
CTA: Start your free trial today
Deadline: 2026-06-01
        `.trim();

        const { spec, confidence, missingFields } = parseContentBrief(brief);

        assert.equal(confidence, 'high');
        assert.deepEqual(missingFields, []);
        assert.ok(spec.audience !== null, 'audience should be extracted');
        assert.ok(spec.tone !== null, 'tone should be extracted');
        assert.equal(spec.format, 'blog_post');
        assert.equal(spec.wordCount, 800);
        assert.ok(spec.callToAction !== null, 'CTA should be extracted');
        assert.equal(spec.deadline, '2026-06-01');
    });

    test('brief with missing tone returns low confidence and lists tone in missingFields', () => {
        const brief = `
Audience: Product managers
Format: Email campaign
Word count: 400 words
Key messages: Improve sprint velocity
        `.trim();

        const { confidence, missingFields } = parseContentBrief(brief);

        assert.equal(confidence, 'low');
        assert.ok(missingFields.includes('tone'), 'tone should be in missingFields');
    });

    test('brief with no CTA returns null callToAction', () => {
        const brief = `
Audience: Developers
Tone: Technical and direct
Format: Blog post
Word count: 1200 words
Key messages: TypeScript improves maintainability
        `.trim();

        const { spec, confidence } = parseContentBrief(brief);

        assert.equal(spec.callToAction, null);
        assert.equal(confidence, 'high');
    });

    test('word count in "500–800 words" range format is parsed as lower bound', () => {
        const brief = `
Audience: HR managers
Tone: Professional
Format: Internal announcement
Word count: 500–800 words
        `.trim();

        const { spec } = parseContentBrief(brief);

        assert.equal(spec.wordCount, 500);
    });

    test('word count with tilde (~1000 words) is parsed correctly', () => {
        const brief = `
Audience: Investors
Tone: Authoritative
Format: Blog post
~1000 words
        `.trim();

        const { spec } = parseContentBrief(brief);

        assert.equal(spec.wordCount, 1000);
    });

    test('format detection falls back to keyword heuristics when no explicit label', () => {
        const brief = `
Audience: General public
Tone: Friendly
We need a LinkedIn post about our product launch.
        `.trim();

        const { spec } = parseContentBrief(brief);

        assert.equal(spec.format, 'social_post');
    });

    test('email campaign format detected from "newsletter" keyword', () => {
        const brief = `
Audience: Email subscribers
Tone: Warm
Write a newsletter for our weekly digest.
        `.trim();

        const { spec } = parseContentBrief(brief);

        assert.equal(spec.format, 'email_campaign');
    });

    test('empty string returns all required fields missing and low confidence', () => {
        const { spec, confidence, missingFields } = parseContentBrief('');

        assert.equal(confidence, 'low');
        assert.ok(missingFields.includes('audience'));
        assert.ok(missingFields.includes('tone'));
        assert.ok(missingFields.includes('format'));
        assert.equal(spec.audience, null);
        assert.equal(spec.tone, null);
        assert.equal(spec.format, null);
        assert.equal(spec.wordCount, null);
        assert.deepEqual(spec.keyMessages, []);
        assert.equal(spec.callToAction, null);
        assert.equal(spec.deadline, null);
    });

    test('key messages are extracted from labelled bullet list', () => {
        const brief = `
Audience: Developers
Tone: Technical
Format: Blog post

Key messages:
- TypeScript reduces runtime errors
- Type inference improves DX
- Migration from JS is incremental
        `.trim();

        const { spec } = parseContentBrief(brief);

        assert.ok(spec.keyMessages.length >= 2, 'should extract multiple key messages');
        assert.ok(
            spec.keyMessages.some((m) => m.toLowerCase().includes('typescript')),
            'key message should contain TypeScript',
        );
    });
});

// ---------------------------------------------------------------------------
// buildClarificationQuestions tests
// ---------------------------------------------------------------------------

import { buildClarificationQuestions } from './brief-parser.js';
import type { ParsedBrief } from './brief-parser.js';

describe('buildClarificationQuestions', () => {
    test('missing audience returns a question about audience', () => {
        const parsed: ParsedBrief = {
            spec: { audience: null, tone: 'professional', format: 'blog_post', wordCount: 500, keyMessages: [], callToAction: null, deadline: null },
            confidence: 'low',
            missingFields: ['audience'],
        };
        const questions = buildClarificationQuestions(parsed);
        assert.ok(questions.length > 0, 'should return at least one question');
        assert.ok(
            questions.some((q) => q.toLowerCase().includes('audience') || q.toLowerCase().includes('who')),
            `expected question about audience, got: ${questions[0]}`,
        );
    });

    test('missing tone returns a question about tone', () => {
        const parsed: ParsedBrief = {
            spec: { audience: 'Developers', tone: null, format: 'blog_post', wordCount: 500, keyMessages: [], callToAction: null, deadline: null },
            confidence: 'low',
            missingFields: ['tone'],
        };
        const questions = buildClarificationQuestions(parsed);
        assert.ok(questions.some((q) => q.toLowerCase().includes('tone')));
    });

    test('missing format returns a question about format', () => {
        const parsed: ParsedBrief = {
            spec: { audience: 'HR', tone: 'friendly', format: null, wordCount: null, keyMessages: [], callToAction: null, deadline: null },
            confidence: 'low',
            missingFields: ['format'],
        };
        const questions = buildClarificationQuestions(parsed);
        assert.ok(questions.some((q) => q.toLowerCase().includes('format') || q.toLowerCase().includes('type')));
    });

    test('social_post with word count > 300 produces a contradiction warning', () => {
        const parsed: ParsedBrief = {
            spec: { audience: 'General public', tone: 'casual', format: 'social_post', wordCount: 500, keyMessages: [], callToAction: null, deadline: null },
            confidence: 'high',
            missingFields: [],
        };
        const questions = buildClarificationQuestions(parsed);
        assert.ok(
            questions.some((q) => q.toLowerCase().includes('social') || q.toLowerCase().includes('word count') || q.toLowerCase().includes('500')),
            `expected contradiction warning about social post word count, got: ${JSON.stringify(questions)}`,
        );
    });

    test('returns empty array when no fields missing and no contradictions', () => {
        const parsed: ParsedBrief = {
            spec: { audience: 'Investors', tone: 'professional', format: 'blog_post', wordCount: 800, keyMessages: ['ROI'], callToAction: 'Contact us', deadline: null },
            confidence: 'high',
            missingFields: [],
        };
        const questions = buildClarificationQuestions(parsed);
        assert.deepEqual(questions, []);
    });
});
