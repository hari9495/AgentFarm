import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeCompetitors } from './competitor-analyzer.js';
import type { CompetitorFetchFn } from './competitor-analyzer.js';

function mockSemrushFetch(csvRows: string[]): CompetitorFetchFn {
    const csvBody = ['Keyword;Position;Traffic;Volume;Difficulty', ...csvRows].join('\n');
    return async () => ({ ok: true, status: 200, text: () => Promise.resolve(csvBody) } as Response & { text: () => Promise<string> });
}

describe('analyzeCompetitors', () => {
    it('returns a valid report without API key', async () => {
        const report = await analyzeCompetitors({ ownBrand: 'AgentFarm', ownDomain: 'agentfarm.io', competitors: [{ domain: 'competitor.com' }], targetKeywords: ['ai agents', 'workflow automation'] });
        assert.equal(report.ok, true);
        assert.equal(report.ownBrand, 'AgentFarm');
        assert.equal(report.competitors.length, 1);
        assert.ok(report.swot.strengths.length > 0);
        assert.ok(report.swot.threats.length > 0);
    });
    it('derives high-priority content gaps from target keywords', async () => {
        const fetch = mockSemrushFetch(['ai agents;1;5000;10000;45', 'workflow automation;3;3000;8000;52']);
        const report = await analyzeCompetitors({ ownBrand: 'AgentFarm', ownDomain: 'agentfarm.io', competitors: [{ domain: 'competitor.com' }], targetKeywords: ['ai agents', 'workflow automation'], semrushApiKey: 'test-key' }, fetch);
        assert.ok(report.contentGaps.filter((g) => g.priority === 'high').length >= 1);
    });
    it('always includes comparison page gap', async () => {
        const report = await analyzeCompetitors({ ownBrand: 'AgentFarm', ownDomain: 'agentfarm.io', competitors: [{ domain: 'rival.io' }] });
        assert.ok(report.contentGaps.find((g) => g.topic.toLowerCase().includes('comparison')));
    });
    it('estimates share of voice for all brands', async () => {
        const report = await analyzeCompetitors({ ownBrand: 'AgentFarm', ownDomain: 'agentfarm.io', competitors: [{ domain: 'rival.io' }, { domain: 'other.com' }] });
        assert.ok(report.shareOfVoiceEstimate['AgentFarm'] !== undefined);
        assert.ok(report.shareOfVoiceEstimate['rival.io'] !== undefined);
    });
    it('handles SEMrush API failure gracefully', async () => {
        const failFetch: CompetitorFetchFn = async () => ({ ok: false, status: 403, text: () => Promise.resolve('') } as Response & { text: () => Promise<string> });
        const report = await analyzeCompetitors({ ownBrand: 'AgentFarm', ownDomain: 'agentfarm.io', competitors: [{ domain: 'rival.io' }], semrushApiKey: 'bad-key' }, failFetch);
        assert.equal(report.ok, true);
        assert.equal(report.competitors[0]!.estimatedOrganicTraffic, null);
    });
});
