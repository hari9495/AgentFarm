/**
 * seed-langfuse-eval-dataset.mjs — create a starter regression dataset in
 * Langfuse for offline evaluation of the agent decision path.
 *
 * Each item is { input: <task instruction>, expectedOutput: <expected actionType> }.
 * Grow this set over time from real approved/rejected outcomes (the app can also
 * add items programmatically via addDatasetItem in @agentfarm/llm-trace).
 *
 * Run a scored experiment against it with scripts/run-langfuse-eval.mjs.
 *
 * Idempotent — dataset + items use stable names/ids, so re-running upserts.
 *
 * Run:
 *   node --env-file=.env --import tsx scripts/seed-langfuse-eval-dataset.mjs
 */

const host = (process.env.LANGFUSE_HOST ?? process.env.LANGFUSE_BASE_URL ?? '').replace(/\/+$/, '');
const publicKey = process.env.LANGFUSE_PUBLIC_KEY ?? '';
const secretKey = process.env.LANGFUSE_SECRET_KEY ?? '';

if (!host || !publicKey || !secretKey) {
    console.error('Missing LANGFUSE_HOST / LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY in env.');
    process.exit(1);
}

const authHeader = 'Basic ' + Buffer.from(`${publicKey}:${secretKey}`).toString('base64');
const DATASET = 'agent-decision-evals';

const ITEMS = [
    { id: 'dev-fix-test',   input: 'Fix the failing unit test in src/auth.ts',          expectedOutput: 'workspace_fix_test_failures' },
    { id: 'dev-edit',       input: 'Add a null check to the parseUser function',         expectedOutput: 'code_edit' },
    { id: 'dev-open-pr',    input: 'Open a pull request with the current changes',       expectedOutput: 'create_pr' },
    { id: 'sec-scan',       input: 'Run a security scan over the repository',            expectedOutput: 'workspace_security_scan' },
    { id: 'dep-audit',      input: 'Audit our dependencies for known CVEs',              expectedOutput: 'workspace_dependency_audit' },
    { id: 'read-file',      input: 'Show me the contents of README.md',                 expectedOutput: 'workspace_read_file' },
];

const post = async (path, body) => {
    const res = await fetch(`${host}${path}`, {
        method: 'POST',
        headers: { authorization: authHeader, 'content-type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`${path} -> ${res.status} ${text.slice(0, 200)}`);
    }
    return res.json();
};

try {
    await post('/api/public/datasets', { name: DATASET, description: 'Regression eval set for the agent decision path (instruction -> expected actionType).' });
    console.log(`dataset ready: ${DATASET}`);
    for (const item of ITEMS) {
        await post('/api/public/dataset-items', { datasetName: DATASET, id: item.id, input: item.input, expectedOutput: item.expectedOutput });
        console.log(`item   ${item.id}  -> ${item.expectedOutput}`);
    }
    console.log(`\nDone. ${ITEMS.length} items in '${DATASET}'.`);
} catch (err) {
    console.error('FAILED:', err.message);
    process.exit(1);
}
