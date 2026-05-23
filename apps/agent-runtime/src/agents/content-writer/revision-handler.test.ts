import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { generateRevisions } from './revision-handler.js';
import type { ProseCallerFn } from './llm-prose-writer.js';
import type { EditorComment } from './revision-handler.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockSuccess: ProseCallerFn = async (_system, _user) => ({
    text: 'Revised section text.',
    tokensUsed: 60,
});

const mockFailure: ProseCallerFn = async () => ({ text: null, tokensUsed: 0 });

const sampleDraft = `# Introduction
TypeScript is great for large projects.

## Benefits
It provides compile-time type checking.

## Drawbacks
Some people find it verbose.`;

const commentOnSection: EditorComment = {
    body: 'Please expand on the benefits with a concrete example.',
    section: 'Benefits',
    author: 'Alice',
};

const commentOnFull: EditorComment = {
    body: 'The tone is too formal, please make it friendlier.',
    section: null,
    author: 'Bob',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('generateRevisions', () => {
    test('returns empty result for empty draft', async () => {
        const result = await generateRevisions('', [commentOnSection], mockSuccess);
        assert.equal(result.revisions.length, 0);
        assert.equal(result.tokensUsed, 0);
    });

    test('returns empty result for empty comment list', async () => {
        const result = await generateRevisions(sampleDraft, [], mockSuccess);
        assert.equal(result.revisions.length, 0);
    });

    test('generates one revision per comment', async () => {
        const result = await generateRevisions(
            sampleDraft,
            [commentOnSection, commentOnFull],
            mockSuccess,
        );
        assert.equal(result.revisions.length, 2);
    });

    test('revised excerpt differs from original when LLM succeeds', async () => {
        const result = await generateRevisions(sampleDraft, [commentOnSection], mockSuccess);
        const revision = result.revisions[0]!;
        assert.equal(revision.revisedExcerpt, 'Revised section text.');
        assert.ok(revision.originalExcerpt.includes('type checking'));
    });

    test('falls back to original excerpt when LLM fails', async () => {
        const result = await generateRevisions(sampleDraft, [commentOnSection], mockFailure);
        const revision = result.revisions[0]!;
        assert.equal(revision.revisedExcerpt, revision.originalExcerpt);
    });

    test('accumulates tokensUsed across multiple comments', async () => {
        const result = await generateRevisions(
            sampleDraft,
            [commentOnSection, commentOnFull],
            mockSuccess,
        );
        assert.equal(result.tokensUsed, 120); // 60 per comment
    });

    test('agentResponseMessage summarises revision count', async () => {
        const result = await generateRevisions(sampleDraft, [commentOnSection], mockSuccess);
        assert.ok(result.agentResponseMessage.includes('1 editor comment'));
    });

    test('section=null comment uses full draft body', async () => {
        const capturedUser: string[] = [];
        const captureCaller: ProseCallerFn = async (_system, user) => {
            capturedUser.push(user);
            return { text: 'ok', tokensUsed: 5 };
        };

        await generateRevisions(sampleDraft, [commentOnFull], captureCaller);
        // Full draft should be in user prompt when section is null
        assert.ok(capturedUser[0]?.includes('TypeScript is great'));
    });
});

// ---------------------------------------------------------------------------
// detectRevisionConflicts tests
// ---------------------------------------------------------------------------

import { detectRevisionConflicts } from './revision-handler.js';

describe('detectRevisionConflicts', () => {
    test('lengthen + shorten on same section returns one conflict', () => {
        const comments: EditorComment[] = [
            { body: 'Please lengthen this section with more examples.', section: 'Benefits', author: 'Alice' },
            { body: 'This is too long, shorten it please.', section: 'Benefits', author: 'Bob' },
        ];
        const conflicts = detectRevisionConflicts(comments);
        assert.equal(conflicts.length, 1);
        assert.equal(conflicts[0]!.section, 'Benefits');
    });

    test('formal + informal on same section returns one conflict', () => {
        const comments: EditorComment[] = [
            { body: 'Make the tone more formal and professional.', section: null, author: 'Alice' },
            { body: 'This feels too formal, please make it informal and casual.', section: null, author: 'Bob' },
        ];
        const conflicts = detectRevisionConflicts(comments);
        assert.equal(conflicts.length, 1);
    });

    test('same direction on same section returns no conflict', () => {
        const comments: EditorComment[] = [
            { body: 'Please expand this with more detail.', section: 'Intro', author: 'Alice' },
            { body: 'More elaboration needed here.', section: 'Intro', author: 'Bob' },
        ];
        const conflicts = detectRevisionConflicts(comments);
        assert.equal(conflicts.length, 0);
    });

    test('conflicting directions on different sections returns no conflict', () => {
        const comments: EditorComment[] = [
            { body: 'Lengthen the introduction.', section: 'Introduction', author: 'Alice' },
            { body: 'Shorten the conclusion.', section: 'Conclusion', author: 'Bob' },
        ];
        const conflicts = detectRevisionConflicts(comments);
        assert.equal(conflicts.length, 0);
    });

    test('returns empty array for empty comment list', () => {
        const conflicts = detectRevisionConflicts([]);
        assert.deepEqual(conflicts, []);
    });

    test('single comment returns no conflict', () => {
        const conflicts = detectRevisionConflicts([
            { body: 'Please make this simpler.', section: null, author: 'Alice' },
        ]);
        assert.deepEqual(conflicts, []);
    });
});
