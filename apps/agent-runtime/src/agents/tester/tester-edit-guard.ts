/**
 * Tester-role file-edit guard (Gap 5: Tester scoped patch ability).
 *
 * The tester role is allowed to author and modify tests, but MUST NOT
 * be permitted to edit production source files. Without a path guard,
 * the `code_edit` / `code_edit_patch` actions would let a tester agent
 * silently rewrite arbitrary source files — a clear violation of role
 * separation and a regression risk for production code.
 *
 * This module classifies a file path as "test" vs "non-test" using the
 * conventions used across the codebase (TS/JS/Python/Go/Java) and the
 * common test-folder names. It is consulted by the runtime gate before
 * dispatching `code_edit` / `code_edit_patch` for the tester role.
 */

const TEST_FILENAME_PATTERNS: RegExp[] = [
    /\.test\.(ts|tsx|js|jsx|mjs|cjs)$/i,
    /\.spec\.(ts|tsx|js|jsx|mjs|cjs)$/i,
    /\.test\.py$/i,
    /\.spec\.py$/i,
    /(^|[\\/])test_[^\\/]+\.py$/i,
    /[^\\/]+_test\.go$/i,
    /(^|[\\/])(?:[A-Z][A-Za-z0-9_]*)Test\.java$/,
    /(^|[\\/])(?:[A-Z][A-Za-z0-9_]*)Tests?\.java$/,
    /(^|[\\/])(?:[A-Z][A-Za-z0-9_]*)IT\.java$/,
];

const TEST_DIRECTORY_PATTERNS: RegExp[] = [
    /(^|[\\/])__tests__([\\/]|$)/i,
    /(^|[\\/])tests?([\\/]|$)/i,
    /(^|[\\/])e2e([\\/]|$)/i,
    /(^|[\\/])cypress([\\/]|$)/i,
    /(^|[\\/])playwright(-tests?)?([\\/]|$)/i,
    /(^|[\\/])specs?([\\/]|$)/i,
    /(^|[\\/])integration-tests?([\\/]|$)/i,
    /(^|[\\/])unit-tests?([\\/]|$)/i,
    /(^|[\\/])src[\\/]test([\\/]|$)/i, // Maven/Gradle Java/Kotlin convention
];

/**
 * Returns true when the supplied path looks like a test file by either
 * filename convention or directory location.
 */
export const isTestFilePath = (rawPath: string): boolean => {
    if (typeof rawPath !== 'string') {
        return false;
    }

    const trimmed = rawPath.trim();
    if (!trimmed) {
        return false;
    }

    // Reject absolute paths and parent-directory escapes outright; tests must
    // live inside the workspace, and the executor's safeChildPath will refuse
    // these anyway. We refuse them here so the guard is the loud failure.
    if (/^[\\/]/.test(trimmed) || /^[A-Za-z]:[\\/]/.test(trimmed)) {
        return false;
    }
    if (trimmed.split(/[\\/]/).some((segment) => segment === '..')) {
        return false;
    }

    // Normalize Windows-style separators for matching.
    const candidate = trimmed.replace(/\\/g, '/');

    if (TEST_FILENAME_PATTERNS.some((rx) => rx.test(candidate))) {
        return true;
    }
    if (TEST_DIRECTORY_PATTERNS.some((rx) => rx.test(candidate))) {
        return true;
    }

    return false;
};

const TESTER_GUARDED_ACTIONS = new Set<string>(['code_edit', 'code_edit_patch']);

interface TesterEditGuardInput {
    roleKey: string;
    actionType: string;
    payload: Record<string, unknown>;
}

interface TesterEditGuardResult {
    allowed: boolean;
    reason?: string;
    filePath?: string;
}

/**
 * Evaluates whether the tester role is permitted to perform the given
 * file-edit action. Returns `{allowed: true}` for non-tester roles,
 * non-edit actions, and tester edits whose `file_path` resolves to a
 * recognized test file. Returns `{allowed: false, reason}` otherwise so
 * the runtime can fail the task loudly with an audit trail.
 */
export const evaluateTesterEditGuard = (input: TesterEditGuardInput): TesterEditGuardResult => {
    if (input.roleKey !== 'tester') {
        return { allowed: true };
    }
    if (!TESTER_GUARDED_ACTIONS.has(input.actionType)) {
        return { allowed: true };
    }

    const rawFilePath = typeof input.payload['file_path'] === 'string' ? input.payload['file_path'] : '';
    if (!rawFilePath.trim()) {
        return {
            allowed: false,
            reason: `Tester role requires payload.file_path for ${input.actionType}.`,
        };
    }

    if (!isTestFilePath(rawFilePath)) {
        return {
            allowed: false,
            reason:
                `Tester role may only edit test files; '${rawFilePath}' is not a recognized test path. ` +
                `Allowed conventions: *.test.{ts,tsx,js,jsx,py}, *.spec.*, *_test.go, **/__tests__/**, ` +
                `**/tests/**, **/e2e/**, **/cypress/**, **/playwright-tests/**, src/test/** (Java).`,
            filePath: rawFilePath,
        };
    }

    return { allowed: true, filePath: rawFilePath };
};
