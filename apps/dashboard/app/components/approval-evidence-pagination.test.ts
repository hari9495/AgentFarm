import assert from 'node:assert/strict';
import test from 'node:test';
import { getEvidencePaginationState, isEvidencePaginationEnabled } from './approval-evidence-pagination';

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
