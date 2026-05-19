/**
 * End-to-end test: simulates what the Next.js server does
 * when processing a login and then a dashboard request.
 */

import { DatabaseSync } from 'node:sqlite';

// 1. Set up the same globalThis context as instrumentation.ts
const ctxKey = Symbol.for('__cloudflare-context__');
const db = new DatabaseSync('d:/AgentFarm/apps/website/.auth.sqlite');

// Replicate makeSqliteD1Mock from instrumentation.ts
const mockD1 = {
    prepare(query) {
        let _bindings = [];
        const stmt = {
            bind(...values) {
                _bindings = values;
                return stmt;
            },
            async first(colName) {
                const row = db.prepare(query).get(..._bindings);
                if (row == null) return null;
                if (colName) return row[colName];
                return row;
            },
            async run() {
                const r = db.prepare(query).run(..._bindings);
                return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) }, success: true, results: [] };
            },
            async all() {
                const results = db.prepare(query).all(..._bindings);
                return { results, success: true, meta: { changes: 0 } };
            },
        };
        return stmt;
    },
};

globalThis[ctxKey] = {
    env: { DB: mockD1 },
    ctx: { waitUntil: () => { }, passThroughOnException: () => { } },
    cf: {},
};

console.log('GlobalThis context set up.');

// 2. Now test the hash function (same as in auth-store.ts)
const hashToken = async (token) => {
    const data = new TextEncoder().encode(token);
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer), (b) => b.toString(16).padStart(2, '0')).join('');
};

// 3. Get most recent session for customer user
const sessions = db.prepare(
    'SELECT id, token_hash, expires_at FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1'
).all('usr_785f3a5bca93eb89876e');

if (sessions.length === 0) {
    console.error('ERROR: No sessions found!');
    process.exit(1);
}

const latestSession = sessions[0];
console.log('Most recent session ID:', latestSession.id);
console.log('Session hash (first 16):', latestSession.token_hash.substring(0, 16) + '...');
console.log('Expires at:', new Date(Number(latestSession.expires_at)).toISOString());

// 4. Verify the mock D1 can find the session
const row = await mockD1.prepare(
    `SELECT sessions.id AS session_id, sessions.expires_at AS expires_at,
            users.id AS user_id, users.email AS email, users.name AS name, users.role AS role
     FROM sessions
     INNER JOIN users ON users.id = sessions.user_id
     WHERE sessions.token_hash = ?`
).bind(latestSession.token_hash).first();

console.log('\nMock D1 lookup result:', row ? `FOUND: ${row.email} (${row.role})` : 'NOT FOUND');

// 5. Test a FRESH createSession → getSessionUser cycle
console.log('\n--- Testing fresh session creation ---');

// Simulate createSession
const randomBase64url = (bytes) => {
    const arr = new Uint8Array(bytes);
    globalThis.crypto.getRandomValues(arr);
    return btoa(String.fromCharCode(...arr)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const randomHex = (bytes) => {
    const arr = new Uint8Array(bytes);
    globalThis.crypto.getRandomValues(arr);
    return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
};

const sessionId = `ses_test_${randomHex(8)}`;
const sessionToken = randomBase64url(48);
const tokenHash = await hashToken(sessionToken);
const now = Date.now();
const expiresAt = now + 8 * 60 * 60 * 1000;

console.log('Created token (first 20):', sessionToken.substring(0, 20) + '...');
console.log('Token hash (first 16):', tokenHash.substring(0, 16) + '...');

// Insert the session
await mockD1.prepare(
    `INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)`
).bind(sessionId, 'usr_785f3a5bca93eb89876e', tokenHash, expiresAt, now, now).run();

console.log('Session inserted!');

// Now look it up (simulating getSessionUser)
const lookupHash = await hashToken(sessionToken);
console.log('Lookup hash matches insert hash:', lookupHash === tokenHash);

const found = await mockD1.prepare(
    `SELECT sessions.id AS session_id, sessions.expires_at AS expires_at,
            users.id AS user_id, users.email AS email, users.name AS name, users.role AS role
     FROM sessions INNER JOIN users ON users.id = sessions.user_id
     WHERE sessions.token_hash = ?`
).bind(lookupHash).first();

console.log('Lookup result:', found ? `FOUND: ${found.email} (${found.role})` : 'NOT FOUND');

// Check expires_at comparison
if (found) {
    const expiresAtNum = Number(found.expires_at);
    console.log('Expires at (number):', expiresAtNum);
    console.log('Now:', Date.now());
    console.log('Not expired:', expiresAtNum > Date.now());
}

// Cleanup
db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
console.log('\nTest session cleaned up.');
