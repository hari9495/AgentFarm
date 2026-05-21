import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    scoreActionConfidence,
    NEVER_AUTO_APPROVE,
    AUTO_APPROVE_CONFIDENCE_THRESHOLD,
} from './confidence-scorer.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('scoreActionConfidence', () => {
    // ── NEVER_AUTO_APPROVE ──────────────────────────────────────────────────

    it('never auto-approves merge_pr regardless of confidence', () => {
        const result = scoreActionConfidence({
            actionType: 'merge_pr',
            riskLevel: 'low',
            confidence: 0.99,
            hasEpisodicContext: true,
        });
        assert.equal(result.autoApprove, false);
        assert.ok(result.reason.includes('never-auto-approve'));
    });

    it('never auto-approves deploy_production', () => {
        const result = scoreActionConfidence({
            actionType: 'deploy_production',
            riskLevel: 'medium',
            confidence: 1.0,
            hasEpisodicContext: true,
        });
        assert.equal(result.autoApprove, false);
    });

    it('never auto-approves delete_resource', () => {
        const result = scoreActionConfidence({
            actionType: 'delete_resource',
            riskLevel: 'low',
            confidence: 1.0,
            hasEpisodicContext: true,
        });
        assert.equal(result.autoApprove, false);
    });

    // ── HIGH risk ───────────────────────────────────────────────────────────

    it('never auto-approves high-risk actions', () => {
        const result = scoreActionConfidence({
            actionType: 'create_issue',
            riskLevel: 'high',
            confidence: 0.99,
            hasEpisodicContext: true,
        });
        assert.equal(result.autoApprove, false);
        assert.ok(result.reason.includes('High-risk'));
    });

    // ── LOW risk ────────────────────────────────────────────────────────────

    it('auto-approves low-risk action when confidence meets threshold', () => {
        const result = scoreActionConfidence({
            actionType: 'run_tests',
            riskLevel: 'low',
            confidence: 0.90,
            hasEpisodicContext: false,
        });
        assert.equal(result.autoApprove, true);
        assert.ok(result.reason.includes('auto-approved'));
    });

    it('does not auto-approve low-risk action when confidence is below threshold', () => {
        const result = scoreActionConfidence({
            actionType: 'run_tests',
            riskLevel: 'low',
            confidence: 0.70,
            hasEpisodicContext: false,
        });
        assert.equal(result.autoApprove, false);
        assert.ok(result.reason.includes('below threshold'));
    });

    it('auto-approves at exactly the threshold', () => {
        const result = scoreActionConfidence({
            actionType: 'workspace_grep',
            riskLevel: 'low',
            confidence: AUTO_APPROVE_CONFIDENCE_THRESHOLD,
            hasEpisodicContext: false,
        });
        assert.equal(result.autoApprove, true);
    });

    // ── MEDIUM risk ─────────────────────────────────────────────────────────

    it('auto-approves medium-risk safe action with high confidence + episodic context', () => {
        const result = scoreActionConfidence({
            actionType: 'create_issue',
            riskLevel: 'medium',
            confidence: 0.82,       // below threshold, but + 0.05 episodic boost = 0.87 ≥ 0.85
            hasEpisodicContext: true,
        });
        assert.equal(result.autoApprove, true);
        assert.ok(result.reason.includes('episodic context'));
    });

    it('does not auto-approve medium-risk safe action without episodic context if confidence too low', () => {
        const result = scoreActionConfidence({
            actionType: 'create_issue',
            riskLevel: 'medium',
            confidence: 0.82,       // without boost: 0.82 < 0.85
            hasEpisodicContext: false,
        });
        assert.equal(result.autoApprove, false);
    });

    it('auto-approves medium-risk safe action with sufficient confidence without episodic context', () => {
        const result = scoreActionConfidence({
            actionType: 'comment_issue',
            riskLevel: 'medium',
            confidence: 0.90,
            hasEpisodicContext: false,
        });
        assert.equal(result.autoApprove, true);
    });

    it('does not auto-approve medium-risk action not in safe list', () => {
        const result = scoreActionConfidence({
            actionType: 'code_edit_patch',
            riskLevel: 'medium',
            confidence: 0.99,
            hasEpisodicContext: true,
        });
        assert.equal(result.autoApprove, false);
        assert.ok(result.reason.includes('safe-for-auto-approve'));
    });

    // ── Effective score ─────────────────────────────────────────────────────

    it('caps effective score at 1.0', () => {
        const result = scoreActionConfidence({
            actionType: 'run_tests',
            riskLevel: 'medium',
            confidence: 0.98,
            hasEpisodicContext: true,
        });
        assert.ok(result.effectiveScore <= 1.0);
    });

    // ── NEVER_AUTO_APPROVE export ───────────────────────────────────────────

    it('NEVER_AUTO_APPROVE includes key destructive actions', () => {
        assert.ok(NEVER_AUTO_APPROVE.has('merge_pr'));
        assert.ok(NEVER_AUTO_APPROVE.has('deploy_production'));
        assert.ok(NEVER_AUTO_APPROVE.has('delete_resource'));
        assert.ok(NEVER_AUTO_APPROVE.has('change_permissions'));
        assert.ok(NEVER_AUTO_APPROVE.has('git_push'));
    });
});
