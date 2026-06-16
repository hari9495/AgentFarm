/**
 * register-langfuse-models.mjs — register AgentFarm's LLM model pricing in
 * self-hosted Langfuse so it computes generation cost natively from the token
 * usage AgentFarm already sends.
 *
 * Source of truth: PRICING_MAP in apps/agent-runtime/src/cost-calculator.ts
 * (per-1M-token prices). This script converts to Langfuse's per-token prices
 * and POSTs a model definition per model. It is idempotent — a custom
 * definition with the same matchPattern is skipped on re-run.
 *
 * Run:
 *   node --env-file=.env --import tsx scripts/register-langfuse-models.mjs
 *
 * Requires LANGFUSE_HOST (or LANGFUSE_BASE_URL), LANGFUSE_PUBLIC_KEY,
 * LANGFUSE_SECRET_KEY in the environment.
 */

import { PRICING_MAP } from '../apps/agent-runtime/src/cost-calculator.ts';

const host = (process.env.LANGFUSE_HOST ?? process.env.LANGFUSE_BASE_URL ?? '').replace(/\/+$/, '');
const publicKey = process.env.LANGFUSE_PUBLIC_KEY ?? '';
const secretKey = process.env.LANGFUSE_SECRET_KEY ?? '';

if (!host || !publicKey || !secretKey) {
    console.error('Missing LANGFUSE_HOST / LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY in env.');
    process.exit(1);
}

const authHeader = 'Basic ' + Buffer.from(`${publicKey}:${secretKey}`).toString('base64');
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const perToken = (perMillion) => perMillion / 1_000_000;

// ── Fetch existing custom (non-Langfuse-managed) model patterns for idempotency ──
const existingCustomPatterns = new Set();
let page = 1;
while (true) {
    const res = await fetch(`${host}/api/public/models?limit=100&page=${page}`, { headers: { authorization: authHeader } });
    if (!res.ok) {
        console.error(`Failed to list existing models (${res.status}).`);
        process.exit(1);
    }
    const body = await res.json();
    for (const m of body.data ?? []) {
        if (!m.isLangfuseManaged) existingCustomPatterns.add(m.matchPattern);
    }
    const total = body.meta?.totalPages ?? 1;
    if (page >= total) break;
    page += 1;
}

let created = 0;
let skipped = 0;
const failures = [];

for (const [modelName, entry] of Object.entries(PRICING_MAP)) {
    // Skip the zero-cost mock and any unpriced entry.
    if (entry.inputPerMillion === 0 && entry.outputPerMillion === 0) {
        skipped += 1;
        continue;
    }

    const matchPattern = `(?i)^(${escapeRegex(modelName)})$`;
    if (existingCustomPatterns.has(matchPattern)) {
        console.log(`skip   ${modelName} (already registered)`);
        skipped += 1;
        continue;
    }

    const payload = {
        modelName,
        matchPattern,
        unit: 'TOKENS',
        inputPrice: perToken(entry.inputPerMillion),
        outputPrice: perToken(entry.outputPerMillion),
    };

    const res = await fetch(`${host}/api/public/models`, {
        method: 'POST',
        headers: { authorization: authHeader, 'content-type': 'application/json' },
        body: JSON.stringify(payload),
    });

    if (res.ok) {
        console.log(`create ${modelName}  in=$${entry.inputPerMillion}/M out=$${entry.outputPerMillion}/M`);
        created += 1;
    } else {
        const text = await res.text().catch(() => '');
        console.error(`FAIL   ${modelName} (${res.status}) ${text.slice(0, 200)}`);
        failures.push(modelName);
    }
}

console.log(`\nDone. created=${created} skipped=${skipped} failed=${failures.length}`);
if (failures.length > 0) process.exit(1);
