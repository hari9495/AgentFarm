import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { adaptTone, detectCurrentTone } from './tone-adapter.js';
import type { ProseCallerFn, } from './llm-prose-writer.js';
import type { ToneAdaptRequest } from './tone-adapter.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockSuccess: ProseCallerFn = async () => ({
    text: 'Rewritten content in new tone.',
    tokensUsed: 80,
});

const mockFailure: ProseCallerFn = async () => ({ text: null });

const baseReq: ToneAdaptRequest = {
    body: 'TypeScript is a programming language. It adds types to JavaScript.',
    targetTone: 'casual',
    preserveStructure: false,
};

// ---------------------------------------------------------------------------
// adaptTone tests
// ---------------------------------------------------------------------------

describe('adaptTone', () => {
    test('returns LLM-adapted body on success', async () => {
        const result = await adaptTone(baseReq, mockSuccess);
        assert.equal(result.adaptedByLlm, true);
        assert.equal(result.body, 'Rewritten content in new tone.');
        assert.equal(result.toneApplied, 'casual');
        assert.equal(result.tokensUsed, 80);
    });

    test('returns original body when LLM fails', async () => {
        const result = await adaptTone(baseReq, mockFailure);
        assert.equal(result.adaptedByLlm, false);
        assert.equal(result.body, baseReq.body);
    });

    test('returns empty body for empty input without calling LLM', async () => {
        let callerCalled = false;
        const trackCaller: ProseCallerFn = async () => {
            callerCalled = true;
            return { text: 'should not be returned', tokensUsed: 0 };
        };

        const result = await adaptTone({ ...baseReq, body: '   ' }, trackCaller);
        assert.equal(result.body, '');
        assert.equal(result.adaptedByLlm, false);
        assert.equal(callerCalled, false);
    });

    test('passes preserveStructure=true note to system prompt', async () => {
        const capturedPrompts: string[] = [];
        const captureCaller: ProseCallerFn = async (system) => {
            capturedPrompts.push(system);
            return { text: 'ok', tokensUsed: 10 };
        };

        await adaptTone({ ...baseReq, preserveStructure: true }, captureCaller);
        assert.ok(capturedPrompts[0]?.includes('headings'));
    });

    test('includes all tone styles in instruction map', async () => {
        const tones: ToneAdaptRequest['targetTone'][] = [
            'professional', 'casual', 'persuasive', 'storytelling',
            'technical', 'friendly', 'authoritative',
        ];
        for (const tone of tones) {
            const capturedPrompts: string[] = [];
            const captureCaller: ProseCallerFn = async (system) => {
                capturedPrompts.push(system);
                return { text: 'ok', tokensUsed: 5 };
            };
            await adaptTone({ ...baseReq, targetTone: tone }, captureCaller);
            assert.ok(
                capturedPrompts[0] && capturedPrompts[0].length > 50,
                `Tone ${tone} should produce a non-trivial system prompt`,
            );
        }
    });
});

// ---------------------------------------------------------------------------
// detectCurrentTone tests
// ---------------------------------------------------------------------------

describe('detectCurrentTone', () => {
    test('detects technical tone from technical vocabulary', () => {
        const body =
            'The API implementation uses a deployment architecture with SDK configuration. ' +
            'The algorithm applies a protocol-level configuration to the deployment pipeline.';
        assert.equal(detectCurrentTone(body), 'technical');
    });

    test('detects casual tone from contractions', () => {
        const body =
            "Don't worry, it's not hard. You're going to love it. We're here to help. " +
            "Can't wait to show you what we've built. It's really simple.";
        assert.equal(detectCurrentTone(body), 'casual');
    });

    test('detects professional tone from lack of contractions and casual language', () => {
        const body =
            'The organisation has established a comprehensive framework for quality management. ' +
            'This framework ensures compliance with industry standards and regulatory requirements.';
        assert.equal(detectCurrentTone(body), 'professional');
    });
});

// ---------------------------------------------------------------------------
// detectCurrentToneLlm tests
// ---------------------------------------------------------------------------

import { detectCurrentToneLlm } from './tone-adapter.js';

describe('detectCurrentToneLlm', () => {
    test('returns LLM tone when valid tone is returned', async () => {
        const mockCaller: ProseCallerFn = async () => ({
            text: 'technical',
            tokensUsed: 15,
        });

        const tone = await detectCurrentToneLlm('The API uses a deployment protocol.', mockCaller);
        assert.equal(tone, 'technical');
    });

    test('falls back to heuristic when LLM returns invalid value', async () => {
        const mockCaller: ProseCallerFn = async () => ({
            text: 'robotic',  // not a valid ToneStyle
            tokensUsed: 10,
        });

        const tone = await detectCurrentToneLlm(
            'The API implementation uses a deployment architecture with SDK configuration.',
            mockCaller,
        );
        // Falls back to heuristic which detects 'technical' for this text
        assert.ok(['technical', 'professional', 'casual', 'persuasive', 'storytelling', 'friendly', 'authoritative'].includes(tone));
    });

    test('falls back to heuristic when LLM fails', async () => {
        const mockFailure: ProseCallerFn = async () => ({ text: null });
        const tone = await detectCurrentToneLlm(
            "Don't worry, it's super easy and you'll love it.",
            mockFailure,
        );
        assert.ok(['technical', 'professional', 'casual', 'persuasive', 'storytelling', 'friendly', 'authoritative'].includes(tone));
    });

    test('returns one of the 7 valid ToneStyle values', async () => {
        const toneValues = ['professional', 'casual', 'persuasive', 'storytelling', 'technical', 'friendly', 'authoritative'];
        for (const expected of toneValues) {
            const mockCaller: ProseCallerFn = async () => ({ text: expected, tokensUsed: 5 });
            const tone = await detectCurrentToneLlm('Some text here.', mockCaller);
            assert.ok(toneValues.includes(tone), `expected valid tone, got: ${tone}`);
        }
    });
});
