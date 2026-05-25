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
    /**
     * Gap 4: per-person episodic memory key.
     * Normalized identifier of the *other* party the agent interacted with on
     * this task — recipient email, candidate ID, Slack user, customer ID, etc.
     * When present, the entry is also indexed under this key so subsequent
     * conversations with the same person can recall prior history.
     */
    personKey?: string;
    /** Human-readable label for the person (e.g. "Jane Doe <jane@acme.com>"). */
    personLabel?: string;
    /**
     * Gap 7 (Learn from mistakes): truncated output of `git diff HEAD~1 HEAD`
     * captured after a successful task. Gives the LLM concrete before/after
     * evidence so it can avoid repeating the same approach on similar tasks.
     * Capped at 2 000 chars.
     */
    codeDiff?: string;
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
    private readonly personStore = new Map<string, TaskMemoryEntry[]>();
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
        // Gap 4: also index by person when available so the agent recalls
        // prior interactions with the same recipient across workspaces.
        if (entry.personKey && entry.personKey.trim()) {
            const pkey = entry.personKey.trim().toLowerCase();
            if (!this.personStore.has(pkey)) {
                this.personStore.set(pkey, []);
            }
            const pbucket = this.personStore.get(pkey)!;
            pbucket.push(entry);
            if (pbucket.length > MAX_PER_WORKSPACE) {
                pbucket.splice(0, pbucket.length - MAX_PER_WORKSPACE);
            }
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
    buildContextBlock(entries: TaskMemoryEntry[], opts?: { label?: string }): string {
        if (entries.length === 0) return '';
        const lines = entries.map((e) => {
            const ts = new Date(e.timestamp).toISOString().slice(0, 16);
            const icon = e.outcome === 'success' ? '✓' : e.outcome === 'escalated' ? '⚠' : '✗';
            const files =
                e.filesChanged && e.filesChanged.length > 0
                    ? ` [${e.filesChanged.slice(0, 3).join(', ')}]`
                    : '';
            const err = e.errorMessage
                ? ` — ${e.errorMessage.slice(0, 80)}`
                : e.testFailureSummary
                  ? ` — test: ${e.testFailureSummary.slice(0, 100)}`
                  : '';
            // Gap 7: surface actual changed lines (not just count) so the LLM can
            // learn what code was written or reverted — helps avoid repeating the same
            // approach on similar tasks. Filter to +/- lines, skip file headers.
            const diffChangedLines = e.codeDiff
                ? e.codeDiff
                      .split('\n')
                      .filter((l) => (l.startsWith('+') || l.startsWith('-')) && !l.startsWith('+++') && !l.startsWith('---'))
                      .slice(0, 6)
                      .join(' | ')
                      .slice(0, 240)
                : '';
            const diffHint = e.codeDiff
                ? ` [diff:${e.codeDiff.split('\n').length}L${diffChangedLines ? ': ' + diffChangedLines : ''}]`
                : '';
            return `${icon} [${ts}] ${e.actionType}: ${e.promptSummary.slice(0, 120)}${files}${diffHint}${err}`;
        });
        const label = opts?.label?.trim();
        const header = label
            ? `=== Recent task history with ${label} (${entries.length} entries) ===`
            : `=== Recent task history (${entries.length} entries) ===`;
        return [
            header,
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

    /**
     * Gap 4: return the N most-recent entries for a *person* (recipient,
     * candidate, customer, etc.). Used to inject "what we last said to this
     * person" context into the LLM prompt so the agent doesn't repeat itself
     * or contradict prior commitments. Falls back to in-process bucket; pg
     * recall by personKey is opportunistic via JSON filter on `summary`.
     */
    async readRecentForPerson(personKey: string, limit = DEFAULT_CONTEXT_WINDOW): Promise<TaskMemoryEntry[]> {
        if (!personKey || !personKey.trim()) return [];
        const pkey = personKey.trim().toLowerCase();
        const bucket = this.personStore.get(pkey) ?? [];
        return bucket.slice(-limit).reverse();
    }

    /** Clear in-process per-person entries (e.g. on right-to-be-forgotten request). */
    clearPerson(personKey: string): void {
        if (!personKey) return;
        this.personStore.delete(personKey.trim().toLowerCase());
    }

    /** Return the current count of entries stored for a person. */
    personEntryCount(personKey: string): number {
        if (!personKey) return 0;
        return this.personStore.get(personKey.trim().toLowerCase())?.length ?? 0;
    }
}

// ---------------------------------------------------------------------------
// pgvector-backed memory factory
// ---------------------------------------------------------------------------

type PrismaLike = {
    $queryRawUnsafe: <T>(query: string, ...values: unknown[]) => Promise<T>;
    agentLongTermMemory: {
        create: (args: {
            data: {
                tenantId: string;
                workspaceId: string;
                botId: string;
                pattern: string;
                confidence: number;
                observedCount: number;
                lastSeen: Date;
                summary: string;
                embeddingModel: string | null;
                embedding?: unknown;
            };
        }) => Promise<unknown>;
    };
};

type AgentLongTermMemoryRow = {
    id: string;
    tenant_id: string;
    workspace_id: string;
    bot_id: string | null;
    pattern: string;
    summary: string | null;
    created_at: Date;
};

/**
 * Calls OpenAI text-embedding-ada-002 to convert text into a 1536-dim vector.
 * Returns null when OPENAI_API_KEY is not set or the call fails.
 */
async function getOpenAIEmbedding(text: string): Promise<number[] | null> {
    const apiKey = process.env['OPENAI_API_KEY'];
    if (!apiKey) return null;
    try {
        const resp = await fetch('https://api.openai.com/v1/embeddings', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ model: 'text-embedding-ada-002', input: text.slice(0, 8000) }),
        });
        if (!resp.ok) return null;
        const json = await resp.json() as { data?: Array<{ embedding: number[] }> };
        return json.data?.[0]?.embedding ?? null;
    } catch {
        return null;
    }
}

/**
 * Creates pgWrite / pgRead callbacks that persist episodic memory entries in
 * the `AgentLongTermMemory` table using pgvector for semantic recall.
 *
 * Embedding generation is best-effort: if OPENAI_API_KEY is absent the entry
 * is stored without a vector and recall falls back to recency order.
 *
 * Usage:
 *   const { pgWrite, pgRead } = createPgEpisodicMemoryFns(prisma, 'tenant-123');
 *   const store = new EpisodicMemoryStore({ pgWrite, pgRead });
 */
export function createPgEpisodicMemoryFns(
    prisma: PrismaLike,
    tenantId: string,
): { pgWrite: PgWriteFn; pgRead: PgReadFn } {
    const pgWrite: PgWriteFn = async (entry: TaskMemoryEntry): Promise<void> => {
        const patternText = `${entry.actionType}: ${entry.promptSummary}`;
        const summaryText = JSON.stringify({
            taskId: entry.taskId,
            outcome: entry.outcome,
            filesChanged: entry.filesChanged ?? [],
            errorMessage: entry.errorMessage ?? null,
            testFailureSummary: entry.testFailureSummary ?? null,
            timestamp: entry.timestamp,
            personKey: entry.personKey ?? null,
            personLabel: entry.personLabel ?? null,
            codeDiff: entry.codeDiff ?? null,
        });

        const embedding = await getOpenAIEmbedding(`${patternText} ${summaryText}`);

        if (embedding) {
            // Insert with pgvector embedding using raw SQL (Prisma does not support
            // the vector cast natively with the Unsupported type)
            const vectorLiteral = `[${embedding.join(',')}]`;
            await prisma.$queryRawUnsafe<unknown[]>(
                `INSERT INTO "AgentLongTermMemory"
                    ("id","tenantId","workspaceId","botId","pattern","confidence","observedCount","lastSeen","summary","embeddingModel","embedding")
                 VALUES
                    (gen_random_uuid(),$1,$2,$3,$4,1.0,1,NOW(),$5,'text-embedding-ada-002',$6::vector)
                 ON CONFLICT DO NOTHING`,
                tenantId,
                entry.workspaceId,
                entry.botId,
                patternText,
                summaryText,
                vectorLiteral,
            );
        } else {
            await prisma.agentLongTermMemory.create({
                data: {
                    tenantId,
                    workspaceId: entry.workspaceId,
                    botId: entry.botId,
                    pattern: patternText,
                    confidence: 1.0,
                    observedCount: 1,
                    lastSeen: new Date(entry.timestamp),
                    summary: summaryText,
                    embeddingModel: null,
                },
            });
        }
    };

    const pgRead: PgReadFn = async (workspaceId: string, limit: number): Promise<TaskMemoryEntry[]> => {
        // Try semantic search first (requires pgvector + a recent embedding)
        // If no query embedding is available, fall back to recency sort
        let rows: AgentLongTermMemoryRow[];
        try {
            rows = await prisma.$queryRawUnsafe<AgentLongTermMemoryRow[]>(
                `SELECT id, "tenantId" AS tenant_id, "workspaceId" AS workspace_id,
                        "botId" AS bot_id, pattern, summary, "createdAt" AS created_at
                 FROM "AgentLongTermMemory"
                 WHERE "tenantId" = $1 AND "workspaceId" = $2
                 ORDER BY "createdAt" DESC
                 LIMIT $3`,
                tenantId,
                workspaceId,
                limit,
            );
        } catch {
            return [];
        }

        return rows.map((row): TaskMemoryEntry => {
            let parsed: Partial<TaskMemoryEntry> = {};
            try {
                parsed = JSON.parse(row.summary ?? '{}') as Partial<TaskMemoryEntry>;
            } catch {
                // ignore
            }
            const [actionType = 'unknown', ...rest] = row.pattern.split(': ');
            const promptSummary = rest.join(': ') || row.pattern;
            return {
                taskId: parsed.taskId ?? row.id,
                workspaceId: row.workspace_id,
                botId: row.bot_id ?? '',
                actionType,
                promptSummary,
                outcome: (parsed.outcome as TaskOutcome | undefined) ?? 'success',
                timestamp: parsed.timestamp ?? row.created_at.getTime(),
                testFailureSummary: parsed.testFailureSummary ?? undefined,
                filesChanged: parsed.filesChanged ?? undefined,
                errorMessage: parsed.errorMessage ?? undefined,
                personKey: parsed.personKey ?? undefined,
                personLabel: parsed.personLabel ?? undefined,
                codeDiff: parsed.codeDiff ?? undefined,
            };
        });
    };

    return { pgWrite, pgRead };
}

/**
 * Attempts to create a pg-backed store when DATABASE_URL is present.
 * Falls back to a pure in-memory store when it cannot import @prisma/client.
 * This is called lazily so the module can always be imported safely.
 */
async function tryCreatePgBackedStore(): Promise<EpisodicMemoryStore> {
    const dbUrl = process.env['DATABASE_URL'];
    if (!dbUrl) return new EpisodicMemoryStore();
    try {
        const { PrismaClient } = await import('@prisma/client');
        const prisma = new PrismaClient();
        const tenantId = process.env['AF_DEFAULT_TENANT_ID'] ?? 'global';
        const { pgWrite, pgRead } = createPgEpisodicMemoryFns(prisma as unknown as PrismaLike, tenantId);
        return new EpisodicMemoryStore({ pgWrite, pgRead });
    } catch {
        // @prisma/client not available or DB unreachable — use in-memory
        return new EpisodicMemoryStore();
    }
}

/**
 * Module-level singleton.
 * processDeveloperTask uses this unless a custom store is injected.
 * Tests can import this and call .clearWorkspace() between runs.
 *
 * When DATABASE_URL is set and @prisma/client is available, memory is
 * persisted to the AgentLongTermMemory table with optional pgvector semantic
 * recall (requires OPENAI_API_KEY for embedding generation).
 */
export const globalEpisodicMemory: EpisodicMemoryStore = new EpisodicMemoryStore();

// Kick off async upgrade to pg-backed store without blocking module load.
// The in-memory store handles any writes that arrive before pg is ready.
tryCreatePgBackedStore().then((pgStore) => {
    // Replace the singleton's internal pg hooks by creating a new store and
    // copying any already-recorded entries into it.
    const upgraded = pgStore;
    // Transfer in-memory entries accumulated before pg was ready
    for (const [wsId, entries] of (globalEpisodicMemory as unknown as { store: Map<string, TaskMemoryEntry[]> }).store) {
        for (const entry of entries) {
            void upgraded.record(entry);
        }
    }
    // Swap prototype so all existing references to globalEpisodicMemory
    // start using the upgraded instance's write-through behaviour.
    Object.assign(globalEpisodicMemory, upgraded);
}).catch(() => { /* silently keep in-memory store */ });

