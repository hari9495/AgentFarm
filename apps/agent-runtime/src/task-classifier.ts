/**
 * Sprint 2 — Role Enforcement Framework
 *
 * Task classifier: determines whether a task belongs to the agent's current role.
 *
 * Two layers of classification:
 *  1. Keyword heuristic (synchronous, no external deps, used as the default).
 *  2. Injectable `TaskClassifierFn` for LLM-backed or test-mock classification.
 *
 * The hard-blocklist check (action_type level) lives in role-enforcer.ts.
 * This module only handles the softer semantic check on the task description.
 */

import type { TaskEnvelope } from './execution-engine.js';
import { DEVELOPER_BLOCKED_KEYWORDS } from './agents/developer/developer-role-profile.js';
import { CORPORATE_ASSISTANT_BLOCKED_KEYWORDS } from './agents/corporate-assistant/corporate-assistant-role-profile.js';
import { TECHNICAL_WRITER_BLOCKED_KEYWORDS } from './agents/technical-writer/technical-writer-role-profile.js';
import { CONTENT_WRITER_BLOCKED_KEYWORDS } from './agents/content-writer/content-writer-role-profile.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ClassificationResult {
    /** True when the task intent appears to belong to the given role. */
    belongsToRole: boolean;
    /** 0–1 confidence score. Values below 0.70 are treated as ambiguous (allowed). */
    confidence: number;
    /** Human-readable explanation for logging. */
    reason: string;
    /**
     * Suggested role when `belongsToRole` is false and the classifier can identify
     * where the task should be routed. Null when unknown.
     * The role-enforcer will cross-check against the signal map to confirm.
     */
    suggestedRole: string | null;
}

/**
 * Injectable classifier function signature.
 * Replace with an LLM-backed implementation for production classification.
 */
export type TaskClassifierFn = (
    taskDescription: string,
    roleKey: string,
) => Promise<ClassificationResult>;

// ---------------------------------------------------------------------------
// Developer-role keyword signals
// ---------------------------------------------------------------------------
// Presence of ANY of these in the combined task description is a positive
// signal that the task belongs to the developer role.

const DEVELOPER_POSITIVE_KEYWORDS: ReadonlyArray<string> = [
    'code',
    'bug',
    'fix',
    'pull request',
    ' pr ',
    'commit',
    'branch',
    'merge',
    'unit test',
    'integration test',
    ' ci ',
    'pipeline',
    'deploy',
    'refactor',
    'code review',
    'review code',
    'diff',
    'patch',
    'lint',
    'build',
    'typescript',
    'javascript',
    'python',
    'java',
    'rust',
    'golang',
    ' api ',
    'endpoint',
    'microservice',
    'dependency',
    'npm',
    'pnpm',
    'yarn',
    'docker',
    'kubernetes',
    'github issue',
    'gitlab issue',
    'jira ticket',
    'jira issue',
    'create_pr',
    'review_code',
    'create_issue',
    'run_pipeline',
    'code_edit',
    'git_commit',
    'run_tests',
    'workspace_fix_test',
    'workspace_create_pr',
    'workspace_run_ci',
    'workspace_github_issue',
    'workspace_meeting',
    'workspace_code',
    'workspace_fix',
    'workspace_create',
    'workspace_run',
];

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Extracts a combined lower-case description string from the task payload.
 * Checks common description fields in priority order.
 */
export function extractTaskDescription(task: TaskEnvelope): string {
    const payload = task.payload;
    const parts: string[] = [];

    if (typeof payload['action_type'] === 'string') parts.push(payload['action_type']);
    if (typeof payload['prompt'] === 'string') parts.push(payload['prompt']);
    if (typeof payload['description'] === 'string') parts.push(payload['description']);
    if (typeof payload['intent'] === 'string') parts.push(payload['intent']);
    if (typeof payload['title'] === 'string') parts.push(payload['title']);

    return parts.join(' ').toLowerCase();
}

// ---------------------------------------------------------------------------
// Heuristic classifier
// ---------------------------------------------------------------------------

/**
 * Pure keyword-based classifier.  No external dependencies.
 * Returns `belongsToRole: false` only when a blocked keyword is present AND
 * no positive developer keyword is present (positive signals take priority).
 *
 * Confidence is 0.85 on a blocked-only match, 0.80 on a developer-positive
 * match, and 0.50 on a neutral (no signal either way).
 */
export function heuristicClassify(taskDescription: string, roleKey: string): ClassificationResult {
    if (roleKey === 'technical_writer') {
        const lower = taskDescription.toLowerCase();

        // Positive TW signals.
        const TW_POSITIVE_KEYWORDS = [
            'document', 'documentation', 'api doc', 'release notes',
            'style guide', 'technical writing', 'openapi', 'swagger',
            'readme', 'changelog', 'jsdoc', 'docstring', 'doc diff',
            'update docs', 'write docs', 'generate docs', 'doc update',
            'api reference', 'user guide', 'runbook',
        ];
        const positiveMatch = TW_POSITIVE_KEYWORDS.find(kw => lower.includes(kw));
        if (positiveMatch) {
            return {
                belongsToRole: true,
                confidence: 0.80,
                reason: `Task contains technical-writer-role keyword: "${positiveMatch}"`,
                suggestedRole: null,
            };
        }

        const blockedMatch = TECHNICAL_WRITER_BLOCKED_KEYWORDS.find(kw => lower.includes(kw));
        if (blockedMatch) {
            return {
                belongsToRole: false,
                confidence: 0.85,
                reason: `Task contains non-technical-writer keyword: "${blockedMatch}"`,
                suggestedRole: null,
            };
        }

        return {
            belongsToRole: true,
            confidence: 0.50,
            reason: 'No strong role signal for technical_writer; defaulting to allow',
            suggestedRole: null,
        };
    }

    if (roleKey === 'corporate_assistant') {
        const lower = taskDescription.toLowerCase();

        // Positive CA signals.
        const CA_POSITIVE_KEYWORDS = [
            'schedule meeting', 'send email', 'create document', 'set up meeting',
            'book meeting', 'calendar invite', 'draft email', 'compose email',
            'prepare agenda', 'meeting notes', 'standup report', 'send message',
            'follow up', 'internal memo', 'out of office',
        ];
        const positiveMatch = CA_POSITIVE_KEYWORDS.find(kw => lower.includes(kw));
        if (positiveMatch) {
            return {
                belongsToRole: true,
                confidence: 0.80,
                reason: `Task contains corporate-assistant-role keyword: "${positiveMatch}"`,
                suggestedRole: null,
            };
        }

        const blockedMatch = CORPORATE_ASSISTANT_BLOCKED_KEYWORDS.find(kw => lower.includes(kw));
        if (blockedMatch) {
            return {
                belongsToRole: false,
                confidence: 0.85,
                reason: `Task contains non-corporate-assistant keyword: "${blockedMatch}"`,
                suggestedRole: null,
            };
        }

        return {
            belongsToRole: true,
            confidence: 0.50,
            reason: 'No strong role signal for corporate_assistant; defaulting to allow',
            suggestedRole: null,
        };
    }

    if (roleKey === 'content_writer') {
        const lower = taskDescription.toLowerCase();

        // Positive CW signals.
        const CW_POSITIVE_KEYWORDS = [
            'write a blog', 'blog post', 'blog article',
            'email campaign', 'newsletter draft', 'newsletter content',
            'social media post', 'linkedin post', 'twitter thread', 'instagram caption',
            'internal announcement', 'company announcement', 'content brief',
            'draft copy', 'marketing copy', 'copywriting',
            'content calendar', 'editorial calendar',
            'write content', 'create content', 'produce content',
        ];
        const positiveMatch = CW_POSITIVE_KEYWORDS.find(kw => lower.includes(kw));
        if (positiveMatch) {
            return {
                belongsToRole: true,
                confidence: 0.80,
                reason: `Task contains content-writer-role keyword: "${positiveMatch}"`,
                suggestedRole: null,
            };
        }

        const blockedMatch = CONTENT_WRITER_BLOCKED_KEYWORDS.find(kw => lower.includes(kw));
        if (blockedMatch) {
            return {
                belongsToRole: false,
                confidence: 0.85,
                reason: `Task contains non-content-writer keyword: "${blockedMatch}"`,
                suggestedRole: null,
            };
        }

        return {
            belongsToRole: true,
            confidence: 0.50,
            reason: 'No strong role signal for content_writer; defaulting to allow',
            suggestedRole: null,
        };
    }

    if (roleKey !== 'developer') {
        // No heuristic for other roles yet — allow through.
        return {
            belongsToRole: true,
            confidence: 0.50,
            reason: `No heuristic classifier for role "${roleKey}"; defaulting to allow`,
            suggestedRole: null,
        };
    }

    const lower = taskDescription.toLowerCase();

    // Positive developer signal takes precedence.
    const positiveMatch = DEVELOPER_POSITIVE_KEYWORDS.find(kw => lower.includes(kw));
    if (positiveMatch) {
        return {
            belongsToRole: true,
            confidence: 0.80,
            reason: `Task contains developer-role keyword: "${positiveMatch}"`,
            suggestedRole: null,
        };
    }

    // Blocked keyword signal — task description smells like another role.
    const blockedMatch = DEVELOPER_BLOCKED_KEYWORDS.find(kw => lower.includes(kw));
    if (blockedMatch) {
        return {
            belongsToRole: false,
            confidence: 0.85,
            reason: `Task contains non-developer keyword: "${blockedMatch}"`,
            suggestedRole: null, // role-enforcer resolves suggestedRole via signal map
        };
    }

    // No signal — allow through; LLM risk routing handles the safety layer.
    return {
        belongsToRole: true,
        confidence: 0.50,
        reason: 'No strong role signal; defaulting to allow',
        suggestedRole: null,
    };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Classifies whether the given task belongs to the specified role.
 *
 * @param task        Full TaskEnvelope being evaluated.
 * @param roleKey     The active role to test against.
 * @param classifierFn  Optional injectable override (for LLM or test mocks).
 *                    Defaults to the keyword heuristic when omitted.
 */
export async function classifyTaskForRole(
    task: TaskEnvelope,
    roleKey: string,
    classifierFn?: TaskClassifierFn,
): Promise<ClassificationResult> {
    const description = extractTaskDescription(task);

    if (classifierFn) {
        return classifierFn(description, roleKey);
    }

    return heuristicClassify(description, roleKey);
}
