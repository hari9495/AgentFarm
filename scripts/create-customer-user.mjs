/**
 * create-customer-user.mjs — seeds the WEBSITE account store (SQLite/D1).
 *
 * ⚠️  READ THIS BEFORE USING FOR "customer login": there are TWO auth surfaces
 *     (see apps/website/AUTH.md). This script writes to the website's own
 *     `users` table (SQLite local / Cloudflare D1 in prod), which backs signup,
 *     the /admin console, onboarding, and `/api/auth/login`.
 *
 *     It does NOT create a customer-DASHBOARD (portal) login. The portal
 *     dashboard at /dashboard authenticates via `/api/portal/auth/*` against
 *     the gateway's Postgres `TenantPortalAccount`. To seed THAT, set a
 *     password on a TenantPortalAccount row in Postgres (see AUTH.md).
 *
 * Despite the name, this is a website-account seeder, not a portal seeder.
 */
import { DatabaseSync } from 'node:sqlite';
import { webcrypto } from 'node:crypto';

const crypto = webcrypto;

function randomHex(bytes) {
    const arr = new Uint8Array(bytes);
    crypto.getRandomValues(arr);
    return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(password) {
    const enc = new TextEncoder();
    const salt = randomHex(32);
    const keyMaterial = await crypto.subtle.importKey(
        'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']
    );
    const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' },
        keyMaterial, 256
    );
    const hash = Array.from(new Uint8Array(bits), b => b.toString(16).padStart(2, '0')).join('');
    return `pbkdf2:${salt}:${hash}`;
}

const email = 'customer@acme.com';
const name = 'Acme Admin';
const company = 'Acme Corp';
const password = 'Customer@1234';
const role = 'member';

const db = new DatabaseSync('d:/AgentFarm/apps/website/.auth.sqlite');

const existing = db.prepare('SELECT id, email, role FROM users WHERE email = ?').get(email);
if (existing) {
    console.log(`User already exists: ${existing.email} (id: ${existing.id}, role: ${existing.role})`);
    db.close();
    process.exit(0);
}

const passwordHash = await hashPassword(password);
const userId = `usr_${randomHex(10)}`;
const now = Math.floor(Date.now() / 1000);

db.prepare(
    `INSERT INTO users (id, email, name, company, role, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
).run(userId, email, name, company, role, passwordHash, now);

console.log('✅ Created customer portal user:');
console.log(`   id:       ${userId}`);
console.log(`   email:    ${email}`);
console.log(`   password: ${password}`);
console.log(`   name:     ${name}`);
console.log(`   company:  ${company}`);
console.log(`   role:     ${role}`);
db.close();
