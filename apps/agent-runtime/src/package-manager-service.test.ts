/**
 * Feature #6 — Package Manager Service tests
 * Frozen 2026-05-07
 */

import { describe, it, expect } from 'vitest';
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
        expect(isValidPackageName('lodash')).toBe(true);
        expect(isValidPackageName('@types/node')).toBe(true);
        expect(isValidPackageName('react-dom')).toBe(true);
        expect(isValidPackageName('lodash@4.17.21')).toBe(true);
    });

    it('rejects names with shell metacharacters', () => {
        expect(isValidPackageName('lodash; rm -rf /')).toBe(false);
        expect(isValidPackageName('pkg && evil')).toBe(false);
        expect(isValidPackageName('$(evil)')).toBe(false);
        expect(isValidPackageName('')).toBe(false);
    });
});

describe('safePackageOperation', () => {
    it('returns success record on install', async () => {
        const record = await safePackageOperation(base, okRunner);
        expect(record.success).toBe(true);
        expect(record.operation).toBe('install');
        expect(record.packages).toEqual(['lodash']);
        expect(record.contractVersion).toBeDefined();
    });

    it('returns failure record when runner exits non-zero', async () => {
        const record = await safePackageOperation(base, failRunner);
        expect(record.success).toBe(false);
        expect(record.lockfileChanged).toBe(false);
    });

    it('detects high-severity vulnerabilities after install', async () => {
        const record = await safePackageOperation(base, auditRunner);
        expect(record.newVulnerabilities).toContain('lodash (high)');
    });

    it('classifies uninstall as high risk', async () => {
        const record = await safePackageOperation(
            { ...base, operation: 'uninstall' },
            okRunner,
        );
        expect(record.riskLevel).toBe('high');
    });

    it('throws on invalid package name before touching shell', async () => {
        const runner: ShellRunnerFn = async () => {
            throw new Error('shell should not have been called');
        };
        await expect(
            safePackageOperation({ ...base, packages: ['evil; rm -rf /'] }, runner),
        ).rejects.toThrow('Invalid package name');
    });

    it('marks dev installs correctly', async () => {
        const record = await safePackageOperation({ ...base, isDev: true }, okRunner);
        expect(record.isDev).toBe(true);
    });
});
