import { describe, expect, it } from 'vitest';

import { evaluateTesterEditGuard, isTestFilePath } from './tester-edit-guard.js';

describe('isTestFilePath', () => {
    it('accepts TypeScript/JavaScript test conventions', () => {
        expect(isTestFilePath('src/foo.test.ts')).toBe(true);
        expect(isTestFilePath('src/foo.test.tsx')).toBe(true);
        expect(isTestFilePath('src/foo.spec.js')).toBe(true);
        expect(isTestFilePath('apps/api-gateway/src/routes/approvals.test.ts')).toBe(true);
        expect(isTestFilePath('packages/sdk/src/client.spec.mjs')).toBe(true);
    });

    it('accepts Python test conventions', () => {
        expect(isTestFilePath('tests/test_billing.py')).toBe(true);
        expect(isTestFilePath('services/foo/test_handler.py')).toBe(true);
        expect(isTestFilePath('foo.test.py')).toBe(true);
    });

    it('accepts Go test conventions', () => {
        expect(isTestFilePath('cmd/server/server_test.go')).toBe(true);
    });

    it('accepts Java test conventions', () => {
        expect(isTestFilePath('src/test/java/com/acme/FooTest.java')).toBe(true);
        expect(isTestFilePath('src/test/java/com/acme/FooTests.java')).toBe(true);
        expect(isTestFilePath('src/test/java/com/acme/FooIT.java')).toBe(true);
    });

    it('accepts test directory conventions', () => {
        expect(isTestFilePath('__tests__/foo.tsx')).toBe(true);
        expect(isTestFilePath('e2e/login.ts')).toBe(true);
        expect(isTestFilePath('cypress/e2e/checkout.cy.js')).toBe(true);
        expect(isTestFilePath('playwright-tests/smoke.ts')).toBe(true);
        expect(isTestFilePath('tests/integration/foo.ts')).toBe(true);
        expect(isTestFilePath('apps/website/tests/home.spec.ts')).toBe(true);
    });

    it('accepts Windows-style path separators', () => {
        expect(isTestFilePath('apps\\api-gateway\\src\\routes\\approvals.test.ts')).toBe(true);
        expect(isTestFilePath('__tests__\\foo.ts')).toBe(true);
    });

    it('rejects non-test source files', () => {
        expect(isTestFilePath('src/index.ts')).toBe(false);
        expect(isTestFilePath('apps/agent-runtime/src/runtime-server.ts')).toBe(false);
        expect(isTestFilePath('packages/db-schema/prisma/schema.prisma')).toBe(false);
        expect(isTestFilePath('README.md')).toBe(false);
        expect(isTestFilePath('package.json')).toBe(false);
        expect(isTestFilePath('Dockerfile')).toBe(false);
    });

    it('rejects files that just contain "test" in the name', () => {
        expect(isTestFilePath('src/test-helpers.ts')).toBe(false);
        expect(isTestFilePath('src/testing-utils.ts')).toBe(false);
        expect(isTestFilePath('src/latest-release.ts')).toBe(false);
    });

    it('rejects absolute paths and parent-directory escapes', () => {
        expect(isTestFilePath('/etc/passwd')).toBe(false);
        expect(isTestFilePath('C:/Windows/System32/foo.test.ts')).toBe(false);
        expect(isTestFilePath('../../etc/foo.test.ts')).toBe(false);
        expect(isTestFilePath('apps/../../foo.test.ts')).toBe(false);
    });

    it('rejects empty/invalid input', () => {
        expect(isTestFilePath('')).toBe(false);
        expect(isTestFilePath('   ')).toBe(false);
        expect(isTestFilePath(null as unknown as string)).toBe(false);
        expect(isTestFilePath(undefined as unknown as string)).toBe(false);
    });
});

describe('evaluateTesterEditGuard', () => {
    it('passes through non-tester roles unchanged', () => {
        const result = evaluateTesterEditGuard({
            roleKey: 'developer',
            actionType: 'code_edit',
            payload: { file_path: 'src/index.ts' },
        });
        expect(result.allowed).toBe(true);
    });

    it('passes through non-edit actions for tester role', () => {
        const result = evaluateTesterEditGuard({
            roleKey: 'tester',
            actionType: 'workspace_test_run',
            payload: { file_path: 'src/index.ts' },
        });
        expect(result.allowed).toBe(true);
    });

    it('allows tester to edit a test file', () => {
        const result = evaluateTesterEditGuard({
            roleKey: 'tester',
            actionType: 'code_edit',
            payload: { file_path: 'src/foo.test.ts' },
        });
        expect(result.allowed).toBe(true);
        expect(result.filePath).toBe('src/foo.test.ts');
    });

    it('allows tester to use code_edit_patch on a test file', () => {
        const result = evaluateTesterEditGuard({
            roleKey: 'tester',
            actionType: 'code_edit_patch',
            payload: { file_path: 'tests/billing.spec.ts' },
        });
        expect(result.allowed).toBe(true);
    });

    it('blocks tester from editing a source file', () => {
        const result = evaluateTesterEditGuard({
            roleKey: 'tester',
            actionType: 'code_edit',
            payload: { file_path: 'src/index.ts' },
        });
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('only edit test files');
        expect(result.filePath).toBe('src/index.ts');
    });

    it('blocks tester from editing config or schema', () => {
        const result = evaluateTesterEditGuard({
            roleKey: 'tester',
            actionType: 'code_edit_patch',
            payload: { file_path: 'packages/db-schema/prisma/schema.prisma' },
        });
        expect(result.allowed).toBe(false);
    });

    it('rejects missing file_path for tester edit', () => {
        const result = evaluateTesterEditGuard({
            roleKey: 'tester',
            actionType: 'code_edit',
            payload: {},
        });
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('file_path');
    });

    it('rejects parent-directory escape attempts', () => {
        const result = evaluateTesterEditGuard({
            roleKey: 'tester',
            actionType: 'code_edit',
            payload: { file_path: '../../src/foo.test.ts' },
        });
        expect(result.allowed).toBe(false);
    });
});
