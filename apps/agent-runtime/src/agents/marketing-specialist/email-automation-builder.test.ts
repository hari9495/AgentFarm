import { describe, it, expect, vi } from 'vitest';
import { buildEmailSequence } from './email-automation-builder.js';
import type { EmailSequenceSpec } from './email-automation-builder.js';

const BASE_SPEC: EmailSequenceSpec = {
    sequenceType: 'lead_nurture',
    product: 'AgentFarm',
    audience: 'B2B startup founders',
    goal: 'automate internal workflows',
    keyBenefit: '10x team productivity',
};

describe('buildEmailSequence', () => {
    it('builds a lead nurture sequence with correct step count', async () => {
        const seq = await buildEmailSequence(BASE_SPEC);
        expect(seq.numEmails).toBeGreaterThan(0);
        expect(seq.steps.length).toBe(seq.numEmails);
    });

    it('respects numEmails limit', async () => {
        const seq = await buildEmailSequence({ ...BASE_SPEC, numEmails: 2 });
        expect(seq.steps.length).toBe(2);
    });

    it('fills product/audience into subject lines', async () => {
        const seq = await buildEmailSequence(BASE_SPEC);
        const hasProduct = seq.steps.some((s) => s.subject.includes('AgentFarm') || s.bodyOutline.includes('AgentFarm'));
        expect(hasProduct).toBe(true);
    });

    it('generates all 4 sequence types', async () => {
        for (const type of ['welcome', 'trial_onboarding', 're_engagement', 'post_purchase'] as const) {
            const seq = await buildEmailSequence({ ...BASE_SPEC, sequenceType: type });
            expect(seq.steps.length).toBeGreaterThan(0);
            expect(seq.sequenceType).toBe(type);
        }
    });

    it('uses LLM caller when provided', async () => {
        const callerFn = vi.fn().mockResolvedValue('LLM-generated body content for the email.');
        const seq = await buildEmailSequence(BASE_SPEC, callerFn);
        expect(callerFn).toHaveBeenCalled();
        const hasLlmContent = seq.steps.some((s) => s.bodyOutline.includes('LLM-generated'));
        expect(hasLlmContent).toBe(true);
    });

    it('falls back to outline when LLM fails', async () => {
        const callerFn = vi.fn().mockRejectedValue(new Error('LLM unavailable'));
        const seq = await buildEmailSequence(BASE_SPEC, callerFn);
        expect(seq.steps.length).toBeGreaterThan(0);
    });

    it('includes platform config for HubSpot and Mailchimp', async () => {
        const seq = await buildEmailSequence(BASE_SPEC);
        expect(seq.platformConfig.hubspot.workflowType).toBeDefined();
        expect(seq.platformConfig.mailchimp.automationType).toBeDefined();
    });

    it('includes trigger conditions for each step', async () => {
        const seq = await buildEmailSequence(BASE_SPEC);
        for (const step of seq.steps) {
            expect(step.triggerCondition.length).toBeGreaterThan(0);
        }
    });
});
