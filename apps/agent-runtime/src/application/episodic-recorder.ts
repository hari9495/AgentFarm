/**
 * episodic-recorder.ts — shared episodic memory recording logic.
 *
 * The exact same ~50-line memory recording block was copy-pasted into both
 * `processApprovedTask` and `processDeveloperTask` inside execution-engine.ts.
 * This module de-duplicates that logic into a single, testable function.
 *
 * Episodic recording is always best-effort: a memory write failure must never
 * cause the agent task itself to fail. Every call site wraps this in `.catch()`
 * for that reason.
 */

import { globalEpisodicMemory, type TaskMemoryEntry } from '../episodic-memory.js';
import { extractPersonKeyFromPayload } from '../person-key-extractor.js';
import type { ProcessedTaskResult, TaskEnvelope, ActionDecision } from '../execution-engine.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EpisodicRecordInput = {
    task: TaskEnvelope;
    result: ProcessedTaskResult;
    decision: ActionDecision;
    workspaceId: string;
};

// ---------------------------------------------------------------------------
// Action output parsing
// ---------------------------------------------------------------------------

type ParsedActionOutput = {
    filesChanged?: string[];
    codeDiff?: string;
    testFailureSummary?: string;
};

const parseActionOutput = (raw: string | undefined): ParsedActionOutput => {
    try {
        const json = JSON.parse(raw ?? '{}') as Record<string, unknown>;
        const result: ParsedActionOutput = {};

        if (Array.isArray(json['files_changed'])) {
            result.filesChanged = (json['files_changed'] as unknown[])
                .filter((f): f is string => typeof f === 'string')
                .slice(0, 10);
        }
        if (typeof json['code_diff'] === 'string' && json['code_diff'].trim()) {
            result.codeDiff = json['code_diff'].slice(0, 2000);
        }
        if (typeof json['test_failure_summary'] === 'string' && json['test_failure_summary'].trim()) {
            result.testFailureSummary = json['test_failure_summary'].slice(0, 400);
        }
        return result;
    } catch {
        return {};
    }
};

// ---------------------------------------------------------------------------
// Outcome mapping
// ---------------------------------------------------------------------------

const toMemoryOutcome = (result: ProcessedTaskResult): TaskMemoryEntry['outcome'] => {
    if (result.status === 'success') return 'success';
    if (result.status === 'approval_required') return 'approval_required';
    if (result.errorMessage?.toLowerCase().includes('escalat')) return 'escalated';
    return 'failed';
};

const extractPromptSummary = (
    payload: Record<string, unknown>,
    actionType: string,
): string =>
    (
        typeof payload['prompt'] === 'string' ? payload['prompt'] :
        typeof payload['description'] === 'string' ? payload['description'] :
        typeof payload['summary'] === 'string' ? payload['summary'] :
        actionType
    ).slice(0, 200);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Records a task's outcome into episodic memory. Returns a Promise that
 * should always be `.catch(() => {})` by the caller — never await it bare.
 */
export const recordEpisode = async (input: EpisodicRecordInput): Promise<void> => {
    const { task, result, decision, workspaceId } = input;
    const payload = result.executionPayload ?? task.payload;

    const promptSummary = extractPromptSummary(payload, decision.actionType);
    const outcome = toMemoryOutcome(result);
    const personContext = extractPersonKeyFromPayload(payload) ?? extractPersonKeyFromPayload(task.payload);
    const { filesChanged, codeDiff, testFailureSummary } = parseActionOutput(result.actionOutput);

    const botId = typeof task.payload['botId'] === 'string' ? task.payload['botId'] : 'unknown';

    await globalEpisodicMemory.record({
        taskId: task.taskId,
        workspaceId,
        botId,
        actionType: decision.actionType,
        promptSummary,
        outcome,
        timestamp: Date.now(),
        errorMessage: result.errorMessage?.slice(0, 120),
        personKey: personContext?.personKey,
        personLabel: personContext?.personLabel,
        filesChanged,
        codeDiff,
        testFailureSummary,
    });
};
