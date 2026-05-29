/**
 * DevOps — Lesson Pipeline
 *
 * Captures post-mortem findings, deployment failures, and security audit
 * results and converts them into structured ops lessons stored in long-term
 * memory.
 *
 * Lesson categories:
 *   incident_response       — incident was slow to detect, contain, or resolve
 *   deployment_safety       — deploy caused outage or rollback due to missing gate
 *   configuration_management — misconfiguration caused failure or security gap
 *   monitoring_gaps         — alert was missing, noisy, or caught the issue too late
 *   security_compliance     — a security control or compliance requirement was missed
 *   cost_optimization       — infrastructure was over-provisioned or wastefully configured
 *   reliability             — SLO was missed due to architecture or dependency failure
 */

import { randomUUID } from 'node:crypto';
import type { TaskEnvelope, ProcessedTaskResult } from '../../execution-engine.js';

export type DevOpsLessonCategory =
    | 'incident_response'
    | 'deployment_safety'
    | 'configuration_management'
    | 'monitoring_gaps'
    | 'security_compliance'
    | 'cost_optimization'
    | 'reliability';

export type DevOpsDocTypeFilter =
    | 'runbook'
    | 'incident_report'
    | 'terraform_config'
    | 'k8s_manifest'
    | 'deployment_plan'
    | 'security_scan'
    | 'any';

export interface DevOpsLesson {
    id: string;
    tenantId: string;
    workspaceId: string;
    sourceTaskId: string;
    sourceIncidentId: string;
    feedback: string;
    category: DevOpsLessonCategory;
    applicableDocTypes: DevOpsDocTypeFilter[];
    learnedAt: string;
    correlationId: string;
}

export interface DevOpsFeedbackContext {
    tenantId: string;
    workspaceId: string;
    taskId: string;
    incidentId: string;
    documentType: DevOpsDocTypeFilter;
    actionType: string;
    correlationId: string;
}

export interface DevOpsFeedbackItem {
    body: string;
    author?: string;
    createdAt?: string;
}

export interface IDevOpsLessonStore {
    save(lesson: DevOpsLesson): Promise<void>;
    findByWorkspace(workspaceId: string, filter?: { docType?: DevOpsDocTypeFilter; category?: DevOpsLessonCategory; limit?: number }): Promise<DevOpsLesson[]>;
}

export class InMemoryDevOpsLessonStore implements IDevOpsLessonStore {
    private readonly store = new Map<string, DevOpsLesson>();
    async save(lesson: DevOpsLesson): Promise<void> { this.store.set(lesson.id, { ...lesson }); }
    async findByWorkspace(workspaceId: string, filter?: { docType?: DevOpsDocTypeFilter; category?: DevOpsLessonCategory; limit?: number }): Promise<DevOpsLesson[]> {
        let results = [...this.store.values()].filter((l) => l.workspaceId === workspaceId);
        if (filter?.category) results = results.filter((l) => l.category === filter.category);
        if (filter?.docType && filter.docType !== 'any') results = results.filter((l) => l.applicableDocTypes.includes(filter.docType!) || l.applicableDocTypes.includes('any'));
        results.sort((a, b) => new Date(b.learnedAt).getTime() - new Date(a.learnedAt).getTime());
        return filter?.limit ? results.slice(0, filter.limit) : results;
    }
}

export class GatewayDevOpsLessonStore implements IDevOpsLessonStore {
    constructor(private readonly gatewayBaseUrl: string, private readonly serviceToken: string) {}
    async save(lesson: DevOpsLesson): Promise<void> {
        const base = this.gatewayBaseUrl.replace(/\/+$/, '');
        try {
            await fetch(`${base}/v1/memory/patterns`, { method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${this.serviceToken}` }, body: JSON.stringify({ tenantId: lesson.tenantId, workspaceId: lesson.workspaceId, pattern: `devops:lesson:${lesson.category}:${lesson.workspaceId}:${lesson.id}`, summary: `[${lesson.category}] ${lesson.feedback.slice(0, 200)}`, confidence: 0.75, observedCount: 1, lastSeen: lesson.learnedAt, metadata: { lessonId: lesson.id, category: lesson.category, docTypes: lesson.applicableDocTypes, feedback: lesson.feedback, sourceTaskId: lesson.sourceTaskId, sourceIncidentId: lesson.sourceIncidentId, correlationId: lesson.correlationId, learnedAt: lesson.learnedAt } }), signal: AbortSignal.timeout(10_000) });
        } catch (err) { console.warn(`[GatewayDevOpsLessonStore] save failed: ${String(err)}`); }
    }
    async findByWorkspace(workspaceId: string, filter?: { docType?: DevOpsDocTypeFilter; category?: DevOpsLessonCategory; limit?: number }): Promise<DevOpsLesson[]> {
        const base = this.gatewayBaseUrl.replace(/\/+$/, '');
        try {
            const res = await fetch(`${base}/v1/workspaces/${encodeURIComponent(workspaceId)}/memory/patterns`, { method: 'GET', headers: { 'content-type': 'application/json', Authorization: `Bearer ${this.serviceToken}` }, signal: AbortSignal.timeout(10_000) });
            if (!res.ok) return [];
            const data = (await res.json()) as { patterns?: Array<{ pattern?: string; summary?: string; confidence?: number; lastSeen?: string; metadata?: Record<string, unknown> }> };
            let lessons: DevOpsLesson[] = (data.patterns ?? []).filter((p) => typeof p.pattern === 'string' && p.pattern.startsWith('devops:lesson:') && p.pattern.includes(`:${workspaceId}:`)).map((p): DevOpsLesson | null => {
                const meta = p.metadata as Record<string, unknown> | undefined;
                const feedback = String(meta?.['feedback'] ?? p.summary ?? '').replace(/^\[[\w_]+\] /, '');
                if (!feedback) return null;
                const keyParts = (p.pattern ?? '').split(':');
                return { id: String(meta?.['lessonId'] ?? keyParts[4] ?? Math.random().toString(36).slice(2)), tenantId: '', workspaceId, sourceTaskId: String(meta?.['sourceTaskId'] ?? ''), sourceIncidentId: String(meta?.['sourceIncidentId'] ?? ''), feedback, category: (meta?.['category'] ?? keyParts[2] ?? 'reliability') as DevOpsLessonCategory, applicableDocTypes: Array.isArray(meta?.['docTypes']) ? (meta['docTypes'] as DevOpsDocTypeFilter[]) : ['any'], learnedAt: String(meta?.['learnedAt'] ?? p.lastSeen ?? new Date().toISOString()), correlationId: String(meta?.['correlationId'] ?? '') };
            }).filter((l): l is DevOpsLesson => l !== null);
            if (filter?.category) lessons = lessons.filter((l) => l.category === filter.category);
            if (filter?.docType && filter.docType !== 'any') lessons = lessons.filter((l) => l.applicableDocTypes.includes(filter.docType!) || l.applicableDocTypes.includes('any'));
            lessons.sort((a, b) => new Date(b.learnedAt).getTime() - new Date(a.learnedAt).getTime());
            return filter?.limit ? lessons.slice(0, filter.limit) : lessons;
        } catch (err) { console.warn(`[GatewayDevOpsLessonStore] findByWorkspace failed: ${String(err)}`); return []; }
    }
}

const CATEGORY_PATTERNS: Array<{ pattern: RegExp; category: DevOpsLessonCategory }> = [
    { pattern: /\b(incident|outage|P0|P1|MTTR|MTTD|slow to detect|escalation|on.call|war room|SLA breach|downtime)\b/i, category: 'incident_response' },
    { pattern: /\b(deploy|rollback|canary|blue.green|feature flag|broke production|bad release|no smoke test|missing approval)\b/i, category: 'deployment_safety' },
    { pattern: /\b(misconfiguration|wrong config|env var|secret|hard.coded|drift|config mismatch|wrong value|IaC)\b/i, category: 'configuration_management' },
    { pattern: /\b(alert|monitoring|metrics|logging|trace|blind spot|no alert|noisy alert|missed|Datadog|PagerDuty|Grafana)\b/i, category: 'monitoring_gaps' },
    { pattern: /\b(security|vulnerability|CVE|compliance|CIS|NIST|exposed|privilege|IAM|secret leaked|unencrypted|certificate)\b/i, category: 'security_compliance' },
    { pattern: /\b(cost|over.provisioned|idle|waste|rightsizing|reserved instance|spot|bill|expensive|unused resource)\b/i, category: 'cost_optimization' },
    { pattern: /\b(SLO|SLA|reliability|availability|single point of failure|redundancy|failover|DR|RTO|RPO|dependency)\b/i, category: 'reliability' },
];

export function classifyDevOpsFeedback(body: string): DevOpsLessonCategory {
    for (const { pattern, category } of CATEGORY_PATTERNS) {
        if (pattern.test(body)) return category;
    }
    return 'reliability';
}

export async function ingestDevOpsFeedback(ctx: DevOpsFeedbackContext, feedbackItems: DevOpsFeedbackItem[], store: IDevOpsLessonStore): Promise<DevOpsLesson[]> {
    const lessons: DevOpsLesson[] = [];
    for (const item of feedbackItems) {
        const body = item.body.trim();
        if (body.length < 10) continue;
        const category = classifyDevOpsFeedback(body);
        const lesson: DevOpsLesson = { id: randomUUID(), tenantId: ctx.tenantId, workspaceId: ctx.workspaceId, sourceTaskId: ctx.taskId, sourceIncidentId: ctx.incidentId, feedback: body, category, applicableDocTypes: ['any'], learnedAt: item.createdAt ?? new Date().toISOString(), correlationId: ctx.correlationId };
        await store.save(lesson);
        lessons.push(lesson);
    }
    return lessons;
}

export function formatDevOpsLessonsForPrompt(lessons: DevOpsLesson[]): string {
    if (lessons.length === 0) return '';
    return `Workspace ops rules (from past incident post-mortems):\n${lessons.slice(0, 12).map((l) => `- [${l.category}] ${l.feedback}`).join('\n')}`;
}

function devopsOutcomeTag(result: ProcessedTaskResult): 'success' | 'fail' { return result.status === 'success' ? 'success' : 'fail'; }

export function buildDevOpsEpisodicPattern(_task: TaskEnvelope, result: ProcessedTaskResult): string {
    const at = result.decision.actionType;
    const oc = devopsOutcomeTag(result);
    const prefix = at.startsWith('workspace_devops_') ? at.replace('workspace_devops_', 'devops:') : `devops:${at}`;
    return `${prefix}:${oc}`;
}

export function buildDevOpsEpisodicSummary(task: TaskEnvelope, result: ProcessedTaskResult): string {
    const at = result.decision.actionType;
    const oc = devopsOutcomeTag(result);
    const service = (typeof task.payload['service'] === 'string' ? task.payload['service'] : typeof task.payload['component'] === 'string' ? task.payload['component'] : at).slice(0, 120);
    if (at.includes('tf_')) return `Terraform action ${oc}: ${service}`;
    if (at.includes('k8s_')) return `Kubernetes action ${oc}: ${service}`;
    if (at.includes('helm_')) return `Helm action ${oc}: ${service}`;
    if (at.includes('incident')) return `Incident response ${oc}: ${service}`;
    if (at.includes('deploy')) return `Deployment ${oc}: ${service}`;
    if (at.includes('runbook')) return `Runbook generated ${oc}: ${service}`;
    if (at.includes('security') || at.includes('scan')) return `Security scan ${oc}: ${service}`;
    return `DevOps action "${at}" completed with status "${oc}": ${service}`;
}
