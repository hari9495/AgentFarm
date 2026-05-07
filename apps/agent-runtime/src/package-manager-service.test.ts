/**
 * Feature #6 - Package Manager Service tests
 * Frozen 2026-05-07
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    isValidPackageName,
    safePackageOperation,
    type PackageOperationInput,
    type ShellRunnerFn,
} from './package-manager-service.js';

const base: PackageOperationInput = {
    tenantId: 't1',
    workspaceId: 'w1',
    taskId: 'task-1',
    operation: 'install',
    packages: ['lodash'],
    manager: 'pnpm',
    isDev: false,
    workspacePath: '/tmp/workspace',
    correlationId: 'corr-1',
};

const okRunner: ShellRunnerFn = async () => ({ stdout: '', stderr: '', exitCode: 0 });
const failRunner: ShellRunnerFn = async () => ({ stdout: '', stderr: 'err', exitCode: 1 });

const auditRunner: ShellRunnerFn = async (_cmd, args) => {
    if (args.includes('audit')) {
        return {
            stdout: JSON.stringify({
                vulnerabilities: { 'lodash': { severity: 'high' } },
            }),
            stderr: '',
            exitCode: 0,
        };
    }
    return { stdout: '', stderr: '', exitCode: 0 };
};

describe('isValidPackageName', () => {
    it('accepts standard names', () => {
        assert.equal(isValidPackageName('lodash'), true);
        assert.equal(isValidPackageName('@types/node'), true);
        assert.equal(isValidPackageName('react-dom'), true);
        assert.equal(isValidPackageName('lodash@4.17.21'), true);
    });

    it('rejects names with shell metacharacters', () => {
        assert.equal(isValidPackageName('lodash; rm -rf /'), false);
        assert.equal(isValidPackageName('pkg && evil'), false);
        assert.equal(isValidPackageName('$(evil)'), false);
        assert.equal(isValidPackageName(''), false);
    });
});

describe('safePackageOperation', () => {
    it('returns success record on install', async () => {
        const record = await safePackageOperation(base, okRunner);
        assert.equal(record.success, true);
        assert.equal(record.operation, 'install');
        assert.deepEqual(record.packages, ['lodash']);
        assert.ok(record.contractVersion);
    });

    it('returns failure record when runner exits non-zero', async () => {
        const record = await safePackageOperation(base, failRunner);
        assert.equal(record.success, false);
        assert.equal(record.lockfileChanged, false);
    });

    it('detects high-severity vulnerabilities after install', async () => {
        const record = await safePackageOperation(base, auditRunner);
        assert.ok(record.newVulnerabilities.includes('lodash (high)'));
    });

    it('classifies uninstall as high risk', async () => {
        const record = await safePackageOperation(
            { ...base, operation: 'uninstall' },
            okRunner,
        );
        assert.equal(record.riskLevel, 'high');
    });

    it('throws on invalid package name before touching shell', async () => {
        const runner: ShellRunnerFn = async () => {
            throw new Error('shell should not have been called');
        };
        await assert.rejects(
            () => safePackageOperation({ ...base, packages: ['evil; rm -rf /'] }, runner),
            /Invalid package name/,
        );
    });

    it('marks dev installs correctly', async () => {
        const record = await safePackageOperation({ ...base, isDev: true }, okRunner);
        assert.equal(record.isDev, true);
    });
});
