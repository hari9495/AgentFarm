/**
 * eslint-plugin-agentfarm-boundaries
 *
 * Enforces monorepo import boundary rules for AgentFarm:
 *
 * Rules:
 *  - no-cross-service-imports:   apps/* must not import directly from services/*
 *  - shared-types-universal:     packages/shared-types is importable everywhere
 *  - connector-contracts-isolation: packages/connector-contracts only importable
 *                                   by services/connector-gateway
 *  - runtime-plane-isolation:    apps/agent-runtime modules not importable by
 *                                control-plane services (approval, identity, policy)
 */

'use strict';

// Normalise Windows paths to forward slashes for consistent matching.
const toForwardSlash = (p) => p.replace(/\\/g, '/');

/** Detect which workspace member the given filename belongs to. */
function classify(filename) {
    const fp = toForwardSlash(filename);
    const match = fp.match(/(apps|services|packages|infrastructure)\/([^/]+)/);
    if (!match) return null;
    return { zone: match[1], name: match[2] };
}

/** Resolve whether an import path string references a workspace package. */
function importedPackage(importPath) {
    // Internal workspace packages use @agentfarm/ namespace
    const m = importPath.match(/^@agentfarm\/([^/]+)/);
    if (m) return { alias: m[1] };

    // Relative imports (../../services/...) - only flag absolute workspace paths
    return null;
}

// ---------------------------------------------------------------------------
// Rule: no-cross-service-imports
// apps/* must not import directly from services/* via @agentfarm/<service-name>
// ---------------------------------------------------------------------------
const noCrossServiceImports = {
    meta: {
        type: 'problem',
        docs: {
            description: 'Apps must not import directly from service packages; use shared-types or API contracts.',
            category: 'Boundaries',
            recommended: true,
        },
        messages: {
            noDirectServiceImport:
                'Import from "{{pkg}}" is not allowed in apps/*. Use shared contract packages instead.',
        },
        schema: [],
    },
    create(context) {
        const caller = classify(toForwardSlash(context.getFilename()));
        if (!caller || caller.zone !== 'apps') return {};

        const SERVICE_PACKAGES = new Set([
            'approval-service', 'connector-gateway', 'evidence-service',
            'identity-service', 'notification-service', 'policy-engine',
            'provisioning-service',
        ]);

        return {
            ImportDeclaration(node) {
                const pkg = importedPackage(node.source.value);
                if (pkg && SERVICE_PACKAGES.has(pkg.alias)) {
                    context.report({
                        node,
                        messageId: 'noDirectServiceImport',
                        data: { pkg: node.source.value },
                    });
                }
            },
        };
    },
};

// ---------------------------------------------------------------------------
// Rule: connector-contracts-isolation
// packages/connector-contracts is only importable by services/connector-gateway
// ---------------------------------------------------------------------------
const connectorContractsIsolation = {
    meta: {
        type: 'problem',
        docs: {
            description: 'Only services/connector-gateway may import from @agentfarm/connector-contracts.',
            category: 'Boundaries',
            recommended: true,
        },
        messages: {
            connectorContractsRestricted:
                'Only services/connector-gateway may import "@agentfarm/connector-contracts".',
        },
        schema: [],
    },
    create(context) {
        const caller = classify(toForwardSlash(context.getFilename()));
        if (!caller) return {};
        // Allow connector-gateway and connector-contracts itself
        if (caller.name === 'connector-gateway' || caller.name === 'connector-contracts') return {};

        return {
            ImportDeclaration(node) {
                if (node.source.value === '@agentfarm/connector-contracts') {
                    context.report({ node, messageId: 'connectorContractsRestricted' });
                }
            },
        };
    },
};

// ---------------------------------------------------------------------------
// Rule: runtime-plane-isolation
// Control-plane services must not import from agent-runtime
// ---------------------------------------------------------------------------
const runtimePlaneIsolation = {
    meta: {
        type: 'problem',
        docs: {
            description: 'Control-plane services must not import directly from apps/agent-runtime.',
            category: 'Boundaries',
            recommended: true,
        },
        messages: {
            runtimeImportRestricted:
                'Control-plane service "{{zone}}/{{name}}" must not import from "@agentfarm/agent-runtime".',
        },
        schema: [],
    },
    create(context) {
        const caller = classify(toForwardSlash(context.getFilename()));
        if (!caller) return {};

        const CONTROL_PLANE_SERVICES = new Set([
            'approval-service', 'identity-service', 'policy-engine',
        ]);

        const isControlPlane =
            caller.zone === 'services' && CONTROL_PLANE_SERVICES.has(caller.name);
        if (!isControlPlane) return {};

        return {
            ImportDeclaration(node) {
                if (node.source.value.startsWith('@agentfarm/agent-runtime')) {
                    context.report({
                        node,
                        messageId: 'runtimeImportRestricted',
                        data: { zone: caller.zone, name: caller.name },
                    });
                }
            },
        };
    },
};

// ---------------------------------------------------------------------------
// Plugin export
// ---------------------------------------------------------------------------
module.exports = {
    meta: {
        name: 'eslint-plugin-agentfarm-boundaries',
        version: '1.0.0',
    },
    rules: {
        'no-cross-service-imports': noCrossServiceImports,
        'connector-contracts-isolation': connectorContractsIsolation,
        'runtime-plane-isolation': runtimePlaneIsolation,
    },
    configs: {
        recommended: {
            plugins: ['agentfarm-boundaries'],
            rules: {
                'agentfarm-boundaries/no-cross-service-imports': 'error',
                'agentfarm-boundaries/connector-contracts-isolation': 'error',
                'agentfarm-boundaries/runtime-plane-isolation': 'error',
            },
        },
    },
};
