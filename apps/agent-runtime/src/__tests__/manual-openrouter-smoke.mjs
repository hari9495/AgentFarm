// Manual smoke test — verifies the OpenRouter (free-tier) LLM round-trip through
// the real createCodeGenFn factory. Not part of the automated test suite.
//
// Usage:
//   cd D:\AgentFarm
//   node --loader ts-node/esm apps/agent-runtime/src/__tests__/manual-openrouter-smoke.mjs
//
// Loads .env from the repo root, then asks the configured LLM for a tiny
// implementation plan and prints whatever comes back (raw + parsed steps).

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../../../'); // apps/agent-runtime/src/__tests__ -> repo root

// --- minimal .env loader (avoids adding a dotenv dependency for a one-off script) ---
function loadEnv(path) {
    const text = readFileSync(path, 'utf8');
    for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        const value = trimmed.slice(eq + 1).trim();
        if (!(key in process.env)) process.env[key] = value;
    }
}

loadEnv(resolve(repoRoot, '.env'));

console.log('--- Config in effect ---');
console.log('AF_MODEL_PROVIDER  =', process.env.AF_MODEL_PROVIDER);
console.log('AF_OPENAI_BASE_URL =', process.env.AF_OPENAI_BASE_URL);
console.log('AF_OPENAI_MODEL    =', process.env.AF_OPENAI_MODEL);
console.log('AF_OPENAI_API_KEY  =', (process.env.AF_OPENAI_API_KEY ?? '').slice(0, 12) + '...');
console.log('');

const { createCodeGenFn } = await import('../infrastructure/llm-provider-factory.js');

const codeGenFn = createCodeGenFn(process.env, 'speed_first');

if (!codeGenFn) {
    console.error('❌ createCodeGenFn returned undefined — provider not configured (check AF_MODEL_PROVIDER / API key).');
    process.exit(1);
}

console.log('--- Sending test prompt to LLM via OpenRouter ---');
const start = Date.now();
const steps = await codeGenFn(
    'Add a function `add(a, b)` that returns the sum of two numbers to math-utils.ts, and export it.',
    { 'math-utils.ts': 'export function subtract(a: number, b: number): number {\n  return a - b;\n}\n' },
    ['math-utils.ts'],
);
const elapsed = Date.now() - start;

console.log(`\n--- Result (${elapsed}ms) ---`);
console.log(JSON.stringify(steps, null, 2));

if (steps.length === 0) {
    console.log('\n⚠️  Empty plan returned. This can mean:');
    console.log('   - the model wrapped its JSON in prose/markdown (parser rejects it), or');
    console.log('   - a network/auth/rate-limit error occurred (factory swallows errors and returns []).');
    console.log('   Try swapping AF_OPENAI_MODEL to meta-llama/llama-3.3-70b-instruct:free and re-run.');
    process.exit(2);
}

console.log('\n✅ Round-trip succeeded — received', steps.length, 'step(s) from the LLM via OpenRouter.');
