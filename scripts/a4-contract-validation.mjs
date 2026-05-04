#!/usr/bin/env node

/**
 * Epic A4: Contract Compatibility Validation
 * Validates that all versioned contracts have required metadata fields
 * Runs as part of quality-gate pipeline (no TS compilation needed)
 */

import fs from 'fs';
import path from 'path';

const sharedTypesPath = path.resolve(process.cwd(), 'packages', 'shared-types', 'src', 'index.ts');

if (!fs.existsSync(sharedTypesPath)) {
    console.error('❌ FAIL: packages/shared-types/src/index.ts not found');
    process.exit(1);
}

const content = fs.readFileSync(sharedTypesPath, 'utf-8');

// Contract validation rules
const expectedContracts = {
    SignupProvisioningRequested: ['contractVersion', 'correlationId'],
    ProvisioningJobRecord: ['contractVersion', 'correlationId'],
    ApprovalRecord: ['contractVersion', 'correlationId'],
    AuditEventRecord: ['contractVersion', 'correlationId'],
    ConnectorActionRecord: ['contractVersion', 'correlationId'],
    WorkMemoryRecord: ['contractVersion', 'correlationId'],
    ReproPackRecord: ['contractVersion', 'correlationId'],
    RunResumeRecord: ['contractVersion', 'correlationId'],
};

const requiredContractVersionKeys = [
    'PROVISIONING',
    'APPROVAL',
    'AUDIT_EVENT',
    'CONNECTOR_ACTION',
    'WORK_MEMORY',
    'REPRO_PACK',
];

let violations = 0;

for (const [contractName, requiredFields] of Object.entries(expectedContracts)) {
    // Find the interface definition
    const interfaceRegex = new RegExp(`interface\\s+${contractName}\\s*\\{`);
    if (!content.match(interfaceRegex)) {
        console.error(`❌ FAIL: Interface ${contractName} not found in shared-types`);
        violations++;
        continue;
    }

    // Extract the interface body
    const startIdx = content.indexOf(`interface ${contractName}`);
    let braceCount = 0;
    let foundStart = false;
    let endIdx = startIdx;

    for (let i = startIdx; i < content.length; i++) {
        if (content[i] === '{') {
            foundStart = true;
            braceCount++;
        } else if (content[i] === '}') {
            braceCount--;
            if (foundStart && braceCount === 0) {
                endIdx = i;
                break;
            }
        }
    }

    const interfaceBody = content.substring(startIdx, endIdx + 1);

    // Check for required fields
    for (const field of requiredFields) {
        const fieldRegex = new RegExp(`\\b${field}\\b.*?[;?:]`);
        if (!fieldRegex.test(interfaceBody)) {
            console.error(
                `❌ FAIL: ${contractName} missing required field '${field}' (A4 contract versioning)`,
            );
            violations++;
        }
    }
}

// Check CONTRACT_VERSIONS constant exists
if (!content.includes('CONTRACT_VERSIONS')) {
    console.error('❌ FAIL: CONTRACT_VERSIONS constant not found in shared-types');
    violations++;
}

for (const key of requiredContractVersionKeys) {
    const keyRegex = new RegExp(`\\b${key}\\s*:`);
    if (!keyRegex.test(content)) {
        console.error(`❌ FAIL: CONTRACT_VERSIONS missing required key '${key}'`);
        violations++;
    }
}

// Check validateContractMeta validator exists
if (!content.includes('validateContractMeta')) {
    console.error('❌ FAIL: validateContractMeta validator not found in shared-types');
    violations++;
}

if (violations === 0) {
    console.log('✅ PASS: All contracts have required versioning metadata (contractVersion + correlationId)');
    console.log('   - SignupProvisioningRequested: ✓ versioned');
    console.log('   - ProvisioningJobRecord: ✓ versioned');
    console.log('   - ApprovalRecord: ✓ versioned');
    console.log('   - AuditEventRecord: ✓ versioned');
    console.log('   - ConnectorActionRecord: ✓ versioned');
    console.log('   - WorkMemoryRecord: ✓ versioned');
    console.log('   - ReproPackRecord: ✓ versioned');
    console.log('   - RunResumeRecord: ✓ versioned');
    console.log('   - CONTRACT_VERSIONS keys: ✓ PROVISIONING/APPROVAL/AUDIT_EVENT/CONNECTOR_ACTION/WORK_MEMORY/REPRO_PACK');
    console.log('   - validateContractMeta: ✓ validator present');
    console.log('   - CONTRACT_VERSIONS: ✓ constants defined\n');
    process.exit(0);
}

console.error(`\n❌ Contract validation failed with ${violations} violations`);
process.exit(1);
