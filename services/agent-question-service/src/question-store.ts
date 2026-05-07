/**
 * Feature #2 — Agent Question Service
 * Frozen 2026-05-07
 *
 * Allows the agent to ask a human teammate a question, park the current task,
 * pick up another task, and resume the parked task when the answer arrives.
 *
 * Flow:
 *   1. Agent hits an ambiguous decision point
 *   2. createQuestion() creates a record (status: 'pending'), sends a notification
 *   3. Agent parks current task, picks up another
 *   4. Human replies via Slack/Teams webhook → answerQuestion() updates record
 *   5. Orchestrator polls/subscribes → resumes blocked task with answer as context
 *   6. If timeout → resolveTimeout() applies onTimeout strategy
 */

import { randomUUID } from 'node:crypto';
import type {
    AgentQuestionRecord,
    AgentQuestionStatus,
    AgentQuestionChannel,
    AgentQuestionTimeoutPolicy,
} from '@agentfarm/shared-types';
import { CONTRACT_VERSIONS } from '@agentfarm/shared-types';

export type { AgentQuestionRecord, AgentQuestionStatus };

// ── In-process store ─────────────────────────────────────────────────────────
// Production implementations replace this with a DB-backed store via the
// IQuestionStore interface below.

export interface IQuestionStore {
    save(record: AgentQuestionRecord): Promise<void>;
    findById(id: string): Promise<AgentQuestionRecord | null>;
    findPendingByTask(taskId: string): Promise<AgentQuestionRecord[]>;
    findPendingByWorkspace(workspaceId: string): Promise<AgentQuestionRecord[]>;
    update(id: string, patch: Partial<AgentQuestionRecord>): Promise<void>;
}

export class InMemoryQuestionStore implements IQuestionStore {
    private readonly store = new Map<string, AgentQuestionRecord>();

    async save(record: AgentQuestionRecord): Promise<void> {
        this.store.set(record.id, { ...record });
    }

    async findById(id: string): Promise<AgentQuestionRecord | null> {
        return this.store.get(id) ?? null;
    }

    async findPendingByTask(taskId: string): Promise<AgentQuestionRecord[]> {
        return [...this.store.values()].filter(
            (r) => r.taskId === taskId && r.status === 'pending',
        );
    }

    async findPendingByWorkspace(workspaceId: string): Promise<AgentQuestionRecord[]> {
        return [...this.store.values()].filter(
            (r) => r.workspaceId === workspaceId && r.status === 'pending',
        );
    }

    async update(id: string, patch: Partial<AgentQuestionRecord>): Promise<void> {
        const existing = this.store.get(id);
        if (existing) {
            this.store.set(id, { ...existing, ...patch });
        }
    }
}

// ── Core service functions ────────────────────────────────────────────────────

export interface CreateQuestionInput {
    tenantId: string;
    workspaceId: string;
    taskId: string;
    botId: string;
    question: string;
    context: string;
    options?: string[];
    askedVia: AgentQuestionChannel;
    timeoutMs?: number;
    onTimeout?: AgentQuestionTimeoutPolicy;
    correlationId: string;
}

const DEFAULT_TIMEOUT_MS = 4 * 60 * 60 * 1000; // 4 hours

/**
 * Create a new question record. The orchestrator should park the current task
 * and pick up another while this is pending.
 */
export async function createQuestion(
    input: CreateQuestionInput,
    store: IQuestionStore,
): Promise<AgentQuestionRecord> {
    const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const now = new Date();
    const record: AgentQuestionRecord = {
        id: randomUUID(),
        contractVersion: CONTRACT_VERSIONS.AGENT_QUESTION,
        tenantId: input.tenantId,
        workspaceId: input.workspaceId,
        taskId: input.taskId,
        botId: input.botId,
        question: input.question,
        context: input.context,
        options: input.options,
        askedVia: input.askedVia,
        status: 'pending',
        timeoutMs,
        onTimeout: input.onTimeout ?? 'escalate',
        expiresAt: new Date(now.getTime() + timeoutMs).toISOString(),
        createdAt: now.toISOString(),
        correlationId: input.correlationId,
    };
    await store.save(record);
    return record;
}

/**
 * Record a human's answer to a pending question.
 * The orchestrator polls findPendingByTask() or subscribes to this change to
 * resume the blocked task.
 */
export async function answerQuestion(
    questionId: string,
    answer: string,
    answeredBy: string,
    store: IQuestionStore,
): Promise<AgentQuestionRecord | null> {
    const record = await store.findById(questionId);
    if (!record || record.status !== 'pending') return null;

    await store.update(questionId, {
        status: 'answered',
        answer,
        answeredBy,
        answeredAt: new Date().toISOString(),
    });

    return store.findById(questionId);
}

/**
 * Apply the timeout strategy for a question that has expired without an answer.
 * Returns the timeout policy so the orchestrator can act accordingly.
 */
export async function resolveTimeout(
    questionId: string,
    store: IQuestionStore,
): Promise<{ policy: AgentQuestionTimeoutPolicy; record: AgentQuestionRecord } | null> {
    const record = await store.findById(questionId);
    if (!record || record.status !== 'pending') return null;

    const now = new Date();
    if (new Date(record.expiresAt) > now) return null; // not yet expired

    await store.update(questionId, { status: 'timed_out' });
    const updated = await store.findById(questionId);
    if (!updated) return null;

    return { policy: record.onTimeout, record: updated };
}

/**
 * Scan workspace for expired questions and resolve their timeout strategies.
 * Called by the orchestrator wake cycle.
 */
export async function sweepExpiredQuestions(
    workspaceId: string,
    store: IQuestionStore,
): Promise<Array<{ policy: AgentQuestionTimeoutPolicy; record: AgentQuestionRecord }>> {
    const pending = await store.findPendingByWorkspace(workspaceId);
    const now = new Date();
    const results: Array<{ policy: AgentQuestionTimeoutPolicy; record: AgentQuestionRecord }> = [];

    for (const q of pending) {
        if (new Date(q.expiresAt) <= now) {
            const resolved = await resolveTimeout(q.id, store);
            if (resolved) results.push(resolved);
        }
    }

    return results;
}
