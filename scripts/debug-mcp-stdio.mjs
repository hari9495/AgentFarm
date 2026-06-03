#!/usr/bin/env node
/**
 * debug-mcp-stdio.mjs
 * Dumps raw stdout from chrome-devtools-mcp to see exact framing/bytes.
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { Buffer } from 'node:buffer';

// Direct spawn: node.exe → chrome-devtools-mcp.js — no cmd.exe shell in between.
// Using shell:true pipes stdin through cmd.exe which does NOT forward it to the
// actual child process stdin, resulting in 0 bytes received from the MCP server.
const MCP_BIN = 'C:/Users/HariSivaSaiKumarMada/AppData/Roaming/npm/node_modules/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js';

console.log('Spawning chrome-devtools-mcp...');

const proc = spawn(
    process.execPath,
    [MCP_BIN, '--no-usage-statistics', '--redactNetworkHeaders'],
    { shell: false, stdio: ['pipe', 'pipe', 'pipe'] },
);

let totalBytes = 0;
proc.stdout.on('data', (chunk) => {
    totalBytes += chunk.length;
    console.log(`\n[STDOUT chunk ${chunk.length} bytes]`);
    // Show as hex + printable
    console.log('  hex:', chunk.toString('hex').match(/.{1,32}/g)?.join('\n       ') ?? '');
    console.log('  str:', JSON.stringify(chunk.toString('utf8')));
});
proc.stderr.on('data', (d) => {
    process.stderr.write(`[stderr] ${d}`);
});
proc.on('exit', (code) => console.log(`\n[exit] code=${code}`));

await sleep(5000);
console.log(`\n--- Sending initialize after 5s (total stdout bytes so far: ${totalBytes}) ---`);

const msg = {
    jsonrpc: '2.0', id: 1, method: 'initialize', params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'debug-client', version: '0.0.1' },
    }
};
const frame = JSON.stringify(msg) + '\n';
console.log('Sending frame:', JSON.stringify(frame));
proc.stdin.write(frame);

await sleep(10000);
console.log(`\n--- Done waiting. Total stdout bytes received: ${totalBytes} ---`);
proc.kill();
