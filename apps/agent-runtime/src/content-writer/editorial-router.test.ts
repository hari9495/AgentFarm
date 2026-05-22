import { describe, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { classifyEditorialRisk, routeToEditor } from './editorial-router.js';
import type { ContentDraft } from './draft-builder.js';
import type { FactCheckReport } from './fact-checker.js';

function makeDraft(body: string, overrides: Partial<ContentDraft> = {}): ContentDraft {
    return {
        title: 'Test Draft',
        body,
        format: 'blog_post',
        wordCount: body.split(/\s+/).length,
        ...overrides,
    };
}

const emptyReport: FactCheckReport = {
    totalClaims: 0,
    verified: 0,
    flagged: [],
};

describe('classifyEditorialRisk', () => {
    test('draft with no risk signals is classified as low', () => {
        const draft = makeDraft(
            'Our team is excited to share our latest product update. We have improved performance significantly.',
        );
        assert.equal(classifyEditorialRisk(draft), 'low');
    });

    test('draft containing legal keyword is classified as high', () => {
        const draft = makeDraft(
            'This is not legal advice. Our product does not address any legal liability.',
        );
        assert.equal(classifyEditorialRisk(draft), 'high');
    });

    test('draft containing liability keyword is classified as high', () => {
        const draft = makeDraft(
            'We accept no liability for outcomes based on our recommendations.',
        );
        assert.equal(classifyEditorialRisk(draft), 'high');
    });

    test('draft mentioning a competitor is classified as medium', () => {
        const draft = makeDraft(
            'Our platform outperforms competing solutions in every benchmark.',
        );
        assert.equal(classifyEditorialRisk(draft), 'medium');
    });

    test('draft with revenue claim is classified as medium', () => {
        const draft = makeDraft(
            'The product drove significant revenue growth and improved market share.',
        );
        assert.equal(classifyEditorialRisk(draft), 'medium');
    });

    test('high risk takes priority over medium signals', () => {
        const draft = makeDraft(
            'Our revenue is protected by regulation. Competitors cannot match our GDPR compliance.',
        );
        assert.equal(classifyEditorialRisk(draft), 'high');
    });
});

describe('routeToEditor', () => {
    test('handoff note includes all required fields', () => {
        const draft = makeDraft('A standard blog post about product features.');
        const note = routeToEditor(draft, emptyReport, { displayName: 'Casey (AI)' });

        assert.ok('title' in note, 'note should have title');
        assert.ok('format' in note, 'note should have format');
        assert.ok('wordCount' in note, 'note should have wordCount');
        assert.ok('brandVoiceCompliant' in note, 'note should have brandVoiceCompliant');
        assert.ok('factCheckSummary' in note, 'note should have factCheckSummary');
        assert.ok('agentDisplayName' in note, 'note should have agentDisplayName');
        assert.ok('riskLevel' in note, 'note should have riskLevel');
    });

    test('persona displayName appears in the handoff note', () => {
        const draft = makeDraft('Standard content.');
        const note = routeToEditor(draft, emptyReport, { displayName: 'Content Agent' });

        assert.equal(note.agentDisplayName, 'Content Agent');
    });

    test('null persona falls back to default display name', () => {
        const draft = makeDraft('Standard content.');
        const note = routeToEditor(draft, emptyReport, null);

        assert.equal(note.agentDisplayName, 'Content Writer Agent');
    });

    test('clean fact check report produces clean summary in note', () => {
        const draft = makeDraft('Simple factual draft.');
        const note = routeToEditor(draft, emptyReport, null);

        assert.ok(
            note.factCheckSummary.includes('No claims flagged'),
            `expected clean fact check, got: ${note.factCheckSummary}`,
        );
    });

    test('risk level is correctly reflected in note for high-risk draft', () => {
        const draft = makeDraft(
            'This content involves legal liability and regulatory compliance.',
        );
        const note = routeToEditor(draft, emptyReport, null);

        assert.equal(note.riskLevel, 'high');
    });

    test('brandVoiceCompliant is true (brand voice applied at build time)', () => {
        const draft = makeDraft('Content produced after brand voice applied.');
        const note = routeToEditor(draft, emptyReport, null);

        assert.equal(note.brandVoiceCompliant, true);
    });
});
