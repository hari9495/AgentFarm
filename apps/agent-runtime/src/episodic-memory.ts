/**
 * Episodic Memory Store for the Developer Agent.
 *
 * Keeps a per-workspace ring-buffer of recent task outcomes so the agent can:
 *   - Avoid repeating failed approaches within the same sprint
 *   - Reference what files / actions were touched earlier in a session
 *   - Inject concise past-context into the LLM system prompt without hallucinating
 *
 * Default: pure in-process store (lives for the lifetime of the runtime process).
 * Optional pgvector backend: inject `pgWrite` / `pgRead` for cross-restart durability.
 * Wire the read path into processDeveloperTask via _episodic_context payload injection.
 */

export type TaskOutcome = 'success' | 'failed' | 'approval_required' | 'escalated';

export type TaskMemoryEntry = {
    taskId: string;
    workspaceId: string;
    botId: string;
    actionType: string;
    /** First 200 chars of the task prompt / description */
    promptSummary: string;
    outcome: TaskOutcome;
    timestamp: number;
    /** Truncated test failure output (≤400 chars) if the task failed due to tests */
    testFailureSummary?: string;
    /** Files changed during this task (up to 10) */
    filesChanged?: string[];
    /** Short error message if outcome is 'failed' or 'escalated' */
    errorMessage?: string;
};

/**
 * Optional PostgreSQL / pgvector write-through callbacks.
 * Implement these to persist memory across container restarts.
 * The in-process store is always kept warm as an L1 cache.
 */
export type PgWriteFn = (entry: TaskMemoryEntry) => Promise<void>;
export type PgReadFn = (workspaceId: string, limit: number) => Promise<TaskMemoryEntry[]>;

const MAX_PER_WORKSPACE = 200;
const DEFAULT_CONTEXT_WINDOW = 5;

/**
 * In-process episodic memory store.
 * One instance is typically used as a module-level singleton per runtime process.
 */
export class EpisodicMemoryStore {
    private readonly store = new Map<string, TaskMemoryEntry[]>();
    private readonly pgWrite?: PgWriteFn;
    private readonly pgRead?: PgReadFn;

    constructor(opts?: { pgWrite?: PgWriteFn; pgRead?: PgReadFn }) {
        this.pgWrite = opts?.pgWrite;
        this.pgRead = opts?.pgRead;
    }

    /**
     * Record a task outcome.  Rotates old entries when the bucket exceeds
     * MAX_PER_WORKSPACE. Best-effort write-through to pg if configured.
     */
    async record(entry: TaskMemoryEntry): Promise<void> {
        const key = entry.workspaceId;
        if (!this.store.has(key)) {
            this.store.set(key, []);
        }
        const bucket = this.store.get(key)!;
        bucket.push(entry);
        if (bucket.length > MAX_PER_WORKSPACE) {
            bucket.splice(0, bucket.length - MAX_PER_WORKSPACE);
        }
        if (this.pgWrite) {
            try {
                await this.pgWrite(entry);
            } catch {
                // Best-effort — never block execution on memory write failure
            }
        }
    }

    /**
     * Return the N most-recent entries for a workspace.
     * Prefers pg when configured (cross-restart durability), falls back to in-process.
     */
    async readRecentForWorkspace(workspaceId: string, limit = DEFAULT_CONTEXT_WINDOW): Promise<TaskMemoryEntry[]> {
        if (this.pgRead) {
            try {
                const pgEntries = await this.pgRead(workspaceId, limit);
                if (pgEntries.length > 0) return pgEntries;
            } catch {
                // Fall through to in-process store
            }
        }
        const bucket = this.store.get(workspaceId) ?? [];
        return bucket.slice(-limit).reverse(); // most-recent first
    }

    /**
     * Build a concise text block to inject into the LLM context.
     * Only actionable facts — no filler.
     */
    buildContextBlock(entries: TaskMemoryEntry[]): string {
        if (entries.length === 0) return '';
        const lines = entries.map((e) => {
            const ts = new Date(e.timestamp).toISOString().slice(0, 16);
            const icon = e.outcome === 'success' ? '✓' : e.outcome === 'escalated' ? '⚠' : '✗';
            const files =
                e.filesChanged && e.filesChanged.length > 0
                    ? ` [${e.filesChanged.slice(0, 3).join(', ')}]`
                    : '';
            const err = e.errorMessage ? ` — ${e.errorMessage.slice(0, 80)}` : '';
            return `${icon} [${ts}] ${e.actionType}: ${e.promptSummary.slice(0, 120)}${files}${err}`;
        });
        return [
            `=== Recent task history (${entries.length} entries) ===`,
            ...lines,
            '=== End task history ===',
        ].join('\n');
    }

    /** Clear all in-process entries for a workspace (e.g. on agent deprovision). */
    clearWorkspace(workspaceId: string): void {
        this.store.delete(workspaceId);
    }

    /** Return the current count of entries stored for a workspace. */
    entryCount(workspaceId: string): number {
        return this.store.get(workspaceId)?.length ?? 0;
    }
}

/**
 * Module-level singleton.
 * processDeveloperTask uses this unless a custom store is injected.
 * Tests can import this and call .clearWorkspace() between runs.
 */
export const globalEpisodicMemory = new EpisodicMemoryStore();
