#!/usr/bin/env node

/**
 * Epic A4: CI Import Boundary Checker
 * Enforces that only packages/shared-types is used for cross-service contracts
 * Fails CI if any service directly imports from another service
 * Frozen 2026-04-30
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../../..');

const violations = [];

// Define service boundaries
const SERVICES = ['api-gateway', 'agent-runtime', 'orchestrator', 'dashboard'];
const SERVICE_DIRS = ['apps', 'services'];

// Scan a file for violations
function scanFile(filePath) {
    if (!filePath.endsWith('.ts') && !filePath.endsWith('.tsx')) return;
    if (filePath.includes('node_modules') || filePath.includes('dist')) return;

    let content;
    try {
        content = fs.readFileSync(filePath, 'utf-8');
    } catch {
        return;
    }

    const lines = content.split('\n');
    let lineNumber = 0;

    for (const line of lines) {
        lineNumber++;

        // Check for direct service imports
        // Pattern: from '@agentfarm/api-gateway' or from '../../../services/...'
        const agentfarmImports = line.match(/from\s+['"]@agentfarm\/[a-z\-]+['"]/g);
        const relativeServiceImports = line.match(/from\s+['"]\.\..*\/(apps|services)\/([a-z\-]+)/g);

        if (agentfarmImports) {
            for (const imp of agentfarmImports) {
                const match = imp.match(/@agentfarm\/([a-z\-]+)/);
                if (match && !['shared-types', 'queue-contracts', 'connector-contracts', 'observability'].includes(match[1])) {
                    violations.push({
                        file: filePath,
                        line: lineNumber,
                        content: line.trim(),
                        violatingImport: imp.replace(/^from\s+|['"]/g, ''),
                    });
                }
            }
        }

        if (relativeServiceImports) {
            for (const imp of relativeServiceImports) {
                const isSharedPackage = imp.includes('/packages/');
                if (!isSharedPackage) {
                    violations.push({
                        file: filePath,
                        line: lineNumber,
                        content: line.trim(),
                        violatingImport: imp.replace(/^from\s+|['"]/g, ''),
                    });
                }
            }
        }
    }
}

// Recursively scan directories
function scanDirectory(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            scanDirectory(fullPath);
        } else {
            scanFile(fullPath);
        }
    }
}

// Main execution
function main() {
    console.log('🔍 Epic A4: Checking import boundaries for cross-service contract integrity...\n');

    // Scan all service and app directories
    for (const baseDir of SERVICE_DIRS) {
        const servicesPath = path.join(rootDir, baseDir);
        if (fs.existsSync(servicesPath)) {
            scanDirectory(servicesPath);
        }
    }

    if (violations.length === 0) {
        console.log('✅ PASS: No cross-service contract violations found.');
        console.log('   All services correctly use packages/shared-types for contracts.\n');
        process.exit(0);
    }

    // Report violations
    console.error('❌ FAIL: Cross-service contract violations detected:\n');
    for (const violation of violations) {
        const relativePath = path.relative(rootDir, violation.file);
        console.error(`  ${relativePath}:${violation.line}`);
        console.error(`    ❌ Import: ${violation.violatingImport}`);
        console.error(`    Code: ${violation.content}`);
        console.error(`    Fix: Use packages/shared-types instead of direct service imports\n`);
    }

    console.error(`\n📋 Total violations: ${violations.length}`);
    console.error('   Remediation: Move type definitions to packages/shared-types and import from there.\n');
    process.exit(1);
}

main();

