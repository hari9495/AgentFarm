/**
 * Feature #8: Kanban board utilities
 *
 * Pure logic for a drag-and-drop Kanban board that visualises agent task progress.
 * UI rendering lives in kanban-board.tsx; this module contains only serialisable
 * data operations so they can be unit-tested with Node's built-in test runner.
 *
 * Board model:
 *   KanbanBoard       – ordered list of columns
 *   KanbanColumn      – has an id, label, WIP limit, and ordered list of card ids
 *   KanbanCard        – rich task card with assignee, priority, labels, timestamps
 *
 * Operations:
 *   createBoard       – build a default 4-column board
 *   addCard           – add a card to a column (respects WIP limit)
 *   moveCard          – move a card between (or within) columns
 *   removeCard        – remove a card from the board
 *   getColumnCards    – resolve card objects for a column in order
 *   filterCards       – filter cards by assignee, label, priority, or status
 */

export type KanbanPriority = 'critical' | 'high' | 'medium' | 'low';
export type KanbanCardStatus = 'todo' | 'in_progress' | 'review' | 'done' | 'blocked';

export interface KanbanCard {
    id: string;
    title: string;
    description?: string;
    assigneeId?: string;
    botId?: string;
    workspaceId: string;
    priority: KanbanPriority;
    status: KanbanCardStatus;
    labels: string[];
    /** ISO-8601 */
    createdAt: string;
    updatedAt: string;
    dueAt?: string;
}

export interface KanbanColumn {
    id: string;
    label: string;
    /** Max number of cards in flight; 0 = unlimited */
    wipLimit: number;
    cardIds: string[];
}

export interface KanbanBoard {
    id: string;
    columns: KanbanColumn[];
    cards: Map<string, KanbanCard>;
}

export type KanbanMoveResult =
    | { ok: true }
    | { ok: false; reason: string };

// ── Factory ───────────────────────────────────────────────────────────────────

/** Creates a new board with the standard 4-column layout. */
export function createBoard(boardId: string): KanbanBoard {
    return {
        id: boardId,
        columns: [
            { id: 'todo',        label: 'To Do',       wipLimit: 0, cardIds: [] },
            { id: 'in_progress', label: 'In Progress',  wipLimit: 5, cardIds: [] },
            { id: 'review',      label: 'In Review',    wipLimit: 3, cardIds: [] },
            { id: 'done',        label: 'Done',         wipLimit: 0, cardIds: [] },
        ],
        cards: new Map(),
    };
}

// ── Mutations ─────────────────────────────────────────────────────────────────

/**
 * Adds a card to the specified column.
 * Returns false when the column's WIP limit would be exceeded.
 */
export function addCard(
    board: KanbanBoard,
    columnId: string,
    card: KanbanCard,
): { ok: true } | { ok: false; reason: string } {
    const col = board.columns.find((c) => c.id === columnId);
    if (!col) return { ok: false, reason: `column "${columnId}" not found` };

    if (col.wipLimit > 0 && col.cardIds.length >= col.wipLimit) {
        return { ok: false, reason: `WIP limit (${col.wipLimit}) reached for column "${columnId}"` };
    }

    board.cards.set(card.id, card);
    col.cardIds.push(card.id);
    return { ok: true };
}

/**
 * Moves a card from one column to another (or reorders within the same column).
 *
 * @param toIndex  Optional insertion index in the target column (append if omitted).
 */
export function moveCard(
    board: KanbanBoard,
    cardId: string,
    toColumnId: string,
    toIndex?: number,
): KanbanMoveResult {
    if (!board.cards.has(cardId)) {
        return { ok: false, reason: `card "${cardId}" not found` };
    }

    const fromCol = board.columns.find((c) => c.cardIds.includes(cardId));
    if (!fromCol) return { ok: false, reason: `card "${cardId}" is not in any column` };

    const toCol = board.columns.find((c) => c.id === toColumnId);
    if (!toCol) return { ok: false, reason: `column "${toColumnId}" not found` };

    // WIP limit check (only when moving to a different column)
    if (fromCol.id !== toCol.id && toCol.wipLimit > 0 && toCol.cardIds.length >= toCol.wipLimit) {
        return { ok: false, reason: `WIP limit (${toCol.wipLimit}) reached for column "${toColumnId}"` };
    }

    // Remove from source
    fromCol.cardIds = fromCol.cardIds.filter((id) => id !== cardId);

    // Insert in target
    if (typeof toIndex === 'number' && toIndex >= 0 && toIndex <= toCol.cardIds.length) {
        toCol.cardIds.splice(toIndex, 0, cardId);
    } else {
        toCol.cardIds.push(cardId);
    }

    return { ok: true };
}

/** Removes a card from the board entirely. */
export function removeCard(board: KanbanBoard, cardId: string): boolean {
    if (!board.cards.has(cardId)) return false;
    board.cards.delete(cardId);
    for (const col of board.columns) {
        col.cardIds = col.cardIds.filter((id) => id !== cardId);
    }
    return true;
}

// ── Queries ───────────────────────────────────────────────────────────────────

/** Returns the resolved card objects for a column, in column order. */
export function getColumnCards(board: KanbanBoard, columnId: string): KanbanCard[] {
    const col = board.columns.find((c) => c.id === columnId);
    if (!col) return [];
    return col.cardIds.flatMap((id) => {
        const card = board.cards.get(id);
        return card ? [card] : [];
    });
}

export interface KanbanFilter {
    assigneeId?: string;
    label?: string;
    priority?: KanbanPriority;
    status?: KanbanCardStatus;
}

/** Returns all cards matching every provided filter criterion. */
export function filterCards(board: KanbanBoard, filter: KanbanFilter): KanbanCard[] {
    const cards = [...board.cards.values()];
    return cards.filter((c) => {
        if (filter.assigneeId && c.assigneeId !== filter.assigneeId) return false;
        if (filter.label && !c.labels.includes(filter.label)) return false;
        if (filter.priority && c.priority !== filter.priority) return false;
        if (filter.status && c.status !== filter.status) return false;
        return true;
    });
}
