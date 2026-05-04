/**
 * Repo Knowledge Graph
 *
 * Builds and queries an in-memory symbol graph for the workspace:
 *  - Symbol index: maps file → exported symbols with types
 *  - Call graph: maps callerSymbol → set of calleeSymbols
 *  - Dependency graph: maps packageId → set of direct dependency IDs
 *  - Learning store: persists task outcomes for contextual next-action suggestions
 *
 * The graph is populated by parsing file content with lightweight regex heuristics
 * (no TypeScript compiler API required). For production accuracy the graph can be
 * hydrated from a tsserver-based indexer.
 */

import { writeFile, readFile, mkdir, readdir, stat } from 'node:fs/promises';
import { join, extname, relative } from 'node:path';
import { tmpdir } from 'node:os';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SymbolKind = 'function' | 'class' | 'interface' | 'type' | 'const' | 'enum' | 'unknown';

export type SymbolEntry = {
    name: string;
    kind: SymbolKind;
    file: string;
    line: number;
    exported: boolean;
    signature?: string;
};

export type CallEdge = {
    caller: string;
    callee: string;
    file: string;
    line: number;
};

export type DepEdge = {
    from: string;
    to: string;
    type: 'workspace' | 'external';
};

export type TaskOutcome = {
    task_id: string;
    task_description: string;
    skills_used: string[];
    actions_taken: string[];
    outcome: 'success' | 'failure' | 'partial';
    duration_ms: number;
    files_touched: string[];
    timestamp: string;
};

export type NextActionSuggestion = {
    skill_id: string;
    confidence: number;
    rationale: string;
};

export type KnowledgeGraphSnapshot = {
    symbols: SymbolEntry[];
    call_edges: CallEdge[];
    dep_edges: DepEdge[];
    file_count: number;
    last_indexed: string;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GRAPH_STATE_DIR = join(tmpdir(), 'agentfarm-knowledge-graph');
const OUTCOMES_FILE = join(GRAPH_STATE_DIR, 'task-outcomes.json');
const GRAPH_SNAPSHOT_FILE = join(GRAPH_STATE_DIR, 'graph-snapshot.json');

// ---------------------------------------------------------------------------
// File system helpers
// ---------------------------------------------------------------------------

async function ensureStateDir(): Promise<void> {
    await mkdir(GRAPH_STATE_DIR, { recursive: true });
}

async function walkDirectory(dir: string, extensions: Set<string>, maxDepth = 6): Promise<string[]> {
    const results: string[] = [];
    async function walk(current: string, depth: number): Promise<void> {
        if (depth > maxDepth) return;
        let entries: string[];
        try {
            entries = await readdir(current);
        } catch {
            return;
        }
        for (const entry of entries) {
            if (entry.startsWith('.') || entry === 'node_modules' || entry === 'dist' || entry === 'coverage') continue;
            const full = join(current, entry);
            let info;
            try {
                info = await stat(full);
            } catch {
                continue;
            }
            if (info.isDirectory()) {
                await walk(full, depth + 1);
            } else if (extensions.has(extname(entry))) {
                results.push(full);
            }
        }
    }
    await walk(dir, 0);
    return results;
}

// ---------------------------------------------------------------------------
// Symbol extraction
// ---------------------------------------------------------------------------

const EXPORT_PATTERNS: Array<{ pattern: RegExp; kind: SymbolKind }> = [
    { pattern: /^export\s+(async\s+)?function\s+(\w+)/m, kind: 'function' },
    { pattern: /^export\s+class\s+(\w+)/m, kind: 'class' },
    { pattern: /^export\s+interface\s+(\w+)/m, kind: 'interface' },
    { pattern: /^export\s+type\s+(\w+)/m, kind: 'type' },
    { pattern: /^export\s+(const|let)\s+(\w+)/m, kind: 'const' },
    { pattern: /^export\s+enum\s+(\w+)/m, kind: 'enum' },
];

function extractSymbols(content: string, filePath: string): SymbolEntry[] {
    const lines = content.split('\n');
    const symbols: SymbolEntry[] = [];

    lines.forEach((line, index) => {
        const trimmed = line.trim();
        for (const { pattern, kind } of EXPORT_PATTERNS) {
            const match = pattern.exec(trimmed);
            if (match) {
                // The captured name is either group 2 (for function with async) or group 1
                const name = match[2] ?? match[1];
                if (name) {
                    symbols.push({
                        name,
                        kind,
                        file: filePath,
                        line: index + 1,
                        exported: true,
                        signature: trimmed.slice(0, 120),
                    });
                }
                break;
            }
        }
    });

    return symbols;
}

function extractCallEdges(content: string, filePath: string, knownSymbols: Set<string>): CallEdge[] {
    const edges: CallEdge[] = [];
    const lines = content.split('\n');
    // Find function declarations to know what the "caller" context is
    let currentFunction = 'module';
    const fnPattern = /^(?:export\s+)?(?:async\s+)?function\s+(\w+)|^(?:const|let)\s+(\w+)\s*=\s*(?:async\s+)?\(/;

    lines.forEach((line, index) => {
        const fnMatch = fnPattern.exec(line.trim());
        if (fnMatch) {
            currentFunction = fnMatch[1] ?? fnMatch[2] ?? 'module';
        }
        // Look for known symbol calls
        for (const sym of knownSymbols) {
            if (sym !== currentFunction && line.includes(`${sym}(`)) {
                edges.push({ caller: currentFunction, callee: sym, file: filePath, line: index + 1 });
                break; // one edge per line to avoid noise
            }
        }
    });

    return edges;
}

// ---------------------------------------------------------------------------
// RepoKnowledgeGraph class
// ---------------------------------------------------------------------------

export class RepoKnowledgeGraph {
    private symbols: SymbolEntry[] = [];
    private callEdges: CallEdge[] = [];
    private depEdges: DepEdge[] = [];
    private taskOutcomes: TaskOutcome[] = [];
    private lastIndexed: string | null = null;

    // ── Indexing ────────────────────────────────────────────────────────────

    async indexWorkspace(rootDir: string): Promise<KnowledgeGraphSnapshot> {
        await ensureStateDir();
        const tsExtensions = new Set(['.ts', '.tsx', '.mts']);
        const files = await walkDirectory(rootDir, tsExtensions);

        this.symbols = [];
        this.callEdges = [];

        // First pass: extract all symbols
        for (const file of files) {
            let content: string;
            try {
                content = await readFile(file, 'utf-8');
            } catch {
                continue;
            }
            const relPath = relative(rootDir, file);
            const syms = extractSymbols(content, relPath);
            this.symbols.push(...syms);
        }

        // Build lookup set for call edge extraction
        const symbolNames = new Set(this.symbols.map((s) => s.name));

        // Second pass: extract call edges
        for (const file of files) {
            let content: string;
            try {
                content = await readFile(file, 'utf-8');
            } catch {
                continue;
            }
            const relPath = relative(rootDir, file);
            const edges = extractCallEdges(content, relPath, symbolNames);
            this.callEdges.push(...edges);
        }

        this.lastIndexed = new Date().toISOString();
        const snapshot = this.getSnapshot(files.length);
        await writeFile(GRAPH_SNAPSHOT_FILE, JSON.stringify(snapshot, null, 2), 'utf-8');
        return snapshot;
    }

    getSnapshot(fileCount = this.symbols.length): KnowledgeGraphSnapshot {
        return {
            symbols: this.symbols,
            call_edges: this.callEdges,
            dep_edges: this.depEdges,
            file_count: fileCount,
            last_indexed: this.lastIndexed ?? new Date().toISOString(),
        };
    }

    // ── Querying ────────────────────────────────────────────────────────────

    findSymbol(name: string): SymbolEntry[] {
        return this.symbols.filter((s) => s.name === name);
    }

    findSymbolsInFile(filePath: string): SymbolEntry[] {
        return this.symbols.filter((s) => s.file === filePath || s.file.endsWith(filePath));
    }

    findCallers(symbolName: string): CallEdge[] {
        return this.callEdges.filter((e) => e.callee === symbolName);
    }

    findCallees(symbolName: string): CallEdge[] {
        return this.callEdges.filter((e) => e.caller === symbolName);
    }

    searchSymbols(query: string): SymbolEntry[] {
        const lower = query.toLowerCase();
        return this.symbols.filter(
            (s) =>
                s.name.toLowerCase().includes(lower) ||
                s.file.toLowerCase().includes(lower) ||
                (s.signature?.toLowerCase().includes(lower) ?? false)
        );
    }

    getCallGraph(): Record<string, string[]> {
        const graph: Record<string, string[]> = {};
        for (const edge of this.callEdges) {
            if (!graph[edge.caller]) graph[edge.caller] = [];
            graph[edge.caller].push(edge.callee);
        }
        return graph;
    }

    // ── Task outcome learning ───────────────────────────────────────────────

    async recordTaskOutcome(outcome: Omit<TaskOutcome, 'timestamp'>): Promise<void> {
        await ensureStateDir();
        const entry: TaskOutcome = { ...outcome, timestamp: new Date().toISOString() };
        this.taskOutcomes.push(entry);
        // Keep only last 200 outcomes in memory
        if (this.taskOutcomes.length > 200) {
            this.taskOutcomes = this.taskOutcomes.slice(-200);
        }
        await writeFile(OUTCOMES_FILE, JSON.stringify(this.taskOutcomes, null, 2), 'utf-8');
    }

    async loadTaskOutcomes(): Promise<void> {
        try {
            const raw = await readFile(OUTCOMES_FILE, 'utf-8');
            this.taskOutcomes = JSON.parse(raw) as TaskOutcome[];
        } catch {
            this.taskOutcomes = [];
        }
    }

    // ── Contextual next-action suggestions ─────────────────────────────────

    suggestNextActions(context: {
        current_files?: string[];
        recent_skills?: string[];
        task_description?: string;
    }): NextActionSuggestion[] {
        const suggestions: NextActionSuggestion[] = [];
        const taskLower = (context.task_description ?? '').toLowerCase();
        const recentSkills = new Set(context.recent_skills ?? []);

        // Rule-based suggestions based on task keywords
        if (taskLower.includes('test') || taskLower.includes('coverage')) {
            suggestions.push({ skill_id: 'test-coverage-reporter', confidence: 0.9, rationale: 'Task involves testing — coverage report is high-value next step.' });
            suggestions.push({ skill_id: 'flaky-test-detector', confidence: 0.7, rationale: 'Run after test suite changes to catch newly flaky tests.' });
        }
        if (taskLower.includes('pr') || taskLower.includes('review') || taskLower.includes('merge')) {
            suggestions.push({ skill_id: 'pr-reviewer-risk-labels', confidence: 0.85, rationale: 'PR workflow detected — risk labeling recommended.' });
            suggestions.push({ skill_id: 'pr-size-enforcer', confidence: 0.7, rationale: 'Ensure PR size is within team limits.' });
        }
        if (taskLower.includes('release') || taskLower.includes('deploy') || taskLower.includes('version')) {
            suggestions.push({ skill_id: 'release-notes-generator', confidence: 0.9, rationale: 'Release workflow — generate notes from commits.' });
            suggestions.push({ skill_id: 'changelog-diff-validator', confidence: 0.8, rationale: 'Ensure CHANGELOG.md is updated for this release.' });
        }
        if (taskLower.includes('security') || taskLower.includes('vulnerability') || taskLower.includes('cve')) {
            suggestions.push({ skill_id: 'dependency-audit', confidence: 0.9, rationale: 'Security context — dependency audit is essential.' });
            suggestions.push({ skill_id: 'docker-image-scanner', confidence: 0.7, rationale: 'Check container images for known CVEs.' });
        }
        if (taskLower.includes('refactor') || taskLower.includes('cleanup') || taskLower.includes('dead code')) {
            suggestions.push({ skill_id: 'dead-code-detector', confidence: 0.85, rationale: 'Refactoring task — identify dead code before removal.' });
            suggestions.push({ skill_id: 'type-coverage-reporter', confidence: 0.65, rationale: 'Improve type safety during refactor.' });
        }

        // Learning from past outcomes: if a skill was used successfully in similar tasks, boost it
        const successfulSkills = this.taskOutcomes
            .filter((o) => o.outcome === 'success' && o.task_description.toLowerCase().includes(taskLower.slice(0, 20)))
            .flatMap((o) => o.skills_used);
        const skillFreq: Record<string, number> = {};
        for (const s of successfulSkills) {
            skillFreq[s] = (skillFreq[s] ?? 0) + 1;
        }
        for (const [skillId, freq] of Object.entries(skillFreq)) {
            if (!recentSkills.has(skillId) && !suggestions.find((s) => s.skill_id === skillId)) {
                suggestions.push({
                    skill_id: skillId,
                    confidence: Math.min(0.95, 0.5 + freq * 0.1),
                    rationale: `Used successfully ${freq}x in similar past tasks.`,
                });
            }
        }

        return suggestions
            .sort((a, b) => b.confidence - a.confidence)
            .slice(0, 5);
    }

    // ── Snapshot persistence ────────────────────────────────────────────────

    async loadSnapshot(): Promise<KnowledgeGraphSnapshot | null> {
        try {
            const raw = await readFile(GRAPH_SNAPSHOT_FILE, 'utf-8');
            const snapshot = JSON.parse(raw) as KnowledgeGraphSnapshot;
            this.symbols = snapshot.symbols;
            this.callEdges = snapshot.call_edges;
            this.depEdges = snapshot.dep_edges;
            this.lastIndexed = snapshot.last_indexed;
            return snapshot;
        } catch {
            return null;
        }
    }

    // ── Crystallize skills for a completed task ─────────────────────────────

    async crystallize(taskId: string, taskDescription: string, skillsUsed: string[], filesTouched: string[], outcome: TaskOutcome['outcome'], durationMs: number): Promise<void> {
        await this.recordTaskOutcome({
            task_id: taskId,
            task_description: taskDescription,
            skills_used: skillsUsed,
            actions_taken: skillsUsed.map((s) => `Executed skill: ${s}`),
            outcome,
            duration_ms: durationMs,
            files_touched: filesTouched,
        });
    }
}

// ---------------------------------------------------------------------------
// Singleton graph instance
// ---------------------------------------------------------------------------

export const globalKnowledgeGraph = new RepoKnowledgeGraph();
