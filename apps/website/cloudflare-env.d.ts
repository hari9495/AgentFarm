// Cloudflare D1 and Worker environment bindings
// Referenced by lib/auth-store.ts via getRequestContext().env

// Minimal D1 type definitions (avoids importing full workers-types which conflicts with DOM lib)
interface D1Result<T = Record<string, unknown>> {
    results: T[];
    success: boolean;
    meta: {
        changes?: number;
        last_row_id?: number;
        duration?: number;
        [key: string]: unknown;
    };
}

interface D1PreparedStatement {
    bind(...values: unknown[]): D1PreparedStatement;
    first<T = Record<string, unknown>>(colName?: string): Promise<T | null>;
    run(): Promise<D1Result<Record<string, unknown>>>;
    all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
    raw<T = unknown[]>(): Promise<T[]>;
}

interface D1Database {
    prepare(query: string): D1PreparedStatement;
    dump(): Promise<ArrayBuffer>;
    batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
    exec(query: string): Promise<D1Result>;
}

interface CloudflareEnv {
    DB: D1Database;
}

// Restore DOM-compatible fetch json() return type that is overridden by
// @cloudflare/workers-types (pulled in by @cloudflare/next-on-pages).
// Workers-types declares json<T>(): Promise<T> which resolves to Promise<unknown>
// when no type parameter is given; restore the DOM any-typed version.
interface Body {
    json(): Promise<any>;
    json<T = any>(): Promise<T>;
}
