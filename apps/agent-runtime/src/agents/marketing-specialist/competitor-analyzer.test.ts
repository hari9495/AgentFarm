import { describe, it, expect, vi } from 'vitest';
import { analyzeCompetitors } from './competitor-analyzer.js';
import type { CompetitorFetchFn } from './competitor-analyzer.js';

function mockSemrushFetch(csvRows: string[]): CompetitorFetchFn {
    const csvBody = ['Keyword;Position;Traffic;Volume;Difficulty', ...csvRows].join('\n');
    return vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(csvBody),
    });
}

describe('analyzeCompetitors', () => {
    it('returns a valid report without API key', async () => {
        const report = await analyzeCompetitors({
            ownBrand: 'AgentFarm',
            ownDomain: 'agentfarm.io',
            competitors: [{ domain: 'competitor.com' }],
            targetKeywords: ['ai agents', 'workflow automation'],
        });
        expect(report.ok).toBe(true);
        expect(report.ownBrand).toBe('AgentFarm');
        expect(report.competitors.length).toBe(1);
        expect(report.swot.strengths.length).toBeGreaterThan(0);
        expect(report.swot.threats.length).toBeGreaterThan(0);
    });

    it('derives high-priority content gaps from target keywords', async () => {
        const fetch = mockSemrushFetch([
            'ai agents;1;5000;10000;45',
            'workflow automation;3;3000;8000;52',
        ]);
        const report = await analyzeCompetitors({
            ownBrand: 'AgentFarm',
            ownDomain: 'agentfarm.io',
            competitors: [{ domain: 'competitor.com' }],
            targetKeywords: ['ai agents', 'workflow automation'],
            semrushApiKey: 'test-key',
        }, fetch);
        const highGaps = report.contentGaps.filter((g) => g.priority === 'high');
        expect(highGaps.length).toBeGreaterThanOrEqual(1);
    });

    it('always includes comparison page gap', async () => {
        const report = await analyzeCompetitors({
            ownBrand: 'AgentFarm',
            ownDomain: 'agentfarm.io',
            competitors: [{ domain: 'rival.io' }],
        });
        const compGap = report.contentGaps.find((g) => g.topic.toLowerCase().includes('comparison'));
        expect(compGap).toBeDefined();
    });

    it('estimates share of voice for all brands', async () => {
        const report = await analyzeCompetitors({
            ownBrand: 'AgentFarm',
            ownDomain: 'agentfarm.io',
            competitors: [{ domain: 'rival.io' }, { domain: 'other.com' }],
        });
        expect(report.shareOfVoiceEstimate['AgentFarm']).toBeDefined();
        expect(report.shareOfVoiceEstimate['rival.io']).toBeDefined();
    });

    it('handles SEMrush API failure gracefully', async () => {
        const failFetch: CompetitorFetchFn = vi.fn().mockResolvedValue({ ok: false, status: 403, text: () => Promise.resolve('') });
        const report = await analyzeCompetitors({
            ownBrand: 'AgentFarm',
            ownDomain: 'agentfarm.io',
            competitors: [{ domain: 'rival.io' }],
            semrushApiKey: 'bad-key',
        }, failFetch);
        expect(report.ok).toBe(true);
        expect(report.competitors[0]!.estimatedOrganicTraffic).toBeNull();
    });
});
