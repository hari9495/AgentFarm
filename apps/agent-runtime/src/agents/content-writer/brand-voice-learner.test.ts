import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { learnBrandVoice } from './brand-voice-learner.js';
import type { BrandVoiceSample } from './brand-voice-learner.js';
import type { BrandVoice } from './draft-builder.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const base: BrandVoice = {
    style: 'friendly and direct',
    doNotUse: ['synergy', 'leverage'],
    signaturePhrase: 'Made for humans.',
};

const techSamples: BrandVoiceSample[] = [
    {
        text:
            'Our platform enables seamless integration through our comprehensive API architecture. ' +
            'Developers benefit from extensive documentation and configurable deployment options.',
    },
    {
        text:
            'The algorithm implementation follows best practices for scalability and performance. ' +
            'The configuration system supports multiple deployment environments automatically.',
    },
];

const casualSamples: BrandVoiceSample[] = [
    {
        text:
            "Hey there! We know you're busy, so we made it super easy. You'll love how simple it is. " +
            "Don't worry, you've got this.",
    },
    {
        text:
            "You can do it! We're here for you every step of the way. Your success is our mission.",
    },
];

const firstPersonSamples: BrandVoiceSample[] = [
    { text: 'We believe in transparency. Our mission is to help our customers succeed. We are committed to our values.' },
    { text: 'Our team works hard every day. We put our customers first. I believe our approach is the best.' },
];

const simpleSamples: BrandVoiceSample[] = [
    { text: 'It works. It is fast. Use it now. Try it today.' },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('learnBrandVoice', () => {
    test('preserves base brand voice fields', () => {
        const learned = learnBrandVoice(techSamples, base);
        assert.equal(learned.style, 'friendly and direct');
        assert.deepEqual(learned.doNotUse, ['synergy', 'leverage']);
        assert.equal(learned.signaturePhrase, 'Made for humans.');
    });

    test('returns zero-value profile for empty samples', () => {
        const learned = learnBrandVoice([], base);
        assert.equal(learned.sampleCount, 0);
        assert.equal(learned.avgSentenceLength, 0);
        assert.deepEqual(learned.styleMarkers, []);
    });

    test('counts samples correctly', () => {
        const learned = learnBrandVoice(techSamples, base);
        assert.equal(learned.sampleCount, 2);
    });

    test('detects second-person POV from casual samples', () => {
        const learned = learnBrandVoice(casualSamples, base);
        assert.equal(learned.preferredPov, 'second_person');
    });

    test('detects first-person POV from first-person samples', () => {
        const learned = learnBrandVoice(firstPersonSamples, base);
        assert.equal(learned.preferredPov, 'first_person');
    });

    test('extracts style markers as non-empty array for multi-word samples', () => {
        const learned = learnBrandVoice(techSamples, base);
        assert.ok(Array.isArray(learned.styleMarkers));
        assert.ok(learned.styleMarkers.length > 0, 'Style markers should not be empty for multi-word samples');
    });

    test('computes simple reading level for short sentences', () => {
        const learned = learnBrandVoice(simpleSamples, base);
        assert.equal(learned.readingLevel, 'simple');
    });

    test('style markers do not include stopwords', () => {
        const learned = learnBrandVoice(techSamples, base);
        const stopwordsInMarkers = learned.styleMarkers.filter((m) =>
            ['the', 'and', 'for', 'with', 'from', 'are'].includes(m),
        );
        assert.equal(stopwordsInMarkers.length, 0);
    });
});

// ---------------------------------------------------------------------------
// learnBrandVoiceSemantic tests
// ---------------------------------------------------------------------------

import { learnBrandVoiceSemantic } from './brand-voice-learner.js';
import type { ProseCallerFn } from './llm-prose-writer.js';

describe('learnBrandVoiceSemantic', () => {
    test('populates semanticDescription, emotionalTone, rhetoricalDevices from LLM response', async () => {
        const mockCaller: ProseCallerFn = async () => ({
            text: 'DESCRIPTION: Confident and direct voice that values clarity.\nEMOTIONAL_TONE: energetic and optimistic\nRHETORICAL_DEVICES: metaphor, rhetorical questions, alliteration',
            tokensUsed: 60,
        });

        const result = await learnBrandVoiceSemantic(techSamples, base, mockCaller);

        assert.ok(result.semanticDescription?.includes('Confident'), `semanticDescription: ${result.semanticDescription}`);
        assert.equal(result.emotionalTone, 'energetic and optimistic');
        assert.ok(Array.isArray(result.rhetoricalDevices) && result.rhetoricalDevices.length === 3);
        assert.ok(result.rhetoricalDevices?.includes('metaphor'));
    });

    test('falls back to heuristic result when LLM fails', async () => {
        const mockFailure: ProseCallerFn = async () => ({ text: null });
        const result = await learnBrandVoiceSemantic(techSamples, base, mockFailure);

        assert.equal(result.sampleCount, techSamples.length);
        assert.equal(result.semanticDescription, undefined);
        assert.equal(result.emotionalTone, undefined);
        assert.equal(result.rhetoricalDevices, undefined);
    });

    test('returns zero-value heuristic result for empty samples without calling LLM', async () => {
        let callerCalled = false;
        const trackCaller: ProseCallerFn = async () => {
            callerCalled = true;
            return { text: 'should not be called', tokensUsed: 0 };
        };

        const result = await learnBrandVoiceSemantic([], base, trackCaller);
        assert.equal(callerCalled, false);
        assert.equal(result.sampleCount, 0);
    });

    test('preserves all heuristic fields alongside LLM-enriched fields', async () => {
        const mockCaller: ProseCallerFn = async () => ({
            text: 'DESCRIPTION: Short voice.\nEMOTIONAL_TONE: calm\nRHETORICAL_DEVICES: analogy',
            tokensUsed: 20,
        });

        const result = await learnBrandVoiceSemantic(casualSamples, base, mockCaller);

        assert.equal(result.sampleCount, casualSamples.length);
        assert.ok(Array.isArray(result.styleMarkers));
        assert.ok(['first_person', 'second_person', 'third_person'].includes(result.preferredPov));
        assert.ok(result.semanticDescription !== undefined);
    });
});
