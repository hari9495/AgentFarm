import { describe, it, expect } from 'vitest';
import {
    isMarketingGateType,
    buildMarketingGateRecord,
    buildMarketingGateApprovalSummary,
    buildMarketingGateImpactScope,
    buildMarketingGateRiskReason,
} from './human-gate-requests.js';

describe('isMarketingGateType', () => {
    it('accepts all valid gate types', () => {
        const valid = ['live_campaign_activation', 'budget_commitment', 'bulk_email_send', 'campaign_pause', 'ab_test_winner_apply', 'content_publish_external'];
        for (const t of valid) {
            expect(isMarketingGateType(t)).toBe(true);
        }
    });
    it('rejects unknown gate types', () => {
        expect(isMarketingGateType('delete_campaign')).toBe(false);
        expect(isMarketingGateType('')).toBe(false);
    });
});

describe('buildMarketingGateRecord', () => {
    it('builds a live_campaign_activation gate', () => {
        const gate = buildMarketingGateRecord({
            gateType: 'live_campaign_activation',
            campaignName: 'Q3 Launch',
        });
        expect(gate.riskLevel).toBe('high');
        expect(gate.question).toContain('Q3 Launch');
    });

    it('builds a budget_commitment gate with amount', () => {
        const gate = buildMarketingGateRecord({
            gateType: 'budget_commitment',
            campaignName: 'Q3 PPC',
            budgetAmount: 25000,
            currency: 'USD',
        });
        expect(gate.question).toContain('25,000');
        expect(gate.riskLevel).toBe('high');
    });

    it('builds a bulk_email_send gate with recipient count', () => {
        const gate = buildMarketingGateRecord({
            gateType: 'bulk_email_send',
            campaignName: 'June Newsletter',
            recipientCount: 15000,
        });
        expect(gate.question).toContain('15,000');
        expect(gate.category).toBe('audience_reach');
    });

    it('campaign_pause is medium risk', () => {
        const gate = buildMarketingGateRecord({
            gateType: 'campaign_pause',
            campaignName: 'Summer Promo',
            detail: 'CTR dropped below threshold',
        });
        expect(gate.riskLevel).toBe('medium');
        expect(gate.question).toContain('CTR dropped');
    });
});

describe('buildMarketingGateApprovalSummary', () => {
    it('includes campaign name and action', () => {
        const gate = buildMarketingGateRecord({ gateType: 'live_campaign_activation', campaignName: 'Test Campaign' });
        const summary = buildMarketingGateApprovalSummary(gate);
        expect(summary).toContain('Test Campaign');
        expect(summary).toContain('activate');
    });
});

describe('buildMarketingGateImpactScope', () => {
    it('returns financial scope for budget gates', () => {
        const gate = buildMarketingGateRecord({ gateType: 'budget_commitment', campaignName: 'X', budgetAmount: 5000, currency: '$' });
        const scope = buildMarketingGateImpactScope(gate);
        expect(scope).toContain('Financial');
    });

    it('returns audience scope for bulk email', () => {
        const gate = buildMarketingGateRecord({ gateType: 'bulk_email_send', campaignName: 'Newsletter', recipientCount: 10000 });
        const scope = buildMarketingGateImpactScope(gate);
        expect(scope).toContain('Audience');
    });
});

describe('buildMarketingGateRiskReason', () => {
    it('provides a risk reason for each gate type', () => {
        const types = ['live_campaign_activation', 'budget_commitment', 'bulk_email_send', 'campaign_pause', 'ab_test_winner_apply', 'content_publish_external'] as const;
        for (const gateType of types) {
            const gate = buildMarketingGateRecord({ gateType, campaignName: 'Test' });
            const reason = buildMarketingGateRiskReason(gate);
            expect(reason.length).toBeGreaterThan(10);
        }
    });
});
