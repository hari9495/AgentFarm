import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { writeProse } from './llm-prose-writer.js';
import type { ProseCallerFn, ProseRequest } from './llm-prose-writer.js';
import type { ContentBriefSpec } from './brief-parser.js';
import type { BrandVoice } from './draft-builder.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const defaultSpec: ContentBriefSpec = {
    audience: 'developers',
    tone: 'professional',
    format: 'blog_post',
    wordCount: 500,
    keyMessages: ['TypeScript improves productivity', 'Strong typing reduces bugs'],
    callToAction: 'Start using TypeScript today',
    deadline: null,
};

const defaultBrandVoice: BrandVoice = {
    style: 'professional',
    doNotUse: ['amazing', 'revolutionary'],
    signaturePhrase: 'Build better, ship faster.',
};

const mockCallerSuccess: ProseCallerFn = async () => ({
    text: '# TypeScript for Developers\n\nTypeScript improves productivity.\n\nBuild better, ship faster.',
    tokensUsed: 120,
});

const mockCallerFailure: ProseCallerFn = async () => ({
    text: null,
    error: 'LLM timeout',
});

const baseReq: ProseRequest = {
    spec: defaultSpec,
    brandVoice: defaultBrandVoice,
    research: null,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('writeProse', () => {
    test('returns LLM-generated body when caller succeeds', async () => {
        const result = await writeProse(baseReq, mockCallerSuccess);
        assert.equal(result.generatedByLlm, true);
        assert.ok(result.body.includes('TypeScript'));
        assert.equal(result.tokensUsed, 120);
    });

    test('returns fallback placeholder when caller returns null', async () => {
        const result = await writeProse(baseReq, mockCallerFailure);
        assert.equal(result.generatedByLlm, false);
        assert.ok(result.body.includes('LLM prose generation failed'));
        assert.ok(result.body.includes('LLM timeout'));
        assert.equal(result.tokensUsed, 0);
    });

    test('includes research context in user prompt', async () => {
        const capturedPrompts: { system: string; user: string }[] = [];
        const captureCaller: ProseCallerFn = async (system, user) => {
            capturedPrompts.push({ system, user });
            return { text: 'Generated content', tokensUsed: 50 };
        };

        const reqWithResearch: ProseRequest = {
            ...baseReq,
            research: {
                topic: 'TypeScript',
                snippets: [
                    {
                        source: 'wikipedia',
                        url: 'https://en.wikipedia.org/wiki/TypeScript',
                        text: 'TypeScript is a strongly typed programming language.',
                    },
                ],
                fetchedAt: new Date().toISOString(),
            },
        };

        await writeProse(reqWithResearch, captureCaller);
        assert.ok(capturedPrompts[0]?.user.includes('Background research'));
        assert.ok(capturedPrompts[0]?.user.includes('TypeScript is a strongly typed'));
    });

    test('includes brand voice doNotUse in system prompt', async () => {
        const capturedPrompts: string[] = [];
        const captureCaller: ProseCallerFn = async (system) => {
            capturedPrompts.push(system);
            return { text: 'ok', tokensUsed: 10 };
        };

        await writeProse(baseReq, captureCaller);
        assert.ok(capturedPrompts[0]?.includes('amazing'));
        assert.ok(capturedPrompts[0]?.includes('revolutionary'));
    });

    test('includes signature phrase in system prompt', async () => {
        const capturedPrompts: string[] = [];
        const captureCaller: ProseCallerFn = async (system) => {
            capturedPrompts.push(system);
            return { text: 'ok', tokensUsed: 10 };
        };

        await writeProse(baseReq, captureCaller);
        assert.ok(capturedPrompts[0]?.includes('Build better, ship faster.'));
    });

    test('handles email_campaign format instruction', async () => {
        const capturedPrompts: string[] = [];
        const captureCaller: ProseCallerFn = async (_sys, user) => {
            capturedPrompts.push(user);
            return { text: 'email body', tokensUsed: 30 };
        };

        const emailReq: ProseRequest = {
            ...baseReq,
            spec: { ...defaultSpec, format: 'email_campaign' },
        };
        await writeProse(emailReq, captureCaller);
        assert.ok(capturedPrompts[0]?.includes('subject line'));
    });

    test('handles social_post format instruction', async () => {
        const capturedPrompts: string[] = [];
        const captureCaller: ProseCallerFn = async (_sys, user) => {
            capturedPrompts.push(user);
            return { text: '#TypeScript is great', tokensUsed: 20 };
        };

        const socialReq: ProseRequest = {
            ...baseReq,
            spec: { ...defaultSpec, format: 'social_post' },
        };
        await writeProse(socialReq, captureCaller);
        assert.ok(capturedPrompts[0]?.includes('hashtags'));
    });
});

// ---------------------------------------------------------------------------
// reviewAndRefineProse tests
// ---------------------------------------------------------------------------

import { reviewAndRefineProse } from './llm-prose-writer.js';

describe('reviewAndRefineProse', () => {
    test('returns improved body when LLM succeeds', async () => {
        const originalBody = 'TypeScript is good. It helps developers.';
        const mockCaller: ProseCallerFn = async () => ({
            text: 'TypeScript significantly improves developer productivity by catching errors at compile time.',
            tokensUsed: 50,
        });

        const result = await reviewAndRefineProse(originalBody, defaultSpec, mockCaller);
        assert.equal(result.generatedByLlm, true);
        assert.equal(result.body, 'TypeScript significantly improves developer productivity by catching errors at compile time.');
        assert.ok(result.tokensUsed > 0);
    });

    test('returns original body when LLM fails', async () => {
        const originalBody = 'TypeScript is good.';
        const mockFailure: ProseCallerFn = async () => ({ text: null });

        const result = await reviewAndRefineProse(originalBody, defaultSpec, mockFailure);
        assert.equal(result.generatedByLlm, false);
        assert.equal(result.body, originalBody);
    });

    test('calls LLM with the original body in the prompt', async () => {
        const capturedUser: string[] = [];
        const captureCaller: ProseCallerFn = async (_sys, user) => {
            capturedUser.push(user);
            return { text: 'Improved content.', tokensUsed: 20 };
        };

        await reviewAndRefineProse('Original draft text here.', defaultSpec, captureCaller);
        assert.ok(capturedUser[0]?.includes('Original draft text here.'));
    });
});
