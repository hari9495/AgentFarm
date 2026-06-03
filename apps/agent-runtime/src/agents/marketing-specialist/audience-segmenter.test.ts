import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
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
    it('returns all segments', () => { assert.equal(segmentAudience(input).segments.length, 4); });
    it('ranks enterprise buyers as champion', () => {
        const r = segmentAudience(input);
        assert.equal(r.segments[0]!.segmentId, 's1');
        assert.equal(r.segments[0]!.tier, 'champion');
    });
    it('assigns low_priority to one-time visitors', () => {
        const r = segmentAudience(input);
        const last = r.segments[r.segments.length - 1]!;
        assert.equal(last.segmentId, 's4');
        assert.equal(last.tier, 'low_priority');
    });
    it('budget allocation percentages sum to ~100', () => {
        const total = segmentAudience(input).segments.reduce((s, seg) => s + seg.budgetAllocationPct, 0);
        assert.ok(total >= 95 && total <= 105, 'sum was ' + total);
    });
    it('provides recommended messaging for each segment', () => {
        for (const seg of segmentAudience(input).segments) {
            assert.ok(seg.recommendedMessaging.length > 0);
            assert.ok(seg.recommendedChannels.length > 0);
        }
    });
    it('recommends linkedin for B2B champion segment', () => {
        const enterprise = segmentAudience(input).segments.find((s) => s.segmentId === 's1')!;
        assert.ok(enterprise.recommendedChannels.includes('linkedin_ads'));
    });
    it('handles empty segments', () => {
        const r = segmentAudience({ segments: [] });
        assert.equal(r.segments.length, 0);
        assert.equal(r.totalAudienceSize, 0);
    });
});
