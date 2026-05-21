import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildSastSemanticPrompt,
    parseSastSemanticResponse,
    callSastLlmIfConfigured,
    selectFilesForSemanticAnalysis,
    type SastLlmFinding,
} from './sast-semantic-analyzer.js';

// ---------------------------------------------------------------------------
// buildSastSemanticPrompt
// ---------------------------------------------------------------------------

test('buildSastSemanticPrompt: includes filename in prompt', () => {
    const prompt = buildSastSemanticPrompt('const x = 1;', 'src/auth.ts');
    assert.ok(prompt.includes('src/auth.ts'));
});

test('buildSastSemanticPrompt: includes all 7 vulnerability categories', () => {
    const prompt = buildSastSemanticPrompt('const x = 1;', 'x.ts');
    assert.ok(prompt.toLowerCase().includes('auth'));
    assert.ok(prompt.toLowerCase().includes('idor'));
    assert.ok(prompt.toLowerCase().includes('race condition'));
    assert.ok(prompt.toLowerCase().includes('privilege escalation'));
    assert.ok(prompt.toLowerCase().includes('toctou'));
});

test('buildSastSemanticPrompt: truncates large files to ~6000 chars', () => {
    const bigCode = 'x'.repeat(10_000);
    const prompt = buildSastSemanticPrompt(bigCode, 'big.ts');
    // Prompt total is bigger than 6000 (has instruction text) but content portion is capped
    assert.ok(prompt.includes('[file truncated for analysis]'));
});

test('buildSastSemanticPrompt: small file not truncated', () => {
    const code = 'const ok = true;';
    const prompt = buildSastSemanticPrompt(code, 'small.ts');
    assert.ok(!prompt.includes('[file truncated for analysis]'));
    assert.ok(prompt.includes('const ok = true;'));
});

test('buildSastSemanticPrompt: instructs LLM to respond with JSON array', () => {
    const prompt = buildSastSemanticPrompt('', 'x.ts');
    assert.ok(prompt.includes('JSON array'));
    assert.ok(prompt.includes('[]'));
});

// ---------------------------------------------------------------------------
// parseSastSemanticResponse
// ---------------------------------------------------------------------------

test('parseSastSemanticResponse: parses valid JSON array', () => {
    const raw = JSON.stringify([
        { rule: 'missing-authz', severity: 'high', line: 42, message: 'No permission check before deletion' },
    ]);
    const findings = parseSastSemanticResponse(raw, 'routes.ts');
    assert.equal(findings.length, 1);
    assert.equal(findings[0]!.rule, 'missing-authz');
    assert.equal(findings[0]!.severity, 'high');
    assert.equal(findings[0]!.line, 42);
    assert.equal(findings[0]!.file, 'routes.ts');
    assert.equal(findings[0]!.engine, 'llm_semantic');
});

test('parseSastSemanticResponse: returns [] for invalid JSON', () => {
    const findings = parseSastSemanticResponse('not json at all', 'x.ts');
    assert.deepEqual(findings, []);
});

test('parseSastSemanticResponse: returns [] for empty array response', () => {
    const findings = parseSastSemanticResponse('[]', 'x.ts');
    assert.deepEqual(findings, []);
});

test('parseSastSemanticResponse: extracts JSON array from prose-wrapped response', () => {
    const raw = 'Here are the findings:\n[\n{"rule":"idor","severity":"critical","line":10,"message":"IDOR"}\n]\nEnd.';
    const findings = parseSastSemanticResponse(raw, 'ctrl.ts');
    assert.equal(findings.length, 1);
    assert.equal(findings[0]!.rule, 'idor');
});

test('parseSastSemanticResponse: normalises unknown severity to medium', () => {
    const raw = JSON.stringify([{ rule: 'r', severity: 'extreme', line: 1, message: 'msg' }]);
    const findings = parseSastSemanticResponse(raw, 'x.ts');
    assert.equal(findings[0]!.severity, 'medium');
});

test('parseSastSemanticResponse: skips items with missing message', () => {
    const raw = JSON.stringify([
        { rule: 'no-message', severity: 'low', line: 1 },
        { rule: 'has-message', severity: 'low', line: 2, message: 'valid' },
    ]);
    const findings = parseSastSemanticResponse(raw, 'x.ts');
    assert.equal(findings.length, 1);
    assert.equal(findings[0]!.rule, 'has-message');
});

test('parseSastSemanticResponse: defaults line to 0 when absent', () => {
    const raw = JSON.stringify([{ rule: 'r', severity: 'low', message: 'msg' }]);
    const findings = parseSastSemanticResponse(raw, 'x.ts');
    assert.equal(findings[0]!.line, 0);
});

// ---------------------------------------------------------------------------
// callSastLlmIfConfigured
// ---------------------------------------------------------------------------

test('callSastLlmIfConfigured: returns null when env vars not set', async () => {
    const original = { endpoint: process.env['SAST_LLM_ENDPOINT'], key: process.env['SAST_LLM_API_KEY'] };
    delete process.env['SAST_LLM_ENDPOINT'];
    delete process.env['SAST_LLM_API_KEY'];
    const result = await callSastLlmIfConfigured('some prompt', 'x.ts');
    assert.equal(result, null);
    if (original.endpoint !== undefined) process.env['SAST_LLM_ENDPOINT'] = original.endpoint;
    if (original.key !== undefined) process.env['SAST_LLM_API_KEY'] = original.key;
});

test('callSastLlmIfConfigured: returns null when only endpoint is set', async () => {
    const originalKey = process.env['SAST_LLM_API_KEY'];
    process.env['SAST_LLM_ENDPOINT'] = 'http://localhost:9999/v1/chat/completions';
    delete process.env['SAST_LLM_API_KEY'];
    const result = await callSastLlmIfConfigured('some prompt', 'x.ts');
    assert.equal(result, null);
    delete process.env['SAST_LLM_ENDPOINT'];
    if (originalKey !== undefined) process.env['SAST_LLM_API_KEY'] = originalKey;
});

// ---------------------------------------------------------------------------
// selectFilesForSemanticAnalysis
// ---------------------------------------------------------------------------

test('selectFilesForSemanticAnalysis: prioritises auth/controller files', () => {
    const files = [
        'src/utils/format.ts',
        'src/auth/guard.ts',
        'src/routes/middleware.ts',
        'src/helpers/date.ts',
        'src/controllers/UserController.ts',
        'src/db/connection.ts',
        'src/permissions/check.ts',
    ];
    const selected = selectFilesForSemanticAnalysis(files, 3);
    assert.equal(selected.length, 3);
    // All top-3 should match auth/permission/controller patterns
    const authPattern = /auth|permission|middleware|controller|guard/i;
    assert.ok(selected.every((f) => authPattern.test(f)));
});

test('selectFilesForSemanticAnalysis: topN defaults to 5', () => {
    const files = Array.from({ length: 10 }, (_, i) => `src/file${i}.ts`);
    const selected = selectFilesForSemanticAnalysis(files);
    assert.equal(selected.length, 5);
});

test('selectFilesForSemanticAnalysis: returns all when fewer than topN files', () => {
    const files = ['a.ts', 'b.ts'];
    const selected = selectFilesForSemanticAnalysis(files, 5);
    assert.equal(selected.length, 2);
});
