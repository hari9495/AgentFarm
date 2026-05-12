#!/usr/bin/env node
// af — AgentFarm CLI

import { AgentFarmClient } from '@agentfarm/sdk';
import { loadConfig } from './config.js';
import { printTable, printJson, printError, printSuccess } from './output.js';

// ── Arg parsing ───────────────────────────────────────────────────────────────

function flag(args: string[], name: string): string | null {
    const idx = args.indexOf(name);
    if (idx !== -1 && idx + 1 < args.length) return args[idx + 1]!;
    return null;
}

function hasFlag(args: string[], name: string): boolean {
    return args.includes(name);
}

function positional(args: string[], pos: number): string | null {
    return args[pos] ?? null;
}

// ── Commands ──────────────────────────────────────────────────────────────────

async function agentsListCmd(args: string[], client: AgentFarmClient): Promise<void> {
    const workspaceId = flag(args, '--workspace-id') ?? undefined;
    const { bots } = await client.agents.list({ workspaceId });
    printTable(
        bots.map((b) => ({ ID: b.id, Role: b.role, Status: b.status, Workspace: b.workspaceId })),
        ['ID', 'Role', 'Status', 'Workspace'],
    );
}

async function agentsGetCmd(args: string[], client: AgentFarmClient): Promise<void> {
    const botId = positional(args, 0);
    if (!botId) { printError('Usage: af agents get <botId>'); process.exit(1); }
    const bot = await client.agents.get(botId);
    printJson(bot);
}

async function analyticsPerformanceCmd(args: string[], client: AgentFarmClient): Promise<void> {
    const tenantId = flag(args, '--tenant-id');
    if (!tenantId) { printError('--tenant-id is required'); process.exit(1); }
    const from = flag(args, '--from') ?? undefined;
    const to = flag(args, '--to') ?? undefined;
    const result = await client.analytics.agentPerformance({ tenantId, from, to });
    printJson(result);
}

async function analyticsCostCmd(args: string[], client: AgentFarmClient): Promise<void> {
    const tenantId = flag(args, '--tenant-id');
    if (!tenantId) { printError('--tenant-id is required'); process.exit(1); }
    const from = flag(args, '--from') ?? undefined;
    const to = flag(args, '--to') ?? undefined;
    const result = await client.analytics.costSummary({ tenantId, from, to });
    printJson(result);
}

async function messagesInboxCmd(args: string[], client: AgentFarmClient): Promise<void> {
    const botId = positional(args, 0);
    if (!botId) { printError('Usage: af messages inbox <botId>'); process.exit(1); }
    const limit = flag(args, '--limit') ? Number(flag(args, '--limit')) : undefined;
    const messages = await client.messages.inbox(botId, { limit });
    printTable(
        messages.map((m) => ({ ID: m.id, From: m.fromBotId, Type: m.messageType, Status: m.status, Subject: m.subject ?? m.body.slice(0, 40) })),
        ['ID', 'From', 'Type', 'Status', 'Subject'],
    );
}

async function messagesSendCmd(args: string[], client: AgentFarmClient): Promise<void> {
    const fromBotId = positional(args, 0);
    if (!fromBotId) { printError('Usage: af messages send <fromBotId> --to <toBotId> --type <type> --body <body>'); process.exit(1); }
    const toBotId = flag(args, '--to');
    const type = flag(args, '--type');
    const body = flag(args, '--body');
    if (!toBotId || !type || !body) { printError('--to, --type, and --body are all required'); process.exit(1); }
    const validTypes = ['QUESTION', 'ANSWER', 'RESULT', 'STATUS_UPDATE', 'HANDOFF_REQUEST', 'HANDOFF_ACCEPT', 'HANDOFF_REJECT', 'BROADCAST'] as const;
    if (!(validTypes as readonly string[]).includes(type)) {
        printError(`Invalid message type. Must be one of: ${validTypes.join(', ')}`);
        process.exit(1);
    }
    const subject = flag(args, '--subject') ?? undefined;
    const message = await client.messages.send(fromBotId, {
        toBotId,
        messageType: type as typeof validTypes[number],
        body,
        subject,
    });
    printSuccess(`Message sent: ${message.id}`);
    printJson(message);
}

// ── Help ──────────────────────────────────────────────────────────────────────

function printHelp(): void {
    console.log(`
af — AgentFarm CLI

USAGE
  af <command> [subcommand] [options]

COMMANDS
  agents list [--workspace-id <id>]                         List agents
  agents get <botId>                                        Get a single agent
  analytics performance --tenant-id <id> [--from] [--to]   Agent performance
  analytics cost --tenant-id <id> [--from] [--to]          Cost summary
  messages inbox <botId> [--limit <n>]                      Inbox messages
  messages send <fromBotId> --to <toBotId> --type <type> --body <body>
                            [--subject <text>]              Send a message

ENVIRONMENT
  AF_BASE_URL       API Gateway URL (default: http://localhost:3000)
  AF_TOKEN          Bearer token for authentication
  AF_TENANT_ID      Default tenant ID
`);
}

// ── Router ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    const argv = process.argv.slice(2);

    if (argv.length === 0 || hasFlag(argv, '--help') || hasFlag(argv, '-h')) {
        printHelp();
        return;
    }

    const config = loadConfig();
    const client = new AgentFarmClient({ baseUrl: config.baseUrl, token: config.token ?? undefined });

    const [group, sub, ...rest] = argv;

    try {
        if (group === 'agents') {
            if (sub === 'list') { await agentsListCmd(rest, client); return; }
            if (sub === 'get') { await agentsGetCmd(rest, client); return; }
        }

        if (group === 'analytics') {
            if (sub === 'performance') { await analyticsPerformanceCmd(rest, client); return; }
            if (sub === 'cost') { await analyticsCostCmd(rest, client); return; }
        }

        if (group === 'messages') {
            if (sub === 'inbox') { await messagesInboxCmd(rest, client); return; }
            if (sub === 'send') { await messagesSendCmd(rest, client); return; }
        }

        printError(`Unknown command: ${group}${sub ? ` ${sub}` : ''}`);
        printHelp();
        process.exit(1);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        printError(message);
        process.exit(1);
    }
}

await main();
