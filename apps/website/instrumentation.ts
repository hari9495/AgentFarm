/**
 * Next.js instrumentation file — runs once during server startup.
 *
 * When the website is started with `next start` (Node.js runtime, not Cloudflare
 * Workers), the `__cloudflare-context__` global is absent, which causes every
 * call to `getCloudflareContext().env.DB` in auth-store.ts to throw, returning
 * HTTP 500.
 *
 * If the environment variable WEBSITE_AUTH_DB_PATH is set, this file injects a
 * D1-compatible SQLite stub into the global so that auth routes work in the
 * Node.js runtime (e.g. during e2e smoke tests or local development without
 * wrangler).
 *
 * This injection is intentionally guarded behind the env var so it is never
 * active in production Cloudflare Workers deployments, where the real context is
 * already present.
 */

export async function register() {
    const ctxKey = Symbol.for("__cloudflare-context__");
    const g = globalThis as Record<symbol, unknown>;

    // Skip if the real Cloudflare context is already populated.
    if (g[ctxKey] != null) {
        return;
    }

    const dbPath = process.env["WEBSITE_AUTH_DB_PATH"];
    if (!dbPath) {
        // No fallback requested — leave context unpopulated.
        return;
    }

    try {
        const { DatabaseSync } = await import("node:sqlite");
        const { existsSync } = await import("node:fs");

        if (!existsSync(dbPath)) {
            console.warn(
                `[instrumentation] WEBSITE_AUTH_DB_PATH set but file not found at ${dbPath}; auth routes will error.`,
            );
            return;
        }

        const db = new DatabaseSync(dbPath);

        g[ctxKey] = {
            env: { DB: makeSqliteD1Mock(db) },
            ctx: {
                waitUntil: (_p: Promise<unknown>) => { /* no-op outside Workers */ },
                passThroughOnException: () => { /* no-op outside Workers */ },
            },
            cf: {},
        };

        console.log(`[instrumentation] D1 SQLite fallback active (${dbPath})`);
    } catch (err) {
        // Non-fatal: if node:sqlite is unavailable (Edge runtime, older Node) skip.
        console.warn("[instrumentation] Could not set up SQLite D1 fallback:", err);
    }
}

function makeSqliteD1Mock(db: import("node:sqlite").DatabaseSync) {
    return {
        prepare(query: string) {
            let _bindings: unknown[] = [];
            const stmt = {
                bind(...values: unknown[]) {
                    _bindings = values;
                    return stmt;
                },
                async first<T = Record<string, unknown>>(
                    colName?: string,
                ): Promise<T | null> {
                    const row = db
                        .prepare(query)
                        .get(...(_bindings as [])) as T | undefined;
                    if (row == null) return null;
                    if (colName) {
                        return (row as Record<string, unknown>)[colName] as T;
                    }
                    return row;
                },
                async run(): Promise<{
                    meta: { changes: number; last_row_id: number };
                    success: boolean;
                    results: [];
                }> {
                    const r = db
                        .prepare(query)
                        .run(...(_bindings as []));
                    return {
                        meta: {
                            changes: Number(r.changes),
                            last_row_id: Number(r.lastInsertRowid),
                        },
                        success: true,
                        results: [],
                    };
                },
                async all<T = Record<string, unknown>>(): Promise<{
                    results: T[];
                    success: boolean;
                    meta: { changes: number };
                }> {
                    const results = db
                        .prepare(query)
                        .all(...(_bindings as [])) as T[];
                    return { results, success: true, meta: { changes: 0 } };
                },
            };
            return stmt;
        },
    };
}
