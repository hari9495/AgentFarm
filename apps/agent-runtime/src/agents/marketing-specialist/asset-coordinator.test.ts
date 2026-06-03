import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildCreativeBrief } from './asset-coordinator.js';
import type { CreativeBriefInput } from './asset-coordinator.js';

const BASE_INPUT: CreativeBriefInput = {
    campaignName: 'Q3 2026 Lead Gen Campaign', brand: 'AgentFarm', goal: 'lead_generation',
    targetAudience: 'B2B startup founders',
    keyMessage: "Automate your team's work with AI agents that work like real employees.",
    cta: 'Start your free trial', deadline: '2026-07-01',
    assets: [
        { assetType: 'hero_banner' },
        { assetType: 'social_image', platform: 'LinkedIn', quantity: 3 },
        { assetType: 'email_header' },
    ],
    brandGuidelines: {
        primaryColor: '#1A1A2E', secondaryColor: '#16213E', fontFamily: 'Inter',
        doNotUse: ['Neon colors', 'Comic Sans'],
    },
    reviewerNames: ['Alice (Head of Design)', 'Bob (Marketing Director)'],
};

describe('buildCreativeBrief', () => {
    it('builds a brief with all deliverables', () => {
        assert.equal(buildCreativeBrief(BASE_INPUT).deliverables.length, 3);
    });
    it('uses default dimensions for asset types', () => {
        const heroBanner = buildCreativeBrief(BASE_INPUT).deliverables.find((d) => d.assetType === 'hero_banner')!;
        assert.ok(heroBanner.dimensions.includes('1920'));
    });
    it('respects custom dimensions when provided', () => {
        const custom = buildCreativeBrief({ ...BASE_INPUT, assets: [{ assetType: 'hero_banner', dimensions: '2560x1440px' }] });
        assert.equal(custom.deliverables[0]!.dimensions, '2560x1440px');
    });
    it('sets review deadline 3 days before final deadline', () => {
        const brief = buildCreativeBrief(BASE_INPUT);
        const diff = Math.round((new Date(BASE_INPUT.deadline).getTime() - new Date(brief.deliverables[0]!.reviewDeadline).getTime()) / 86400000);
        assert.equal(diff, 3);
    });
    it('includes brand colors in guidelines', () => {
        assert.ok(buildCreativeBrief(BASE_INPUT).brandGuidelines.includes('#1A1A2E'));
    });
    it('includes do-nots from brand guidelines', () => {
        const brief = buildCreativeBrief(BASE_INPUT);
        assert.ok(brief.doNots.some((d) => d.includes('Neon colors')));
        assert.ok(brief.doNots.some((d) => d.includes('competitor logos')));
    });
    it('lists reviewers in review process', () => {
        assert.ok(buildCreativeBrief(BASE_INPUT).reviewProcess.some((r) => r.includes('Alice')));
    });
    it('respects quantity for social images', () => {
        const socialImage = buildCreativeBrief(BASE_INPUT).deliverables.find((d) => d.assetType === 'social_image')!;
        assert.equal(socialImage.quantity, 3);
    });
});
