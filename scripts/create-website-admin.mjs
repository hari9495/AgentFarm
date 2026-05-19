import { DatabaseSync } from 'node:sqlite';
import { webcrypto } from 'node:crypto';

// Use Web Crypto (same as website auth-store.ts uses PBKDF2)
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

const [, , email, name, company, password] = process.argv;

if (!email || !name || !company || !password) {
    console.error('Usage: node scripts/create-website-admin.mjs <email> <name> <company> <password>');
    process.exit(1);
}

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
).run(userId, email, name, company, 'admin', passwordHash, now);

console.log(`✅ Created customer admin user:`);
console.log(`   id:       ${userId}`);
console.log(`   email:    ${email}`);
console.log(`   name:     ${name}`);
console.log(`   company:  ${company}`);
console.log(`   role:     admin`);
db.close();
