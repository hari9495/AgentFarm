/**
 * register-langfuse-prompts.mjs — seed AgentFarm's in-code role system prompts
 * into the Langfuse prompt registry so operators can version / A/B / roll them
 * back from the Langfuse UI without a code deploy.
 *
 * Source of truth: ROLE_SYSTEM_PROMPTS in
 * apps/agent-runtime/src/role-system-prompts.ts. At runtime getRoleSystemPrompt
 * prefers the Langfuse-registered `role-system-prompt:<roleKey>` (label
 * `production`) and falls back to the in-code prompt.
 *
 * Idempotent — a prompt that already exists is skipped (so it won't clobber
 * operator edits). Pass --force to push the current code prompt as a NEW
 * version regardless.
 *
 * Run:
 *   node --env-file=.env --import tsx scripts/register-langfuse-prompts.mjs
 *   node --env-file=.env --import tsx scripts/register-langfuse-prompts.mjs --force
 */

import { ROLE_SYSTEM_PROMPTS } from '../apps/agent-runtime/src/role-system-prompts.ts';

const host = (process.env.LANGFUSE_HOST ?? process.env.LANGFUSE_BASE_URL ?? '').replace(/\/+$/, '');
const publicKey = process.env.LANGFUSE_PUBLIC_KEY ?? '';
const secretKey = process.env.LANGFUSE_SECRET_KEY ?? '';
const force = process.argv.includes('--force');

if (!host || !publicKey || !secretKey) {
    console.error('Missing LANGFUSE_HOST / LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY in env.');
    process.exit(1);
}

const authHeader = 'Basic ' + Buffer.from(`${publicKey}:${secretKey}`).toString('base64');
const promptName = (roleKey) => `role-system-prompt:${roleKey}`;

const exists = async (name) => {
    const res = await fetch(`${host}/api/public/v2/prompts/${encodeURIComponent(name)}?label=production`, {
        headers: { authorization: authHeader },
    });
    return res.status === 200;
};

let created = 0;
let skipped = 0;
const failures = [];

for (const [roleKey, prompt] of Object.entries(ROLE_SYSTEM_PROMPTS)) {
    const name = promptName(roleKey);

    if (!force && (await exists(name))) {
        console.log(`skip   ${name} (already registered)`);
        skipped += 1;
        continue;
    }

    const res = await fetch(`${host}/api/public/v2/prompts`, {
        method: 'POST',
        headers: { authorization: authHeader, 'content-type': 'application/json' },
        body: JSON.stringify({ name, type: 'text', prompt, labels: ['production'] }),
    });

    if (res.ok) {
        console.log(`create ${name}  (${prompt.length} chars)`);
        created += 1;
    } else {
        const text = await res.text().catch(() => '');
        console.error(`FAIL   ${name} (${res.status}) ${text.slice(0, 200)}`);
        failures.push(name);
    }
}

console.log(`\nDone. created=${created} skipped=${skipped} failed=${failures.length}`);
if (failures.length > 0) process.exit(1);
