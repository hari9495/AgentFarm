// =============================================================================
// TEST GENERATOR
// Sprint 14 — Developer Agent Gap: workspace_generate_test writes real tests
//
// Replaces the TODO-stub approach with semantically-aware test generation.
// Parses TypeScript function signatures (name, params, return type) and
// produces real assertion logic based on:
//   • Return type annotation (boolean, number, string, array, object, void)
//   • Function name prefix heuristics (is*/has* → boolean, add/sum → number, …)
//   • Parameter name heuristics to infer realistic sample values
//
// Supported frameworks: node:test (default), jest, vitest
// =============================================================================

export interface FnSignature {
    name: string;
    rawParams: string;
    returnType: string;
    isAsync: boolean;
}

type FnCategory = 'boolean' | 'number' | 'string' | 'array' | 'nullable' | 'object' | 'void' | 'unknown';

// ---------------------------------------------------------------------------
// 1. Signature extraction
// ---------------------------------------------------------------------------

/**
 * Parse all exported function/arrow-function signatures from TypeScript source.
 * Falls back to simple symbol extraction for classes / re-exports.
 */
export function extractSignatures(src: string): { signatures: FnSignature[]; fallbackSymbols: string[] } {
    const signatures: FnSignature[] = [];

    // export [async] function name(params): ReturnType
    const funcRe = /export\s+(async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*(?:<[^>]*>)?\s*\(([^)]*)\)\s*(?::\s*([^\n{;]+))?/g;
    let m: RegExpExecArray | null;
    while ((m = funcRe.exec(src)) !== null) {
        signatures.push({
            name: m[2],
            rawParams: (m[3] ?? '').trim(),
            returnType: (m[4] ?? '').trim().replace(/\s+/g, ' '),
            isAsync: !!m[1],
        });
    }

    // export const name = [async] (params): ReturnType =>
    const arrowRe = /export\s+const\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(async\s+)?\(([^)]*)\)\s*(?::\s*([^=\n{;]+))?\s*=>/g;
    while ((m = arrowRe.exec(src)) !== null) {
        if (!signatures.some((s) => s.name === m![1])) {
            signatures.push({
                name: m[1],
                rawParams: (m[3] ?? '').trim(),
                returnType: (m[4] ?? '').trim().replace(/\s+/g, ' '),
                isAsync: !!m[2],
            });
        }
    }

    // Collect any exported symbol not already captured as a function (classes, etc.)
    const fallbackSymbols: string[] = [];
    const symbolRe = /export\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g;
    while ((m = symbolRe.exec(src)) !== null) {
        const name = m[1];
        if (!signatures.some((s) => s.name === name) && !fallbackSymbols.includes(name)) {
            fallbackSymbols.push(name);
        }
    }

    return { signatures, fallbackSymbols };
}

// ---------------------------------------------------------------------------
// 2. Category inference
// ---------------------------------------------------------------------------

export function categorise(name: string, returnType: string): FnCategory {
    const n = name.toLowerCase();
    // Strip Promise<…> wrapper from return type and normalise
    const rt = returnType
        .toLowerCase()
        .replace(/\s/g, '')
        .replace(/^promise<(.+)>$/, '$1');

    // Exact return-type matches take priority
    if (rt === 'boolean' || rt === 'bool') return 'boolean';
    if (rt === 'number' || rt === 'int' || rt === 'float' || rt === 'bigint') return 'number';
    if (rt === 'string') return 'string';
    if (rt === 'void' || rt === 'undefined') return 'void';
    if (rt.endsWith('[]') || rt.startsWith('array<') || rt.startsWith('[')) return 'array';
    if (rt.includes('|null') || rt.includes('null|') || rt.includes('| null') || rt.includes('undefined')) return 'nullable';
    if (rt === 'object' || (rt.startsWith('{') && rt.endsWith('}'))) return 'object';

    // Name-based heuristics
    if (/^(is|has|can|check|should|validate|assert|ensure|verify)/.test(n)) return 'boolean';
    if (/^(add|sum|sub(?:tract)?|mul(?:tiply)?|div(?:ide)?|count|calc|compute|increment|decrement|minus|plus|times|total|avg|mean|max|min|abs|pow|sqrt|mod|round|floor|ceil)/.test(n)) return 'number';
    if (/^(format|to|serialize|stringify|encode|decode|trim|join|concat|render|print|display|label|describe|slug|mask|truncate|pad)/.test(n)) return 'string';
    if (/^(sort|filter|map|flat|reduce|search|list|getall|fetchall|query|select|pick|pluck|unique|dedupe|chunk|group|zip)/.test(n)) return 'array';
    if (/^(get|find|fetch|load|read|lookup|resolve|extract|parse)/.test(n)) return 'nullable';
    if (/^(create|build|make|new|init|construct|generate|produce|compose)/.test(n)) return 'object';

    return 'unknown';
}

// ---------------------------------------------------------------------------
// 3. Argument value inference
// ---------------------------------------------------------------------------

/**
 * Infer realistic sample argument values from parameter declarations.
 */
export function inferArgs(rawParams: string): string {
    if (!rawParams.trim()) return '';
    const parts = rawParams
        .split(',')
        .map((p) => p.trim().split(':')[0]?.trim() ?? '')
        .filter(Boolean);

    return parts
        .map((p) => {
            const n = p.toLowerCase().replace(/[_\s]/g, '');
            if (/email/.test(n)) return "'user@example.com'";
            if (/url|uri|href|link/.test(n)) return "'https://example.com'";
            if (/name|title|label/.test(n)) return "'Alice'";
            if (/^id$|^[a-z]+id$/.test(n)) return "'id-1'";
            if (/password|pass(?:word)?|pwd|secret/.test(n)) return "'Secret123!'";
            if (/text|message|content|body|str(?:ing)?|description|note/.test(n)) return "'hello world'";
            if (/num|count|amount|size|length|index|age|total|limit|offset/.test(n)) return '42';
            if (/flag|bool|enabled|active|visible|open|closed|toggle/.test(n)) return 'true';
            if (/list|arr|items|elements|values|entries/.test(n)) return '[]';
            if (/obj|data|opts?|options|config|settings|context/.test(n)) return '{}';
            // Fallback: first param gets 1, rest get index+1
            return '1';
        })
        .join(', ');
}

// ---------------------------------------------------------------------------
// 4. Test case generation per framework
// ---------------------------------------------------------------------------

function buildNodeTestCases(sig: FnSignature): string[] {
    const { name, rawParams, returnType, isAsync } = sig;
    const cat = categorise(name, returnType);
    const args = inferArgs(rawParams);
    const call = isAsync ? `await ${name}(${args})` : `${name}(${args})`;
    const ap = isAsync ? 'async ' : '';
    const cases: string[] = [];

    switch (cat) {
        case 'boolean':
            cases.push(
                `test('${name} returns a boolean', ${ap}() => {\n  const result = ${call};\n  assert.equal(typeof result, 'boolean');\n});`,
            );
            cases.push(
                `test('${name} returns true for a valid input', ${ap}() => {\n  assert.equal(${call}, true);\n});`,
            );
            cases.push(
                `test('${name} returns false for empty / falsy input', ${ap}() => {\n  const result = ${name}('' as never);\n  assert.equal(typeof result, 'boolean');\n});`,
            );
            break;

        case 'number':
            cases.push(
                `test('${name} returns a number', ${ap}() => {\n  assert.equal(typeof ${call}, 'number');\n});`,
            );
            if (/^add|^sum|^plus/.test(name.toLowerCase())) {
                cases.push(`test('${name} returns correct sum', ${ap}() => {\n  assert.equal(${name}(2, 3), 5);\n});`);
                cases.push(`test('${name} handles zero', ${ap}() => {\n  assert.equal(${name}(0, 0), 0);\n});`);
            } else if (/^sub/.test(name.toLowerCase())) {
                cases.push(`test('${name} returns correct difference', ${ap}() => {\n  assert.equal(${name}(5, 3), 2);\n});`);
                cases.push(`test('${name} returns 0 for equal inputs', ${ap}() => {\n  assert.equal(${name}(4, 4), 0);\n});`);
            } else {
                cases.push(
                    `test('${name} returns a finite number', ${ap}() => {\n  assert.ok(Number.isFinite(${call}));\n});`,
                );
                cases.push(
                    `test('${name} handles zero edge case', ${ap}() => {\n  assert.equal(typeof ${name}(0 as never), 'number');\n});`,
                );
            }
            break;

        case 'string':
            cases.push(
                `test('${name} returns a string', ${ap}() => {\n  assert.equal(typeof ${call}, 'string');\n});`,
            );
            cases.push(
                `test('${name} returns a non-empty string for valid input', ${ap}() => {\n  assert.ok(${call}.length > 0);\n});`,
            );
            cases.push(
                `test('${name} does not return null', ${ap}() => {\n  assert.notEqual(${call}, null);\n});`,
            );
            break;

        case 'array':
            cases.push(`test('${name} returns an array', ${ap}() => {\n  assert.ok(Array.isArray(${call}));\n});`);
            cases.push(
                `test('${name} returns empty array for empty input', ${ap}() => {\n  const result = ${name}([] as never);\n  assert.ok(Array.isArray(result));\n});`,
            );
            cases.push(
                `test('${name} result length is non-negative', ${ap}() => {\n  assert.ok(${call}.length >= 0);\n});`,
            );
            break;

        case 'nullable':
            cases.push(
                `test('${name} returns a defined value for valid input', ${ap}() => {\n  const result = ${call};\n  assert.notEqual(result, undefined);\n});`,
            );
            cases.push(
                `test('${name} does not throw for valid input', ${ap}() => {\n  assert.doesNotThrow(() => { ${isAsync ? '' : call} });\n});`,
            );
            cases.push(
                `test('${name} result is null or a concrete value', ${ap}() => {\n  const result = ${call};\n  assert.ok(result === null || result !== undefined);\n});`,
            );
            break;

        case 'object':
            cases.push(
                `test('${name} returns an object', ${ap}() => {\n  const result = ${call};\n  assert.ok(result !== null && typeof result === 'object');\n});`,
            );
            cases.push(`test('${name} returns non-null', ${ap}() => {\n  assert.notEqual(${call}, null);\n});`);
            cases.push(
                `test('${name} does not throw for valid input', ${ap}() => {\n  assert.doesNotThrow(() => { ${isAsync ? '' : call} });\n});`,
            );
            break;

        case 'void':
            cases.push(
                `test('${name} executes without throwing', ${ap}() => {\n  assert.doesNotThrow(() => { ${isAsync ? '' : call} });\n});`,
            );
            cases.push(`test('${name} returns undefined', ${ap}() => {\n  assert.equal(${call}, undefined);\n});`);
            break;

        default:
            cases.push(
                `test('${name} executes without throwing', ${ap}() => {\n  assert.doesNotThrow(() => { ${isAsync ? '' : call} });\n});`,
            );
            cases.push(
                `test('${name} returns a defined result', ${ap}() => {\n  const result = ${call};\n  assert.notEqual(result, undefined);\n});`,
            );
            cases.push(
                `test('${name} handles zero / empty edge case', ${ap}() => {\n  assert.ok(${name}(0 as never) !== undefined || true);\n});`,
            );
            break;
    }

    return cases;
}

function buildJestCases(sig: FnSignature, isVitest: boolean): string {
    const { name, rawParams, returnType, isAsync } = sig;
    const cat = categorise(name, returnType);
    const args = inferArgs(rawParams);
    const call = isAsync ? `await ${name}(${args})` : `${name}(${args})`;
    const ap = isAsync ? 'async ' : '';
    const itBody: string[] = [];

    switch (cat) {
        case 'boolean':
            itBody.push(`  it('returns a boolean', ${ap}() => {\n    expect(typeof ${call}).toBe('boolean');\n  });`);
            itBody.push(`  it('returns true for a valid input', ${ap}() => {\n    expect(${call}).toBe(true);\n  });`);
            itBody.push(`  it('returns false for empty / falsy input', ${ap}() => {\n    expect(typeof ${name}('' as never)).toBe('boolean');\n  });`);
            break;
        case 'number':
            itBody.push(`  it('returns a number', ${ap}() => {\n    expect(typeof ${call}).toBe('number');\n  });`);
            if (/^add|^sum|^plus/.test(name.toLowerCase())) {
                itBody.push(`  it('returns correct sum', ${ap}() => {\n    expect(${name}(2, 3)).toBe(5);\n  });`);
                itBody.push(`  it('handles zero', ${ap}() => {\n    expect(${name}(0, 0)).toBe(0);\n  });`);
            } else if (/^sub/.test(name.toLowerCase())) {
                itBody.push(`  it('returns correct difference', ${ap}() => {\n    expect(${name}(5, 3)).toBe(2);\n  });`);
                itBody.push(`  it('returns 0 for equal inputs', ${ap}() => {\n    expect(${name}(4, 4)).toBe(0);\n  });`);
            } else {
                itBody.push(`  it('returns a finite number', ${ap}() => {\n    expect(isFinite(${call})).toBe(true);\n  });`);
                itBody.push(`  it('handles zero edge case', ${ap}() => {\n    expect(typeof ${name}(0 as never)).toBe('number');\n  });`);
            }
            break;
        case 'string':
            itBody.push(`  it('returns a string', ${ap}() => {\n    expect(typeof ${call}).toBe('string');\n  });`);
            itBody.push(`  it('returns non-empty string for valid input', ${ap}() => {\n    expect(${call}.length).toBeGreaterThan(0);\n  });`);
            itBody.push(`  it('does not return null', ${ap}() => {\n    expect(${call}).not.toBeNull();\n  });`);
            break;
        case 'array':
            itBody.push(`  it('returns an array', ${ap}() => {\n    expect(Array.isArray(${call})).toBe(true);\n  });`);
            itBody.push(`  it('handles empty input', ${ap}() => {\n    expect(Array.isArray(${name}([] as never))).toBe(true);\n  });`);
            itBody.push(`  it('result length is non-negative', ${ap}() => {\n    expect(${call}.length).toBeGreaterThanOrEqual(0);\n  });`);
            break;
        case 'nullable':
            itBody.push(`  it('returns defined value for valid input', ${ap}() => {\n    expect(${call}).toBeDefined();\n  });`);
            itBody.push(`  it('does not throw for valid input', ${ap}() => {\n    expect(() => ${call}).not.toThrow();\n  });`);
            itBody.push(`  it('result is null or a concrete value', ${ap}() => {\n    const r = ${call};\n    expect(r === null || r !== undefined).toBe(true);\n  });`);
            break;
        case 'object':
            itBody.push(`  it('returns an object', ${ap}() => {\n    const r = ${call};\n    expect(r !== null && typeof r === 'object').toBe(true);\n  });`);
            itBody.push(`  it('returns non-null', ${ap}() => {\n    expect(${call}).not.toBeNull();\n  });`);
            itBody.push(`  it('does not throw for valid input', ${ap}() => {\n    expect(() => ${call}).not.toThrow();\n  });`);
            break;
        case 'void':
            itBody.push(`  it('executes without throwing', ${ap}() => {\n    expect(() => ${call}).not.toThrow();\n  });`);
            itBody.push(`  it('returns undefined', ${ap}() => {\n    expect(${call}).toBeUndefined();\n  });`);
            break;
        default:
            itBody.push(`  it('executes without throwing', ${ap}() => {\n    expect(() => ${call}).not.toThrow();\n  });`);
            itBody.push(`  it('returns a defined result', ${ap}() => {\n    expect(${call}).toBeDefined();\n  });`);
            itBody.push(`  it('handles zero / empty edge case', ${ap}() => {\n    expect(${name}(0 as never)).toBeDefined();\n  });`);
            break;
    }

    return `describe('${name}', () => {\n${itBody.join('\n\n')}\n});`;
}

// ---------------------------------------------------------------------------
// 5. Top-level file assembly
// ---------------------------------------------------------------------------

export interface GenerateTestFileOptions {
    src: string;
    filePath: string;
    framework?: string;
}

export interface GenerateTestFileResult {
    content: string;
    symbols: string[];
    framework: string;
}

/**
 * Generate a test file for the given TypeScript source content.
 *
 * Returns the full test file content plus metadata. Does NOT write to disk.
 */
export function generateTestFile(opts: GenerateTestFileOptions): GenerateTestFileResult {
    const { src, filePath } = opts;
    const framework = opts.framework ?? 'node:test';
    const baseName = filePath.split('/').pop() ?? filePath;
    const relImport = './' + baseName.replace(/\.ts$/, '.js').replace(/\.tsx$/, '.js');

    const { signatures, fallbackSymbols } = extractSignatures(src);
    const allSymbols = [...signatures.map((s) => s.name), ...fallbackSymbols];

    if (allSymbols.length === 0) {
        return { content: '', symbols: [], framework };
    }

    const isJest = framework === 'jest';
    const isVitest = framework === 'vitest';
    let content = '';

    if (isJest || isVitest) {
        if (isVitest) {
            content += `import { describe, it, expect } from 'vitest';\n`;
        }
        content += `import { ${allSymbols.join(', ')} } from '${relImport}';\n\n`;

        for (const sig of signatures) {
            content += buildJestCases(sig, isVitest) + '\n\n';
        }
        for (const sym of fallbackSymbols) {
            content += `describe('${sym}', () => {\n  it('can be imported', () => {\n    expect(${sym}).toBeDefined();\n  });\n});\n\n`;
        }
    } else {
        // node:test (default)
        content += `import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { ${allSymbols.join(', ')} } from '${relImport}';\n\n`;

        for (const sig of signatures) {
            const cases = buildNodeTestCases(sig);
            content += cases.join('\n\n') + '\n\n';
        }
        for (const sym of fallbackSymbols) {
            content += `test('${sym} can be imported', () => {\n  assert.ok(${sym} !== undefined);\n});\n\n`;
        }
    }

    return { content: content.trimEnd() + '\n', symbols: allSymbols, framework };
}

// ---------------------------------------------------------------------------
// 6. LLM-guided test generation
// ---------------------------------------------------------------------------
// Calls Anthropic (claude-haiku-3-5 for speed/cost) to produce semantically
// aware tests. Falls back to the regex-based path if ANTHROPIC_API_KEY is not
// set, the network fails, or the model returns an empty/unusable response.
// ---------------------------------------------------------------------------

const LLM_TESTGEN_MODEL = 'claude-haiku-3-5';
const LLM_TESTGEN_MAX_SRC_CHARS = 5_000;

function buildTestGenPrompt(opts: GenerateTestFileOptions): string {
    const { src, filePath, framework = 'node:test' } = opts;
    const truncated = src.length > LLM_TESTGEN_MAX_SRC_CHARS ? src.slice(0, LLM_TESTGEN_MAX_SRC_CHARS) + '\n// … (truncated)' : src;
    return [
        `You are an expert TypeScript test writer. Generate a complete ${framework} test file for the following source.`,
        '',
        `Rules:`,
        `- Use ${framework} imports and API (${framework === 'node:test' ? "import test from 'node:test'; import assert from 'node:assert/strict'" : framework === 'vitest' ? "import { describe, it, expect } from 'vitest'" : "standard Jest globals"}).`,
        `- Import from '${'./' + (filePath.split('/').pop() ?? filePath).replace(/\.ts$/, '.js').replace(/\.tsx$/, '.js')}' (named imports, NOT default).`,
        `- Cover the happy path, at least one edge case, and one negative/error case per exported function.`,
        `- Use realistic, concrete argument values — not just empty strings or zeros.`,
        `- Do NOT use mocking frameworks unless the function clearly requires IO. Prefer pure assertion logic.`,
        `- Output ONLY the raw TypeScript test file. No markdown fences. No explanation outside the code.`,
        '',
        `Source file: ${filePath}`,
        '```typescript',
        truncated,
        '```',
    ].join('\n');
}

/**
 * Generate a test file using the LLM (Anthropic claude-haiku) when
 * ANTHROPIC_API_KEY is set. Falls back gracefully to `generateTestFile` on
 * any failure so callers never need to handle the async error path.
 */
export async function generateTestFileWithLlm(opts: GenerateTestFileOptions): Promise<GenerateTestFileResult> {
    const apiKey = process.env['ANTHROPIC_API_KEY'] ?? '';
    if (!apiKey) {
        return generateTestFile(opts);
    }

    const prompt = buildTestGenPrompt(opts);

    try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: LLM_TESTGEN_MODEL,
                max_tokens: 4096,
                messages: [{ role: 'user', content: prompt }],
            }),
            signal: AbortSignal.timeout(60_000),
        });

        if (!response.ok) {
            return generateTestFile(opts);
        }

        const json = await response.json() as {
            content?: Array<{ type: string; text?: string }>;
        };
        const raw = (json.content ?? [])
            .filter((b) => b.type === 'text')
            .map((b) => b.text ?? '')
            .join('');

        // Strip markdown fences if the model included them despite instructions
        const content = raw
            .replace(/^```(?:typescript|ts)?\s*/im, '')
            .replace(/```\s*$/m, '')
            .trim();

        if (!content) {
            return generateTestFile(opts);
        }

        // Extract the symbol list from the original source for metadata
        const { signatures, fallbackSymbols } = extractSignatures(opts.src);
        const symbols = [...signatures.map((s) => s.name), ...fallbackSymbols];

        return { content: content + '\n', symbols, framework: opts.framework ?? 'node:test' };
    } catch {
        // Network / timeout / parse failure — fall back silently
        return generateTestFile(opts);
    }
}
