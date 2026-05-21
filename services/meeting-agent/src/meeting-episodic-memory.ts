/**
 * Per-speaker episodic memory for the meeting agent.
 *
 * Records participant↔agent exchange pairs keyed by a speaker identifier
 * (typically the speaker's display name or a normalized email/ID).  The
 * brain can retrieve recent exchanges before calling `think()` so it
 * remembers what was discussed with a particular participant across
 * multiple turns or future meetings.
 *
 * Default: pure in-process ring buffer (lives for the lifetime of the
 * process).  Drop-in pg backend hooks are available for cross-restart
 * durability when a Postgres connection is available.
 */

export interface PastExchange {
    /** Normalized speaker key (lower-cased). */
    speakerKey: string;
    /** What the participant said. */
    participantText: string;
    /** What the agent replied. */
    agentReply: string;
    /** Unix timestamp (ms). */
    ts: number;
}

/** Write a single exchange to a durable backend. */
export type MemoryWriteFn = (exchange: PastExchange) => Promise<void>;

/**
 * Read the N most-recent exchanges for a speaker from a durable backend.
 * Must return entries in most-recent-first order.
 */
export type MemoryReadFn = (speakerKey: string, limit: number) => Promise<PastExchange[]>;

const MAX_PER_SPEAKER = 50;
const DEFAULT_RECALL_LIMIT = 5;

/**
 * In-process per-speaker episodic memory store.
 * One instance should be shared across all sessions in a meeting-agent process.
 */
export class MeetingEpisodicMemory {
    private readonly store = new Map<string, PastExchange[]>();
    private readonly pgWrite?: MemoryWriteFn;
    private readonly pgRead?: MemoryReadFn;

    constructor(opts?: { pgWrite?: MemoryWriteFn; pgRead?: MemoryReadFn }) {
        this.pgWrite = opts?.pgWrite;
        this.pgRead = opts?.pgRead;
    }

    /**
     * Record a participant↔agent exchange.  Best-effort write-through to the
     * pg backend when configured; never throws on backend failure.
     */
    record(speakerKey: string, participantText: string, agentReply: string, ts = Date.now()): void {
        if (!speakerKey.trim()) return;
        const key = speakerKey.trim().toLowerCase();
        if (!this.store.has(key)) {
            this.store.set(key, []);
        }
        const bucket = this.store.get(key)!;
        const exchange: PastExchange = { speakerKey: key, participantText, agentReply, ts };
        bucket.push(exchange);
        if (bucket.length > MAX_PER_SPEAKER) {
            bucket.splice(0, bucket.length - MAX_PER_SPEAKER);
        }
        if (this.pgWrite) {
            this.pgWrite(exchange).catch(() => {
                // Best-effort — never block execution on memory write failure
            });
        }
    }

    /**
     * Return the N most-recent exchanges for a speaker.
     * Prefers pg when configured (cross-restart durability), then falls back
     * to the in-process ring buffer.
     */
    async recall(speakerKey: string, limit = DEFAULT_RECALL_LIMIT): Promise<PastExchange[]> {
        if (!speakerKey.trim()) return [];
        const key = speakerKey.trim().toLowerCase();
        if (this.pgRead) {
            try {
                const pgEntries = await this.pgRead(key, limit);
                if (pgEntries.length > 0) return pgEntries;
            } catch {
                // Fall through to in-process store
            }
        }
        const bucket = this.store.get(key) ?? [];
        return bucket.slice(-limit).reverse();
    }

    /**
     * Build a concise text block summarising past exchanges for injection
     * into the LLM system prompt.  Returns empty string when no history exists.
     */
    async buildContextBlock(speakerKey: string, limit = DEFAULT_RECALL_LIMIT): Promise<string> {
        const exchanges = await this.recall(speakerKey, limit);
        if (exchanges.length === 0) return '';
        const label = speakerKey.trim() || 'this participant';
        const lines = exchanges.map((e) => {
            const ts = new Date(e.ts).toISOString().slice(0, 16);
            const said = e.participantText.length > 120
                ? `${e.participantText.slice(0, 120)}…`
                : e.participantText;
            const replied = e.agentReply.length > 120
                ? `${e.agentReply.slice(0, 120)}…`
                : e.agentReply;
            return `[${ts}] ${label}: "${said}" → agent: "${replied}"`;
        });
        return [
            `=== Past exchanges with ${label} (${exchanges.length} shown) ===`,
            ...lines,
            '=== End past exchanges ===',
        ].join('\n');
    }

    /** Remove all in-process entries for a speaker (e.g. right-to-be-forgotten). */
    clear(speakerKey: string): void {
        if (!speakerKey.trim()) return;
        this.store.delete(speakerKey.trim().toLowerCase());
    }

    /** Return the in-process entry count for a speaker. */
    entryCount(speakerKey: string): number {
        if (!speakerKey.trim()) return 0;
        return this.store.get(speakerKey.trim().toLowerCase())?.length ?? 0;
    }
}
