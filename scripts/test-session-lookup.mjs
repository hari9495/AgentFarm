import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('d:/AgentFarm/apps/website/.auth.sqlite');

// Get the most recent session for the customer user
const sessions = db.prepare('SELECT id, token_hash, expires_at FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 3').all('usr_785f3a5bca93eb89876e');
console.log('Most recent sessions:', sessions.map(s => ({ id: s.id, hash: s.token_hash?.substring(0, 16) + '...', expired: Number(s.expires_at) <= Date.now() })));

// Try the exact JOIN query used by getSessionUser
const tokenHash = sessions[0].token_hash;
const row = db.prepare(`
  SELECT sessions.id AS session_id, sessions.expires_at AS expires_at, users.id AS user_id, users.email AS email, users.role AS role
  FROM sessions
  INNER JOIN users ON users.id = sessions.user_id
  WHERE sessions.token_hash = ?
`).get(tokenHash);

console.log('Session JOIN lookup:', row ? `FOUND: ${row.email} (${row.role})` : 'NOT FOUND');
console.log('Expires at:', row ? new Date(Number(row.expires_at)).toISOString() : 'N/A');
console.log('Current time:', new Date().toISOString());
