#!/usr/bin/env node
/**
 * scripts/seed-dev.mjs
 *
 * Seeds the database with the minimal dev records required by the dashboard
 * and the internal dev session token:
 *   tenant_acme_001 → ws_primary_001 → bot_dev_001
 *
 * Safe to run multiple times (upsert / skip-if-exists).
 *
 * Usage:
 *   node --env-file=apps/api-gateway/.env scripts/seed-dev.mjs
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const prismaPath = path.resolve(__dirname, '../apps/api-gateway/node_modules/@prisma/client/index.js');
const { PrismaClient } = await import(pathToFileURL(prismaPath).href);
const prisma = new PrismaClient();

try {
    // ── Tenant ─────────────────────────────────────────────────────────────
    const tenant = await prisma.tenant.upsert({
        where: { id: 'tenant_acme_001' },
        create: { id: 'tenant_acme_001', name: 'Acme Corp (dev)', status: 'ready' },
        update: {},
    });
    console.log('✓ tenant:', tenant.id, tenant.name);

    // ── Workspace ──────────────────────────────────────────────────────────
    const workspace = await prisma.workspace.upsert({
        where: { id: 'ws_primary_001' },
        create: { id: 'ws_primary_001', tenantId: 'tenant_acme_001', name: 'Primary Dev Workspace', status: 'ready' },
        update: {},
    });
    console.log('✓ workspace:', workspace.id, workspace.name);

    // ── Bot ────────────────────────────────────────────────────────────────
    const bot = await prisma.bot.upsert({
        where: { id: 'bot_dev_001' },
        create: { id: 'bot_dev_001', workspaceId: 'ws_primary_001', role: 'developer', status: 'active' },
        update: {},
    });
    console.log('✓ bot:', bot.id, bot.role, bot.status);

    // ── User ───────────────────────────────────────────────────────────────
    // Backs the synthetic `dev-user-001` session minted by /api/dev-login —
    // without a matching TenantUser row, /v1/auth/me 404s and pages like
    // /account bounce back to the dashboard home.
    const user = await prisma.tenantUser.upsert({
        where: { id: 'dev-user-001' },
        create: {
            id: 'dev-user-001',
            tenantId: 'tenant_acme_001',
            email: 'dev@acme.test',
            name: 'Dev Admin',
            role: 'admin',
        },
        update: {},
    });
    console.log('✓ user:', user.id, user.email, user.role);

    console.log('\nSeed complete.');
} catch (err) {
    console.error('Seed failed:', err);
    process.exitCode = 1;
} finally {
    await prisma.$disconnect();
}
