import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyReply } from './reply-classifier.js';

const savedFetch = globalThis.fetch;

const makeFetch = (ok: boolean, payload?: object) =>
    (async () => ({
        ok,
        status: ok ? 200 : 500,
        text: async () => 'error',
        json: async () =>
            ok
                ? { content: [{ type: 'text', text: JSON.stringify(payload ?? {}) }] }
                : {},
    })) as unknown as typeof fetch;

test('classifyReply — returns ClassifyReplyResult shape on success', async () => {
    const expected = {
        intent: 'interested',
        confidence: 0.9,
        suggestedAction: 'schedule_demo',
        reasoning: 'Prospect expressed clear interest.',
    };
    globalThis.fetch = makeFetch(true, expected);

    try {
        const result = await classifyReply({
            replyText: 'Yes, I am interested! Let\'s set up a demo.',
            originalSubject: 'Automate your dev workflows',
        });
        assert.equal(result.intent, 'interested');
        assert.equal(typeof result.confidence, 'number');
        assert.ok(result.confidence >= 0 && result.confidence <= 1, 'confidence must be 0-1');
        assert.equal(typeof result.suggestedAction, 'string');
        assert.equal(typeof result.reasoning, 'string');
    } finally {
        globalThis.fetch = savedFetch;
    }
});

test('classifyReply — returns unknown intent (no throw) on LLM error', async () => {
    globalThis.fetch = makeFetch(false);

    try {
        const result = await classifyReply({
            replyText: 'Some reply',
            originalSubject: 'Test subject',
        });
        assert.equal(result.intent, 'unknown');
        assert.equal(result.confidence, 0);
        assert.equal(result.suggestedAction, 'manual_review');
    } finally {
        globalThis.fetch = savedFetch;
    }
});

test('classifyReply — confidence is between 0 and 1', async () => {
    const expected = {
        intent: 'not_now',
        confidence: 0.5,
        suggestedAction: 'follow_up_in_30_days',
        reasoning: 'Prospect is busy.',
    };
    globalThis.fetch = makeFetch(true, expected);

    try {
        const result = await classifyReply({
            replyText: 'Not right now, maybe in a few months.',
            originalSubject: 'Quick question',
        });
        assert.ok(result.confidence >= 0 && result.confidence <= 1);
    } finally {
        globalThis.fetch = savedFetch;
    }
});
