import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { computeRecruitingMetrics } from './recruiter-metrics.js';

describe('computeRecruitingMetrics', () => {
    it('builds a funnel with conversion rates and counts hires/active/rejected', () => {
        const m = computeRecruitingMetrics({
            asOfDate: '2026-08-26',
            jobTitle: 'Staff Engineer',
            candidates: [
                { stage: 'sourced', source: 'linkedin' },
                { stage: 'screened', source: 'linkedin' },
                { stage: 'interview', source: 'referral' },
                { stage: 'offer', source: 'referral' },
                { stage: 'hired', source: 'referral', hired: true },
                { stage: 'screened', source: 'inbound', rejected: true },
            ],
        });
        assert.equal(m.totalCandidates, 6);
        assert.equal(m.hires, 1);
        assert.equal(m.rejections, 1);
        // everyone reached 'sourced'; fewer reached later stages
        const sourced = m.funnel.find((f) => f.stage === 'sourced')!;
        const hired = m.funnel.find((f) => f.stage === 'hired')!;
        assert.equal(sourced.reached, 6);
        assert.equal(sourced.conversionFromPrevPct, null);
        assert.equal(hired.reached, 1);
        assert.ok((hired.conversionFromPrevPct ?? 0) > 0);
    });

    it('computes time-to-fill and days-open from dates', () => {
        const filled = computeRecruitingMetrics({
            asOfDate: '2026-08-26', openedDate: '2026-07-01', filledDate: '2026-08-01',
            candidates: [{ stage: 'hired', hired: true }],
        });
        assert.equal(filled.timeToFillDays, 31);
        assert.equal(filled.daysOpen, 31); // open→filled

        const stillOpen = computeRecruitingMetrics({
            asOfDate: '2026-08-26', openedDate: '2026-08-01',
            candidates: [{ stage: 'interview' }],
        });
        assert.equal(stillOpen.timeToFillDays, null);
        assert.equal(stillOpen.daysOpen, 25); // open→asOf
    });

    it('flags stale candidates by days in current stage', () => {
        const m = computeRecruitingMetrics({
            asOfDate: '2026-08-26', staleThresholdDays: 14,
            candidates: [
                { id: 'a', stage: 'interview', enteredStageDate: '2026-08-25' }, // 1d — fresh
                { id: 'b', stage: 'offer', enteredStageDate: '2026-08-01' },     // 25d — stale
            ],
        });
        assert.equal(m.aging.staleCount, 1);
        assert.equal(m.aging.stalest?.id, 'b');
        assert.equal(m.aging.maxDaysInStage, 25);
    });

    it('ranks source effectiveness by hires', () => {
        const m = computeRecruitingMetrics({
            asOfDate: '2026-08-26',
            candidates: [
                { stage: 'hired', source: 'referral', hired: true },
                { stage: 'screened', source: 'referral' },
                { stage: 'sourced', source: 'linkedin' },
            ],
        });
        assert.equal(m.sourceEffectiveness[0]?.source, 'referral');
        assert.equal(m.sourceEffectiveness[0]?.hires, 1);
        assert.equal(m.sourceEffectiveness[0]?.hireRatePct, 50);
    });
});
