/**
 * AgentFarm Support — Lesson Pipeline
 *
 * Captures post-resolution feedback and tier failure signals, converts them
 * into structured support lessons stored in long-term memory.
 *
 * Lesson categories:
 *   config_error        — misconfiguration caused the issue (env vars, feature flags, limits)
 *   code_bug            — a code defect in the platform caused the failure
 *   infra_failure       — infrastructure or cloud resource fault (VM, DB, Redis, network)
 *   billing_issue       — subscription, quota, budget, or payment state caused the issue
 *   connector_failure   — OAuth token, connector auth, or 3rd-party API fault
 *   provisioning_error  — agent/resource provisioning job stuck or failed
 *   user_error          — incorrect usage, misconfigured workflow, or unsupported operation
 */

import { randomUUID } from 'node:crypto';
import type { TaskEnvelope, ProcessedTaskResult } from '../../execution-engine.js';

export type SupportLessonCategory =
    | 'config_error'
    | 'code_bug'
    | 'infra_failure'
    | 'billing_issue'
    | 'connector_failure'
    | 'provisioning_error'
    | 'user_error';

export interface SupportLesson {
    id: string;
    tenantId: string;
    workspaceId: string;
    sourceTaskId: string;
    sourceIssueId: string;
    feedback: string;
    category: SupportLessonCategory;
    learnedAt: string;
    correlationId: string;
}

export interface SupportFeedbackContext {
    tenantId: string;
    workspaceId: string;
    taskId: string;
    issueId: string;
    actionType: string;
    correlationId: string;
}

export interface SupportFeedbackItem {
    body: string;
    author?: string;
    createdAt?: string;
}

export interface ISupportLessonStore {
    save(lesson: SupportLesson): Promise<void>;
    findByWorkspace(workspaceId: string, filter?: { category?: SupportLessonCategory; limit?: number }): Promise<SupportLesson[]>;
}

export class InMemorySupportLessonStore implements ISupportLessonStore {
    private readonly store = new Map<string, SupportLesson>();
    async save(lesson: SupportLesson): Promise<void> { this.store.set(lesson.id, { ...lesson }); }
    async findByWorkspace(workspaceId: string, filter?: { category?: SupportLessonCategory; limit?: number }): Promise<SupportLesson[]> {
        let results = [...this.store.values()].filter((l) => l.workspaceId === workspaceId);
        if (filter?.category) results = results.filter((l) => l.category === filter.category);
        results.sort((a, b) => new Date(b.learnedAt).getTime() - new Date(a.learnedAt).getTime());
        return filter?.limit ? results.slice(0, filter.limit) : results;
    }
}

export class GatewaySupportLessonStore implements ISupportLessonStore {
    constructor(private readonly gatewayBaseUrl: string, private readonly serviceToken: string) {}
    async save(lesson: SupportLesson): Promise<void> {
        const base = this.gatewayBaseUrl.replace(/\/+$/, '');
        try {
            await fetch(`${base}/v1/memory/patterns`, { method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${this.serviceToken}` }, body: JSON.stringify({ tenantId: lesson.tenantId, workspaceId: lesson.workspaceId, pattern: `support:lesson:${lesson.category}:${lesson.workspaceId}:${lesson.id}`, summary: `[${lesson.category}] ${lesson.feedback.slice(0, 200)}`, confidence: 0.75, observedCount: 1, lastSeen: lesson.learnedAt, metadata: { lessonId: lesson.id, category: lesson.category, feedback: lesson.feedback, sourceTaskId: lesson.sourceTaskId, sourceIssueId: lesson.sourceIssueId, correlationId: lesson.correlationId, learnedAt: lesson.learnedAt } }), signal: AbortSignal.timeout(10_000) });
        } catch (err) { console.warn(`[GatewaySupportLessonStore] save failed: ${String(err)}`); }
    }
    async findByWorkspace(workspaceId: string, filter?: { category?: SupportLessonCategory; limit?: number }): Promise<SupportLesson[]> {
        const base = this.gatewayBaseUrl.replace(/\/+$/, '');
        try {
            const res = await fetch(`${base}/v1/workspaces/${encodeURIComponent(workspaceId)}/memory/patterns`, { method: 'GET', headers: { 'content-type': 'application/json', Authorization: `Bearer ${this.serviceToken}` }, signal: AbortSignal.timeout(10_000) });
            if (!res.ok) return [];
            const data = (await res.json()) as { patterns?: Array<{ pattern?: string; summary?: string; confidence?: number; lastSeen?: string; metadata?: Record<string, unknown> }> };
            let lessons: SupportLesson[] = (data.patterns ?? []).filter((p) => typeof p.pattern === 'string' && p.pattern.startsWith('support:lesson:') && p.pattern.includes(`:${workspaceId}:`)).map((p): SupportLesson | null => {
                const meta = p.metadata as Record<string, unknown> | undefined;
                const feedback = String(meta?.['feedback'] ?? p.summary ?? '').replace(/^\[[\w_]+\] /, '');
                if (!feedback) return null;
                const keyParts = (p.pattern ?? '').split(':');
                return { id: String(meta?.['lessonId'] ?? keyParts[4] ?? Math.random().toString(36).slice(2)), tenantId: '', workspaceId, sourceTaskId: String(meta?.['sourceTaskId'] ?? ''), sourceIssueId: String(meta?.['sourceIssueId'] ?? ''), feedback, category: (meta?.['category'] ?? keyParts[2] ?? 'config_error') as SupportLessonCategory, learnedAt: String(meta?.['learnedAt'] ?? p.lastSeen ?? new Date().toISOString()), correlationId: String(meta?.['correlationId'] ?? '') };
            }).filter((l): l is SupportLesson => l !== null);
            if (filter?.category) lessons = lessons.filter((l) => l.category === filter.category);
            lessons.sort((a, b) => new Date(b.learnedAt).getTime() - new Date(a.learnedAt).getTime());
            return filter?.limit ? lessons.slice(0, filter.limit) : lessons;
        } catch (err) { console.warn(`[GatewaySupportLessonStore] findByWorkspace failed: ${String(err)}`); return []; }
    }
}

const CATEGORY_PATTERNS: Array<{ pattern: RegExp; category: SupportLessonCategory }> = [
    { pattern: /\b(misconfiguration|wrong config|env var|feature flag|rate limit|quota|missing key|wrong value|config mismatch|setting|parameter)\b/i, category: 'config_error' },
    { pattern: /\b(bug|defect|exception|stack trace|crash|null pointer|undefined|assertion|regression|broken logic|code error)\b/i, category: 'code_bug' },
    { pattern: /\b(infra|infrastructure|VM|database|Redis|postgres|network|disk|CPU|memory|timeout|unreachable|cloud|Azure|AWS|GCP|server down)\b/i, category: 'infra_failure' },
    { pattern: /\b(billing|subscription|quota exceeded|payment|invoice|credit|hard.stop|throttl|budget|plan limit|trial expired)\b/i, category: 'billing_issue' },
    { pattern: /\b(connector|OAuth|token expired|auth failed|API key|webhook|third.party|integration|Slack|GitHub|Jira|Salesforce)\b/i, category: 'connector_failure' },
    { pattern: /\b(provisioning|provision|stuck job|failed job|agent creation|workspace setup|VM spin.up|resource creation)\b/i, category: 'provisioning_error' },
    { pattern: /\b(user error|incorrect usage|wrong endpoint|unsupported|not supported|invalid input|misconfigured workflow|operator mistake)\b/i, category: 'user_error' },
];

export function classifyFeedback(body: string): SupportLessonCategory {
    for (const { pattern, category } of CATEGORY_PATTERNS) {
        if (pattern.test(body)) return category;
    }
    return 'config_error';
}

export async function ingestSupportFeedback(ctx: SupportFeedbackContext, feedbackItems: SupportFeedbackItem[], store: ISupportLessonStore): Promise<SupportLesson[]> {
    const lessons: SupportLesson[] = [];
    for (const item of feedbackItems) {
        const body = item.body.trim();
        if (body.length < 10) continue;
        const category = classifyFeedback(body);
        const lesson: SupportLesson = { id: randomUUID(), tenantId: ctx.tenantId, workspaceId: ctx.workspaceId, sourceTaskId: ctx.taskId, sourceIssueId: ctx.issueId, feedback: body, category, learnedAt: item.createdAt ?? new Date().toISOString(), correlationId: ctx.correlationId };
        await store.save(lesson);
        lessons.push(lesson);
    }
    return lessons;
}

export function formatSupportLessonsForPrompt(lessons: SupportLesson[]): string {
    if (lessons.length === 0) return '';
    return `Workspace support rules (from past resolved issues):\n${lessons.slice(0, 12).map((l) => `- [${l.category}] ${l.feedback}`).join('\n')}`;
}

function supportOutcomeTag(result: ProcessedTaskResult): 'success' | 'fail' { return result.status === 'success' ? 'success' : 'fail'; }

export function buildSupportEpisodicPattern(_task: TaskEnvelope, result: ProcessedTaskResult): string {
    const at = result.decision.actionType;
    const oc = supportOutcomeTag(result);
    const prefix = at.startsWith('agentfarm_support_') ? at.replace('agentfarm_support_', 'support:') : `support:${at}`;
    return `${prefix}:${oc}`;
}

export function buildSupportEpisodicSummary(task: TaskEnvelope, result: ProcessedTaskResult): string {
    const at = result.decision.actionType;
    const oc = supportOutcomeTag(result);
    const issueId = (typeof task.payload['issueId'] === 'string' ? task.payload['issueId'] : '').slice(0, 36);
    const desc = (typeof task.payload['issueDescription'] === 'string' ? task.payload['issueDescription'] : at).slice(0, 120);
    if (at.includes('config_fix')) return `Config fix ${oc}${issueId ? ` for issue ${issueId}` : ''}: ${desc}`;
    if (at.includes('code_fix')) return `Code fix dispatch ${oc}${issueId ? ` for issue ${issueId}` : ''}: ${desc}`;
    if (at.includes('infra_fix')) return `Infra fix dispatch ${oc}${issueId ? ` for issue ${issueId}` : ''}: ${desc}`;
    if (at.includes('escalate')) return `Escalation ${oc}${issueId ? ` for issue ${issueId}` : ''}: ${desc}`;
    if (at.includes('resolve')) return `Issue resolved ${oc}${issueId ? `: ${issueId}` : ''} — ${desc}`;
    return `Support action "${at}" completed with status "${oc}"${issueId ? ` for issue ${issueId}` : ''}: ${desc}`;
}
