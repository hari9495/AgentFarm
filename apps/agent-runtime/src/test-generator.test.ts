import test from 'node:test';
import assert from 'node:assert/strict';
import { extractSignatures, categorise, inferArgs, generateTestFile } from './test-generator.js';

// ---------------------------------------------------------------------------
// extractSignatures
// ---------------------------------------------------------------------------

test('extractSignatures: detects regular exported function with params and return type', () => {
    const src = `export function add(a: number, b: number): number { return a + b; }`;
    const { signatures, fallbackSymbols } = extractSignatures(src);
    assert.equal(signatures.length, 1);
    assert.equal(signatures[0]!.name, 'add');
    assert.equal(signatures[0]!.returnType, 'number');
    assert.equal(signatures[0]!.isAsync, false);
    assert.equal(fallbackSymbols.length, 0);
});

test('extractSignatures: detects async exported function', () => {
    const src = `export async function fetchUser(id: string): Promise<User> { return {}; }`;
    const { signatures } = extractSignatures(src);
    assert.equal(signatures.length, 1);
    assert.equal(signatures[0]!.name, 'fetchUser');
    assert.equal(signatures[0]!.isAsync, true);
});

test('extractSignatures: detects arrow function export', () => {
    const src = `export const formatEmail = (email: string): string => email.trim().toLowerCase();`;
    const { signatures } = extractSignatures(src);
    assert.equal(signatures.length, 1);
    assert.equal(signatures[0]!.name, 'formatEmail');
    assert.equal(signatures[0]!.returnType, 'string');
});

test('extractSignatures: detects multiple functions', () => {
    const src = `
export function add(a: number, b: number): number { return a + b; }
export function sub(a: number, b: number): number { return a - b; }
export const isEmail = (email: string): boolean => email.includes('@');
`;
    const { signatures } = extractSignatures(src);
    assert.equal(signatures.length, 3);
    const names = signatures.map((s) => s.name);
    assert.ok(names.includes('add'));
    assert.ok(names.includes('sub'));
    assert.ok(names.includes('isEmail'));
});

test('extractSignatures: class with no function sig goes to fallbackSymbols', () => {
    const src = `export class UserService { getUser(id: string) {} }`;
    const { signatures, fallbackSymbols } = extractSignatures(src);
    assert.equal(signatures.length, 0);
    assert.ok(fallbackSymbols.includes('UserService'));
});

// ---------------------------------------------------------------------------
// categorise
// ---------------------------------------------------------------------------

test('categorise: boolean return type', () => {
    assert.equal(categorise('check', 'boolean'), 'boolean');
    assert.equal(categorise('anything', 'bool'), 'boolean');
});

test('categorise: number return type', () => {
    assert.equal(categorise('myFunc', 'number'), 'number');
});

test('categorise: string return type', () => {
    assert.equal(categorise('myFunc', 'string'), 'string');
});

test('categorise: array return type', () => {
    assert.equal(categorise('myFunc', 'string[]'), 'array');
    assert.equal(categorise('myFunc', 'Array<string>'), 'array');
});

test('categorise: void return type', () => {
    assert.equal(categorise('doSomething', 'void'), 'void');
});

test('categorise: nullable return type from union', () => {
    assert.equal(categorise('findUser', 'User | null'), 'nullable');
    assert.equal(categorise('getItem', 'string | undefined'), 'nullable');
});

test('categorise: is* / has* prefix forces boolean', () => {
    assert.equal(categorise('isValid', ''), 'boolean');
    assert.equal(categorise('hasPermission', ''), 'boolean');
    assert.equal(categorise('validateEmail', ''), 'boolean');
});

test('categorise: add/sum/sub prefix forces number', () => {
    assert.equal(categorise('addNumbers', ''), 'number');
    assert.equal(categorise('sumAll', ''), 'number');
    assert.equal(categorise('subtract', ''), 'number');
});

test('categorise: format/to prefix forces string', () => {
    assert.equal(categorise('formatDate', ''), 'string');
    assert.equal(categorise('toString', ''), 'string');
});

test('categorise: filter/sort prefix forces array', () => {
    assert.equal(categorise('filterByRole', ''), 'array');
    assert.equal(categorise('sortByDate', ''), 'array');
});

test('categorise: get/find prefix forces nullable', () => {
    assert.equal(categorise('getUser', ''), 'nullable');
    assert.equal(categorise('findById', ''), 'nullable');
});

test('categorise: create/build prefix forces object', () => {
    assert.equal(categorise('createUser', ''), 'object');
    assert.equal(categorise('buildConfig', ''), 'object');
});

test('categorise: unknown for unrecognised name with no return type', () => {
    assert.equal(categorise('xyzAbc', ''), 'unknown');
});

// ---------------------------------------------------------------------------
// inferArgs
// ---------------------------------------------------------------------------

test('inferArgs: empty params returns empty string', () => {
    assert.equal(inferArgs(''), '');
});

test('inferArgs: email param returns example email', () => {
    const result = inferArgs('email: string');
    assert.ok(result.includes('@'), `expected email address in: ${result}`);
});

test('inferArgs: name param returns Alice', () => {
    assert.equal(inferArgs('name: string'), "'Alice'");
});

test('inferArgs: num param returns 42', () => {
    assert.equal(inferArgs('num: number'), '42');
});

test('inferArgs: multiple params', () => {
    const result = inferArgs('a: number, b: number');
    assert.match(result, /,/);
});

// ---------------------------------------------------------------------------
// generateTestFile — node:test (default)
// ---------------------------------------------------------------------------

test('generateTestFile: generates real assertions for add function (node:test)', () => {
    const src = `export function add(a: number, b: number): number { return a + b; }`;
    const { content, symbols, framework } = generateTestFile({ src, filePath: 'src/math.ts' });
    assert.equal(framework, 'node:test');
    assert.ok(symbols.includes('add'));
    assert.ok(content.includes("import test from 'node:test'"));
    assert.ok(content.includes("import assert from 'node:assert/strict'"));
    assert.ok(content.includes('assert.equal(add(2, 3), 5)'), `Expected sum assertion in:\n${content}`);
    assert.ok(content.includes('assert.equal(add(0, 0), 0)'), `Expected zero assertion in:\n${content}`);
    assert.ok(!content.includes('TODO'), 'Must not contain TODO stubs');
    assert.ok(!content.includes('assert.ok(true)'), 'Must not contain trivial ok(true) stubs');
});

test('generateTestFile: generates real assertions for sub function (node:test)', () => {
    const src = `export function sub(a: number, b: number): number { return a - b; }`;
    const { content } = generateTestFile({ src, filePath: 'src/math.ts' });
    assert.ok(content.includes('assert.equal(sub(5, 3), 2)'), `Expected diff assertion in:\n${content}`);
    assert.ok(content.includes('assert.equal(sub(4, 4), 0)'), `Expected zero-diff assertion in:\n${content}`);
});

test('generateTestFile: generates boolean assertions for isEmail (node:test)', () => {
    const src = `export function isEmail(email: string): boolean { return email.includes('@'); }`;
    const { content } = generateTestFile({ src, filePath: 'src/validate.ts' });
    assert.ok(content.includes("typeof result, 'boolean'") || content.includes("'boolean'"), `Expected boolean type check in:\n${content}`);
});

test('generateTestFile: generates string assertions for formatDate (node:test)', () => {
    const src = `export function formatDate(date: string): string { return date; }`;
    const { content } = generateTestFile({ src, filePath: 'src/util.ts' });
    assert.ok(content.includes("'string'"), `Expected string type check in:\n${content}`);
    assert.ok(content.includes('.length > 0'), `Expected length check in:\n${content}`);
});

test('generateTestFile: generates array assertions for filterUsers (node:test)', () => {
    const src = `export function filterUsers(users: string[]): string[] { return users; }`;
    const { content } = generateTestFile({ src, filePath: 'src/util.ts' });
    assert.ok(content.includes('Array.isArray'), `Expected Array.isArray check in:\n${content}`);
});

// ---------------------------------------------------------------------------
// generateTestFile — jest format
// ---------------------------------------------------------------------------

test('generateTestFile: generates jest describe/it blocks', () => {
    const src = `export function add(a: number, b: number): number { return a + b; }`;
    const { content, framework } = generateTestFile({ src, filePath: 'src/math.ts', framework: 'jest' });
    assert.equal(framework, 'jest');
    assert.ok(content.includes('describe('), `Expected describe() in:\n${content}`);
    assert.ok(content.includes("toBe(5)"), `Expected toBe(5) in:\n${content}`);
    assert.ok(!content.includes("import { describe"), 'jest format must NOT import describe (vitest only)');
});

// ---------------------------------------------------------------------------
// generateTestFile — vitest format
// ---------------------------------------------------------------------------

test('generateTestFile: generates vitest import header', () => {
    const src = `export function add(a: number, b: number): number { return a + b; }`;
    const { content, framework } = generateTestFile({ src, filePath: 'src/math.ts', framework: 'vitest' });
    assert.equal(framework, 'vitest');
    assert.ok(content.includes("from 'vitest'"), `Expected vitest import in:\n${content}`);
    assert.ok(content.includes('describe('));
});

// ---------------------------------------------------------------------------
// generateTestFile — no exports
// ---------------------------------------------------------------------------

test('generateTestFile: returns empty content for file with no exports', () => {
    const src = `function internal() {}`;
    const { content, symbols } = generateTestFile({ src, filePath: 'src/util.ts' });
    assert.equal(symbols.length, 0);
    assert.equal(content, '');
});
