export type RateLimitResult = {
    allowed: boolean;
    remaining: number;
    reset_at: number; // unix ms
    consumed: number;
};

type WindowEntry = {
    timestamps: number[];
    limit: number;
    window_ms: number;
};

type SkillLimit = {
    limit: number;
    window_ms: number;
};

const DEFAULT_LIMIT = 100;
const DEFAULT_WINDOW_MS = 60_000;

export class WorkspaceRateLimiter {
    private readonly windows = new Map<string, WindowEntry>();
    private readonly skillOverrides = new Map<string, SkillLimit>();

    constructor(
        private readonly defaultLimit = DEFAULT_LIMIT,
        private readonly defaultWindowMs = DEFAULT_WINDOW_MS,
    ) { }

    setSkillLimit(skillId: string, limit: number, windowMs = DEFAULT_WINDOW_MS): void {
        this.skillOverrides.set(skillId, { limit, window_ms: windowMs });
    }

    check(workspaceId: string, skillId: string): RateLimitResult {
        const key = `${workspaceId}::${skillId}`;
        const override = this.skillOverrides.get(skillId);
        const limit = override?.limit ?? this.defaultLimit;
        const window_ms = override?.window_ms ?? this.defaultWindowMs;
        const now = Date.now();
        const cutoff = now - window_ms;

        let entry = this.windows.get(key);
        if (!entry) {
            entry = { timestamps: [], limit, window_ms };
            this.windows.set(key, entry);
        }

        // Prune old timestamps
        entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

        const consumed = entry.timestamps.length;
        const remaining = Math.max(0, limit - consumed);
        const oldest = entry.timestamps[0] ?? now;
        const reset_at = oldest + window_ms;

        return {
            allowed: consumed < limit,
            remaining,
            reset_at,
            consumed,
        };
    }

    consume(workspaceId: string, skillId: string): RateLimitResult {
        const key = `${workspaceId}::${skillId}`;
        const override = this.skillOverrides.get(skillId);
        const limit = override?.limit ?? this.defaultLimit;
        const window_ms = override?.window_ms ?? this.defaultWindowMs;
        const now = Date.now();
        const cutoff = now - window_ms;

        let entry = this.windows.get(key);
        if (!entry) {
            entry = { timestamps: [], limit, window_ms };
            this.windows.set(key, entry);
        }

        entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

        const before = entry.timestamps.length;
        const allowed = before < limit;
        if (allowed) {
            entry.timestamps.push(now);
        }

        const consumed = entry.timestamps.length;
        const remaining = Math.max(0, limit - consumed);
        const oldest = entry.timestamps[0] ?? now;
        const reset_at = oldest + window_ms;

        return { allowed, remaining, reset_at, consumed };
    }

    resetWorkspace(workspaceId: string): void {
        for (const key of this.windows.keys()) {
            if (key.startsWith(`${workspaceId}::`)) {
                this.windows.delete(key);
            }
        }
    }

    resetSkill(workspaceId: string, skillId: string): void {
        this.windows.delete(`${workspaceId}::${skillId}`);
    }

    getUsage(workspaceId: string, skillId: string): { consumed: number; limit: number } {
        const key = `${workspaceId}::${skillId}`;
        const override = this.skillOverrides.get(skillId);
        const limit = override?.limit ?? this.defaultLimit;
        const window_ms = override?.window_ms ?? this.defaultWindowMs;
        const now = Date.now();
        const cutoff = now - window_ms;
        const entry = this.windows.get(key);
        const consumed = entry ? entry.timestamps.filter((t) => t > cutoff).length : 0;
        return { consumed, limit };
    }

    listWorkspaceUsage(workspaceId: string): Array<{ skill_id: string; consumed: number; limit: number }> {
        const results: Array<{ skill_id: string; consumed: number; limit: number }> = [];
        for (const key of this.windows.keys()) {
            if (key.startsWith(`${workspaceId}::`)) {
                const skill_id = key.slice(workspaceId.length + 2);
                results.push({ skill_id, ...this.getUsage(workspaceId, skill_id) });
            }
        }
        return results;
    }

    // Used in tests
    _reset(): void {
        this.windows.clear();
        this.skillOverrides.clear();
    }
}

export const globalRateLimiter = new WorkspaceRateLimiter();
