import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { evaluateTesterEditGuard, isTestFilePath } from './tester-edit-guard.js';

describe('isTestFilePath', () => {
    it('accepts TypeScript/JavaScript test conventions', () => {
        assert.equal(isTestFilePath('src/foo.test.ts'), true);
        assert.equal(isTestFilePath('src/foo.test.tsx'), true);
        assert.equal(isTestFilePath('src/foo.spec.js'), true);
        assert.equal(isTestFilePath('apps/api-gateway/src/routes/approvals.test.ts'), true);
        assert.equal(isTestFilePath('packages/sdk/src/client.spec.mjs'), true);
    });

    it('accepts Python test conventions', () => {
        assert.equal(isTestFilePath('tests/test_billing.py'), true);
        assert.equal(isTestFilePath('services/foo/test_handler.py'), true);
        assert.equal(isTestFilePath('foo.test.py'), true);
    });

    it('accepts Go test conventions', () => {
        assert.equal(isTestFilePath('cmd/server/server_test.go'), true);
    });

    it('accepts Java test conventions', () => {
        assert.equal(isTestFilePath('src/test/java/com/acme/FooTest.java'), true);
        assert.equal(isTestFilePath('src/test/java/com/acme/FooTests.java'), true);
        assert.equal(isTestFilePath('src/test/java/com/acme/FooIT.java'), true);
    });

    it('accepts test directory conventions', () => {
        assert.equal(isTestFilePath('__tests__/foo.tsx'), true);
        assert.equal(isTestFilePath('e2e/login.ts'), true);
        assert.equal(isTestFilePath('cypress/e2e/checkout.cy.js'), true);
        assert.equal(isTestFilePath('playwright-tests/smoke.ts'), true);
        assert.equal(isTestFilePath('tests/integration/foo.ts'), true);
        assert.equal(isTestFilePath('apps/website/tests/home.spec.ts'), true);
    });

    it('accepts Windows-style path separators', () => {
        assert.equal(isTestFilePath('apps\\api-gateway\\src\\routes\\approvals.test.ts'), true);
        assert.equal(isTestFilePath('__tests__\\foo.ts'), true);
    });

    it('rejects non-test source files', () => {
        assert.equal(isTestFilePath('src/index.ts'), false);
        assert.equal(isTestFilePath('apps/agent-runtime/src/runtime-server.ts'), false);
        assert.equal(isTestFilePath('packages/db-schema/prisma/schema.prisma'), false);
        assert.equal(isTestFilePath('README.md'), false);
        assert.equal(isTestFilePath('package.json'), false);
        assert.equal(isTestFilePath('Dockerfile'), false);
    });

    it('rejects files that just contain "test" in the name', () => {
        assert.equal(isTestFilePath('src/test-helpers.ts'), false);
        assert.equal(isTestFilePath('src/testing-utils.ts'), false);
        assert.equal(isTestFilePath('src/latest-release.ts'), false);
    });

    it('rejects absolute paths and parent-directory escapes', () => {
        assert.equal(isTestFilePath('/etc/passwd'), false);
        assert.equal(isTestFilePath('C:/Windows/System32/foo.test.ts'), false);
        assert.equal(isTestFilePath('../../etc/foo.test.ts'), false);
        assert.equal(isTestFilePath('apps/../../foo.test.ts'), false);
    });

    it('rejects empty/invalid input', () => {
        assert.equal(isTestFilePath(''), false);
        assert.equal(isTestFilePath('   '), false);
        assert.equal(isTestFilePath(null as unknown as string), false);
        assert.equal(isTestFilePath(undefined as unknown as string), false);
    });
});

describe('evaluateTesterEditGuard', () => {
    it('passes through non-tester roles unchanged', () => {
        const result = evaluateTesterEditGuard({
            roleKey: 'developer',
            actionType: 'code_edit',
            payload: { file_path: 'src/index.ts' },
        });
        assert.equal(result.allowed, true);
    });

    it('passes through non-edit actions for tester role', () => {
        const result = evaluateTesterEditGuard({
            roleKey: 'tester',
            actionType: 'workspace_test_run',
            payload: { file_path: 'src/index.ts' },
        });
        assert.equal(result.allowed, true);
    });

    it('allows tester to edit a test file', () => {
        const result = evaluateTesterEditGuard({
            roleKey: 'tester',
            actionType: 'code_edit',
            payload: { file_path: 'src/foo.test.ts' },
        });
        assert.equal(result.allowed, true);
        assert.equal(result.filePath, 'src/foo.test.ts');
    });

    it('allows tester to use code_edit_patch on a test file', () => {
        const result = evaluateTesterEditGuard({
            roleKey: 'tester',
            actionType: 'code_edit_patch',
            payload: { file_path: 'tests/billing.spec.ts' },
        });
        assert.equal(result.allowed, true);
    });

    it('blocks tester from editing a source file', () => {
        const result = evaluateTesterEditGuard({
            roleKey: 'tester',
            actionType: 'code_edit',
            payload: { file_path: 'src/index.ts' },
        });
        assert.equal(result.allowed, false);
        assert.ok(result.reason?.includes('only edit test files'));
        assert.equal(result.filePath, 'src/index.ts');
    });

    it('blocks tester from editing config or schema', () => {
        const result = evaluateTesterEditGuard({
            roleKey: 'tester',
            actionType: 'code_edit_patch',
            payload: { file_path: 'packages/db-schema/prisma/schema.prisma' },
        });
        assert.equal(result.allowed, false);
    });

    it('rejects missing file_path for tester edit', () => {
        const result = evaluateTesterEditGuard({
            roleKey: 'tester',
            actionType: 'code_edit',
            payload: {},
        });
        assert.equal(result.allowed, false);
        assert.ok(result.reason?.includes('file_path'));
    });

    it('rejects parent-directory escape attempts', () => {
        const result = evaluateTesterEditGuard({
            roleKey: 'tester',
            actionType: 'code_edit',
            payload: { file_path: '../../src/foo.test.ts' },
        });
        assert.equal(result.allowed, false);
    });
});
