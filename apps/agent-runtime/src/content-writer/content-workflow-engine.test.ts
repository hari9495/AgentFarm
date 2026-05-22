import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runContentWorkflow } from './content-workflow-engine.js';
import type { ContentWorkflowInput, WorkflowDeps } from './content-workflow-engine.js';
import type { ProseCallerFn } from './llm-prose-writer.js';
import type { ReviewFetchFn } from './review-dispatcher.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockCaller(body = 'Mock LLM draft body for testing.'): ProseCallerFn {
    return async (_systemPrompt, _userPrompt) => ({ text: body });
}

function makeMockReviewFetchFn(ok = true): ReviewFetchFn {
    return async (_url, _payload) => ({
        ok,
        status: ok ? 200 : 500,
        json: async () => ({ ok }),
    } as unknown as Response);
}

const baseInput: ContentWorkflowInput = {
    title: 'Why TypeScript Monorepos Scale',
    topic: 'TypeScript monorepo architecture benefits',
    audience: 'Engineering managers',
    keywords: ['monorepo', 'TypeScript', 'scalability'],
};

// ---------------------------------------------------------------------------
// research_and_draft preset
// ---------------------------------------------------------------------------

describe('runContentWorkflow — research_and_draft preset', () => {
    it('runs research, write, and seo steps and returns ok', async () => {
        const deps: WorkflowDeps = { callerFn: makeMockCaller() };
        const result = await runContentWorkflow(
            { ...baseInput, preset: 'research_and_draft' },
            deps,
        );

        assert.equal(result.ok, true, `Expected ok but got errors: ${result.errorOutput}`);
        assert.equal(result.preset, 'research_and_draft');
        const stepNames = result.steps.map((s) => s.step);
        assert.deepEqual(stepNames, ['research', 'write_prose', 'seo_optimize']);
        assert.ok(result.finalDraft && result.finalDraft.length > 0, 'finalDraft should be set');
        assert.ok(result.seoReport, 'seoReport should be set');
    });

    it('research step marks ok even when no research fetch fn provided', async () => {
        const deps: WorkflowDeps = { callerFn: makeMockCaller() };
        const result = await runContentWorkflow(
            { ...baseInput, preset: 'research_and_draft' },
            deps,
        );
        const researchStep = result.steps.find((s) => s.step === 'research');
        assert.ok(researchStep, 'research step should be present');
        assert.equal(researchStep!.ok, true);
        assert.equal(researchStep!.skipped, false);
    });
});

// ---------------------------------------------------------------------------
// write_and_review preset
// ---------------------------------------------------------------------------

describe('runContentWorkflow — write_and_review preset', () => {
    it('skips research step and runs write, seo, review, send_for_review', async () => {
        const deps: WorkflowDeps = {
            callerFn: makeMockCaller(),
            reviewFetchFn: makeMockReviewFetchFn(true),
        };
        const result = await runContentWorkflow(
            {
                ...baseInput,
                preset: 'write_and_review',
                reviewerUrl: 'https://hooks.example.com/review',
                reviewerDisplayName: 'Content Lead',
                reviewChannel: 'webhook',
            },
            deps,
        );

        assert.equal(result.ok, true, `Expected ok but got: ${result.errorOutput}`);
        const stepNames = result.steps.map((s) => s.step);
        assert.deepEqual(stepNames, ['write_prose', 'seo_optimize', 'review_prose', 'send_for_review']);
        // Research must not appear
        assert.equal(result.steps.some((s) => s.step === 'research'), false);
    });

    it('send_for_review is skipped when reviewerUrl is absent', async () => {
        const deps: WorkflowDeps = { callerFn: makeMockCaller() };
        const result = await runContentWorkflow(
            { ...baseInput, preset: 'write_and_review' },
            deps,
        );

        const sendStep = result.steps.find((s) => s.step === 'send_for_review');
        assert.ok(sendStep, 'send_for_review step should be present');
        assert.equal(sendStep!.skipped, true);
        assert.equal(result.ok, true);
    });
});

// ---------------------------------------------------------------------------
// skipSteps option
// ---------------------------------------------------------------------------

describe('runContentWorkflow — skipSteps', () => {
    it('skips seo_optimize when listed in skipSteps', async () => {
        const deps: WorkflowDeps = { callerFn: makeMockCaller() };
        const result = await runContentWorkflow(
            { ...baseInput, preset: 'research_and_draft', skipSteps: ['seo_optimize'] },
            deps,
        );

        const seoStep = result.steps.find((s) => s.step === 'seo_optimize');
        assert.ok(seoStep, 'seo_optimize step should still appear in results');
        assert.equal(seoStep!.skipped, true);
        assert.equal(seoStep!.ok, true);
        assert.equal(result.seoReport, undefined, 'seoReport should be absent when step was skipped');
    });

    it('skips research step and still generates draft', async () => {
        const deps: WorkflowDeps = { callerFn: makeMockCaller() };
        const result = await runContentWorkflow(
            { ...baseInput, preset: 'research_and_draft', skipSteps: ['research'] },
            deps,
        );

        const researchStep = result.steps.find((s) => s.step === 'research');
        assert.ok(researchStep);
        assert.equal(researchStep!.skipped, true);
        const writeStep = result.steps.find((s) => s.step === 'write_prose');
        assert.ok(writeStep);
        assert.equal(writeStep!.ok, true);
    });
});

// ---------------------------------------------------------------------------
// write_prose failure halts downstream steps
// ---------------------------------------------------------------------------

describe('runContentWorkflow — write_prose failure', () => {
    it('marks ok=false and all downstream steps as failed when callerFn absent', async () => {
        // No callerFn provided — write_prose will fail
        const result = await runContentWorkflow(
            { ...baseInput, preset: 'full_pipeline' },
            {} satisfies WorkflowDeps,
        );

        assert.equal(result.ok, false);
        const writeStep = result.steps.find((s) => s.step === 'write_prose');
        assert.ok(writeStep);
        assert.equal(writeStep!.ok, false);

        const downstream: string[] = ['seo_optimize', 'fact_check', 'review_prose', 'send_for_review'];
        for (const stepName of downstream) {
            const s = result.steps.find((s) => s.step === stepName);
            assert.ok(s, `${stepName} should appear in steps`);
            assert.equal(s!.ok, false, `${stepName} should be marked ok=false`);
            assert.equal(s!.skipped, false);
        }
        assert.ok(result.errorOutput && result.errorOutput.includes('write_prose'));
    });
});

// ---------------------------------------------------------------------------
// full_pipeline happy path
// ---------------------------------------------------------------------------

describe('runContentWorkflow — full_pipeline', () => {
    it('runs all steps and returns finalDraft, seoReport, factCheckReport, reviewId', async () => {
        const deps: WorkflowDeps = {
            callerFn: makeMockCaller('Full pipeline mock draft with factual claims.'),
            reviewFetchFn: makeMockReviewFetchFn(true),
        };
        const result = await runContentWorkflow(
            {
                ...baseInput,
                preset: 'full_pipeline',
                reviewerUrl: 'https://hooks.example.com/review',
                reviewerDisplayName: 'Editor',
                reviewChannel: 'webhook',
            },
            deps,
        );

        assert.equal(result.ok, true, `full_pipeline failed: ${result.errorOutput}`);
        assert.equal(result.preset, 'full_pipeline');
        assert.equal(result.steps.length, 6);
        assert.ok(result.finalDraft && result.finalDraft.length > 0);
        assert.ok(result.seoReport, 'seoReport should be present');
        assert.ok(result.factCheckReport, 'factCheckReport should be present');
        assert.ok(typeof result.reviewId === 'string', 'reviewId should be set');
        assert.ok(result.totalDurationMs >= 0);
    });

    it('all step results have required fields', async () => {
        const deps: WorkflowDeps = {
            callerFn: makeMockCaller(),
            reviewFetchFn: makeMockReviewFetchFn(true),
        };
        const result = await runContentWorkflow(
            {
                ...baseInput,
                preset: 'full_pipeline',
                reviewerUrl: 'https://hooks.example.com/review',
                reviewerDisplayName: 'Editor',
            },
            deps,
        );

        for (const step of result.steps) {
            assert.ok(typeof step.step === 'string', 'step.step should be a string');
            assert.ok(typeof step.ok === 'boolean', 'step.ok should be boolean');
            assert.ok(typeof step.skipped === 'boolean', 'step.skipped should be boolean');
            assert.ok(typeof step.durationMs === 'number', 'step.durationMs should be number');
            assert.ok(typeof step.output === 'string', 'step.output should be string');
        }
    });
});
