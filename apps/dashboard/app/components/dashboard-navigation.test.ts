import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDashboardHref } from './dashboard-navigation';

test('buildDashboardHref preserves workspaceId when switching tab', () => {
    const href = buildDashboardHref('/', 'workspaceId=ws_primary_001&tab=overview', {
        tab: 'observability',
    });

    assert.equal(href, '/?workspaceId=ws_primary_001&tab=observability');
});

test('buildDashboardHref preserves tab when switching workspace', () => {
    const href = buildDashboardHref('/', 'workspaceId=ws_primary_001&tab=audit', {
        workspaceId: 'ws_secondary_001',
    });

    assert.equal(href, '/?workspaceId=ws_secondary_001&tab=audit');
});

test('buildDashboardHref preserves unrelated query params', () => {
    const href = buildDashboardHref('/', 'workspaceId=ws_primary_001&tab=overview&source=smoke', {
        workspaceId: 'ws_secondary_001',
        tab: 'approvals',
    });

    assert.equal(href, '/?workspaceId=ws_secondary_001&tab=approvals&source=smoke');
});

test('buildDashboardHref adds extra deep-link params', () => {
    const href = buildDashboardHref('/', 'workspaceId=ws_primary_001&tab=approvals', {
        params: {
            approvalId: 'APR-1009',
            correlationId: 'corr_approval_1009',
        },
    });

    assert.equal(href, '/?workspaceId=ws_primary_001&tab=approvals&approvalId=APR-1009&correlationId=corr_approval_1009');
});

test('buildDashboardHref removes deep-link params when undefined', () => {
    const href = buildDashboardHref('/', 'workspaceId=ws_primary_001&tab=approvals&approvalId=APR-1009', {
        params: {
            approvalId: undefined,
        },
    });

    assert.equal(href, '/?workspaceId=ws_primary_001&tab=approvals');
});
