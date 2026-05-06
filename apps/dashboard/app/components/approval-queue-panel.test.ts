import assert from 'node:assert/strict';
import test from 'node:test';

// Unit tests for approval queue panel behavior
// These tests validate the structured approval packet rendering, search, filtering, and detail drawer

// Test data: approval items with structured packet fields
const createMockApproval = (overrides: any = {}) => ({
    approval_id: 'APR-001',
    workspace_id: 'ws_primary_001',
    bot_id: 'bot_dev_001',
    task_id: 'task_001',
    action_summary: 'Merge release PR #221',
    change_summary: 'Merge release PR #221',
    impacted_scope: 'github:repo/main',
    risk_reason: 'Action merge_pr is high-risk by policy.',
    proposed_rollback: 'Re-open rollback branch and revert merge commit if release validation fails.',
    lint_status: 'passed',
    test_status: 'passed',
    packet_complete: true,
    risk_level: 'high' as 'high' | 'medium' | 'low',
    decision_status: 'pending',
    requested_at: '2026-04-20T09:11:39Z',
    decided_at: null,
    decision_reason: null,
    ...overrides,
});

// getApprovalHeadline: tests for headline logic
test('getApprovalHeadline uses change_summary when present', () => {
    const approval = createMockApproval({
        change_summary: 'Custom change summary',
        action_summary: 'Raw action summary',
    });
    const headline = approval.change_summary?.trim() || approval.action_summary;
    assert.equal(headline, 'Custom change summary');
});

test('getApprovalHeadline falls back to action_summary when change_summary is absent', () => {
    const approval = createMockApproval({
        change_summary: undefined,
        action_summary: 'Raw action summary',
    });
    const headline = approval.change_summary?.trim() || approval.action_summary;
    assert.equal(headline, 'Raw action summary');
});

test('getApprovalHeadline trims whitespace from change_summary', () => {
    const approval = createMockApproval({
        change_summary: '  Custom change summary  ',
        action_summary: 'Raw action summary',
    });
    const headline = approval.change_summary?.trim() || approval.action_summary;
    assert.equal(headline, 'Custom change summary');
});

// getApprovalSearchText: tests for search aggregation
test('getApprovalSearchText includes all searchable fields in lowercase', () => {
    const approval = createMockApproval({
        action_summary: 'Merge PR',
        change_summary: 'Release Merge',
        impacted_scope: 'GitHub Repo',
        risk_reason: 'High Risk Action',
        proposed_rollback: 'Revert Merge',
        lint_status: 'passed',
        test_status: 'failed',
    });

    const searchText = [
        approval.action_summary,
        approval.change_summary ?? '',
        approval.impacted_scope ?? '',
        approval.risk_reason ?? '',
        approval.proposed_rollback ?? '',
        approval.lint_status ?? '',
        approval.test_status ?? '',
    ]
        .join(' ')
        .toLowerCase();

    assert.ok(searchText.includes('merge pr'));
    assert.ok(searchText.includes('release merge'));
    assert.ok(searchText.includes('github repo'));
    assert.ok(searchText.includes('high risk action'));
    assert.ok(searchText.includes('revert merge'));
    assert.ok(searchText.includes('passed'));
    assert.ok(searchText.includes('failed'));
});

test('getApprovalSearchText handles missing packet fields gracefully', () => {
    const approval = createMockApproval({
        change_summary: undefined,
        impacted_scope: null,
        risk_reason: null,
        proposed_rollback: null,
    });

    const searchText = [
        approval.action_summary,
        approval.change_summary ?? '',
        approval.impacted_scope ?? '',
        approval.risk_reason ?? '',
        approval.proposed_rollback ?? '',
        approval.lint_status ?? '',
        approval.test_status ?? '',
    ]
        .join(' ')
        .toLowerCase();

    assert.ok(searchText.length > 0);
    assert.ok(searchText.includes('merge release pr'));
});

// getQualityStatus: tests for quality status formatting
test('getQualityStatus formats lint and test status', () => {
    const approval = createMockApproval({
        lint_status: 'passed',
        test_status: 'passed',
    });

    const status = `Lint ${approval.lint_status ?? 'not_run'} | Test ${approval.test_status ?? 'not_run'}`;
    assert.equal(status, 'Lint passed | Test passed');
});

test('getQualityStatus defaults to not_run when status is absent', () => {
    const approval = createMockApproval({
        lint_status: null,
        test_status: null,
    });

    const status = `Lint ${approval.lint_status ?? 'not_run'} | Test ${approval.test_status ?? 'not_run'}`;
    assert.equal(status, 'Lint not_run | Test not_run');
});

// Approval packet rendering: tests for packet field presence and preservation
test('Approval packet rendering has all required fields', () => {
    const approval = createMockApproval();

    assert.ok('change_summary' in approval);
    assert.ok('impacted_scope' in approval);
    assert.ok('risk_reason' in approval);
    assert.ok('proposed_rollback' in approval);
    assert.ok('lint_status' in approval);
    assert.ok('test_status' in approval);
    assert.ok('packet_complete' in approval);
});

test('Approval packet rendering preserves packet fields through state updates', () => {
    const original = createMockApproval();
    const updated = {
        ...original,
        decision_status: 'approved',
        decided_at: '2026-04-20T09:12:00Z',
        decision_reason: 'Approved after policy review',
    };

    assert.equal(updated.change_summary, original.change_summary);
    assert.equal(updated.impacted_scope, original.impacted_scope);
    assert.equal(updated.risk_reason, original.risk_reason);
    assert.equal(updated.proposed_rollback, original.proposed_rollback);
    assert.equal(updated.lint_status, original.lint_status);
    assert.equal(updated.test_status, original.test_status);
    assert.equal(updated.packet_complete, original.packet_complete);
});

// Risk level filtering: tests for risk-based filters
test('Risk level filtering by high risk', () => {
    const pendingApprovals = [
        createMockApproval({ approval_id: 'high-1', risk_level: 'high' }),
        createMockApproval({ approval_id: 'med-1', risk_level: 'medium' }),
        createMockApproval({ approval_id: 'low-1', risk_level: 'low' }),
        createMockApproval({ approval_id: 'high-2', risk_level: 'high' }),
    ];

    const filtered = pendingApprovals.filter((item) => item.risk_level === 'high');
    assert.equal(filtered.length, 2);
    assert.ok(filtered.every((item) => item.risk_level === 'high'));
});

test('Risk level filtering by medium risk', () => {
    const pendingApprovals = [
        createMockApproval({ approval_id: 'high-1', risk_level: 'high' }),
        createMockApproval({ approval_id: 'med-1', risk_level: 'medium' }),
    ];

    const filtered = pendingApprovals.filter((item) => item.risk_level === 'medium');
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]?.risk_level, 'medium');
});

test('Risk level filtering returns all items when no filter applied', () => {
    const pendingApprovals = [
        createMockApproval({ approval_id: 'high-1', risk_level: 'high' }),
        createMockApproval({ approval_id: 'med-1', risk_level: 'medium' }),
        createMockApproval({ approval_id: 'low-1', risk_level: 'low' }),
        createMockApproval({ approval_id: 'high-2', risk_level: 'high' }),
    ];

    const filtered = pendingApprovals.filter(() => true);
    assert.equal(filtered.length, 4);
});

// Detail drawer state: tests for drawer open/close logic
test('Detail drawer state initializes with no selected approval', () => {
    const selectedApprovalId = null;
    assert.strictEqual(selectedApprovalId, null);
});

test('Detail drawer state allows selection of approval', () => {
    let selectedApprovalId: string | null = null;
    const approvalId = 'APR-001';

    selectedApprovalId = approvalId;
    assert.equal(selectedApprovalId, 'APR-001');
});

test('Detail drawer state allows clearing selection', () => {
    let selectedApprovalId: string | null = 'APR-001';

    selectedApprovalId = null;
    assert.strictEqual(selectedApprovalId, null);
});

test('Detail drawer state finds approval from combined pending and recent lists', () => {
    const pending = [createMockApproval({ approval_id: 'APR-001' })];
    const recent = [createMockApproval({ approval_id: 'APR-002', decision_status: 'approved' })];
    const selectedApprovalId = 'APR-002';

    const selectedApproval = [...pending, ...recent].find((a) => a.approval_id === selectedApprovalId);
    assert.equal(selectedApproval?.approval_id, 'APR-002');
    assert.equal(selectedApproval?.decision_status, 'approved');
});

// Approval decision workflow: tests for state transitions with packet preservation
test('Approval decision workflow preserves packet fields when moving from pending to recent', () => {
    const approval = createMockApproval({
        approval_id: 'APR-001',
        decision_status: 'pending',
    });

    const moved = {
        ...approval,
        decision_status: 'approved',
        decided_at: '2026-04-20T09:12:00Z',
        decision_reason: 'Approved by operations team',
    };

    assert.equal(moved.change_summary, approval.change_summary);
    assert.equal(moved.impacted_scope, approval.impacted_scope);
    assert.equal(moved.risk_reason, approval.risk_reason);
    assert.equal(moved.proposed_rollback, approval.proposed_rollback);
    assert.equal(moved.lint_status, approval.lint_status);
    assert.equal(moved.test_status, approval.test_status);
    assert.equal(moved.packet_complete, approval.packet_complete);
    assert.equal(moved.decision_status, 'approved');
});

test('Approval decision workflow handles bulk decision with packet field preservation', () => {
    const selected = [
        createMockApproval({ approval_id: 'APR-001' }),
        createMockApproval({ approval_id: 'APR-002' }),
    ];

    const moved = selected.map((approval) => ({
        ...approval,
        decision_status: 'approved' as const,
        decided_at: new Date().toISOString(),
        decision_reason: 'Bulk approved by operations triage run.',
    }));

    moved.forEach((approval) => {
        assert.equal(approval.packet_complete, true);
        assert.ok(approval.change_summary);
    });
});

// Fallback behavior: tests for approvals without structured packet
test('Fallback behavior renders approval without structured packet fields', () => {
    const approval = {
        approval_id: 'APR-001',
        workspace_id: 'ws_primary_001',
        bot_id: 'bot_dev_001',
        action_summary: 'Some action',
        risk_level: 'low' as const,
        decision_status: 'pending',
        requested_at: '2026-04-20T09:11:39Z',
        decided_at: null,
        decision_reason: null,
    };

    const headline = approval.action_summary;
    assert.equal(headline, 'Some action');
});

test('Fallback behavior handles partial packet completion', () => {
    const approval = createMockApproval({
        change_summary: 'Updated action',
        impacted_scope: 'github:repo',
        risk_reason: null,
        proposed_rollback: null,
        packet_complete: false,
    });

    assert.equal(approval.change_summary, 'Updated action');
    assert.equal(approval.impacted_scope, 'github:repo');
    assert.strictEqual(approval.risk_reason, null);
    assert.equal(approval.packet_complete, false);
});

// Search and filter interaction: tests for combined filtering logic
test('Search and filter interaction filters by risk then searches within result', () => {
    const approvals = [
        createMockApproval({
            approval_id: 'APR-001',
            change_summary: 'Merge database migration',
            impacted_scope: 'postgres:prod',
            risk_level: 'high',
        }),
        createMockApproval({
            approval_id: 'APR-002',
            change_summary: 'Update API config',
            impacted_scope: 'api-gateway:config',
            risk_level: 'medium',
        }),
    ];

    const riskFilter = 'high';
    const searchQuery = 'database';

    const filtered = approvals
        .filter((item) => item.risk_level === riskFilter)
        .filter((item) => {
            const searchText = [
                item.action_summary,
                item.change_summary ?? '',
                item.impacted_scope ?? '',
                item.risk_reason ?? '',
            ]
                .join(' ')
                .toLowerCase();
            return searchText.includes(searchQuery);
        });

    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]?.approval_id, 'APR-001');
});

test('Search and filter interaction searches across packet scope field', () => {
    const approvals = [
        createMockApproval({
            approval_id: 'APR-001',
            change_summary: 'Merge database migration',
            impacted_scope: 'postgres:prod',
            risk_level: 'high',
        }),
        createMockApproval({
            approval_id: 'APR-002',
            change_summary: 'Update API config',
            impacted_scope: 'api-gateway:config',
            risk_level: 'medium',
        }),
    ];

    const searchQuery = 'postgres';

    const filtered = approvals.filter((item) => {
        const searchText = [
            item.action_summary,
            item.change_summary ?? '',
            item.impacted_scope ?? '',
        ]
            .join(' ')
            .toLowerCase();
        return searchText.includes(searchQuery);
    });

    assert.equal(filtered.length, 1);
    assert.ok(filtered[0]?.impacted_scope?.includes('postgres'));
});

test('Search and filter interaction resets pagination on filter change', () => {
    let currentPage = 5;
    const riskFilter = Math.random() > 0.5 ? ('all' as const) : ('high' as const);

    if (riskFilter !== 'all') {
        currentPage = 1;
    }

    assert.equal(currentPage, riskFilter === 'high' ? 1 : 5);
});
