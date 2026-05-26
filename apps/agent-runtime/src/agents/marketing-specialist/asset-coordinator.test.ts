import { describe, it, expect } from 'vitest';
import { buildCreativeBrief } from './asset-coordinator.js';
import type { CreativeBriefInput } from './asset-coordinator.js';

const BASE_INPUT: CreativeBriefInput = {
    campaignName: 'Q3 2026 Lead Gen Campaign',
    brand: 'AgentFarm',
    goal: 'lead_generation',
    targetAudience: 'B2B startup founders',
    keyMessage: 'Automate your team\'s work with AI agents that work like real employees.',
    cta: 'Start your free trial',
    deadline: '2026-07-01',
    assets: [
        { assetType: 'hero_banner' },
        { assetType: 'social_image', platform: 'LinkedIn', quantity: 3 },
        { assetType: 'email_header' },
    ],
    brandGuidelines: {
        primaryColor: '#1A1A2E',
        secondaryColor: '#16213E',
        fontFamily: 'Inter',
        doNotUse: ['Neon colors', 'Comic Sans'],
    },
    reviewerNames: ['Alice (Head of Design)', 'Bob (Marketing Director)'],
};

describe('buildCreativeBrief', () => {
    it('builds a brief with all deliverables', () => {
        const brief = buildCreativeBrief(BASE_INPUT);
        expect(brief.deliverables.length).toBe(3);
    });

    it('uses default dimensions for asset types', () => {
        const brief = buildCreativeBrief(BASE_INPUT);
        const heroBanner = brief.deliverables.find((d) => d.assetType === 'hero_banner')!;
        expect(heroBanner.dimensions).toContain('1920');
    });

    it('respects custom dimensions when provided', () => {
        const custom = buildCreativeBrief({
            ...BASE_INPUT,
            assets: [{ assetType: 'hero_banner', dimensions: '2560×1440px' }],
        });
        expect(custom.deliverables[0]!.dimensions).toBe('2560×1440px');
    });

    it('sets review deadline 3 days before final deadline', () => {
        const brief = buildCreativeBrief(BASE_INPUT);
        const reviewDate = new Date(brief.deliverables[0]!.reviewDeadline);
        const finalDate = new Date(BASE_INPUT.deadline);
        const diff = Math.round((finalDate.getTime() - reviewDate.getTime()) / (1000 * 60 * 60 * 24));
        expect(diff).toBe(3);
    });

    it('includes brand colors in guidelines', () => {
        const brief = buildCreativeBrief(BASE_INPUT);
        expect(brief.brandGuidelines).toContain('#1A1A2E');
    });

    it('includes do-nots from brand guidelines', () => {
        const brief = buildCreativeBrief(BASE_INPUT);
        expect(brief.doNots.some((d) => d.includes('Neon colors'))).toBe(true);
        expect(brief.doNots.some((d) => d.includes('competitor logos'))).toBe(true);
    });

    it('lists reviewers in review process', () => {
        const brief = buildCreativeBrief(BASE_INPUT);
        expect(brief.reviewProcess.some((r) => r.includes('Alice'))).toBe(true);
    });

    it('respects quantity for social images', () => {
        const brief = buildCreativeBrief(BASE_INPUT);
        const socialImage = brief.deliverables.find((d) => d.assetType === 'social_image')!;
        expect(socialImage.quantity).toBe(3);
    });
});
