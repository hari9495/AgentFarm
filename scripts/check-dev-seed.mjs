#!/usr/bin/env node
// Check whether the dev seed records exist and optionally create them.
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const prismaPath = path.resolve(__dirname, '../apps/api-gateway/node_modules/@prisma/client/index.js');
const { PrismaClient } = await import(pathToFileURL(prismaPath).href);
const prisma = new PrismaClient();

const tenant = await prisma.tenant.findUnique({ where: { id: 'tenant_acme_001' } });
console.log('tenant_acme_001:', JSON.stringify(tenant));

const ws = await prisma.workspace.findUnique({ where: { id: 'ws_primary_001' } });
console.log('ws_primary_001:', JSON.stringify(ws));

const bot = await prisma.bot.findUnique({ where: { id: 'bot_dev_001' } });
console.log('bot_dev_001:', JSON.stringify(bot));

await prisma.$disconnect();
