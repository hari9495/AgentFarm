import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildEmailSequence } from './email-automation-builder.js';
import type { EmailSequenceSpec } from './email-automation-builder.js';

const BASE_SPEC: EmailSequenceSpec = {
    sequenceType: 'lead_nurture', product: 'AgentFarm', audience: 'B2B startup founders',
    goal: 'automate internal workflows', keyBenefit: '10x team productivity',
};

describe('buildEmailSequence', () => {
    it('builds a lead nurture sequence with correct step count', async () => {
        const seq = await buildEmailSequence(BASE_SPEC);
        assert.ok(seq.numEmails > 0);
        assert.equal(seq.steps.length, seq.numEmails);
    });
    it('respects numEmails limit', async () => {
        assert.equal((await buildEmailSequence({ ...BASE_SPEC, numEmails: 2 })).steps.length, 2);
    });
    it('fills product/audience into subject lines', async () => {
        const seq = await buildEmailSequence(BASE_SPEC);
        assert.ok(seq.steps.some((s) => s.subject.includes('AgentFarm') || s.bodyOutline.includes('AgentFarm')));
    });
    it('generates all 4 sequence types', async () => {
        for (const type of ['welcome', 'trial_onboarding', 're_engagement', 'post_purchase'] as const) {
            const seq = await buildEmailSequence({ ...BASE_SPEC, sequenceType: type });
            assert.ok(seq.steps.length > 0);
            assert.equal(seq.sequenceType, type);
        }
    });
    it('uses LLM caller when provided', async () => {
        let callerCalled = 0;
        const callerFn = async (..._args: unknown[]) => { callerCalled++; return 'LLM-generated body content for the email.'; };
        const seq = await buildEmailSequence(BASE_SPEC, callerFn);
        assert.ok(callerCalled > 0, 'callerFn must have been called');
        assert.ok(seq.steps.some((s) => s.bodyOutline.includes('LLM-generated')));
    });
    it('falls back to outline when LLM fails', async () => {
        const callerFn = async (..._args: unknown[]) => { throw new Error('LLM unavailable'); };
        const seq = await buildEmailSequence(BASE_SPEC, callerFn);
        assert.ok(seq.steps.length > 0);
    });
    it('includes platform config for HubSpot and Mailchimp', async () => {
        const seq = await buildEmailSequence(BASE_SPEC);
        assert.ok(seq.platformConfig.hubspot.workflowType);
        assert.ok(seq.platformConfig.mailchimp.automationType);
    });
    it('includes trigger conditions for each step', async () => {
        for (const step of (await buildEmailSequence(BASE_SPEC)).steps) {
            assert.ok(step.triggerCondition.length > 0);
        }
    });
});
