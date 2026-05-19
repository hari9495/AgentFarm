/**
 * Test setup: mocks Cloudflare context with a D1-compatible wrapper backed by
 * the local Node.js DatabaseSync SQLite API.
 *
 * Imported via --import ./tests/cloudflare-setup.mts in every tsx --test command.
 */
import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const DB_PATH =
    process.env["WEBSITE_AUTH_DB_PATH"] ?? resolve(__dirname, "../.auth.sqlite");

if (!existsSync(DB_PATH)) {
    console.error(`[cloudflare-setup] SQLite DB not found at ${DB_PATH}. Run migrations first.`);
    // Allow tests to import; they will fail with a clear error from DatabaseSync
}

const _db = new DatabaseSync(DB_PATH, { open: existsSync(DB_PATH) });

/**
 * Creates a D1-compatible async wrapper around a DatabaseSync instance.
 * Satisfies the interface used by auth-store.ts against Cloudflare D1.
 */
function makeD1Mock(db: DatabaseSync) {
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
                    const row = db.prepare(query).get(...(_bindings as [])) as
                        | T
                        | undefined;
                    if (row == null) return null;
                    if (colName)
                        return (row as Record<string, unknown>)[colName] as T;
                    return row;
                },
                async run(): Promise<{
                    meta: { changes: number; last_row_id: number | bigint };
                    success: boolean;
                    results: [];
                }> {
                    const r = db
                        .prepare(query)
                        .run(...(_bindings as []));
                    return {
                        meta: {
                            changes: r.changes,
                            last_row_id: r.lastInsertRowid,
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

// Inject the mock into the global Cloudflare context slot
const cloudflareContextSymbol = Symbol.for("__cloudflare-context__");
(globalThis as unknown as Record<symbol, unknown>)[cloudflareContextSymbol] = {
    env: { DB: makeD1Mock(_db) },
    ctx: {
        waitUntil: (_p: Promise<unknown>) => {
            /* no-op in tests */
        },
        passThroughOnException: () => {
            /* no-op in tests */
        },
    },
    cf: {},
};
