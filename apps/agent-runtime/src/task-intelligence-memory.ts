import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, resolve } from 'path';

type TaskIntelligenceStore = {
    version: 1;
    trajectories: Record<string, {
        actionType: string;
        riskLevel: 'low' | 'medium' | 'high';
        successes: number;
        failures: number;
        lastStatus: 'success' | 'approval_required' | 'failed' | 'cancelled';
        lastUpdatedAt: string;
    }>;
    conventions: Record<string, {
        testCommand?: string;
        buildCommand?: string;
        packageManager?: 'pnpm' | 'npm' | 'yarn' | 'unknown';
        importStyle?: 'esm' | 'cjs' | 'mixed' | 'unknown';
        lastUpdatedAt: string;
    }>;
    /** Per-task completion records keyed by taskId, used to calibrate effort estimates */
    taskRecords: Record<string, {
        description: string;
        complexity: string;
        estimatedMinutes: number;
        actualMinutes?: number;
        completedAt?: string;
    }>;
};

const DEFAULT_TASK_INTELLIGENCE_PATH = resolve(tmpdir(), 'agentfarm-task-intelligence-memory.json');

const getTaskIntelligencePath = (): string => {
    const configured = process.env['AF_TASK_INTELLIGENCE_PATH'] ?? process.env['AGENTFARM_TASK_INTELLIGENCE_PATH'];
    return resolve(configured?.trim() || DEFAULT_TASK_INTELLIGENCE_PATH);
};

const loadStore = (): TaskIntelligenceStore => {
    const filePath = getTaskIntelligencePath();
    if (!existsSync(filePath)) {
        return {
            version: 1,
            trajectories: {},
            conventions: {},
            taskRecords: {},
        };
    }

    try {
        const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as TaskIntelligenceStore;
        return {
            version: 1,
            trajectories: parsed.trajectories ?? {},
            conventions: parsed.conventions ?? {},
            taskRecords: parsed.taskRecords ?? {},
        };
    } catch {
        return {
            version: 1,
            trajectories: {},
            conventions: {},
            taskRecords: {},
        };
    }
};

const saveStore = (store: TaskIntelligenceStore): void => {
    const filePath = getTaskIntelligencePath();
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(store, null, 2));
};

const detectPackageManager = (command: string | undefined): 'pnpm' | 'npm' | 'yarn' | 'unknown' => {
    if (!command) return 'unknown';
    const normalized = command.trim().toLowerCase();
    if (normalized.startsWith('pnpm ')) return 'pnpm';
    if (normalized.startsWith('npm ')) return 'npm';
    if (normalized.startsWith('yarn ')) return 'yarn';
    return 'unknown';
};

const detectImportStyle = (payload: Record<string, unknown>): 'esm' | 'cjs' | 'mixed' | 'unknown' => {
    const moduleType = payload['module_type'];
    if (moduleType === 'esm' || moduleType === 'cjs' || moduleType === 'mixed') {
        return moduleType;
    }

    const files = payload['target_files'];
    if (!Array.isArray(files)) {
        return 'unknown';
    }

    const hasCjs = files.some((entry) => typeof entry === 'string' && entry.endsWith('.cjs'));
    const hasEsm = files.some((entry) => typeof entry === 'string' && (entry.endsWith('.mjs') || entry.endsWith('.ts') || entry.endsWith('.tsx')));

    if (hasCjs && hasEsm) return 'mixed';
    if (hasCjs) return 'cjs';
    if (hasEsm) return 'esm';
    return 'unknown';
};

const toWorkspaceKey = (value: string | undefined): string => {
    const normalized = value?.trim();
    return normalized && normalized.length > 0 ? normalized : 'default';
};

export const recordTaskIntelligence = (input: {
    workspaceKey?: string;
    actionType: string;
    riskLevel: 'low' | 'medium' | 'high';
    status: 'success' | 'approval_required' | 'failed' | 'cancelled';
    payload: Record<string, unknown>;
}): void => {
    const store = loadStore();
    const workspaceKey = toWorkspaceKey(input.workspaceKey);
    const trajectoryKey = `${workspaceKey}:${input.actionType}`;
    const nowIso = new Date().toISOString();

    const existing = store.trajectories[trajectoryKey] ?? {
        actionType: input.actionType,
        riskLevel: input.riskLevel,
        successes: 0,
        failures: 0,
        lastStatus: input.status,
        lastUpdatedAt: nowIso,
    };

    if (input.status === 'success' || input.status === 'approval_required') {
        existing.successes += 1;
    }
    if (input.status === 'failed' || input.status === 'cancelled') {
        existing.failures += 1;
    }
    existing.riskLevel = input.riskLevel;
    existing.lastStatus = input.status;
    existing.lastUpdatedAt = nowIso;
    store.trajectories[trajectoryKey] = existing;

    const testCommand = typeof input.payload['test_command'] === 'string' ? input.payload['test_command'].trim() : undefined;
    const buildCommand = typeof input.payload['build_command'] === 'string' ? input.payload['build_command'].trim() : undefined;
    const packageManager = detectPackageManager(testCommand ?? buildCommand);
    const importStyle = detectImportStyle(input.payload);

    const previousConvention = store.conventions[workspaceKey] ?? { lastUpdatedAt: nowIso };
    store.conventions[workspaceKey] = {
        ...previousConvention,
        testCommand: testCommand || previousConvention.testCommand,
        buildCommand: buildCommand || previousConvention.buildCommand,
        packageManager: packageManager !== 'unknown' ? packageManager : previousConvention.packageManager,
        importStyle: importStyle !== 'unknown' ? importStyle : previousConvention.importStyle,
        lastUpdatedAt: nowIso,
    };

    saveStore(store);
};

export const getTaskIntelligenceContext = (input: {
    workspaceKey?: string;
    actionType: string;
}): {
    trajectoryHints: string[];
    conventionHints: string[];
} => {
    const store = loadStore();
    const workspaceKey = toWorkspaceKey(input.workspaceKey);
    const trajectory = store.trajectories[`${workspaceKey}:${input.actionType}`];
    const conventions = store.conventions[workspaceKey];

    const trajectoryHints: string[] = [];
    if (trajectory) {
        trajectoryHints.push(
            `Historical outcome for ${trajectory.actionType}: successes=${trajectory.successes}, failures=${trajectory.failures}, last_status=${trajectory.lastStatus}`,
        );
    }

    const conventionHints: string[] = [];
    if (conventions?.packageManager) {
        conventionHints.push(`Preferred package manager: ${conventions.packageManager}`);
    }
    if (conventions?.testCommand) {
        conventionHints.push(`Preferred test command: ${conventions.testCommand}`);
    }
    if (conventions?.buildCommand) {
        conventionHints.push(`Preferred build command: ${conventions.buildCommand}`);
    }
    if (conventions?.importStyle) {
        conventionHints.push(`Preferred import style: ${conventions.importStyle}`);
    }

    return {
        trajectoryHints,
        conventionHints,
    };
};

/**
 * Persists the actual time taken to complete a task so future effort estimates
 * can be calibrated against real historical data.
 */
export const recordTaskCompletion = (
    taskId: string,
    actualMinutes: number,
    meta?: { description?: string; complexity?: string; estimatedMinutes?: number },
): void => {
    const store = loadStore();
    store.taskRecords[taskId] = {
        description: meta?.description ?? '',
        complexity: meta?.complexity ?? 'unknown',
        estimatedMinutes: meta?.estimatedMinutes ?? 0,
        actualMinutes,
        completedAt: new Date().toISOString(),
    };
    saveStore(store);
};

/**
 * Returns the average actual minutes across the provided task IDs that have a
 * recorded completion time. Returns null when no matching records exist.
 */
export const getHistoricalMinutes = (taskIds: string[]): number | null => {
    if (taskIds.length === 0) return null;
    const store = loadStore();
    const actuals = taskIds
        .map((id) => store.taskRecords[id]?.actualMinutes)
        .filter((v): v is number => typeof v === 'number' && v > 0);
    if (actuals.length === 0) return null;
    return actuals.reduce((sum, v) => sum + v, 0) / actuals.length;
};
