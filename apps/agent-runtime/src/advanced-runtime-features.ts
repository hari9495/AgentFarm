import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';
import { tmpdir } from 'os';
import { extname, join, resolve } from 'path';
import type { ActionDecision, ProcessedTaskResult, TaskEnvelope } from './execution-engine.js';
import { getSkillHandler } from './skill-execution-engine.js';
import type { SkillOutput } from './skill-execution-engine.js';

type TraceStep = {
    name: string;
    at: string;
    details?: Record<string, unknown>;
};

type TaskTrace = {
    taskId: string;
    startedAt: string;
    endedAt?: string;
    decision: ActionDecision;
    status?: ProcessedTaskResult['status'];
    reasonTrail: string[];
    steps: TraceStep[];
};

type FlakySignal = {
    testCommand: string;
    failures: number;
    lastFailedAt: string;
};

type MarketplaceSkill = {
    id: string;
    name: string;
    version: string;
    permissions: string[];
    source: string;
    manifest_digest: string;
    signature: string;
};

type MarketplaceCatalogState = {
    version: 1;
    skills: MarketplaceSkill[];
};

type MarketplaceState = {
    version: 2;
    installed: Record<string, string>;
};

type SemanticGraph = {
    generatedAt: string;
    nodes: string[];
    edges: Array<{ from: string; to: string }>;
    symbols: Array<{
        id: string;
        file: string;
        symbol: string;
        kind: 'function' | 'class' | 'type' | 'const' | 'interface';
        owner: string | null;
        testLinks: string[];
        failureHotspotScore: number;
    }>;
    callEdges: Array<{ from: string; to: string }>;
};

type PlanCheckpoint = {
    taskId: string;
    approved: boolean;
    approvedBy: string | null;
    approvedAt: string | null;
    reason: string | null;
    plan: {
        planId: string;
        summary: string;
        risks: string[];
        filesHint: string[];
        testStrategy: string;
        rollback: string;
    };
};

type PolicyPack = {
    id: string;
    name: string;
    blockedActions: string[];
    blockedCommandPatterns: string[];
    maxAllowedBlockRate: number;
    enabled: boolean;
    createdAt: string;
    updatedAt: string;
};

type PolicyPackState = {
    version: 1;
    activePackId: string | null;
    packs: PolicyPack[];
    lastSimulationByPackId: Record<string, {
        simulatedAt: string;
        sampledTasks: number;
        wouldBlock: number;
        blockRate: number;
    }>;
};

type ScopeConstraint = {
    includePaths: string[];
    setAt: string;
};

type MarketplaceUsageEvent = {
    at: string;
    skillId: string;
    event: 'install' | 'uninstall' | 'invoke';
    workspaceKey: string;
};

type ProvenanceAttestation = {
    at: string;
    taskId: string;
    status: ProcessedTaskResult['status'];
    actionType: string;
    payloadHash: string;
    resultHash: string;
    previousHash: string | null;
    chainHash: string;
};

type FlakyCluster = {
    rootCause: string;
    commands: string[];
    failures: number;
};

const DEFAULT_ADVANCED_STATE_DIR = join(tmpdir(), 'agentfarm-advanced-runtime-state');
const SECRET_PATTERNS: RegExp[] = [
    /sk-[a-z0-9]{20,}/i,
    /ghp_[a-z0-9]{20,}/i,
    /xox[baprs]-[a-z0-9-]{20,}/i,
    /-----begin\s+private\s+key-----/i,
];
const DEFAULT_RISKY_COMMAND_PATTERNS: RegExp[] = [
    /rm\s+-rf\s+\//i,
    /curl\b[^\n]*\|[^\n]*\b(sh|bash|zsh|pwsh|powershell)\b/i,
    /wget\b[^\n]*\|[^\n]*\b(sh|bash|zsh|pwsh|powershell)\b/i,
    /powershell\s+-enc(odedcommand)?\b/i,
    /Invoke-Expression|iex\s*\(/i,
];
const MUTATING_ACTION_HINTS = [
    'code_edit',
    'apply_patch',
    'git_commit',
    'git_push',
    'run_build',
    'run_tests',
    'workspace_bulk_refactor',
    'workspace_atomic_edit_set',
    'workspace_generate_test',
    'workspace_format_code',
    'workspace_version_bump',
    'workspace_fix_test_failures',
    'workspace_autonomous_plan_execute',
    'deploy',
    'provision',
];

const toIso = (now: () => number): string => new Date(now()).toISOString();

const stableUnique = <T>(values: T[]): T[] => Array.from(new Set(values));

const sha256 = (input: string): string => createHash('sha256').update(input).digest('hex');

const getStateDir = (): string => {
    const configured = process.env['AF_ADVANCED_STATE_DIR'] ?? process.env['AGENTFARM_ADVANCED_STATE_DIR'];
    return resolve(configured?.trim() || DEFAULT_ADVANCED_STATE_DIR);
};

const getInstalledSkillsPath = (): string => join(getStateDir(), 'installed-skills.json');
const getMarketplaceTelemetryPath = (): string => join(getStateDir(), 'marketplace-telemetry.json');
const getManagedMarketplaceCatalogPath = (): string => join(getStateDir(), 'marketplace-admin-catalog.json');
const getPolicyPackStatePath = (): string => join(getStateDir(), 'policy-packs.json');
const getProvenanceLogPath = (): string => join(getStateDir(), 'provenance-attestations.ndjson');

const getMarketplaceCatalogPath = (): string => resolve('apps/agent-runtime/marketplace/skills.json');

const readMarketplaceState = (): MarketplaceState => {
    const path = getInstalledSkillsPath();
    if (!existsSync(path)) {
        return { version: 2, installed: {} };
    }

    try {
        const parsed = JSON.parse(readFileSync(path, 'utf8')) as {
            version?: number;
            installedSkillIds?: string[];
            installed?: Record<string, string>;
        };
        const installedFromLegacy = Array.isArray(parsed.installedSkillIds)
            ? parsed.installedSkillIds.reduce<Record<string, string>>((acc, skillId) => {
                if (typeof skillId === 'string' && skillId.trim()) {
                    acc[skillId.trim()] = 'latest';
                }
                return acc;
            }, {})
            : {};
        return {
            version: 2,
            installed: {
                ...installedFromLegacy,
                ...(parsed.installed ?? {}),
            },
        };
    } catch {
        return { version: 2, installed: {} };
    }
};

const writeMarketplaceState = (state: MarketplaceState): void => {
    const path = getInstalledSkillsPath();
    mkdirSync(resolve(getStateDir()), { recursive: true });
    writeFileSync(path, JSON.stringify(state, null, 2));
};

const readMarketplaceCatalog = (): MarketplaceSkill[] => {
    const path = getMarketplaceCatalogPath();
    if (!existsSync(path)) {
        return [];
    }

    try {
        const parsed = JSON.parse(readFileSync(path, 'utf8')) as { skills?: Array<Partial<MarketplaceSkill>> };
        if (!Array.isArray(parsed.skills)) {
            return [];
        }
        return parsed.skills
            .filter((entry) => entry && typeof entry === 'object')
            .map((entry) => ({
                id: typeof entry.id === 'string' ? entry.id.trim() : '',
                name: typeof entry.name === 'string' ? entry.name.trim() : '',
                version: typeof entry.version === 'string' && entry.version.trim() ? entry.version.trim() : '1.0.0',
                permissions: Array.isArray(entry.permissions)
                    ? entry.permissions.filter((perm): perm is string => typeof perm === 'string')
                    : [],
                source: typeof entry.source === 'string' ? entry.source.trim() : 'builtin',
                manifest_digest: typeof entry.manifest_digest === 'string' ? entry.manifest_digest.trim() : '',
                signature: typeof entry.signature === 'string' ? entry.signature.trim() : '',
            }))
            .filter((entry) => entry.id.length > 0);
    } catch {
        return [];
    }
};

const readManagedMarketplaceCatalog = (): MarketplaceSkill[] => {
    const path = getManagedMarketplaceCatalogPath();
    if (!existsSync(path)) {
        return [];
    }

    try {
        const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<MarketplaceCatalogState>;
        if (!Array.isArray(parsed.skills)) {
            return [];
        }
        return parsed.skills
            .filter((entry) => entry && typeof entry === 'object')
            .map((entry) => ({
                id: typeof entry.id === 'string' ? entry.id.trim() : '',
                name: typeof entry.name === 'string' ? entry.name.trim() : '',
                version: typeof entry.version === 'string' && entry.version.trim() ? entry.version.trim() : '1.0.0',
                permissions: Array.isArray(entry.permissions)
                    ? stableUnique(entry.permissions.filter((perm): perm is string => typeof perm === 'string').map((perm) => perm.trim()).filter(Boolean))
                    : [],
                source: typeof entry.source === 'string' && entry.source.trim() ? entry.source.trim() : 'custom_managed',
                manifest_digest: typeof entry.manifest_digest === 'string' ? entry.manifest_digest.trim() : '',
                signature: typeof entry.signature === 'string' ? entry.signature.trim() : '',
            }))
            .filter((entry) => entry.id.length > 0);
    } catch {
        return [];
    }
};

const writeManagedMarketplaceCatalog = (skills: MarketplaceSkill[]): void => {
    const path = getManagedMarketplaceCatalogPath();
    mkdirSync(resolve(getStateDir()), { recursive: true });
    const next: MarketplaceCatalogState = {
        version: 1,
        skills,
    };
    writeFileSync(path, JSON.stringify(next, null, 2));
};

const readMergedMarketplaceCatalog = (): MarketplaceSkill[] => {
    const builtin = readMarketplaceCatalog();
    const managed = readManagedMarketplaceCatalog();
    const byId = new Map<string, MarketplaceSkill>();

    for (const skill of builtin) {
        byId.set(skill.id, skill);
    }
    for (const skill of managed) {
        byId.set(skill.id, skill);
    }

    return [...byId.values()];
};

const verifySkillManifest = (skill: MarketplaceSkill): { verified: boolean; computedDigest: string } => {
    const digestInput = JSON.stringify({
        id: skill.id,
        name: skill.name,
        version: skill.version,
        permissions: [...skill.permissions].sort(),
        source: skill.source,
    });
    const computedDigest = sha256(digestInput);
    const verified = skill.manifest_digest === computedDigest && skill.signature === `sha256:${computedDigest}`;
    return { verified, computedDigest };
};

const readPolicyPackState = (): PolicyPackState => {
    const path = getPolicyPackStatePath();
    if (!existsSync(path)) {
        return {
            version: 1,
            activePackId: null,
            packs: [],
            lastSimulationByPackId: {},
        };
    }

    try {
        const parsed = JSON.parse(readFileSync(path, 'utf8')) as PolicyPackState;
        return {
            version: 1,
            activePackId: typeof parsed.activePackId === 'string' ? parsed.activePackId : null,
            packs: Array.isArray(parsed.packs) ? parsed.packs : [],
            lastSimulationByPackId: parsed.lastSimulationByPackId ?? {},
        };
    } catch {
        return {
            version: 1,
            activePackId: null,
            packs: [],
            lastSimulationByPackId: {},
        };
    }
};

const writePolicyPackState = (state: PolicyPackState): void => {
    const path = getPolicyPackStatePath();
    mkdirSync(resolve(getStateDir()), { recursive: true });
    writeFileSync(path, JSON.stringify(state, null, 2));
};

const readMarketplaceTelemetry = (): MarketplaceUsageEvent[] => {
    const path = getMarketplaceTelemetryPath();
    if (!existsSync(path)) {
        return [];
    }

    try {
        const parsed = JSON.parse(readFileSync(path, 'utf8')) as { events?: MarketplaceUsageEvent[] };
        return Array.isArray(parsed.events) ? parsed.events : [];
    } catch {
        return [];
    }
};

const writeMarketplaceTelemetry = (events: MarketplaceUsageEvent[]): void => {
    const path = getMarketplaceTelemetryPath();
    mkdirSync(resolve(getStateDir()), { recursive: true });
    writeFileSync(path, JSON.stringify({ version: 1, events }, null, 2));
};

const collectFiles = (root: string, out: string[]): void => {
    let entries: string[] = [];
    try {
        entries = readdirSync(root);
    } catch {
        return;
    }

    for (const entry of entries) {
        const fullPath = join(root, entry);
        let isDirectory = false;
        try {
            isDirectory = statSync(fullPath).isDirectory();
        } catch {
            continue;
        }

        if (isDirectory) {
            if (entry === 'node_modules' || entry === '.git' || entry === 'coverage' || entry === 'dist' || entry === '.next') {
                continue;
            }
            collectFiles(fullPath, out);
            continue;
        }

        out.push(fullPath);
    }
};

const readCodeOwners = (): Array<{ pattern: string; owner: string }> => {
    const codeownersPath = resolve('CODEOWNERS');
    if (!existsSync(codeownersPath)) {
        return [];
    }

    try {
        const lines = readFileSync(codeownersPath, 'utf8').split(/\r?\n/);
        const entries: Array<{ pattern: string; owner: string }> = [];
        for (const lineRaw of lines) {
            const line = lineRaw.trim();
            if (!line || line.startsWith('#')) {
                continue;
            }
            const parts = line.split(/\s+/).filter(Boolean);
            if (parts.length < 2) {
                continue;
            }
            entries.push({ pattern: parts[0], owner: parts[1] });
        }
        return entries;
    } catch {
        return [];
    }
};

const resolveOwnerForFile = (filePath: string, codeOwners: Array<{ pattern: string; owner: string }>): string | null => {
    const normalized = filePath.replace(/\\/g, '/');
    for (const entry of codeOwners) {
        const pattern = entry.pattern.replace(/\*\*/g, '').replace(/\*/g, '');
        if (!pattern || pattern === '/') {
            return entry.owner;
        }
        if (normalized.includes(pattern.replace(/^\//, ''))) {
            return entry.owner;
        }
    }
    return null;
};

const deriveFailureHotspots = (traces: TaskTrace[]): Record<string, number> => {
    const hotspots: Record<string, number> = {};
    for (const trace of traces) {
        if (trace.status !== 'failed') {
            continue;
        }
        for (const step of trace.steps) {
            const filePath = typeof step.details?.filePath === 'string' ? step.details.filePath : null;
            if (!filePath) {
                continue;
            }
            hotspots[filePath] = (hotspots[filePath] ?? 0) + 1;
        }
    }
    return hotspots;
};

const extractPathsFromPayload = (payload: Record<string, unknown>): string[] => {
    const paths: string[] = [];
    const keys = ['file_path', 'target', 'workspace_path', 'directory_path'];
    for (const key of keys) {
        const value = payload[key];
        if (typeof value === 'string' && value.trim()) {
            paths.push(value.trim().replace(/\\/g, '/'));
        }
    }

    const listKeys = ['target_files', 'changed_files', 'paths'];
    for (const key of listKeys) {
        const value = payload[key];
        if (!Array.isArray(value)) {
            continue;
        }
        for (const entry of value) {
            if (typeof entry === 'string' && entry.trim()) {
                paths.push(entry.trim().replace(/\\/g, '/'));
            }
        }
    }

    return stableUnique(paths);
};

const inferFlakyRootCause = (command: string): string => {
    const normalized = command.toLowerCase();
    if (normalized.includes('e2e') || normalized.includes('playwright') || normalized.includes('cypress')) {
        return 'environmental_ui_timing';
    }
    if (normalized.includes('integration') || normalized.includes('docker') || normalized.includes('compose')) {
        return 'dependency_startup_race';
    }
    if (normalized.includes('network') || normalized.includes('http')) {
        return 'network_instability';
    }
    if (normalized.includes('test') || normalized.includes('tsx --test') || normalized.includes('vitest') || normalized.includes('jest')) {
        return 'nondeterministic_test_logic';
    }
    return 'unknown_flaky_pattern';
};

const extractCommandCandidates = (payload: Record<string, unknown>): string[] => {
    const values: string[] = [];
    const keys = ['command', 'shell_command', 'test_command', 'build_command'];
    for (const key of keys) {
        const value = payload[key];
        if (typeof value === 'string' && value.trim()) {
            values.push(value.trim());
        }
    }
    return stableUnique(values);
};

const readFileSafe = (filePath: string): string => {
    try {
        return readFileSync(filePath, 'utf8');
    } catch {
        return '';
    }
};

const buildSemanticGraph = (
    workspaceRoot: string,
    now: () => number,
    traces: TaskTrace[],
): SemanticGraph => {
    const files: string[] = [];
    collectFiles(workspaceRoot, files);
    const allNormalizedFiles = files.map((path) => path.replace(/\\/g, '/'));
    const codeOwners = readCodeOwners();
    const failureHotspots = deriveFailureHotspots(traces);

    const sourceFiles = files.filter((path) => {
        const extension = extname(path).toLowerCase();
        return extension === '.ts' || extension === '.tsx' || extension === '.js' || extension === '.mjs';
    });

    const nodes: string[] = [];
    const edges: Array<{ from: string; to: string }> = [];
    const symbols: SemanticGraph['symbols'] = [];
    const callEdges: SemanticGraph['callEdges'] = [];

    for (const filePath of sourceFiles) {
        const normalizedPath = filePath.replace(/\\/g, '/');
        nodes.push(normalizedPath);

        const content = readFileSafe(filePath);
        const importMatches = content.matchAll(/from\s+['\"]([^'\"]+)['\"]/g);
        for (const match of importMatches) {
            const target = match[1];
            if (!target) {
                continue;
            }
            edges.push({ from: normalizedPath, to: target });
            nodes.push(target);
        }

        const symbolMatches = content.matchAll(
            /(?:export\s+)?(?:async\s+)?(?:function|class|interface|type|const)\s+([A-Za-z_][A-Za-z0-9_]*)/g,
        );
        const owner = resolveOwnerForFile(normalizedPath, codeOwners);
        const linkedTests = allNormalizedFiles.filter((candidate) => {
            const name = candidate.toLowerCase();
            const stem = normalizedPath
                .split('/')
                .pop()
                ?.replace(/\.[^.]+$/, '')
                .toLowerCase() ?? '';
            return (name.endsWith('.test.ts') || name.endsWith('.spec.ts')) && stem.length > 0 && name.includes(stem);
        }).slice(0, 5);

        for (const match of symbolMatches) {
            const symbolName = match[1];
            const prefix = content.slice(Math.max(0, (match.index ?? 0) - 20), match.index);
            let kind: SemanticGraph['symbols'][number]['kind'] = 'function';
            if (prefix.includes('class')) kind = 'class';
            else if (prefix.includes('interface')) kind = 'interface';
            else if (prefix.includes('type')) kind = 'type';
            else if (prefix.includes('const')) kind = 'const';

            const symbolId = `${normalizedPath}::${symbolName}`;
            symbols.push({
                id: symbolId,
                file: normalizedPath,
                symbol: symbolName,
                kind,
                owner,
                testLinks: linkedTests,
                failureHotspotScore: failureHotspots[normalizedPath] ?? 0,
            });
            nodes.push(symbolId);
        }

        const calls = content.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*\(/g);
        for (const call of calls) {
            const callName = call[1];
            if (!callName || callName === 'if' || callName === 'for' || callName === 'while' || callName === 'switch') {
                continue;
            }
            callEdges.push({ from: normalizedPath, to: callName });
        }
    }

    return {
        generatedAt: toIso(now),
        nodes: stableUnique(nodes),
        edges,
        symbols,
        callEdges,
    };
};

export class AdvancedRuntimeFeatures {
    private readonly now: () => number;
    private readonly traces = new Map<string, TaskTrace>();
    private readonly reasonByTask = new Map<string, string[]>();
    private readonly flakySignals = new Map<string, FlakySignal>();
    private readonly planCheckpoints = new Map<string, PlanCheckpoint>();
    private policyPacks: PolicyPackState;
    private scopeConstraint: ScopeConstraint | null = null;
    private readonly marketplaceTelemetry: MarketplaceUsageEvent[];
    private readonly provenance: ProvenanceAttestation[] = [];
    private paused = false;
    private stepBudget = 0;
    private semanticGraphCache: SemanticGraph | null = null;

    constructor(now: () => number = () => Date.now()) {
        this.now = now;
        this.policyPacks = readPolicyPackState();
        this.marketplaceTelemetry = readMarketplaceTelemetry();
    }

    public createPlan(task: TaskEnvelope, decision: ActionDecision): {
        planId: string;
        summary: string;
        risks: string[];
        filesHint: string[];
        testStrategy: string;
        rollback: string;
    } {
        const filesHint = Array.isArray(task.payload['target_files'])
            ? task.payload['target_files'].filter((entry): entry is string => typeof entry === 'string').slice(0, 10)
            : [];

        const risks = [
            `Risk level: ${decision.riskLevel}`,
            decision.route === 'approval' ? 'Requires human approval path.' : 'Eligible for direct execution.',
        ];

        if (decision.actionType.includes('deploy')) {
            risks.push('Deployment action detected; ensure rollback slot is healthy.');
        }

        return {
            planId: `${task.taskId}:${this.now()}`,
            summary: `${decision.actionType} for task ${task.taskId}`,
            risks,
            filesHint,
            testStrategy: typeof task.payload['test_command'] === 'string'
                ? task.payload['test_command']
                : 'Run nearest package tests and targeted smoke checks.',
            rollback: 'Use checkpoint rollback or git revert on failure.',
        };
    }

    public recordStart(task: TaskEnvelope, decision: ActionDecision): void {
        const trace: TaskTrace = {
            taskId: task.taskId,
            startedAt: toIso(this.now),
            decision,
            reasonTrail: [decision.reason],
            steps: [{
                name: 'task_received',
                at: toIso(this.now),
                details: {
                    actionType: decision.actionType,
                    route: decision.route,
                    reason: decision.reason,
                    payloadPaths: extractPathsFromPayload(task.payload),
                },
            }],
        };
        this.traces.set(task.taskId, trace);
        this.reasonByTask.set(task.taskId, [...trace.reasonTrail]);
    }

    public appendTraceStep(taskId: string, step: string, details?: Record<string, unknown>): void {
        const trace = this.traces.get(taskId);
        if (!trace) {
            return;
        }
        trace.steps.push({ name: step, at: toIso(this.now), details });
    }

    public recordEnd(task: TaskEnvelope, result: ProcessedTaskResult): void {
        const trace = this.traces.get(task.taskId);
        if (!trace) {
            return;
        }

        trace.endedAt = toIso(this.now);
        trace.status = result.status;
        trace.reasonTrail.push(result.decision.reason);
        this.reasonByTask.set(task.taskId, [...trace.reasonTrail]);

        if (result.status === 'failed') {
            const command = typeof task.payload['test_command'] === 'string' ? task.payload['test_command'].trim() : null;
            if (command) {
                const signal = this.flakySignals.get(command) ?? {
                    testCommand: command,
                    failures: 0,
                    lastFailedAt: toIso(this.now),
                };
                signal.failures += 1;
                signal.lastFailedAt = toIso(this.now);
                this.flakySignals.set(command, signal);
            }
        }

        this.recordProvenanceAttestation(task, result);
    }

    public registerPlanCheckpoint(task: TaskEnvelope, decision: ActionDecision, plan: {
        planId: string;
        summary: string;
        risks: string[];
        filesHint: string[];
        testStrategy: string;
        rollback: string;
    }): PlanCheckpoint {
        const current = this.planCheckpoints.get(task.taskId);
        const next: PlanCheckpoint = {
            taskId: task.taskId,
            approved: current?.approved ?? false,
            approvedBy: current?.approvedBy ?? null,
            approvedAt: current?.approvedAt ?? null,
            reason: current?.reason ?? null,
            plan,
        };
        this.planCheckpoints.set(task.taskId, next);
        return next;
    }

    public approvePlan(taskId: string, actor: string, reason?: string): PlanCheckpoint | null {
        const checkpoint = this.planCheckpoints.get(taskId);
        if (!checkpoint) {
            return null;
        }
        checkpoint.approved = true;
        checkpoint.approvedBy = actor.trim() || 'unknown';
        checkpoint.approvedAt = toIso(this.now);
        checkpoint.reason = reason?.trim() || null;
        return checkpoint;
    }

    public getPlanCheckpoint(taskId: string): PlanCheckpoint | null {
        return this.planCheckpoints.get(taskId) ?? null;
    }

    public listPendingPlans(limit = 100): PlanCheckpoint[] {
        return Array.from(this.planCheckpoints.values())
            .filter((entry) => !entry.approved)
            .slice(-Math.max(1, Math.min(500, limit)));
    }

    public requiresPlanApproval(actionType: string): boolean {
        const normalized = actionType.trim().toLowerCase();
        return MUTATING_ACTION_HINTS.some((hint) => normalized.includes(hint));
    }

    public isPlanApproved(taskId: string): boolean {
        return this.planCheckpoints.get(taskId)?.approved ?? false;
    }

    public listTraces(limit = 100): TaskTrace[] {
        return Array.from(this.traces.values()).slice(-Math.max(1, Math.min(500, limit)));
    }

    public getTrace(taskId: string): TaskTrace | null {
        return this.traces.get(taskId) ?? null;
    }

    public replay(taskId: string, fromStep = 0): { ok: boolean; replayed: TraceStep[] } {
        const trace = this.traces.get(taskId);
        if (!trace) {
            return { ok: false, replayed: [] };
        }

        const bounded = Math.max(0, Math.floor(fromStep));
        return {
            ok: true,
            replayed: trace.steps.slice(bounded),
        };
    }

    public simulatePolicy(input: {
        blockedActions: string[];
        traces: Array<{ actionType: string; status: string }>;
    }): {
        total: number;
        wouldBlock: number;
        wouldPass: number;
    } {
        const blocked = new Set(input.blockedActions.map((entry) => entry.trim()).filter(Boolean));
        let wouldBlock = 0;
        for (const trace of input.traces) {
            if (blocked.has(trace.actionType)) {
                wouldBlock += 1;
            }
        }

        return {
            total: input.traces.length,
            wouldBlock,
            wouldPass: Math.max(0, input.traces.length - wouldBlock),
        };
    }

    public computePrReview(input: {
        changedFiles: string[];
        summary?: string;
    }): {
        labels: string[];
        score: number;
        reason: string;
    } {
        let score = 0;

        for (const file of input.changedFiles) {
            const normalized = file.toLowerCase();
            if (normalized.includes('infrastructure/') || normalized.includes('.github/workflows')) {
                score += 3;
            } else if (normalized.endsWith('.test.ts') || normalized.endsWith('.spec.ts')) {
                score -= 1;
            } else if (normalized.includes('security') || normalized.includes('auth')) {
                score += 2;
            } else {
                score += 1;
            }
        }

        if ((input.summary ?? '').toLowerCase().includes('hotfix')) {
            score += 2;
        }

        const labels = ['needs-human'];
        if (score <= 2) {
            labels.push('safe');
        } else if (score <= 5) {
            labels.push('medium-risk');
        } else {
            labels.push('high-risk');
        }

        if (input.changedFiles.some((file) => file.toLowerCase().includes('security'))) {
            labels.push('security-risk');
        }

        return {
            labels: stableUnique(labels),
            score,
            reason: `Risk score ${score} derived from ${input.changedFiles.length} changed file(s).`,
        };
    }

    public buildIssueToPrAutopilot(input: {
        issueNumber: number;
        title: string;
        body?: string;
    }): {
        objective: string;
        steps: string[];
        verification: string[];
        branchName: string;
    } {
        const slug = input.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 40);

        return {
            objective: `Resolve issue #${input.issueNumber}: ${input.title}`,
            branchName: `autopilot/issue-${input.issueNumber}-${slug || 'update'}`,
            steps: [
                'Analyze issue context and identify impacted files.',
                'Apply minimal code fix with bounded scope.',
                'Generate or update tests for changed behavior.',
                'Run targeted tests and collect evidence.',
                'Create PR metadata and route for approval.',
            ],
            verification: [
                'Run nearest package test command.',
                'Ensure lint/typecheck pass for changed files.',
                'Attach summary + rollback note in PR body.',
            ],
        };
    }

    public getFlakySignals(limit = 20): FlakySignal[] {
        return Array.from(this.flakySignals.values())
            .sort((a, b) => b.failures - a.failures)
            .slice(0, Math.max(1, Math.min(200, limit)));
    }

    public triageFlakyTests(): {
        clusters: FlakyCluster[];
        tickets: Array<{ id: string; title: string; severity: 'low' | 'medium' | 'high'; commands: string[] }>;
        patchSuggestions: Array<{ rootCause: string; suggestion: string }>;
    } {
        const byCause = new Map<string, FlakyCluster>();
        for (const signal of this.flakySignals.values()) {
            const cause = inferFlakyRootCause(signal.testCommand);
            const existing = byCause.get(cause) ?? { rootCause: cause, commands: [], failures: 0 };
            existing.commands.push(signal.testCommand);
            existing.failures += signal.failures;
            byCause.set(cause, existing);
        }

        const clusters = Array.from(byCause.values())
            .map((entry) => ({
                ...entry,
                commands: stableUnique(entry.commands).slice(0, 10),
            }))
            .sort((a, b) => b.failures - a.failures);

        const tickets = clusters.map((cluster, index) => {
            const severity: 'low' | 'medium' | 'high' = cluster.failures >= 5
                ? 'high'
                : cluster.failures >= 3
                    ? 'medium'
                    : 'low';
            return {
                id: `flaky-${index + 1}-${cluster.rootCause}`,
                title: `Flaky test triage: ${cluster.rootCause}`,
                severity,
                commands: cluster.commands,
            };
        });

        const patchSuggestions = clusters.map((cluster) => ({
            rootCause: cluster.rootCause,
            suggestion:
                cluster.rootCause === 'environmental_ui_timing'
                    ? 'Add deterministic waits and mock unstable selectors in e2e tests.'
                    : cluster.rootCause === 'dependency_startup_race'
                        ? 'Add service readiness probes and retry wrappers before integration assertions.'
                        : cluster.rootCause === 'network_instability'
                            ? 'Wrap network assertions in bounded retries with explicit timeout controls.'
                            : 'Stabilize fixture setup/teardown and isolate test state between runs.',
        }));

        return {
            clusters,
            tickets,
            patchSuggestions,
        };
    }

    public scanPayloadForSecrets(payload: Record<string, unknown>): {
        blocked: boolean;
        matches: string[];
    } {
        const serialized = JSON.stringify(payload).slice(0, 100_000);
        const matches: string[] = [];

        for (const pattern of SECRET_PATTERNS) {
            if (pattern.test(serialized)) {
                matches.push(pattern.source);
            }
        }

        return {
            blocked: matches.length > 0,
            matches,
        };
    }

    public scanGeneratedDiffForSecrets(diffText: string): { blocked: boolean; matches: string[] } {
        const bounded = diffText.slice(0, 500_000);
        const matches: string[] = [];
        for (const pattern of SECRET_PATTERNS) {
            if (pattern.test(bounded)) {
                matches.push(pattern.source);
            }
        }
        return {
            blocked: matches.length > 0,
            matches,
        };
    }

    public evaluatePolicyForTask(actionType: string, payload: Record<string, unknown>): {
        blocked: boolean;
        reason: string | null;
        activePackId: string | null;
    } {
        const activePack = this.policyPacks.activePackId
            ? this.policyPacks.packs.find((pack) => pack.id === this.policyPacks.activePackId && pack.enabled)
            : null;

        if (activePack && activePack.blockedActions.includes(actionType)) {
            return {
                blocked: true,
                reason: `Action '${actionType}' blocked by policy pack '${activePack.id}'.`,
                activePackId: activePack.id,
            };
        }

        const commandCandidates = extractCommandCandidates(payload);
        const customPatterns = activePack?.blockedCommandPatterns
            .map((entry) => {
                try {
                    return new RegExp(entry, 'i');
                } catch {
                    return null;
                }
            })
            .filter((entry): entry is RegExp => entry !== null) ?? [];

        const patterns = [...DEFAULT_RISKY_COMMAND_PATTERNS, ...customPatterns];
        for (const command of commandCandidates) {
            for (const pattern of patterns) {
                if (pattern.test(command)) {
                    return {
                        blocked: true,
                        reason: `Command blocked by policy pattern '${pattern.source}'.`,
                        activePackId: activePack?.id ?? null,
                    };
                }
            }
        }

        return {
            blocked: false,
            reason: null,
            activePackId: activePack?.id ?? null,
        };
    }

    public upsertPolicyPack(input: {
        id: string;
        name: string;
        blockedActions?: string[];
        blockedCommandPatterns?: string[];
        maxAllowedBlockRate?: number;
    }): PolicyPack {
        const nowIso = toIso(this.now);
        const existingIndex = this.policyPacks.packs.findIndex((pack) => pack.id === input.id);
        const next: PolicyPack = {
            id: input.id.trim(),
            name: input.name.trim() || input.id.trim(),
            blockedActions: stableUnique((input.blockedActions ?? []).map((entry) => entry.trim()).filter(Boolean)),
            blockedCommandPatterns: stableUnique((input.blockedCommandPatterns ?? []).map((entry) => entry.trim()).filter(Boolean)),
            maxAllowedBlockRate: Math.max(0, Math.min(1, input.maxAllowedBlockRate ?? 0.25)),
            enabled: existingIndex >= 0 ? this.policyPacks.packs[existingIndex].enabled : false,
            createdAt: existingIndex >= 0 ? this.policyPacks.packs[existingIndex].createdAt : nowIso,
            updatedAt: nowIso,
        };

        if (existingIndex >= 0) {
            this.policyPacks.packs[existingIndex] = next;
        } else {
            this.policyPacks.packs.push(next);
        }
        writePolicyPackState(this.policyPacks);
        return next;
    }

    public listPolicyPacks(): PolicyPack[] {
        return [...this.policyPacks.packs];
    }

    public simulatePolicyPack(packId: string, traces: Array<{ actionType: string; status: string }>): {
        packId: string;
        sampledTasks: number;
        wouldBlock: number;
        blockRate: number;
    } | null {
        const pack = this.policyPacks.packs.find((entry) => entry.id === packId);
        if (!pack) {
            return null;
        }

        let wouldBlock = 0;
        for (const trace of traces) {
            if (pack.blockedActions.includes(trace.actionType)) {
                wouldBlock += 1;
            }
        }
        const sampledTasks = traces.length;
        const blockRate = sampledTasks > 0 ? Number((wouldBlock / sampledTasks).toFixed(3)) : 0;
        this.policyPacks.lastSimulationByPackId[packId] = {
            simulatedAt: toIso(this.now),
            sampledTasks,
            wouldBlock,
            blockRate,
        };
        writePolicyPackState(this.policyPacks);
        return {
            packId,
            sampledTasks,
            wouldBlock,
            blockRate,
        };
    }

    public enablePolicyPack(packId: string): {
        enabled: boolean;
        reason: string;
        activePackId: string | null;
    } {
        const pack = this.policyPacks.packs.find((entry) => entry.id === packId);
        if (!pack) {
            return { enabled: false, reason: 'policy_pack_not_found', activePackId: this.policyPacks.activePackId };
        }

        const simulation = this.policyPacks.lastSimulationByPackId[packId];
        if (!simulation) {
            return { enabled: false, reason: 'policy_pack_not_simulated', activePackId: this.policyPacks.activePackId };
        }
        if (simulation.sampledTasks < 100) {
            return { enabled: false, reason: 'policy_pack_simulation_requires_100_tasks', activePackId: this.policyPacks.activePackId };
        }
        if (simulation.blockRate > pack.maxAllowedBlockRate) {
            return { enabled: false, reason: 'policy_pack_block_rate_too_high', activePackId: this.policyPacks.activePackId };
        }

        this.policyPacks.packs = this.policyPacks.packs.map((entry) => ({
            ...entry,
            enabled: entry.id === packId,
            updatedAt: toIso(this.now),
        }));
        this.policyPacks.activePackId = packId;
        writePolicyPackState(this.policyPacks);
        return { enabled: true, reason: 'enabled', activePackId: this.policyPacks.activePackId };
    }

    public getActivePolicyPack(): PolicyPack | null {
        if (!this.policyPacks.activePackId) {
            return null;
        }
        return this.policyPacks.packs.find((entry) => entry.id === this.policyPacks.activePackId) ?? null;
    }

    public setScopeConstraint(includePaths: string[]): ScopeConstraint {
        const normalized = stableUnique(includePaths.map((entry) => entry.trim().replace(/\\/g, '/')).filter(Boolean));
        this.scopeConstraint = {
            includePaths: normalized,
            setAt: toIso(this.now),
        };
        return this.scopeConstraint;
    }

    public clearScopeConstraint(): void {
        this.scopeConstraint = null;
    }

    public getScopeConstraint(): ScopeConstraint | null {
        return this.scopeConstraint;
    }

    public validateTaskScope(payload: Record<string, unknown>): {
        allowed: boolean;
        outOfScopePaths: string[];
    } {
        if (!this.scopeConstraint || this.scopeConstraint.includePaths.length === 0) {
            return {
                allowed: true,
                outOfScopePaths: [],
            };
        }

        const payloadPaths = extractPathsFromPayload(payload);
        const outOfScopePaths = payloadPaths.filter((candidate) => {
            const normalized = candidate.replace(/\\/g, '/');
            return !this.scopeConstraint!.includePaths.some((scope) => normalized.startsWith(scope));
        });

        return {
            allowed: outOfScopePaths.length === 0,
            outOfScopePaths,
        };
    }

    public setPaused(paused: boolean): { paused: boolean } {
        this.paused = paused;
        if (!paused) {
            this.stepBudget = 0;
        }
        return { paused: this.paused };
    }

    public allowSingleStep(): { paused: boolean; stepBudget: number } {
        this.paused = true;
        this.stepBudget = 1;
        return { paused: this.paused, stepBudget: this.stepBudget };
    }

    public canProcessNextTask(): boolean {
        if (!this.paused) {
            return true;
        }
        if (this.stepBudget > 0) {
            this.stepBudget -= 1;
            return true;
        }
        return false;
    }

    public getControlState(): { paused: boolean; stepBudget: number } {
        return { paused: this.paused, stepBudget: this.stepBudget };
    }

    public explainWhy(taskId: string): { taskId: string; reasons: string[] } {
        return {
            taskId,
            reasons: this.reasonByTask.get(taskId) ?? [],
        };
    }

    public getSemanticGraph(workspaceRoot: string): SemanticGraph {
        this.semanticGraphCache = buildSemanticGraph(workspaceRoot, this.now, Array.from(this.traces.values()));
        return this.semanticGraphCache;
    }

    public querySemanticGraph(symbol: string): {
        symbol: string;
        inbound: Array<{ from: string; to: string }>;
        outbound: Array<{ from: string; to: string }>;
        symbolNodes: SemanticGraph['symbols'];
        callPaths: Array<{ from: string; to: string }>;
        owners: string[];
        coverageLinks: string[];
    } {
        const graph = this.semanticGraphCache;
        if (!graph) {
            return { symbol, inbound: [], outbound: [], symbolNodes: [], callPaths: [], owners: [], coverageLinks: [] };
        }

        const normalized = symbol.trim().toLowerCase();
        const inbound = graph.edges.filter((edge) => edge.to.toLowerCase().includes(normalized));
        const outbound = graph.edges.filter((edge) => edge.from.toLowerCase().includes(normalized));
        const symbolNodes = graph.symbols.filter((entry) => entry.symbol.toLowerCase().includes(normalized));
        const callPaths = graph.callEdges.filter(
            (entry) => entry.from.toLowerCase().includes(normalized) || entry.to.toLowerCase().includes(normalized),
        );
        const owners = stableUnique(symbolNodes.map((entry) => entry.owner).filter((entry): entry is string => !!entry));
        const coverageLinks = stableUnique(symbolNodes.flatMap((entry) => entry.testLinks));
        return { symbol, inbound, outbound, symbolNodes, callPaths, owners, coverageLinks };
    }

    public generateIncidentPatchPack(input: {
        incidentId: string;
        service: string;
        traces: Array<{ taskId: string; status: string; actionType: string }>;
    }): {
        incidentId: string;
        service: string;
        summary: string;
        rootCauseSummary: string;
        patchDiff: string;
        hotfixActions: string[];
        verificationCommands: string[];
        rollback: string[];
        oneClickHotfix: string;
    } {
        const failed = input.traces.filter((trace) => trace.status === 'failed').slice(0, 10);
        const rootCauseSummary = failed.length > 0
            ? `Most frequent failed action type: ${failed[0].actionType}`
            : 'No failed traces found in sampled incident window.';
        const patchDiff = [
            'diff --git a/services/hotfix.ts b/services/hotfix.ts',
            '--- a/services/hotfix.ts',
            '+++ b/services/hotfix.ts',
            '@@',
            "+// hotfix placeholder generated by incident patch pack",
            "+export const INCIDENT_${input.incidentId.replace(/[^A-Za-z0-9]/g, '_')} = true;",
        ].join('\n');
        return {
            incidentId: input.incidentId,
            service: input.service,
            summary: `Incident ${input.incidentId} captured with ${failed.length} failed runtime action(s).`,
            rootCauseSummary,
            patchDiff,
            hotfixActions: failed.map((trace) => `Inspect action ${trace.actionType} from task ${trace.taskId}.`),
            verificationCommands: [
                'pnpm --filter @agentfarm/agent-runtime test',
                'pnpm quality:gate',
            ],
            rollback: [
                'Pause runtime control loop before hotfix rollout.',
                'Rollback using checkpoint/git revert if verification fails.',
                'Re-run targeted smoke tests and unpause runtime.',
            ],
            oneClickHotfix: `git checkout -b hotfix/${input.incidentId} ; pnpm --filter @agentfarm/agent-runtime test`,
        };
    }

    public listMarketplaceSkills(): Array<MarketplaceSkill & { installed: boolean; installedVersion: string | null; verified: boolean }> {
        const state = readMarketplaceState();
        const catalog = readMergedMarketplaceCatalog();
        return catalog.map((skill) => {
            const verification = verifySkillManifest(skill);
            return {
                ...skill,
                installed: Object.prototype.hasOwnProperty.call(state.installed, skill.id),
                installedVersion: state.installed[skill.id] ?? null,
                verified: verification.verified,
            };
        });
    }

    public installMarketplaceSkill(input: {
        skillId: string;
        approvedPermissions: string[];
        requiredVersion?: string;
        pinVersion?: string;
        workspaceKey?: string;
    }): {
        installed: boolean;
        reason: string;
    } {
        const catalog = readMergedMarketplaceCatalog();
        const skill = catalog.find((entry) => entry.id === input.skillId);
        if (!skill) {
            return { installed: false, reason: 'skill_not_found' };
        }

        const verification = verifySkillManifest(skill);
        if (!verification.verified) {
            return { installed: false, reason: 'invalid_skill_signature' };
        }

        if (input.requiredVersion && input.requiredVersion !== skill.version) {
            return { installed: false, reason: `version_mismatch:${skill.version}` };
        }

        const approvedSet = new Set(input.approvedPermissions.map((entry) => entry.trim()));
        const missingPermissions = skill.permissions.filter((permission) => !approvedSet.has(permission));
        if (missingPermissions.length > 0) {
            return { installed: false, reason: `missing_permissions:${missingPermissions.join(',')}` };
        }

        const state = readMarketplaceState();
        state.installed[skill.id] = input.pinVersion?.trim() || skill.version;
        writeMarketplaceState(state);

        this.recordMarketplaceUsage({
            skillId: skill.id,
            event: 'install',
            workspaceKey: input.workspaceKey?.trim() || 'default',
        });

        return { installed: true, reason: 'installed' };
    }

    public uninstallMarketplaceSkill(input: {
        skillId: string;
        workspaceKey?: string;
    }): {
        removed: boolean;
        reason: string;
    } {
        const state = readMarketplaceState();
        if (!Object.prototype.hasOwnProperty.call(state.installed, input.skillId)) {
            return { removed: false, reason: 'skill_not_installed' };
        }

        delete state.installed[input.skillId];
        writeMarketplaceState(state);
        this.recordMarketplaceUsage({
            skillId: input.skillId,
            event: 'uninstall',
            workspaceKey: input.workspaceKey?.trim() || 'default',
        });

        return {
            removed: true,
            reason: 'uninstalled',
        };
    }

    public upsertMarketplaceSkill(input: {
        id: string;
        name: string;
        version: string;
        permissions: string[];
        source?: string;
    }): { updated: boolean; skill: MarketplaceSkill } {
        const digestInput = JSON.stringify({
            id: input.id,
            name: input.name,
            version: input.version,
            permissions: [...input.permissions].sort(),
            source: input.source?.trim() || 'custom_managed',
        });
        const manifestDigest = sha256(digestInput);

        const nextSkill: MarketplaceSkill = {
            id: input.id.trim(),
            name: input.name.trim(),
            version: input.version.trim(),
            permissions: stableUnique(input.permissions.map((entry) => entry.trim()).filter(Boolean)),
            source: input.source?.trim() || 'custom_managed',
            manifest_digest: manifestDigest,
            signature: `sha256:${manifestDigest}`,
        };

        const managed = readManagedMarketplaceCatalog();
        const existingIndex = managed.findIndex((entry) => entry.id === nextSkill.id);
        const updated = existingIndex >= 0;
        if (existingIndex >= 0) {
            managed[existingIndex] = nextSkill;
        } else {
            managed.push(nextSkill);
        }
        writeManagedMarketplaceCatalog(managed);

        return {
            updated,
            skill: nextSkill,
        };
    }

    public removeMarketplaceSkill(skillId: string): { removed: boolean; reason: string } {
        const trimmedId = skillId.trim();
        if (!trimmedId) {
            return { removed: false, reason: 'invalid_skill_id' };
        }

        const managed = readManagedMarketplaceCatalog();
        const next = managed.filter((entry) => entry.id !== trimmedId);
        if (next.length === managed.length) {
            const builtin = readMarketplaceCatalog();
            if (builtin.some((entry) => entry.id === trimmedId)) {
                return { removed: false, reason: 'builtin_skill_read_only' };
            }
            return { removed: false, reason: 'skill_not_found' };
        }

        writeManagedMarketplaceCatalog(next);
        return { removed: true, reason: 'removed' };
    }

    public recordMarketplaceUsage(input: { skillId: string; event: 'install' | 'uninstall' | 'invoke'; workspaceKey: string }): void {
        const next: MarketplaceUsageEvent = {
            at: toIso(this.now),
            skillId: input.skillId,
            event: input.event,
            workspaceKey: input.workspaceKey,
        };
        this.marketplaceTelemetry.push(next);
        while (this.marketplaceTelemetry.length > 1_000) {
            this.marketplaceTelemetry.shift();
        }
        writeMarketplaceTelemetry(this.marketplaceTelemetry);
    }

    public listMarketplaceTelemetry(limit = 100): MarketplaceUsageEvent[] {
        return this.marketplaceTelemetry.slice(-Math.max(1, Math.min(500, limit)));
    }

    public buildIssueToPrExecution(input: { issueNumber: number; title: string; body?: string }): {
        objective: string;
        branchName: string;
        commands: string[];
        patchHints: string[];
        tests: string[];
        prDraft: { title: string; body: string; labels: string[] };
        route: 'approval';
    } {
        const plan = this.buildIssueToPrAutopilot(input);
        return {
            objective: plan.objective,
            branchName: plan.branchName,
            commands: [
                `git checkout -b ${plan.branchName}`,
                'pnpm --filter @agentfarm/agent-runtime test',
                'git add .',
                `git commit -m "fix: resolve issue #${input.issueNumber}"`,
            ],
            patchHints: [
                'Apply minimal bounded patch only in issue scope files.',
                'Add regression tests before creating PR.',
            ],
            tests: plan.verification,
            prDraft: {
                title: `fix: ${input.title} (#${input.issueNumber})`,
                body: [
                    `Resolves #${input.issueNumber}`,
                    '',
                    '## Summary',
                    '- Generated by issue-to-PR autopilot workflow',
                    '- Includes tests and rollback notes',
                    '',
                    '## Rollback',
                    '- Revert this PR if production verification fails',
                ].join('\n'),
                labels: ['autopilot', 'needs-human-approval'],
            },
            route: 'approval',
        };
    }

    public recordProvenanceAttestation(task: TaskEnvelope, result: ProcessedTaskResult): ProvenanceAttestation {
        const payloadHash = sha256(JSON.stringify(task.payload));
        const resultHash = sha256(JSON.stringify({
            decision: result.decision,
            status: result.status,
            attempts: result.attempts,
            retries: result.transientRetries,
            failureClass: result.failureClass ?? null,
            errorMessage: result.errorMessage ?? null,
        }));
        const previous = this.provenance.length > 0 ? this.provenance[this.provenance.length - 1] : null;
        const chainHash = sha256([
            previous?.chainHash ?? '',
            task.taskId,
            payloadHash,
            resultHash,
            toIso(this.now),
        ].join('|'));

        const attestation: ProvenanceAttestation = {
            at: toIso(this.now),
            taskId: task.taskId,
            status: result.status,
            actionType: result.decision.actionType,
            payloadHash,
            resultHash,
            previousHash: previous?.chainHash ?? null,
            chainHash,
        };
        this.provenance.push(attestation);
        while (this.provenance.length > 2_000) {
            this.provenance.shift();
        }

        const path = getProvenanceLogPath();
        mkdirSync(resolve(getStateDir()), { recursive: true });
        appendFileSync(path, `${JSON.stringify(attestation)}\n`);
        return attestation;
    }

    public listProvenanceAttestations(limit = 100): ProvenanceAttestation[] {
        return this.provenance.slice(-Math.max(1, Math.min(1_000, limit)));
    }

    public executeInstalledSkill(input: {
        skillId: string;
        inputs: Record<string, unknown>;
        workspaceKey?: string;
    }): SkillOutput {
        const skillId = input.skillId.trim();
        if (!skillId) {
            return {
                ok: false,
                skill_id: skillId,
                summary: 'skill_id is required',
                risk_level: 'low',
                requires_approval: false,
                actions_taken: [],
                result: { error: 'missing_skill_id' },
                duration_ms: 0,
            };
        }

        const state = readMarketplaceState();
        if (!Object.prototype.hasOwnProperty.call(state.installed, skillId)) {
            return {
                ok: false,
                skill_id: skillId,
                summary: `Skill "${skillId}" is not installed`,
                risk_level: 'low',
                requires_approval: false,
                actions_taken: [],
                result: { error: 'skill_not_installed' },
                duration_ms: 0,
            };
        }

        const handler = getSkillHandler(skillId);
        if (!handler) {
            return {
                ok: false,
                skill_id: skillId,
                summary: `No execution handler registered for skill "${skillId}"`,
                risk_level: 'low',
                requires_approval: false,
                actions_taken: [],
                result: { error: 'no_handler_registered' },
                duration_ms: 0,
            };
        }

        const startedAt = this.now();
        const output = handler(input.inputs, startedAt);

        this.recordMarketplaceUsage({
            skillId,
            event: 'invoke',
            workspaceKey: input.workspaceKey?.trim() || 'default',
        });

        return output;
    }
}
