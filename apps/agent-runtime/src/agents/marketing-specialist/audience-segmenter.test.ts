import { describe, it, expect } from 'vitest';
import { segmentAudience } from './audience-segmenter.js';
import type { AudienceSegmentInput } from './audience-segmenter.js';

const input: AudienceSegmentInput = {
    segments: [
        { segmentId: 's1', label: 'Enterprise Buyers', size: 500, conversions: 100, revenue: 50000, avgSessionDuration: 240, bounceRate: 0.2, demographics: { industry: 'SaaS', jobTitle: 'CTO' } },
        { segmentId: 's2', label: 'SMB Prospects', size: 2000, conversions: 80, revenue: 16000, avgSessionDuration: 120, bounceRate: 0.4 },
        { segmentId: 's3', label: 'Free Trial Users', size: 5000, conversions: 50, revenue: 5000, bounceRate: 0.6 },
        { segmentId: 's4', label: 'One-time Visitors', size: 20000, conversions: 5, bounceRate: 0.85 },
    ],
};

describe('segmentAudience', () => {
    it('returns all segments', () => {
        const result = segmentAudience(input);
        expect(result.segments.length).toBe(4);
    });

    it('ranks enterprise buyers as champion', () => {
        const result = segmentAudience(input);
        expect(result.segments[0]!.segmentId).toBe('s1');
        expect(result.segments[0]!.tier).toBe('champion');
    });

    it('assigns low_priority to one-time visitors', () => {
        const result = segmentAudience(input);
        const lastSeg = result.segments[result.segments.length - 1]!;
        expect(lastSeg.segmentId).toBe('s4');
        expect(lastSeg.tier).toBe('low_priority');
    });

    it('budget allocation percentages sum to ~100', () => {
        const result = segmentAudience(input);
        const total = result.segments.reduce((s, seg) => s + seg.budgetAllocationPct, 0);
        expect(total).toBeGreaterThanOrEqual(95);
        expect(total).toBeLessThanOrEqual(105);
    });

    it('provides recommended messaging for each segment', () => {
        const result = segmentAudience(input);
        for (const seg of result.segments) {
            expect(seg.recommendedMessaging.length).toBeGreaterThan(0);
            expect(seg.recommendedChannels.length).toBeGreaterThan(0);
        }
    });

    it('recommends linkedin for B2B champion segment', () => {
        const result = segmentAudience(input);
        const enterprise = result.segments.find((s) => s.segmentId === 's1')!;
        expect(enterprise.recommendedChannels).toContain('linkedin_ads');
    });

    it('handles empty segments', () => {
        const result = segmentAudience({ segments: [] });
        expect(result.segments.length).toBe(0);
        expect(result.totalAudienceSize).toBe(0);
    });
});
