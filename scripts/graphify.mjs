#!/usr/bin/env node
/**
 * scripts/graphify.mjs
 *
 * Dev tool — visualise the AgentFarm monorepo package dependency graph.
 * Reads every package.json under apps/, services/, and packages/, then
 * renders a Mermaid flowchart that shows which packages depend on which.
 *
 * Usage:
 *   node scripts/graphify.mjs               # print Mermaid to stdout
 *   node scripts/graphify.mjs --json        # print adjacency list as JSON
 *   node scripts/graphify.mjs --dot         # Graphviz DOT output
 *
 * The output can be pasted into https://mermaid.live or piped to mmdc.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── Config ────────────────────────────────────────────────────────────────────

const SCAN_ROOTS = ['apps', 'services', 'packages'];
const ARG = process.argv[2] ?? '';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Recursively find all package.json files one level deep under each scan root. */
function findPackageJsons() {
    const results = [];
    for (const root of SCAN_ROOTS) {
        const rootPath = join(ROOT, root);
        if (!existsSync(rootPath)) continue;
        for (const entry of readdirSync(rootPath)) {
            const pkgDir = join(rootPath, entry);
            if (!statSync(pkgDir).isDirectory()) continue;
            const pkgJson = join(pkgDir, 'package.json');
            if (!existsSync(pkgJson)) continue;
            results.push({ dir: pkgDir, pkgJsonPath: pkgJson, segment: root });
        }
    }
    return results;
}

/** Parse a package.json safely; return null on error. */
function readPkg(path) {
    try {
        return JSON.parse(readFileSync(path, 'utf-8'));
    } catch {
        return null;
    }
}

/** Sanitise a package name to a Mermaid-safe node ID. */
function toNodeId(name) {
    return name.replace(/[@/]/g, '_').replace(/[^a-zA-Z0-9_]/g, '_');
}

// ── Build graph ───────────────────────────────────────────────────────────────

const packages = findPackageJsons();
/** name → { nodeId, segment, deps: string[] } */
const graph = new Map();

for (const { pkgJsonPath, segment } of packages) {
    const pkg = readPkg(pkgJsonPath);
    if (!pkg?.name) continue;
    const deps = Object.keys({
        ...(pkg.dependencies ?? {}),
        ...(pkg.devDependencies ?? {}),
        ...(pkg.peerDependencies ?? {}),
    }).filter((d) => d.startsWith('@agentfarm/'));
    graph.set(pkg.name, { nodeId: toNodeId(pkg.name), segment, deps });
}

// ── Output ────────────────────────────────────────────────────────────────────

if (ARG === '--json') {
    const obj = {};
    for (const [name, meta] of graph) {
        obj[name] = meta.deps;
    }
    console.log(JSON.stringify(obj, null, 2));

} else if (ARG === '--dot') {
    console.log('digraph agentfarm {');
    console.log('  rankdir=LR;');
    for (const [name, meta] of graph) {
        for (const dep of meta.deps) {
            if (graph.has(dep)) {
                console.log(`  "${name}" -> "${dep}";`);
            }
        }
    }
    console.log('}');

} else {
    // Default: Mermaid flowchart
    const segmentColor = {
        apps: 'fill:#dbeafe,stroke:#3b82f6',
        services: 'fill:#dcfce7,stroke:#22c55e',
        packages: 'fill:#fef9c3,stroke:#eab308',
    };

    const lines = ['flowchart LR'];
    const styles = [];

    for (const [name, meta] of graph) {
        const label = name.replace('@agentfarm/', '');
        lines.push(`  ${meta.nodeId}["${label}"]`);
        styles.push(`  style ${meta.nodeId} ${segmentColor[meta.segment] ?? ''}`);
    }

    lines.push('');
    for (const [name, meta] of graph) {
        for (const dep of meta.deps) {
            const target = graph.get(dep);
            if (target) {
                lines.push(`  ${meta.nodeId} --> ${target.nodeId}`);
            }
        }
    }

    lines.push('');
    lines.push(...styles);
    console.log(lines.join('\n'));
}
