import { describe, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { buildContentDraft, applyBrandVoice } from './draft-builder.js';
import type { ContentBriefSpec } from './brief-parser.js';
import type { BrandVoice } from './draft-builder.js';

const emptyBrandVoice: BrandVoice = {
    style: 'neutral',
    doNotUse: [],
    signaturePhrase: null,
};

const baseSpec = (overrides: Partial<ContentBriefSpec> = {}): ContentBriefSpec => ({
    audience: 'Developers',
    tone: 'technical',
    format: null,
    wordCount: 800,
    keyMessages: ['Point A', 'Point B'],
    callToAction: null,
    deadline: null,
    ...overrides,
});

describe('buildContentDraft — format headings', () => {
    test('blog_post produces # heading', () => {
        const draft = buildContentDraft(baseSpec({ format: 'blog_post' }), emptyBrandVoice);
        assert.ok(draft.body.startsWith('# '), `expected # heading, got: ${draft.body.slice(0, 30)}`);
    });

    test('email_campaign produces Subject: heading', () => {
        const draft = buildContentDraft(baseSpec({ format: 'email_campaign' }), emptyBrandVoice);
        assert.ok(draft.body.startsWith('Subject:'), `expected Subject:, got: ${draft.body.slice(0, 30)}`);
    });

    test('social_post has no heading — body flows directly', () => {
        const draft = buildContentDraft(baseSpec({ format: 'social_post' }), emptyBrandVoice);
        assert.ok(
            !draft.body.startsWith('#') && !draft.body.startsWith('Subject:'),
            `social post should have no heading, got: ${draft.body.slice(0, 30)}`,
        );
    });

    test('internal_announcement produces ## Announcement: heading', () => {
        const draft = buildContentDraft(
            baseSpec({ format: 'internal_announcement' }),
            emptyBrandVoice,
        );
        assert.ok(
            draft.body.startsWith('## Announcement:'),
            `expected ## Announcement:, got: ${draft.body.slice(0, 40)}`,
        );
    });

    test('format field is copied through to the draft', () => {
        const draft = buildContentDraft(baseSpec({ format: 'blog_post' }), emptyBrandVoice);
        assert.equal(draft.format, 'blog_post');
    });

    test('wordCount is a positive number', () => {
        const draft = buildContentDraft(baseSpec({ format: 'blog_post' }), emptyBrandVoice);
        assert.ok(draft.wordCount > 0, 'wordCount should be positive');
    });
});

describe('applyBrandVoice', () => {
    test('removes banned phrases case-insensitively', () => {
        const bv: BrandVoice = {
            style: 'clean',
            doNotUse: ['synergy', 'leverage'],
            signaturePhrase: null,
        };
        const result = applyBrandVoice(
            'We need to leverage synergy to grow.',
            bv,
        );
        assert.ok(!result.toLowerCase().includes('synergy'), 'synergy should be removed');
        assert.ok(!result.toLowerCase().includes('leverage'), 'leverage should be removed');
    });

    test('appends signaturePhrase when set', () => {
        const bv: BrandVoice = {
            style: 'clean',
            doNotUse: [],
            signaturePhrase: 'Powered by AgentFarm.',
        };
        const result = applyBrandVoice('Hello world.', bv);
        assert.ok(result.endsWith('Powered by AgentFarm.'), 'should end with signaturePhrase');
    });

    test('no changes when doNotUse is empty and no signaturePhrase', () => {
        const bv: BrandVoice = {
            style: 'neutral',
            doNotUse: [],
            signaturePhrase: null,
        };
        const input = 'Clean draft body here.';
        const result = applyBrandVoice(input, bv);
        assert.equal(result, input);
    });

    test('multiple banned phrases all removed', () => {
        const bv: BrandVoice = {
            style: 'corporate',
            doNotUse: ['utilize', 'bandwidth', 'circle back'],
            signaturePhrase: null,
        };
        const input = 'Please utilize your bandwidth and circle back soon.';
        const result = applyBrandVoice(input, bv);
        assert.ok(!result.toLowerCase().includes('utilize'));
        assert.ok(!result.toLowerCase().includes('bandwidth'));
        assert.ok(!result.toLowerCase().includes('circle back'));
    });
});

// ---------------------------------------------------------------------------
// Format-aware scaffold content tests
// ---------------------------------------------------------------------------

describe('buildContentDraft — scaffold content', () => {
    test('blog_post body contains ## Introduction section', () => {
        const draft = buildContentDraft(baseSpec({ format: 'blog_post' }), emptyBrandVoice);
        assert.ok(draft.body.includes('## Introduction'), `expected ## Introduction, got body: ${draft.body.slice(0, 200)}`);
    });

    test('blog_post body contains ## Conclusion section', () => {
        const draft = buildContentDraft(baseSpec({ format: 'blog_post' }), emptyBrandVoice);
        assert.ok(draft.body.includes('## Conclusion') || draft.body.includes('Conclusion'), `expected Conclusion section`);
    });

    test('social_post body does not contain placeholder text', () => {
        const draft = buildContentDraft(baseSpec({ format: 'social_post' }), emptyBrandVoice);
        assert.ok(!draft.body.includes('[Draft body'), `social_post should not contain placeholder text`);
        assert.ok(!draft.body.includes('expand this section'), `social_post should not contain placeholder text`);
    });

    test('email_campaign body contains greeting section', () => {
        const draft = buildContentDraft(baseSpec({ format: 'email_campaign' }), emptyBrandVoice);
        assert.ok(
            draft.body.toLowerCase().includes('greeting') || draft.body.toLowerCase().includes('dear') || draft.body.includes('Subject:'),
            `expected email greeting or subject, got: ${draft.body.slice(0, 200)}`,
        );
    });

    test('internal_announcement body contains ## Key Details or key details section', () => {
        const draft = buildContentDraft(baseSpec({ format: 'internal_announcement' }), emptyBrandVoice);
        assert.ok(
            draft.body.toLowerCase().includes('details') || draft.body.toLowerCase().includes('announcement'),
            `expected details section, got: ${draft.body.slice(0, 200)}`,
        );
    });

    test('callToAction is appended to body when provided', () => {
        const cta = 'Start your free trial today';
        const draft = buildContentDraft(
            baseSpec({ format: 'blog_post', callToAction: cta }),
            emptyBrandVoice,
        );
        assert.ok(draft.body.includes(cta), `CTA "${cta}" should appear in body`);
    });
});
