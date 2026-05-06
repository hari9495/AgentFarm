import assert from 'node:assert/strict';
import test from 'node:test';
import {
    applyEvidencePaginationParams,
    getEvidencePaginationState,
    isEvidencePaginationEnabled,
    normalizeEvidenceOffset,
    shouldApplyEvidenceResponse,
} from './approval-evidence-pagination';

test('isEvidencePaginationEnabled is true only for explicit true', () => {
    assert.equal(isEvidencePaginationEnabled('true'), true);
    assert.equal(isEvidencePaginationEnabled('false'), false);
    assert.equal(isEvidencePaginationEnabled(undefined), false);
});

test('getEvidencePaginationState computes initial page correctly', () => {
    const state = getEvidencePaginationState(12, 5, 0);

    assert.equal(state.page, 1);
    assert.equal(state.pageCount, 3);
    assert.equal(state.canPrev, false);
    assert.equal(state.canNext, true);
    assert.equal(state.startIndex, 1);
    assert.equal(state.endIndex, 5);
});

test('getEvidencePaginationState computes middle page correctly', () => {
    const state = getEvidencePaginationState(12, 5, 5);

    assert.equal(state.page, 2);
    assert.equal(state.pageCount, 3);
    assert.equal(state.canPrev, true);
    assert.equal(state.canNext, true);
    assert.equal(state.startIndex, 6);
    assert.equal(state.endIndex, 10);
});

test('getEvidencePaginationState computes last page correctly', () => {
    const state = getEvidencePaginationState(12, 5, 10);

    assert.equal(state.page, 3);
    assert.equal(state.pageCount, 3);
    assert.equal(state.canPrev, true);
    assert.equal(state.canNext, false);
    assert.equal(state.startIndex, 11);
    assert.equal(state.endIndex, 12);
});

test('getEvidencePaginationState handles empty evidence list', () => {
    const state = getEvidencePaginationState(0, 5, 0);

    assert.equal(state.page, 1);
    assert.equal(state.pageCount, 1);
    assert.equal(state.canPrev, false);
    assert.equal(state.canNext, false);
    assert.equal(state.startIndex, 0);
    assert.equal(state.endIndex, 0);
});

test('normalizeEvidenceOffset clamps out-of-range offsets for non-empty pages', () => {
    assert.equal(normalizeEvidenceOffset(12, 5, 11), 7);
    assert.equal(normalizeEvidenceOffset(12, 5, 5), 5);
    assert.equal(normalizeEvidenceOffset(0, 5, 3), 0);
});

test('applyEvidencePaginationParams sets limit and offset only when enabled', () => {
    const enabled = new URLSearchParams({ workspace_id: 'ws_1' });
    applyEvidencePaginationParams(enabled, true, 5, 10);
    assert.equal(enabled.get('workspace_id'), 'ws_1');
    assert.equal(enabled.get('limit'), '5');
    assert.equal(enabled.get('offset'), '10');

    const disabled = new URLSearchParams({ workspace_id: 'ws_1' });
    applyEvidencePaginationParams(disabled, false, 5, 10);
    assert.equal(disabled.get('workspace_id'), 'ws_1');
    assert.equal(disabled.get('limit'), null);
    assert.equal(disabled.get('offset'), null);
});

test('shouldApplyEvidenceResponse accepts only the active request id', () => {
    assert.equal(shouldApplyEvidenceResponse(4, 4), true);
    assert.equal(shouldApplyEvidenceResponse(3, 4), false);
});
