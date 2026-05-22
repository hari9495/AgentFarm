import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    isContentWriterGateType,
    buildHumanGateRecord,
    buildHumanGateApprovalSummary,
    buildHumanGateImpactScope,
    buildHumanGateRiskReason,
    buildHumanGateTaskPayload,
    GATE_RISK_LEVELS,
    GATE_CATEGORIES,
    type HumanGateInput,
} from './human-gate-requests.js';

// ---------------------------------------------------------------------------
// isContentWriterGateType
// ---------------------------------------------------------------------------

test('isContentWriterGateType — accepts all 8 valid types', () => {
    const valid = [
        'competitive_analysis', 'ab_variant', 'audience_persona',
        'style_guide', 'distribution_plan', 'legal_review',
        'evergreen_update', 'ai_disclosure',
    ];
    for (const t of valid) {
        assert.equal(isContentWriterGateType(t), true, `Expected ${t} to be valid`);
    }
});

test('isContentWriterGateType — rejects unknown strings', () => {
    assert.equal(isContentWriterGateType('unknown_gate'), false);
    assert.equal(isContentWriterGateType(''), false);
    assert.equal(isContentWriterGateType('workspace_cw_request_human_gate'), false);
});

// ---------------------------------------------------------------------------
// GATE_RISK_LEVELS
// ---------------------------------------------------------------------------

test('GATE_RISK_LEVELS — compliance gates are high', () => {
    assert.equal(GATE_RISK_LEVELS.legal_review, 'high');
    assert.equal(GATE_RISK_LEVELS.ai_disclosure, 'high');
});

test('GATE_RISK_LEVELS — strategy/quality gates are medium', () => {
    assert.equal(GATE_RISK_LEVELS.competitive_analysis, 'medium');
    assert.equal(GATE_RISK_LEVELS.ab_variant, 'medium');
    assert.equal(GATE_RISK_LEVELS.audience_persona, 'medium');
    assert.equal(GATE_RISK_LEVELS.style_guide, 'medium');
    assert.equal(GATE_RISK_LEVELS.distribution_plan, 'medium');
    assert.equal(GATE_RISK_LEVELS.evergreen_update, 'medium');
});

// ---------------------------------------------------------------------------
// GATE_CATEGORIES
// ---------------------------------------------------------------------------

test('GATE_CATEGORIES — compliance gates categorized correctly', () => {
    assert.equal(GATE_CATEGORIES.legal_review, 'compliance');
    assert.equal(GATE_CATEGORIES.ai_disclosure, 'compliance');
});

test('GATE_CATEGORIES — strategy gates categorized correctly', () => {
    assert.equal(GATE_CATEGORIES.competitive_analysis, 'strategy');
    assert.equal(GATE_CATEGORIES.ab_variant, 'strategy');
    assert.equal(GATE_CATEGORIES.distribution_plan, 'strategy');
});

test('GATE_CATEGORIES — quality gates categorized correctly', () => {
    assert.equal(GATE_CATEGORIES.audience_persona, 'quality');
    assert.equal(GATE_CATEGORIES.style_guide, 'quality');
    assert.equal(GATE_CATEGORIES.evergreen_update, 'quality');
});

// ---------------------------------------------------------------------------
// buildHumanGateRecord
// ---------------------------------------------------------------------------

test('buildHumanGateRecord — returns correct gateType, label, category, riskLevel', () => {
    const record = buildHumanGateRecord({
        gateType: 'legal_review',
        title: 'Privacy Policy Update',
        topic: 'GDPR compliance',
    });
    assert.equal(record.gateType, 'legal_review');
    assert.equal(record.category, 'compliance');
    assert.equal(record.riskLevel, 'high');
    assert.ok(record.label.length > 0);
    assert.ok(record.question.length > 0);
});

test('buildHumanGateRecord — sanitizes title: strips <>"\'` and truncates at 80', () => {
    const dirty = '<script>alert("xss")</script>'.repeat(5); // >80 chars with injection
    const record = buildHumanGateRecord({
        gateType: 'style_guide',
        title: dirty,
        topic: 'test',
    });
    assert.ok(!record.safeTitle.includes('<'), 'No < in safeTitle');
    assert.ok(!record.safeTitle.includes('>'), 'No > in safeTitle');
    assert.ok(!record.safeTitle.includes('"'), 'No " in safeTitle');
    assert.ok(!record.safeTitle.includes("'"), 'No \' in safeTitle');
    assert.ok(!record.safeTitle.includes('`'), 'No ` in safeTitle');
    assert.ok(record.safeTitle.length <= 80, 'safeTitle max 80 chars');
});

test('buildHumanGateRecord — sanitizes topic', () => {
    const record = buildHumanGateRecord({
        gateType: 'ab_variant',
        title: 'Normal Title',
        topic: 'Topic with <injection> attempt',
    });
    assert.ok(!record.safeTopic.includes('<'));
    assert.ok(!record.safeTopic.includes('>'));
});

test('buildHumanGateRecord — optional wordCount and publishTarget', () => {
    const withExtras = buildHumanGateRecord({
        gateType: 'distribution_plan',
        title: 'Blog Post',
        topic: 'Marketing',
        wordCount: 1200,
        publishTarget: 'Company Blog',
    });
    assert.equal(withExtras.wordCount, 1200);
    assert.equal(withExtras.publishTarget, 'Company Blog');

    const withoutExtras = buildHumanGateRecord({
        gateType: 'distribution_plan',
        title: 'Blog Post',
        topic: 'Marketing',
    });
    assert.equal(withoutExtras.wordCount, null);
    assert.equal(withoutExtras.publishTarget, null);
});

// ---------------------------------------------------------------------------
// buildHumanGateApprovalSummary
// ---------------------------------------------------------------------------

test('buildHumanGateApprovalSummary — format is [Label] "title" — question', () => {
    const record = buildHumanGateRecord({
        gateType: 'ai_disclosure',
        title: 'AI Article',
        topic: 'Artificial Intelligence',
    });
    const summary = buildHumanGateApprovalSummary(record);
    assert.ok(summary.startsWith('['), 'Starts with [');
    assert.match(summary, /^\[.+\] ".+" — .+$/);
    assert.ok(summary.includes('AI Article'));
    assert.ok(summary.includes(record.label));
    assert.ok(summary.includes(record.question));
});

test('buildHumanGateApprovalSummary — no raw HTML in output', () => {
    const record = buildHumanGateRecord({
        gateType: 'legal_review',
        title: '<b>Injected</b>',
        topic: 'Legal',
    });
    const summary = buildHumanGateApprovalSummary(record);
    assert.ok(!summary.includes('<b>'), 'No HTML tags in summary');
    assert.ok(!summary.includes('</b>'), 'No HTML tags in summary');
});

// ---------------------------------------------------------------------------
// buildHumanGateImpactScope
// ---------------------------------------------------------------------------

test('buildHumanGateImpactScope — minimal (title only)', () => {
    const record = buildHumanGateRecord({
        gateType: 'evergreen_update',
        title: 'Old Article',
        topic: 'History',
    });
    const scope = buildHumanGateImpactScope(record);
    assert.ok(scope.startsWith('Content:'));
    assert.ok(scope.includes('Old Article'));
    assert.ok(!scope.includes('Target:'));
    assert.ok(!scope.includes('Words:'));
});

test('buildHumanGateImpactScope — all fields present', () => {
    const record = buildHumanGateRecord({
        gateType: 'distribution_plan',
        title: 'Campaign Post',
        topic: 'Marketing',
        wordCount: 800,
        publishTarget: 'LinkedIn',
    });
    const scope = buildHumanGateImpactScope(record);
    assert.ok(scope.includes('Campaign Post'));
    assert.ok(scope.includes('Target: LinkedIn'));
    assert.ok(scope.includes('Words: 800'));
});

// ---------------------------------------------------------------------------
// buildHumanGateRiskReason
// ---------------------------------------------------------------------------

test('buildHumanGateRiskReason — includes category and label', () => {
    const record = buildHumanGateRecord({
        gateType: 'legal_review',
        title: 'Policy Doc',
        topic: 'Privacy',
    });
    const reason = buildHumanGateRiskReason(record);
    assert.ok(reason.toLowerCase().includes('compliance'), 'Includes category');
    assert.ok(reason.includes(record.label), 'Includes label');
});

// ---------------------------------------------------------------------------
// buildHumanGateTaskPayload
// ---------------------------------------------------------------------------

test('buildHumanGateTaskPayload — has required approval packet fields', () => {
    const payload = buildHumanGateTaskPayload({
        gateType: 'legal_review',
        title: 'Terms of Service',
        topic: 'Legal',
    });

    assert.equal(payload['action_type'], 'workspace_cw_request_human_gate');
    assert.ok(typeof payload['summary'] === 'string' && (payload['summary'] as string).length > 0, 'summary present');
    assert.ok(typeof payload['target'] === 'string' && (payload['target'] as string).length > 0, 'target present');
    assert.ok(typeof payload['rollback_plan'] === 'string', 'rollback_plan present');
    assert.equal(payload['gateType'], 'legal_review');
});

test('buildHumanGateTaskPayload — summary embeds Gate type and Gate category lines', () => {
    const payload = buildHumanGateTaskPayload({
        gateType: 'ai_disclosure',
        title: 'AI Blog Post',
        topic: 'Technology',
    });

    const summary = payload['summary'] as string;
    assert.ok(summary.includes('Gate type: ai_disclosure'), 'Gate type line present');
    assert.ok(summary.includes('Gate category: compliance'), 'Gate category line present');
});

test('buildHumanGateTaskPayload — summary embeds Gate category: strategy for strategy gates', () => {
    const payload = buildHumanGateTaskPayload({
        gateType: 'competitive_analysis',
        title: 'Market Report',
        topic: 'Competition',
    });
    const summary = payload['summary'] as string;
    assert.ok(summary.includes('Gate category: strategy'));
});

test('buildHumanGateTaskPayload — optional fields only present when provided', () => {
    const withoutOptional = buildHumanGateTaskPayload({
        gateType: 'style_guide',
        title: 'Brand Article',
        topic: 'Branding',
    });
    assert.equal(withoutOptional['wordCount'], undefined);
    assert.equal(withoutOptional['publishTarget'], undefined);

    const withOptional = buildHumanGateTaskPayload({
        gateType: 'style_guide',
        title: 'Brand Article',
        topic: 'Branding',
        wordCount: 500,
        publishTarget: 'Website',
    });
    assert.equal(withOptional['wordCount'], 500);
    assert.equal(withOptional['publishTarget'], 'Website');
});

test('buildHumanGateTaskPayload — rollback_plan is the content gate message', () => {
    const payload = buildHumanGateTaskPayload({
        gateType: 'ai_disclosure',
        title: 'Test',
        topic: 'Test',
    });
    assert.equal(
        payload['rollback_plan'],
        'Content gate — no rollback needed; reject to prevent publication.',
    );
});
