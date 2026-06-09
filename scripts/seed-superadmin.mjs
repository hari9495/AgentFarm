/**
 * Wipes all test/fake tenants & portal accounts, then creates one clean
 * owner account for AgentFarms production use.
 *
 * Run from repo root:
 *   node --env-file=.env scripts/seed-superadmin.mjs
 */

import { scrypt, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const scryptAsync = promisify(scrypt);

async function hashPassword(password) {
    const salt = randomBytes(32).toString('hex');
    const derivedKey = await scryptAsync(password, salt, 64);
    return `scrypt:${salt}:${derivedKey.toString('hex')}`;
}

// ── Config ────────────────────────────────────────────────────────────────────

const TENANT_ID    = 'agentfarms';
const TENANT_NAME  = 'AgentFarms';
const EMAIL        = 'admin@agentfarms.in';
const PASSWORD     = 'AgentFarms@2025';
const DISPLAY_NAME = 'Super Admin';

// ── Load Prisma client ────────────────────────────────────────────────────────

const { PrismaClient } = await import(
    path.resolve(__dirname, '../packages/db-schema/node_modules/@prisma/client/index.js')
).catch(() => import('@prisma/client'));

const prisma = new PrismaClient();

try {
    console.log('--- Cleaning fake/test data ---');

    // Delete sessions first (FK)
    const delSessions = await prisma.tenantPortalSession.deleteMany();
    console.log(`  Deleted ${delSessions.count} portal sessions`);

    // Delete accounts
    const delAccounts = await prisma.tenantPortalAccount.deleteMany();
    console.log(`  Deleted ${delAccounts.count} portal accounts`);

    // Delete password reset tokens if model exists
    try {
        const delTokens = await prisma.tenantPasswordResetToken.deleteMany();
        console.log(`  Deleted ${delTokens.count} password reset tokens`);
    } catch { /* model may not exist */ }

    // Delete all tenants (cascades or FK-ordered above)
    const delTenants = await prisma.tenant.deleteMany();
    console.log(`  Deleted ${delTenants.count} tenants`);

    console.log('');
    console.log('--- Creating clean tenant + super admin ---');

    // Create tenant
    await prisma.tenant.upsert({
        where: { id: TENANT_ID },
        create: { id: TENANT_ID, name: TENANT_NAME, status: 'ready' },
        update: { name: TENANT_NAME, status: 'ready' },
    });
    console.log(`  Tenant: ${TENANT_ID} (${TENANT_NAME})`);

    // Hash password
    console.log('  Hashing password…');
    const passwordHash = await hashPassword(PASSWORD);

    // Create owner account (pre-verified so they can log in immediately)
    const account = await prisma.tenantPortalAccount.upsert({
        where: { tenantId_email: { tenantId: TENANT_ID, email: EMAIL } },
        create: {
            tenantId: TENANT_ID,
            email: EMAIL,
            passwordHash,
            displayName: DISPLAY_NAME,
            role: 'owner',
            isActive: true,
            isEmailVerified: true,
            emailVerifiedAt: new Date(),
        },
        update: {
            passwordHash,
            displayName: DISPLAY_NAME,
            role: 'owner',
            isActive: true,
            isEmailVerified: true,
            emailVerifiedAt: new Date(),
        },
    });
    console.log(`  Account: ${EMAIL} (id: ${account.id})`);

    console.log('');
    console.log('=================================================');
    console.log('  LOGIN DETAILS');
    console.log('  URL:       https://agentfarms.in/portal/login');
    console.log(`  Tenant ID: ${TENANT_ID}`);
    console.log(`  Email:     ${EMAIL}`);
    console.log(`  Password:  ${PASSWORD}`);
    console.log('=================================================');

} finally {
    await prisma.$disconnect();
}
