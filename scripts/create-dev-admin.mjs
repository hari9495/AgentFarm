#!/usr/bin/env node
/**
 * scripts/create-dev-admin.mjs
 *
 * Creates a dev admin user in the database.
 * Usage:
 *   node --env-file=apps/api-gateway/.env scripts/create-dev-admin.mjs <email> <name> <password>
 *
 * Example:
 *   node --env-file=apps/api-gateway/.env scripts/create-dev-admin.mjs hari.m@yukthixconsulting.com "Hari M" "YourPassword123"
 */

import { scrypt, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const scryptAsync = promisify(scrypt);

async function hashPassword(password) {
    const salt = randomBytes(32).toString('hex');
    const derivedKey = await scryptAsync(password, salt, 64);
    return `scrypt:${salt}:${derivedKey.toString('hex')}`;
}

const [, , email, name, password] = process.argv;

if (!email || !name || !password) {
    console.error('Usage: node --env-file=apps/api-gateway/.env scripts/create-dev-admin.mjs <email> <name> <password>');
    process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
    console.error('DATABASE_URL not set. Run with --env-file=apps/api-gateway/.env');
    process.exit(1);
}

// Dynamically import PrismaClient — resolved from api-gateway's node_modules
const prismaClientPath = path.resolve(__dirname, '../apps/api-gateway/node_modules/@prisma/client/index.js');
const { PrismaClient } = await import(pathToFileURL(prismaClientPath).href);
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

try {
    // Check if user already exists
    const existing = await prisma.tenantUser.findUnique({ where: { email } });
    if (existing) {
        console.log(`User ${email} already exists (id: ${existing.id}). Skipping creation.`);
        process.exit(0);
    }

    // Create a tenant for this admin if one doesn't exist with the same name
    const tenantName = `Dev Tenant — ${name}`;
    let tenant = await prisma.tenant.findFirst({ where: { name: tenantName } });
    if (!tenant) {
        tenant = await prisma.tenant.create({
            data: { name: tenantName, status: 'ready' },
        });
        console.log(`Created tenant: ${tenant.id} (${tenantName})`);
    }

    const passwordHash = await hashPassword(password);

    const user = await prisma.tenantUser.create({
        data: {
            tenantId: tenant.id,
            email,
            name,
            passwordHash,
            role: 'admin',
        },
    });

    console.log(`✅ Created admin user:`);
    console.log(`   id:    ${user.id}`);
    console.log(`   email: ${user.email}`);
    console.log(`   role:  ${user.role}`);
    console.log(`\nYou can now log in at http://localhost:3001/login (or the dashboard port).`);
} catch (err) {
    console.error('Failed to create user:', err.message);
    process.exit(1);
} finally {
    await prisma.$disconnect();
}
