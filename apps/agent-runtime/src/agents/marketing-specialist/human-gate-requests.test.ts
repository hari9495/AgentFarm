import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    isMarketingGateType, buildMarketingGateRecord, buildMarketingGateApprovalSummary,
    buildMarketingGateImpactScope, buildMarketingGateRiskReason,
} from './human-gate-requests.js';

describe('isMarketingGateType', () => {
    it('accepts all valid gate types', () => {
        for (const t of ['live_campaign_activation','budget_commitment','bulk_email_send','campaign_pause','ab_test_winner_apply','content_publish_external']) {
            assert.ok(isMarketingGateType(t), t + ' should be valid');
        }
    });
    it('rejects unknown gate types', () => {
        assert.equal(isMarketingGateType('delete_campaign'), false);
        assert.equal(isMarketingGateType(''), false);
    });
});

describe('buildMarketingGateRecord', () => {
    it('builds a live_campaign_activation gate', () => {
        const gate = buildMarketingGateRecord({ gateType: 'live_campaign_activation', campaignName: 'Q3 Launch' });
        assert.equal(gate.riskLevel, 'high');
        assert.ok(gate.question.includes('Q3 Launch'));
    });
    it('builds a budget_commitment gate with amount', () => {
        const gate = buildMarketingGateRecord({ gateType: 'budget_commitment', campaignName: 'Q3 PPC', budgetAmount: 25000, currency: 'USD' });
        assert.ok(gate.question.includes('25,000'));
        assert.equal(gate.riskLevel, 'high');
    });
    it('builds a bulk_email_send gate with recipient count', () => {
        const gate = buildMarketingGateRecord({ gateType: 'bulk_email_send', campaignName: 'June Newsletter', recipientCount: 15000 });
        assert.ok(gate.question.includes('15,000'));
        assert.equal(gate.category, 'audience_reach');
    });
    it('campaign_pause is medium risk', () => {
        const gate = buildMarketingGateRecord({ gateType: 'campaign_pause', campaignName: 'Summer Promo', detail: 'CTR dropped below threshold' });
        assert.equal(gate.riskLevel, 'medium');
        assert.ok(gate.question.includes('CTR dropped'));
    });
});

describe('buildMarketingGateApprovalSummary', () => {
    it('includes campaign name and action', () => {
        const summary = buildMarketingGateApprovalSummary(buildMarketingGateRecord({ gateType: 'live_campaign_activation', campaignName: 'Test Campaign' }));
        assert.ok(summary.includes('Test Campaign'));
        assert.ok(summary.includes('activate'));
    });
});

describe('buildMarketingGateImpactScope', () => {
    it('returns financial scope for budget gates', () => {
        assert.ok(buildMarketingGateImpactScope(buildMarketingGateRecord({ gateType: 'budget_commitment', campaignName: 'X', budgetAmount: 5000, currency: '$' })).includes('Financial'));
    });
    it('returns audience scope for bulk email', () => {
        assert.ok(buildMarketingGateImpactScope(buildMarketingGateRecord({ gateType: 'bulk_email_send', campaignName: 'Newsletter', recipientCount: 10000 })).includes('Audience'));
    });
});

describe('buildMarketingGateRiskReason', () => {
    it('provides a risk reason for each gate type', () => {
        for (const gateType of ['live_campaign_activation','budget_commitment','bulk_email_send','campaign_pause','ab_test_winner_apply','content_publish_external'] as const) {
            assert.ok(buildMarketingGateRiskReason(buildMarketingGateRecord({ gateType, campaignName: 'Test' })).length > 10);
        }
    });
});
