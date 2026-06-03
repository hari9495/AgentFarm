#!/usr/bin/env node
/**
 * test-chrome-devtools-mcp.mjs
 *
 * Manual integration test that mirrors exactly what the agent does:
 *   1. Spawns chrome-devtools-mcp as a child process (stdio MCP transport)
 *   2. Navigates to https://rpachallenge.com
 *   3. Reads the challenge data table from the DOM
 *   4. Clicks Start, fills each round's form, submits
 *   5. Saves a PNG screenshot after every key step
 *
 * Run:
 *   node scripts/test-chrome-devtools-mcp.mjs
 *
 * Screenshots are written to:  scripts/rpa-screenshots/
 */

import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { setTimeout as sleep } from 'node:timers/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dir, 'rpa-screenshots');
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

// MCP over stdio uses NDJSON framing (this SDK build):
//   Each message is JSON.stringify(msg) + '\n'  (NOT Content-Length headers)
// Note: the official MCP spec describes Content-Length framing, but
// the bundled @modelcontextprotocol/sdk in chrome-devtools-mcp v1.1.1 uses
// ReadBuffer which splits on '\n'.

function encodeMessage(msg) {
    return JSON.stringify(msg) + '\n';
}

class McpStdio {
    constructor(proc) {
        this._proc = proc;
        this._pending = new Map();   // id → { resolve, reject }
        this._buf = '';
        this._nextId = 1;

        proc.stdout.setEncoding('utf8');
        proc.stdout.on('data', (chunk) => {
            this._buf += chunk;
            this._drain();
        });
        proc.stderr.on('data', (d) => {
            const line = d.toString().trim();
            if (line) process.stderr.write(`\x1b[2m[mcp] ${line}\x1b[0m\n`);
        });
        proc.on('exit', (code) => {
            if (code !== 0) console.error(`\n[mcp] process exited with code ${code}`);
        });
    }

    _drain() {
        let idx;
        while ((idx = this._buf.indexOf('\n')) !== -1) {
            const line = this._buf.slice(0, idx).replace(/\r$/, '');
            this._buf = this._buf.slice(idx + 1);
            if (!line.trim()) continue;
            try {
                const msg = JSON.parse(line);
                if (msg.id != null) {
                    const handler = this._pending.get(msg.id);
                    if (handler) {
                        this._pending.delete(msg.id);
                        if (msg.error) handler.reject(new Error(`MCP error ${msg.error.code}: ${msg.error.message}`));
                        else handler.resolve(msg.result);
                    }
                }
            } catch { /* ignore parse errors */ }
        }
    }

    call(method, params = {}, timeoutMs = 20_000) {
        return new Promise((resolve, reject) => {
            const id = this._nextId++;
            const timer = setTimeout(() => {
                this._pending.delete(id);
                reject(new Error(`MCP call timeout: ${method} (${timeoutMs}ms)`));
            }, timeoutMs);
            this._pending.set(id, {
                resolve: (v) => { clearTimeout(timer); resolve(v); },
                reject: (e) => { clearTimeout(timer); reject(e); },
            });
            this._proc.stdin.write(encodeMessage({ jsonrpc: '2.0', id, method, params }));
        });
    }

    kill() { this._proc.kill(); }
}

// ─── Tool helpers ────────────────────────────────────────────────────────────

async function tool(mcp, name, args = {}) {
    const result = await mcp.call('tools/call', { name, arguments: args });
    return result;
}

async function js(mcp, script) {
    // chrome-devtools-mcp v1.1.1: evaluate_script uses 'function' parameter, not 'script'
    const result = await tool(mcp, 'evaluate_script', { function: script });
    const text = result?.content?.find(c => c.type === 'text')?.text ?? 'null';
    try { return JSON.parse(text); } catch { return text; }
}

let shotNum = 0;
async function screenshot(mcp, label) {
    shotNum++;
    const slug = label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const file = `${String(shotNum).padStart(2, '0')}-${slug}.png`;
    // Use filePath param so chrome-devtools-mcp writes directly to disk (avoids base64 decode issues)
    const absPath = join(OUT, file);
    try {
        await tool(mcp, 'take_screenshot', { filePath: absPath });
        console.log(`  📸 ${file}`);
    } catch (e) {
        console.warn(`  [screenshot] failed: ${e.message}`);
    }
}

/**
 * Parse snapshot text from take_snapshot into { label → uid } pairs.
 * The snapshot format is:
 *   uid=X_Y StaticText "First Name"
 *   uid=X_Z textbox
 * We match each label StaticText directly above a textbox.
 */
function parseSnapshotFields(snapshotText) {
    const lines = snapshotText.split('\n');
    const fields = {};  // label.toLowerCase() → uid
    for (let i = 0; i < lines.length - 1; i++) {
        const labelMatch = lines[i].match(/uid=(\S+)\s+StaticText\s+"(.+?)"/);
        const inputMatch = lines[i + 1]?.match(/uid=(\S+)\s+textbox/);
        if (labelMatch && inputMatch) {
            const label = labelMatch[2].trim().toLowerCase();
            fields[label] = inputMatch[1];
        }
    }
    return fields;
}

// ─── Main ────────────────────────────────────────────────────────────────────

// Use direct node spawn (shell:false) — shell:true on Windows routes stdin
// through cmd.exe which does NOT forward it to the MCP process stdin.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { resolve as resolvePath } from 'node:path';

function findMcpBin() {
    try {
        return createRequire(import.meta.url).resolve(
            'chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js',
        );
    } catch {
        const globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
        return resolvePath(globalRoot, 'chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js');
    }
}
const MCP_BIN = findMcpBin();

console.log('\x1b[1m=== AgentFarm chrome-devtools-mcp RPA Test ===\x1b[0m\n');
console.log('Spawning chrome-devtools-mcp (stdio transport)…');

// Remove --headless to watch Chrome on screen; add it back for Docker/CI.
const mcpProc = spawn(
    process.execPath,
    [MCP_BIN, '--no-usage-statistics', '--redactNetworkHeaders', '--isolated'],
    { shell: false, stdio: ['pipe', 'pipe', 'pipe'] },
);

const mcp = new McpStdio(mcpProc);

// Give Chrome time to launch
await sleep(6000);
console.log('Sending MCP initialize…');

// ── 1. Handshake ─────────────────────────────────────────────────────────────
const init = await mcp.call('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'agentfarm-rpa-test', version: '1.0.0' },
});
console.log(`✅ Connected to: ${init.serverInfo.name} v${init.serverInfo.version}\n`);

// List tools (informational)
const { tools } = await mcp.call('tools/list', {});
console.log(`Available tools (${tools.length}): ${tools.map(t => t.name).join(', ')}\n`);

// ── 2. Navigate ──────────────────────────────────────────────────────────────
console.log('[Step 1] Navigating to rpachallenge.com…');
await tool(mcp, 'navigate_page', { url: 'https://rpachallenge.com' });
await sleep(2500);
await screenshot(mcp, 'landing-page');

// ── 3. Download and parse Excel data ─────────────────────────────────────────
// The challenge page has NO table — data is in a downloadable Excel file.
console.log('\n[Step 2] Downloading challenge data from Excel…');
const xlsxPath = join(OUT, 'challenge.xlsx');
const xlsxResp = await fetch('https://rpachallenge.com/assets/downloadFiles/challenge.xlsx');
if (!xlsxResp.ok) throw new Error(`Failed to download Excel: ${xlsxResp.status}`);
const xlsxBuf = Buffer.from(await xlsxResp.arrayBuffer());
writeFileSync(xlsxPath, xlsxBuf);
console.log(`  Downloaded challenge.xlsx (${xlsxBuf.length} bytes)`);

// Parse with xlsx (workspace dev dep: pnpm add xlsx -D -w)
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
const wb = XLSX.read(xlsxBuf, { type: 'buffer' });
const ws = wb.Sheets[wb.SheetNames[0]];
const raw = XLSX.utils.sheet_to_json(ws, { defval: '' });
// Normalise column names (xlsx may have trailing spaces: "Last Name ")
const challengeData = raw.map(r => {
    const n = Object.fromEntries(Object.entries(r).map(([k, v]) => [k.trim(), v]));
    return {
        firstName: String(n['First Name'] ?? '').trim(),
        lastName: String(n['Last Name'] ?? '').trim(),
        company: String(n['Company Name'] ?? '').trim(),
        role: String(n['Role in Company'] ?? '').trim(),
        address: String(n['Address'] ?? '').trim(),
        email: String(n['Email'] ?? '').trim(),
        phone: String(n['Phone Number'] ?? '').trim(),
    };
}).filter(r => r.firstName);

if (challengeData.length === 0) {
    console.error('❌  Excel parsed but found no data rows. Columns:', Object.keys(raw[0] ?? {}));
    mcp.kill(); process.exit(1);
}
console.log(`  Found ${challengeData.length} rows:`);
challengeData.forEach((r, i) =>
    console.log(`    ${i + 1}. ${r.firstName} ${r.lastName} | ${r.email} | ${r.phone}`));

// ── 4. Click Start ────────────────────────────────────────────────────────────
console.log('\n[Step 3] Clicking Start (using snapshot UID)…');
const landingSnap = await tool(mcp, 'take_snapshot', {});
const landingSnapText = landingSnap?.content?.find(c => c.type === 'text')?.text ?? '';
// Find the START button UID
const startUidMatch = landingSnapText.match(/uid=(\S+)\s+button\s+"START"/);
if (startUidMatch) {
    await tool(mcp, 'click', { uid: startUidMatch[1] });
} else {
    // Fallback: evaluate_script DOM click
    await js(mcp, `() => { document.querySelector('button.btn, button')?.click(); return 'clicked'; }`);
}
await sleep(1500);
await screenshot(mcp, 'challenge-started');

// ── 5. Fill all 10 rounds ─────────────────────────────────────────────────────
const labelKey = {
    'first name': 'firstName',
    'last name': 'lastName',
    'company name': 'company',
    'role in company': 'role',
    'address': 'address',
    'email': 'email',
    'phone number': 'phone',
};

for (let round = 0; round < Math.min(challengeData.length, 10); round++) {
    const data = challengeData[round];
    console.log(`\n[Round ${round + 1}/10] ${data.firstName} ${data.lastName}`);

    // Get current snapshot to find field UIDs (fields change position each round)
    const snap = await tool(mcp, 'take_snapshot', {});
    const snapText = snap?.content?.find(c => c.type === 'text')?.text ?? '';
    const fields = parseSnapshotFields(snapText);

    if (Object.keys(fields).length === 0) {
        console.warn('  ⚠️  No fields found in snapshot');
        await screenshot(mcp, `round-${round + 1}-no-fields`);
        continue;
    }

    // Build fill_form elements from UID map
    const elements = [];
    for (const [label, uid] of Object.entries(fields)) {
        const key = labelKey[label];
        const value = key ? data[key] : undefined;
        if (!value) { console.warn(`  skip label: "${label}" (no mapping)`); continue; }
        console.log(`  fill "${label}" → uid=${uid} = "${value}"`);
        elements.push({ uid, value });
    }

    if (elements.length > 0) {
        await tool(mcp, 'fill_form', { elements });
    }
    await screenshot(mcp, `round-${round + 1}-filled`);

    // Submit: find Submit button UID in snapshot
    const submitUidMatch = snapText.match(/uid=(\S+)\s+button\s+"Submit"/i)
        ?? snapText.match(/uid=(\S+)\s+button\s+"SUBMIT"/i);
    if (submitUidMatch) {
        await tool(mcp, 'click', { uid: submitUidMatch[1] });
    } else {
        await js(mcp, `() => { document.querySelector('input[value="Submit"],button[type="submit"],.btn-submit,input.btn')?.click(); return 'submitted'; }`);
    }
    await sleep(800);
}

// ── 6. Final result ───────────────────────────────────────────────────────────
await sleep(1000);
await screenshot(mcp, 'final-result');

const finalSnap = await tool(mcp, 'take_snapshot', {});
const finalText = finalSnap?.content?.find(c => c.type === 'text')?.text ?? '';
// Look for a success/congratulations message in the snapshot
const successMatch = finalText.match(/StaticText\s+"([^"]*(?:congratulation|success|complete|score|100)[^"]*)"/i);
console.log(`\n\x1b[1m🏆  Result: ${successMatch?.[1] ?? 'Challenge complete — check final screenshot'}\x1b[0m`);
console.log(`\n✅  Screenshots saved to: ${OUT}\n`);

mcp.kill();
// Give the child process a moment to exit cleanly before we exit (avoids Windows libuv handle assertion)
await sleep(500);
process.exit(0);
