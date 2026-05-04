import assert from 'node:assert/strict';
import test from 'node:test';
import {
    addCard,
    createBoard,
    filterCards,
    getColumnCards,
    moveCard,
    removeCard,
    type KanbanCard,
} from './kanban-board-utils.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeCard(id: string, overrides: Partial<KanbanCard> = {}): KanbanCard {
    return {
        id,
        title: `Task ${id}`,
        workspaceId: 'ws_1',
        priority: 'medium',
        status: 'todo',
        labels: [],
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        ...overrides,
    };
}

// ── createBoard ───────────────────────────────────────────────────────────────

test('createBoard creates 4 columns in order', () => {
    const board = createBoard('board_1');
    assert.equal(board.columns.length, 4);
    assert.deepEqual(
        board.columns.map((c) => c.id),
        ['todo', 'in_progress', 'review', 'done'],
    );
});

test('createBoard starts with no cards', () => {
    const board = createBoard('board_1');
    assert.equal(board.cards.size, 0);
});

// ── addCard ───────────────────────────────────────────────────────────────────

test('addCard inserts card into specified column', () => {
    const board = createBoard('b');
    const result = addCard(board, 'todo', makeCard('c1'));
    assert.equal(result.ok, true);
    assert.equal(board.columns[0].cardIds.length, 1);
    assert.equal(board.columns[0].cardIds[0], 'c1');
});

test('addCard returns failure for unknown column', () => {
    const board = createBoard('b');
    const result = addCard(board, 'nonexistent', makeCard('c1'));
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.reason.includes('not found'));
});

test('addCard respects WIP limit', () => {
    const board = createBoard('b');
    // in_progress has wipLimit=5
    for (let i = 0; i < 5; i++) {
        addCard(board, 'in_progress', makeCard(`c${i}`));
    }
    const overflow = addCard(board, 'in_progress', makeCard('c_overflow'));
    assert.equal(overflow.ok, false);
    if (!overflow.ok) assert.ok(overflow.reason.includes('WIP limit'));
});

test('addCard allows unlimited cards when wipLimit is 0', () => {
    const board = createBoard('b');
    for (let i = 0; i < 20; i++) {
        const result = addCard(board, 'todo', makeCard(`c${i}`));
        assert.equal(result.ok, true);
    }
    assert.equal(board.columns[0].cardIds.length, 20);
});

// ── moveCard ──────────────────────────────────────────────────────────────────

test('moveCard moves card to another column', () => {
    const board = createBoard('b');
    addCard(board, 'todo', makeCard('c1'));
    const result = moveCard(board, 'c1', 'in_progress');
    assert.equal(result.ok, true);
    assert.equal(board.columns[0].cardIds.includes('c1'), false);
    assert.equal(board.columns[1].cardIds.includes('c1'), true);
});

test('moveCard inserts at specified index', () => {
    const board = createBoard('b');
    addCard(board, 'todo', makeCard('c1'));
    addCard(board, 'todo', makeCard('c2'));
    addCard(board, 'todo', makeCard('c3'));
    moveCard(board, 'c3', 'todo', 0); // move c3 to the front of same column
    assert.equal(board.columns[0].cardIds[0], 'c3');
});

test('moveCard returns failure when card not found', () => {
    const board = createBoard('b');
    const result = moveCard(board, 'ghost_card', 'done');
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.reason.includes('not found'));
});

test('moveCard returns failure when target column WIP limit exceeded', () => {
    const board = createBoard('b');
    // Fill in_progress (limit=5)
    for (let i = 0; i < 5; i++) addCard(board, 'in_progress', makeCard(`ip${i}`));
    addCard(board, 'todo', makeCard('overflow'));
    const result = moveCard(board, 'overflow', 'in_progress');
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.reason.includes('WIP limit'));
});

// ── removeCard ────────────────────────────────────────────────────────────────

test('removeCard removes card from board and column', () => {
    const board = createBoard('b');
    addCard(board, 'todo', makeCard('c1'));
    const removed = removeCard(board, 'c1');
    assert.equal(removed, true);
    assert.equal(board.cards.has('c1'), false);
    assert.equal(board.columns[0].cardIds.includes('c1'), false);
});

test('removeCard returns false for unknown card', () => {
    const board = createBoard('b');
    assert.equal(removeCard(board, 'ghost'), false);
});

// ── getColumnCards ────────────────────────────────────────────────────────────

test('getColumnCards returns cards in column order', () => {
    const board = createBoard('b');
    addCard(board, 'todo', makeCard('c1'));
    addCard(board, 'todo', makeCard('c2'));
    const cards = getColumnCards(board, 'todo');
    assert.equal(cards.length, 2);
    assert.equal(cards[0].id, 'c1');
    assert.equal(cards[1].id, 'c2');
});

test('getColumnCards returns empty array for unknown column', () => {
    const board = createBoard('b');
    assert.deepEqual(getColumnCards(board, 'unknown'), []);
});

// ── filterCards ───────────────────────────────────────────────────────────────

test('filterCards by assigneeId', () => {
    const board = createBoard('b');
    addCard(board, 'todo', makeCard('c1', { assigneeId: 'bot_1' }));
    addCard(board, 'todo', makeCard('c2', { assigneeId: 'bot_2' }));
    const results = filterCards(board, { assigneeId: 'bot_1' });
    assert.equal(results.length, 1);
    assert.equal(results[0].id, 'c1');
});

test('filterCards by label', () => {
    const board = createBoard('b');
    addCard(board, 'todo', makeCard('c1', { labels: ['security', 'urgent'] }));
    addCard(board, 'todo', makeCard('c2', { labels: ['feature'] }));
    const results = filterCards(board, { label: 'security' });
    assert.equal(results.length, 1);
    assert.equal(results[0].id, 'c1');
});

test('filterCards by priority', () => {
    const board = createBoard('b');
    addCard(board, 'todo', makeCard('c1', { priority: 'critical' }));
    addCard(board, 'todo', makeCard('c2', { priority: 'low' }));
    const results = filterCards(board, { priority: 'critical' });
    assert.equal(results.length, 1);
    assert.equal(results[0].id, 'c1');
});

test('filterCards returns empty array when no match', () => {
    const board = createBoard('b');
    addCard(board, 'todo', makeCard('c1', { assigneeId: 'bot_1' }));
    const results = filterCards(board, { assigneeId: 'bot_99' });
    assert.equal(results.length, 0);
});

test('filterCards with combined criteria (AND)', () => {
    const board = createBoard('b');
    addCard(board, 'todo', makeCard('c1', { assigneeId: 'bot_1', priority: 'high', labels: ['urgent'] }));
    addCard(board, 'todo', makeCard('c2', { assigneeId: 'bot_1', priority: 'low',  labels: ['urgent'] }));
    const results = filterCards(board, { assigneeId: 'bot_1', priority: 'high' });
    assert.equal(results.length, 1);
    assert.equal(results[0].id, 'c1');
});
