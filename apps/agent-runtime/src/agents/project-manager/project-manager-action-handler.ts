/**
 * Project Manager / Scrum Master — Action Handler
 *
 * Orchestration layer that wires all PM/SM modules into a single entry point
 * for every workspace_pm_* action type.
 *
 * Two distinct personas are served by this handler:
 *
 *   Project Manager (PM) — owns the "what" and "when":
 *     workspace_pm_project_charter   — draft project charter (scope, budget, timeline)
 *     workspace_pm_status_report     — RAG status report for stakeholders
 *     workspace_pm_risk_register     — create/update the project risk register
 *     workspace_pm_dependency_map    — map cross-team/cross-sprint dependencies
 *     workspace_pm_change_request    — document and route a scope/timeline change
 *     workspace_pm_milestone_plan    — build milestone and delivery timeline
 *     workspace_pm_budget_forecast   — budget and resource utilisation forecast
 *
 *   Scrum Master (SM) — owns the "how":
 *     workspace_pm_sprint_plan       — generate sprint plan from backlog + velocity
 *     workspace_pm_backlog_groom     — refine and score backlog DoR compliance
 *     workspace_pm_velocity_report   — compute velocity trend and forecast
 *     workspace_pm_standup_summary   — generate daily standup summary
 *     workspace_pm_retrospective     — retro analysis and action item capture
 *     workspace_pm_impediment_log    — log and escalate blockers
 *     workspace_pm_ceremony_agenda   — generate ceremony agenda with facilitation guide
 *
 *   Proactive monitoring:
 *     workspace_pm_proactive_blocker_scan — scan knowledge base for open blockers
 *     workspace_pm_proactive_scope_drift  — detect scope creep vs original charter
 *
 * Pipeline for document-generation actions (PM side):
 *   1. RAG context retrieval  — prior charters, risk logs, lessons
 *   2. Content generation     — LLM draft using enriched system prompt
 *   3. Risk gate              — classify → auto-execute | async notify | escalate
 *   4. Post-run persistence   — KB ingest + episodic memory write
 *   5. Ticket write-back      — create/update Jira/Linear tasks
 *
 * Pipeline for structured-data actions (SM side):
 *   1. Parse structured payload → call pure domain module
 *   2. Optionally enrich with LLM narrative
 *   3. Write episodic memory
 *   4. Return structured result + markdown
 */

import type { MeetingProviderExecutor } from '../meeting-agent/meeting-transcription.js';
import { buildSprintPlan, type SprintPlanInput } from './sprint-planner.js';
import { calculateVelocity, type SprintRecord } from './velocity-calculator.js';
import { buildRiskRegister, parseRiskFromText, type RiskItem } from './risk-tracker.js';
import { groomBacklog, type GroomingItem } from './backlog-groomer.js';
import { buildCeremonyAgenda, type CeremonyInput } from './ceremony-facilitator.js';
import { buildPmStandupSummary, buildPmSprintHealthSummary } from './project-manager-standup-builder.js';
import { buildPmEpisodicPattern, buildPmEpisodicSummary } from './project-manager-episodic-hooks.js';
import { registerPmStandupSchedule } from './pm-schedule-setup.js';
import { createHandoff, listHandoffs, formatHandoffSummary, type HandoffRole } from './pm-handoff-coordinator.js';
import { fetchSprintBoardState, formatBoardStateForStandup } from './pm-board-sync.js';
import { runEscalationChain } from './pm-escalation-chain.js';
import { computeDeliveryForecast } from './pm-delivery-forecast.js';
import { runSprintHealthCheck, computeSprintHealth } from './pm-sprint-health-monitor.js';
import type { TaskEnvelope, ProcessedTaskResult } from '../../execution-engine.js';

// ---------------------------------------------------------------------------
// Action type registry
// ---------------------------------------------------------------------------

export type PmActionType =
    // PM domain
    | 'workspace_pm_project_charter'
    | 'workspace_pm_status_report'
    | 'workspace_pm_risk_register'
    | 'workspace_pm_dependency_map'
    | 'workspace_pm_change_request'
    | 'workspace_pm_milestone_plan'
    | 'workspace_pm_budget_forecast'
    // SM domain
    | 'workspace_pm_sprint_plan'
    | 'workspace_pm_backlog_groom'
    | 'workspace_pm_velocity_report'
    | 'workspace_pm_standup_summary'
    | 'workspace_pm_retrospective'
    | 'workspace_pm_impediment_log'
    | 'workspace_pm_ceremony_agenda'
    // Proactive
    | 'workspace_pm_proactive_blocker_scan'
    | 'workspace_pm_proactive_scope_drift'
    // Scheduling
    | 'workspace_pm_schedule_standup'
    // Cross-agent orchestration
    | 'workspace_pm_handoff_to_developer'
    | 'workspace_pm_handoff_to_tester'
    | 'workspace_pm_check_handoff_status'
    // Human-PM parity: live board + forecasting + health monitoring
    | 'workspace_pm_delivery_forecast'
    | 'workspace_pm_sprint_health_check'
    | 'workspace_pm_board_sync';

export const PM_ACTION_TYPES = new Set<PmActionType>([
    'workspace_pm_project_charter',
    'workspace_pm_status_report',
    'workspace_pm_risk_register',
    'workspace_pm_dependency_map',
    'workspace_pm_change_request',
    'workspace_pm_milestone_plan',
    'workspace_pm_budget_forecast',
    'workspace_pm_sprint_plan',
    'workspace_pm_backlog_groom',
    'workspace_pm_velocity_report',
    'workspace_pm_standup_summary',
    'workspace_pm_retrospective',
    'workspace_pm_impediment_log',
    'workspace_pm_ceremony_agenda',
    'workspace_pm_proactive_blocker_scan',
    'workspace_pm_proactive_scope_drift',
    'workspace_pm_schedule_standup',
    'workspace_pm_handoff_to_developer',
    'workspace_pm_handoff_to_tester',
    'workspace_pm_check_handoff_status',
    'workspace_pm_delivery_forecast',
    'workspace_pm_sprint_health_check',
    'workspace_pm_board_sync',
]);

export function isPmActionType(at: string): at is PmActionType {
    return PM_ACTION_TYPES.has(at as PmActionType);
}

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

type ExecuteActionFn = (
    actionType: string,
    payload: Record<string, unknown>,
) => Promise<{ ok: boolean; output: string; errorOutput?: string }>;

/**
 * Thin wrapper around the connector gateway client.
 * Structurally compatible with LocalWorkspaceConnectorClient — defined here
 * without importing from local-workspace-executor to avoid circular deps.
 */
export type PmConnectorClient = (input: {
    connectorType: string;
    actionType: string;
    payload: Record<string, unknown>;
}) => Promise<{ ok: boolean; statusCode?: number; errorMessage?: string }>;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PmActionParams {
    actionType: PmActionType;
    tenantId: string;
    botId: string;
    taskId: string;
    workspaceId: string;
    payload: Record<string, unknown>;
    gatewayBaseUrl: string;
    serviceToken: string;
    /** LLM prose caller — required for document generation and narrative enrichment. */
    callLlm?: (prompt: string, systemPrompt?: string) => Promise<string>;
    /** Provider executor — required for async Slack/email approval notifications. */
    notificationExecutor?: MeetingProviderExecutor;
    /**
     * Notification target for async approvals (Slack user ID, channel, or email).
     * Required when using async (medium risk) approval flow.
     */
    approvalNotificationTarget?: string;
    /** Channel for async approval notifications. Default: 'slack'. */
    approvalNotificationChannel?: 'slack' | 'email';
    /** ISO-8601 deadline for async approvals — auto-rejected after this time. */
    approvalEscalationDeadlineIso?: string;
    /** Connector function for ticket write-back (Jira/Linear) and document persistence. */
    executeAction?: ExecuteActionFn;
    /**
     * Direct connector client — routes (connectorType, actionType, payload) to Jira,
     * Linear, Slack, etc. via the connector gateway.  Required for sprint push,
     * standup Slack post, and other real-time write-backs.
     */
    connectorClient?: PmConnectorClient;
    /** Local workspace directory for file-system document persistence. */
    workspaceDir?: string;
    /** Stable document identifier used for version control. */
    documentId?: string;
}

export interface PmActionResult {
    ok: boolean;
    output: string;
    documentType?: string;
    riskLevel?: 'low' | 'medium' | 'high';
    approvalId?: string;
    approvalStatus?: 'auto_approved' | 'pending_async' | 'pending_escalation';
    /** Whether KB context was retrieved via RAG for this action. */
    ragContextUsed?: boolean;
    /** Structured data returned by SM domain modules (velocity, sprint plan, etc.). */
    structuredData?: Record<string, unknown>;
    errorOutput?: string;
    [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function str(v: unknown, fallback = ''): string {
    return typeof v === 'string' ? v.trim() : fallback;
}

function num(v: unknown, fallback = 0): number {
    return typeof v === 'number' ? v : fallback;
}

function bool(v: unknown): boolean {
    return v === true;
}

function arr<T>(v: unknown): T[] {
    return Array.isArray(v) ? (v as T[]) : [];
}

async function callLlmSafe(
    callLlm: ((prompt: string, sys?: string) => Promise<string>) | undefined,
    prompt: string,
    systemPrompt?: string,
): Promise<string> {
    if (!callLlm) return '';
    try {
        return await callLlm(prompt, systemPrompt);
    } catch {
        return '';
    }
}

/**
 * Write an episodic memory record to the gateway after a PM action completes.
 */
async function writeEpisodicMemory(params: {
    tenantId: string;
    workspaceId: string;
    pattern: string;
    summary: string;
    gatewayBaseUrl: string;
    serviceToken: string;
}): Promise<void> {
    const base = params.gatewayBaseUrl.replace(/\/+$/, '');
    try {
        await fetch(`${base}/v1/memory/patterns`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                Authorization: `Bearer ${params.serviceToken}`,
            },
            body: JSON.stringify({
                tenantId: params.tenantId,
                workspaceId: params.workspaceId,
                pattern: params.pattern,
                summary: params.summary,
                confidence: 0.8,
                observedCount: 1,
                lastSeen: new Date().toISOString(),
            }),
            signal: AbortSignal.timeout(10_000),
        });
    } catch {
        // Non-fatal — memory write failures don't block the action result
    }
}

/**
 * Submit an approval intake request to the gateway.
 */
async function submitApprovalIntake(params: {
    tenantId: string;
    workspaceId: string;
    botId: string;
    taskId: string;
    actionType: string;
    payload: Record<string, unknown>;
    riskLevel: 'medium' | 'high';
    gatewayBaseUrl: string;
    serviceToken: string;
}): Promise<string | null> {
    const base = params.gatewayBaseUrl.replace(/\/+$/, '');
    try {
        const res = await fetch(`${base}/v1/approvals/intake`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                Authorization: `Bearer ${params.serviceToken}`,
            },
            body: JSON.stringify({
                tenantId: params.tenantId,
                workspaceId: params.workspaceId,
                botId: params.botId,
                taskId: params.taskId,
                actionType: params.actionType,
                payload: params.payload,
                riskLevel: params.riskLevel,
            }),
            signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) return null;
        const body = (await res.json()) as { approvalId?: string };
        return body.approvalId ?? null;
    } catch {
        return null;
    }
}

/**
 * Retrieve prior PM documents from the KB for RAG context.
 */
async function fetchPmKbContext(params: {
    tenantId: string;
    botId?: string;
    queryText: string;
    topK: number;
    gatewayBaseUrl: string;
    serviceToken: string;
}): Promise<Array<{ content: string; sourceUrl?: string }>> {
    const base = params.gatewayBaseUrl.replace(/\/+$/, '');
    try {
        const res = await fetch(`${base}/v1/knowledge-base/search`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                Authorization: `Bearer ${params.serviceToken}`,
            },
            body: JSON.stringify({
                tenantId: params.tenantId,
                botId: params.botId,
                queryText: params.queryText,
                topK: params.topK,
                minSimilarity: 0.25,
            }),
            signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) return [];
        const data = (await res.json()) as {
            results?: Array<{ content?: string; sourceUrl?: string }>;
        };
        return (data.results ?? [])
            .filter((r) => r.content)
            .map((r) => ({ content: r.content ?? '', sourceUrl: r.sourceUrl }));
    } catch {
        return [];
    }
}

/**
 * Ingest a PM document into the knowledge base for future RAG retrieval.
 */
async function ingestPmDocument(params: {
    tenantId: string;
    botId: string;
    documentTitle: string;
    documentType: string;
    content: string;
    gatewayBaseUrl: string;
    serviceToken: string;
}): Promise<void> {
    const base = params.gatewayBaseUrl.replace(/\/+$/, '');
    try {
        await fetch(`${base}/v1/knowledge-base/ingest`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                Authorization: `Bearer ${params.serviceToken}`,
            },
            body: JSON.stringify({
                tenantId: params.tenantId,
                botId: params.botId,
                title: params.documentTitle,
                sourceType: `pm_${params.documentType}`,
                content: params.content,
            }),
            signal: AbortSignal.timeout(15_000),
        });
    } catch {
        // Non-fatal
    }
}

// ---------------------------------------------------------------------------
// Risk gate helpers
// ---------------------------------------------------------------------------

const HIGH_RISK_ACTIONS: ReadonlySet<PmActionType> = new Set([
    'workspace_pm_project_charter',
    'workspace_pm_budget_forecast',
    'workspace_pm_change_request',
    'workspace_pm_milestone_plan',
]);

const MEDIUM_RISK_ACTIONS: ReadonlySet<PmActionType> = new Set([
    'workspace_pm_status_report',
    'workspace_pm_risk_register',
    'workspace_pm_sprint_plan',
    'workspace_pm_backlog_groom',
    'workspace_pm_velocity_report',
    'workspace_pm_retrospective',
    'workspace_pm_dependency_map',
]);

function classifyPmActionRisk(actionType: PmActionType): 'low' | 'medium' | 'high' {
    if (HIGH_RISK_ACTIONS.has(actionType))   return 'high';
    if (MEDIUM_RISK_ACTIONS.has(actionType)) return 'medium';
    return 'low';
}

const ACTION_TYPE_TO_DOC_TYPE: Partial<Record<PmActionType, string>> = {
    workspace_pm_project_charter: 'project_charter',
    workspace_pm_status_report:   'status_report',
    workspace_pm_risk_register:   'risk_register',
    workspace_pm_dependency_map:  'dependency_map',
    workspace_pm_change_request:  'change_request',
    workspace_pm_milestone_plan:  'milestone_plan',
    workspace_pm_budget_forecast: 'budget_forecast',
    workspace_pm_sprint_plan:     'sprint_plan',
    workspace_pm_backlog_groom:   'backlog_grooming',
    workspace_pm_velocity_report: 'velocity_report',
    workspace_pm_standup_summary: 'standup_summary',
    workspace_pm_retrospective:   'retrospective',
    workspace_pm_impediment_log:  'impediment_log',
    workspace_pm_ceremony_agenda: 'ceremony_agenda',
};

// ---------------------------------------------------------------------------
// System prompt builder
// ---------------------------------------------------------------------------

function buildPmSystemPrompt(params: {
    actionType: PmActionType;
    ragContextBlock: string;
    toneHint?: string;
}): string {
    const { actionType, ragContextBlock, toneHint } = params;

    const docInstructions: Partial<Record<PmActionType, string>> = {
        workspace_pm_project_charter: `You are drafting a Project Charter.
Structure: Executive Summary, Project Objectives (SMART), Scope (In/Out-of-Scope), Stakeholders & Roles, High-Level Milestones, Budget Range, Success Criteria, Assumptions & Constraints, Risk Summary, Approval Sign-Off section.
Every objective must be measurable. Every milestone must have an acceptance criterion.`,

        workspace_pm_status_report: `You are drafting a Project Status Report.
Structure: RAG Status (Red/Amber/Green) for Scope, Schedule, Budget, and Quality; Executive Summary (2-3 sentences); Progress Since Last Report; Upcoming Milestones; Open Risks & Issues; Decisions Required.
Be direct. Do not soften red status with positive spin — executives need accurate information to make decisions.`,

        workspace_pm_risk_register: `You are drafting or updating a Risk Register.
For each risk use the format: Risk ID | Category | Description | Probability (1–5) | Impact (1–5) | Score | Mitigation | Owner | Review Date | Status.
Score = Probability × Impact. Flag any risk scoring ≥12 as HIGH and escalate.`,

        workspace_pm_dependency_map: `You are documenting a cross-team dependency map.
For each dependency: Dependent Team → Providing Team | Dependency Description | Delivery Date | Risk if Late | Owner | Status.
Identify the critical path. Flag any dependency that, if delayed, would push a milestone.`,

        workspace_pm_change_request: `You are documenting a Change Request (CR).
Structure: CR Number, Change Description, Reason for Change, Impact on Scope, Impact on Timeline, Impact on Budget, Risk if Not Done, Risk if Done, Recommendation, Stakeholder Approval Required.
Be objective. Present the trade-offs without bias toward approval or rejection.`,

        workspace_pm_milestone_plan: `You are creating a Milestone Plan.
List each milestone with: Milestone Name | Description | Acceptance Criteria | Target Date | Owner | Dependencies | Status.
The plan must be logically ordered. Earlier milestones must be prerequisites for later ones. Flag any milestone with more than 3 dependencies as a critical path risk.`,

        workspace_pm_budget_forecast: `You are producing a Budget Forecast.
Structure: Original Budget | Committed Spend | Forecast to Complete | Forecast at Completion | Variance | Variance Explanation.
Present by workstream. Flag any workstream with >10% variance from budget for escalation.`,

        workspace_pm_sprint_plan: `You are drafting a Sprint Plan narrative.
The structured sprint plan data is already computed — your role is to write the sprint goal rationale, capacity decisions, and any decisions made during planning that are not captured in the structured data.
Be concise. The narrative should be 3–5 sentences per section.`,

        workspace_pm_retrospective: `You are facilitating a Sprint Retrospective analysis.
Structure: What Went Well (top 3), What Did Not Go Well (top 3), Root Cause Analysis (for each issue), Action Items (owner + due date + success metric), Patterns from Previous Retros.
Do not soften criticism. Name recurring patterns explicitly — if the same issue appears 3 sprints in a row, flag it as systemic.`,

        workspace_pm_impediment_log: `You are documenting and escalating an impediment/blocker.
Structure: Blocker ID | Description | Impact on Sprint Goal | Date Raised | Owner | Resolution Path | Escalation Required (Y/N) | Escalate To.
Classify severity: Critical (blocks sprint goal), Major (blocks a committed story), Minor (causes inefficiency).`,
    };

    const baseInstruction = docInstructions[actionType] ??
        'You are a senior Project Manager and Scrum Master. Produce clear, structured, actionable project management documentation.';

    const parts: string[] = [
        '# Project Manager / Scrum Master Agent',
        '',
        baseInstruction,
        '',
        'Guidelines:',
        '- Every claim must be traceable to stated requirements, stakeholder input, or project data.',
        '- Use specific, measurable language. Avoid vague terms like "soon", "many", or "significant".',
        '- Flag open questions with [TBD] rather than guessing.',
        '- Do not over-promise or under-report. Accuracy builds trust; spin destroys it.',
        '- Use professional, confident tone appropriate for executive and technical audiences.',
    ];

    if (toneHint) {
        parts.push('', `Tone guidance: ${toneHint}`);
    }

    if (ragContextBlock) {
        parts.push('', ragContextBlock);
    }

    return parts.join('\n');
}

// ---------------------------------------------------------------------------
// SM action handlers (structured data, minimal LLM)
// ---------------------------------------------------------------------------

async function handleSprintPlan(params: PmActionParams): Promise<PmActionResult> {
    const {
        tenantId, botId, taskId, workspaceId,
        payload, gatewayBaseUrl, serviceToken,
        callLlm, connectorClient,
    } = params;

    const input: SprintPlanInput = {
        sprintName: str(payload['sprint_name'], `Sprint ${new Date().toISOString().slice(0, 10)}`),
        sprintGoal: str(payload['sprint_goal'], 'Deliver committed stories'),
        sprintDuration: num(payload['sprint_duration_days'], 10),
        historicalVelocity: typeof payload['historical_velocity'] === 'number' ? payload['historical_velocity'] : undefined,
        capacityBuffer: typeof payload['capacity_buffer'] === 'number' ? payload['capacity_buffer'] : 0.8,
        team: arr<Record<string, unknown>>(payload['team']).map((m) => ({
            name: str(m['name'], 'Team Member'),
            capacity: num(m['capacity'], 8),
            skills: arr<string>(m['skills']),
        })),
        backlog: arr<Record<string, unknown>>(payload['backlog']).map((b) => ({
            id: str(b['id'], `STORY-${Math.random().toString(36).slice(2, 6).toUpperCase()}`),
            title: str(b['title'], 'Untitled Story'),
            type: (str(b['type'], 'story')) as 'story' | 'bug' | 'task' | 'spike' | 'epic',
            points: num(b['points'], 0),
            priority: (str(b['priority'], 'medium')) as 'critical' | 'high' | 'medium' | 'low',
            dependsOn: arr<string>(b['depends_on']),
            labels: arr<string>(b['labels']),
            hasAcceptanceCriteria: bool(b['has_acceptance_criteria']),
            isGroomed: typeof b['is_groomed'] === 'boolean' ? b['is_groomed'] : undefined,
        })),
    };

    const sprintPlan = buildSprintPlan(input);

    // Optional LLM narrative enrichment for sprint goal rationale
    let narrativeEnrichment = '';
    if (callLlm && sprintPlan.allocations.length > 0) {
        const storyList = sprintPlan.allocations
            .slice(0, 5)
            .map((a) => `- ${a.item.title} (${a.item.points}pts, ${a.item.priority})`)
            .join('\n');
        narrativeEnrichment = await callLlmSafe(
            callLlm,
            `Write a 2-sentence sprint goal rationale explaining why the committed stories support the sprint goal: "${input.sprintGoal}"\n\nCommitted stories:\n${storyList}`,
            'You are a Scrum Master. Write a concise, motivating sprint goal rationale. 2 sentences maximum.',
        );
    }

    const fullOutput = narrativeEnrichment
        ? `${sprintPlan.markdown}\n\n## Sprint Goal Rationale\n${narrativeEnrichment}`
        : sprintPlan.markdown;

    await writeEpisodicMemory({
        tenantId,
        workspaceId,
        pattern: 'pm:sprint_plan:completed',
        summary: `Sprint plan committed: ${input.sprintName} — ${sprintPlan.committedPoints}pts`,
        gatewayBaseUrl,
        serviceToken,
    });

    await ingestPmDocument({
        tenantId,
        botId,
        documentTitle: input.sprintName,
        documentType: 'sprint_plan',
        content: fullOutput,
        gatewayBaseUrl,
        serviceToken,
    });

    // ── GAP 2: Push sprint to Jira or Linear ────────────────────────────────
    let remoteSprintId: string | number | undefined;
    const connector = str(payload['connector']); // 'jira' | 'linear'
    if (connectorClient && connector) {
        const startDate = str(payload['start_date']) || new Date().toISOString().split('T')[0];
        const endDate = str(payload['end_date']) || (() => {
            const d = new Date();
            d.setDate(d.getDate() + input.sprintDuration);
            return d.toISOString().split('T')[0];
        })();

        const createSprintPayload: Record<string, unknown> = {
            name: sprintPlan.sprintName,
            goal: input.sprintGoal,
            start_date: startDate,
            end_date: endDate,
            ...(connector === 'jira' && payload['board_id'] != null ? { board_id: payload['board_id'] } : {}),
            ...(connector === 'linear' && payload['team_id'] ? { team_id: payload['team_id'] } : {}),
            ...(payload['credentials'] ? { credentials: payload['credentials'] } : {}),
        };

        const createResult = await connectorClient({
            connectorType: connector,
            actionType: 'create_sprint',
            payload: createSprintPayload,
        }).catch(() => ({ ok: false as const }));

        if (createResult.ok) {
            // Extract the new sprint / cycle ID from the connector response
            // (statusCode carries the sprint id for our Jira path; Linear returns it via data)
            remoteSprintId = createResult.statusCode; // set by connector for Jira numeric IDs

            // Add committed stories to the sprint using their item.id as issue keys
            const issueKeys = sprintPlan.allocations
                .map((a) => a.item.id)
                .filter((id) => /^[A-Z]+-\d+$|^[a-f0-9-]{36}$/.test(id)); // Jira KEY or UUID

            if (issueKeys.length > 0 && remoteSprintId != null) {
                await connectorClient({
                    connectorType: connector,
                    actionType: 'add_issue_to_sprint',
                    payload: {
                        sprint_id: remoteSprintId,
                        issue_keys: issueKeys,
                        ...(payload['credentials'] ? { credentials: payload['credentials'] } : {}),
                    },
                }).catch(() => {}); // non-fatal
            }
        }
    }

    // ── GAP 3: Auto-register morning standup schedule (idempotent) ───────────
    // Fire-and-forget — schedule registration failure must never block the sprint plan.
    registerPmStandupSchedule({
        botId,
        tenantId,
        teamName: str(payload['team_name'], 'Engineering'),
        gatewayBaseUrl,
        serviceToken,
    }).catch(() => {});

    // ── GAP 5: Create developer handoffs for each committed story ────────────
    const orchestratorBaseUrl =
        str(payload['orchestrator_url']) ||
        process.env['ORCHESTRATOR_URL'] ||
        process.env['ORCHESTRATOR_BASE_URL'] ||
        '';

    const handoffIds: string[] = [];
    if (orchestratorBaseUrl && sprintPlan.allocations.length > 0) {
        const handoffResults = await Promise.allSettled(
            sprintPlan.allocations.slice(0, 20).map((allocation) =>
                createHandoff({
                    tenantId,
                    workspaceId,
                    taskId,
                    fromBotId: botId,
                    toBotId: allocation.assignedTo
                        ? `${allocation.assignedTo.toLowerCase().replace(/\s+/g, '-')}-dev`
                        : 'developer-agent',
                    toRole: 'developer',
                    reason: `Sprint story: ${allocation.item.title}`,
                    handoffContext: {
                        storyId: allocation.item.id,
                        storyTitle: allocation.item.title,
                        storyPoints: allocation.item.points,
                        priority: allocation.item.priority,
                        hasAcceptanceCriteria: allocation.item.hasAcceptanceCriteria ?? false,
                        sprintName: sprintPlan.sprintName,
                        sprintGoal: input.sprintGoal,
                        ...(remoteSprintId != null ? { remoteSprintId } : {}),
                    },
                    escalateOnTimeoutMs: input.sprintDuration * 24 * 60 * 60 * 1_000,
                    orchestratorBaseUrl,
                    serviceToken,
                }),
            ),
        );

        for (const r of handoffResults) {
            if (r.status === 'fulfilled' && r.value.ok && r.value.handoff?.id) {
                handoffIds.push(r.value.handoff.id);
            }
        }
    }

    return {
        ok: true,
        output: fullOutput,
        documentType: 'sprint_plan',
        riskLevel: 'medium',
        approvalStatus: 'auto_approved',
        structuredData: {
            sprintName: sprintPlan.sprintName,
            committedPoints: sprintPlan.committedPoints,
            plannedCapacity: sprintPlan.plannedCapacity,
            allocationCount: sprintPlan.allocations.length,
            deferredCount: sprintPlan.deferred.length,
            needsGroomingCount: sprintPlan.needsGrooming.length,
            remoteSprintId,
            handoffIds,
            standupScheduled: true,
        },
    };
}

async function handleBacklogGroom(params: PmActionParams): Promise<PmActionResult> {
    const { tenantId, botId, taskId, workspaceId, payload, gatewayBaseUrl, serviceToken } = params;

    const items = arr<Record<string, unknown>>(payload['backlog']).map((b) => ({
        id: str(b['id'], `ITEM-${Math.random().toString(36).slice(2, 6).toUpperCase()}`),
        title: str(b['title'], 'Untitled'),
        description: str(b['description']) || undefined,
        type: (str(b['type'], 'story')) as 'story' | 'bug' | 'task' | 'spike' | 'epic',
        points: num(b['points'], 0),
        priority: (str(b['priority'], 'medium')) as 'critical' | 'high' | 'medium' | 'low',
        hasAcceptanceCriteria: bool(b['has_acceptance_criteria']),
        isEstimated: num(b['points'], 0) > 0,
        hasDependenciesDocumented: bool(b['has_dependencies_documented']),
        dependsOn: arr<string>(b['depends_on']),
        labels: arr<string>(b['labels']),
    })) as import('./backlog-groomer.js').GroomingItem[];

    const groomingResult = groomBacklog(items);

    await writeEpisodicMemory({
        tenantId,
        workspaceId,
        pattern: `pm:backlog_groom:success`,
        summary: `Backlog groomed: ${groomingResult.readyCount}/${groomingResult.totalItems} ready for sprint`,
        gatewayBaseUrl,
        serviceToken,
    });

    await ingestPmDocument({
        tenantId,
        botId,
        documentTitle: `Backlog Grooming — ${new Date().toISOString().split('T')[0]}`,
        documentType: 'backlog_grooming',
        content: groomingResult.markdown,
        gatewayBaseUrl,
        serviceToken,
    });

    return {
        ok: true,
        output: groomingResult.markdown,
        documentType: 'backlog_grooming',
        riskLevel: 'medium',
        approvalStatus: 'auto_approved',
        structuredData: {
            totalItems: groomingResult.totalItems,
            readyCount: groomingResult.readyCount,
            needsWorkCount: groomingResult.needsWorkCount,
            mustSplitCount: groomingResult.mustSplitCount,
        },
    };
}

async function handleVelocityReport(params: PmActionParams): Promise<PmActionResult> {
    const { tenantId, botId, taskId, workspaceId, payload, gatewayBaseUrl, serviceToken } = params;

    const sprints = arr<Record<string, unknown>>(payload['sprints']).map((s) => ({
        sprintName: str(s['sprint_name'], 'Unknown Sprint'),
        committedPoints: num(s['committed_points'], 0),
        completedPoints: num(s['completed_points'], 0),
        endDate: str(s['end_date'], new Date().toISOString()),
        durationDays: num(s['duration_days'], 10),
        teamSize: typeof s['team_size'] === 'number' ? s['team_size'] : undefined,
    })) as SprintRecord[];

    const remainingBacklogPoints = typeof payload['remaining_backlog_points'] === 'number'
        ? payload['remaining_backlog_points']
        : undefined;

    const report = calculateVelocity(sprints, remainingBacklogPoints);

    await writeEpisodicMemory({
        tenantId,
        workspaceId,
        pattern: `pm:velocity:trend_${report.trend}`,
        summary: `Velocity report: avg ${report.averageVelocity}pts, trend ${report.trend}`,
        gatewayBaseUrl,
        serviceToken,
    });

    return {
        ok: true,
        output: report.markdown,
        documentType: 'velocity_report',
        riskLevel: 'medium',
        approvalStatus: 'auto_approved',
        velocity_trend: report.trend,
        structuredData: {
            averageVelocity: report.averageVelocity,
            rollingVelocity: report.rollingVelocity,
            forecastVelocity: report.forecastVelocity,
            trend: report.trend,
            completionRate: report.completionRate,
            backlogForecastSprints: report.backlogForecastSprints,
        },
    };
}

async function handleStandupSummary(params: PmActionParams): Promise<PmActionResult> {
    const { tenantId, workspaceId, payload, gatewayBaseUrl, serviceToken, connectorClient } = params;

    const recentMemory = arr<string>(payload['recent_memory']);
    const botName      = str(payload['bot_name'], 'PM Agent');
    const teamName     = str(payload['team_name'], 'the team');
    const sprintNumber = typeof payload['sprint_number'] === 'number' ? payload['sprint_number'] : undefined;
    const sprintGoal   = str(payload['sprint_goal']) || undefined;
    const daysRemaining  = typeof payload['days_remaining']  === 'number' ? payload['days_remaining']  : undefined;
    const daysTotal      = typeof payload['days_total']      === 'number' ? payload['days_total']      : undefined;
    const daysElapsed    = typeof payload['days_elapsed']    === 'number' ? payload['days_elapsed']    : undefined;
    const completedPoints = typeof payload['completed_points'] === 'number' ? payload['completed_points'] : undefined;
    const committedPoints = typeof payload['committed_points'] === 'number' ? payload['committed_points'] : undefined;

    // ── Live board sync (human PM always looks at the board before standup) ───
    const sprintId   = payload['sprint_id'] ?? payload['sprintId'];
    const connector  = str(payload['connector']) as 'jira' | 'linear' | '';
    const credentials = typeof payload['credentials'] === 'object' ? payload['credentials'] as Record<string, unknown> : undefined;
    const sprintName = str(payload['sprint_name']) || `Sprint ${sprintNumber ?? ''}`;

    let boardSection = '';
    if (connectorClient && connector && sprintId) {
        const boardState = await fetchSprintBoardState(
            connectorClient,
            connector as 'jira' | 'linear',
            { sprintId: sprintId as string | number, sprintName, credentials },
        ).catch(() => null);

        if (boardState) {
            boardSection = formatBoardStateForStandup(boardState, daysElapsed, daysTotal);

            // Override payload values with live board data for accuracy
            (payload as Record<string, unknown>)['completed_points'] = boardState.completedPoints;
            (payload as Record<string, unknown>)['committed_points'] = boardState.committedPoints;
        }
    }

    const standup = buildPmStandupSummary(recentMemory, {
        botName,
        teamName,
        sprintContext: { sprintNumber, sprintGoal, daysRemaining, completedPoints, committedPoints },
    });

    const output = [
        `**${botName} — Daily Standup Update** | ${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}`,
        '',
        boardSection || '',
        boardSection ? '---' : '',
        standup.blockers.length > 0
            ? `🚨 **Blockers:** ${standup.blockers.join(' | ')}`
            : '',
        `✅ **Yesterday:** ${standup.yesterday.join('; ') || 'No completed items logged.'}`,
        `📋 **Today:** ${standup.today.join('; ') || 'Continuing sprint coordination.'}`,
        standup.teamHighlights.length > 0
            ? `⭐ **Highlight:** ${standup.teamHighlights[0]}`
            : '',
    ].filter(Boolean).join('\n');

    await writeEpisodicMemory({
        tenantId,
        workspaceId,
        pattern: 'pm:standup:success',
        summary: `PM standup generated — ${standup.blockers.length} blocker(s)`,
        gatewayBaseUrl,
        serviceToken,
    });

    // ── GAP 2: Post standup to Slack / Teams ────────────────────────────────
    const slackChannel = str(payload['slack_channel']);
    const teamsWebhook = str(payload['teams_webhook']);
    let postedTo: string | undefined;

    if (connectorClient && slackChannel) {
        await connectorClient({
            connectorType: 'slack',
            actionType: 'send_message',
            payload: {
                channel: slackChannel,
                message: output,
                ...(payload['credentials'] ? { credentials: payload['credentials'] } : {}),
            },
        }).catch(() => {}); // non-fatal
        postedTo = `slack:${slackChannel}`;
    } else if (connectorClient && teamsWebhook) {
        await connectorClient({
            connectorType: 'teams',
            actionType: 'send_message',
            payload: {
                webhook_url: teamsWebhook,
                message: output,
                ...(payload['credentials'] ? { credentials: payload['credentials'] } : {}),
            },
        }).catch(() => {}); // non-fatal
        postedTo = 'teams';
    }

    return {
        ok: true,
        output,
        documentType: 'standup_summary',
        riskLevel: 'low',
        approvalStatus: 'auto_approved',
        structuredData: {
            yesterdayCount: standup.yesterday.length,
            todayCount: standup.today.length,
            blockerCount: standup.blockers.length,
            postedTo,
        },
    };
}

async function handleRetrospective(params: PmActionParams): Promise<PmActionResult> {
    const { tenantId, botId, taskId, workspaceId, payload, gatewayBaseUrl, serviceToken, callLlm } = params;

    const sprintName = str(payload['sprint_name'], 'Current Sprint');
    const sprintGoal = str(payload['sprint_goal']) || undefined;
    const wentWell = arr<string>(payload['went_well']);
    const didNotGoWell = arr<string>(payload['did_not_go_well']);
    const experiments = arr<string>(payload['experiments']);
    const completedPoints = typeof payload['completed_points'] === 'number' ? payload['completed_points'] : undefined;
    const committedPoints = typeof payload['committed_points'] === 'number' ? payload['committed_points'] : undefined;
    const previousActionItems = arr<string>(payload['previous_action_items']);

    let retroContent = '';

    if (callLlm) {
        const systemPrompt = buildPmSystemPrompt({
            actionType: 'workspace_pm_retrospective',
            ragContextBlock: '',
        });

        const userPrompt = [
            `# Sprint Retrospective — ${sprintName}`,
            sprintGoal ? `Sprint Goal: ${sprintGoal}` : '',
            completedPoints != null && committedPoints != null
                ? `Delivery: ${completedPoints}/${committedPoints} points completed`
                : '',
            '',
            '## What Went Well',
            wentWell.length > 0 ? wentWell.map((w) => `- ${w}`).join('\n') : '- (to be provided)',
            '',
            '## What Did Not Go Well',
            didNotGoWell.length > 0 ? didNotGoWell.map((d) => `- ${d}`).join('\n') : '- (to be provided)',
            '',
            '## Proposed Experiments',
            experiments.length > 0 ? experiments.map((e) => `- ${e}`).join('\n') : '- (to be defined)',
            '',
            previousActionItems.length > 0
                ? `## Previous Sprint Action Items\n${previousActionItems.map((a) => `- ${a}`).join('\n')}`
                : '',
        ].filter(Boolean).join('\n');

        retroContent = await callLlmSafe(callLlm, userPrompt, systemPrompt);
    }

    if (!retroContent) {
        // Fallback: structured without LLM
        const lines: string[] = [
            `# 🔄 Sprint Retrospective — ${sprintName}`,
            sprintGoal ? `**Sprint Goal:** ${sprintGoal}` : '',
            completedPoints != null && committedPoints != null
                ? `**Delivery:** ${completedPoints}/${committedPoints} points (${Math.round((completedPoints / committedPoints) * 100)}%)`
                : '',
            '',
            '## ✅ What Went Well',
            wentWell.length > 0 ? wentWell.map((w) => `- ${w}`).join('\n') : '- _Not provided_',
            '',
            '## ❌ What Did Not Go Well',
            didNotGoWell.length > 0 ? didNotGoWell.map((d) => `- ${d}`).join('\n') : '- _Not provided_',
            '',
            '## 🔬 Experiments for Next Sprint',
            experiments.length > 0 ? experiments.map((e) => `- ${e}`).join('\n') : '- _To be defined_',
            '',
            '## 📋 Action Items',
            '| Action | Owner | Due | Success Metric |',
            '|---|---|---|---|',
            '| _[Add action items]_ | _[Owner]_ | _[Date]_ | _[Metric]_ |',
        ].filter(Boolean);
        retroContent = lines.join('\n');
    }

    const actionItemCount = (retroContent.match(/\baction\s+item\b/gi) ?? []).length +
        (retroContent.match(/\|\s*\[[^\]]+\]\s*\|/g) ?? []).length;

    await writeEpisodicMemory({
        tenantId,
        workspaceId,
        pattern: actionItemCount > 0 ? 'pm:retro:action_items_captured' : 'pm:retro:success',
        summary: `Retrospective for ${sprintName} — ${actionItemCount} action item(s)`,
        gatewayBaseUrl,
        serviceToken,
    });

    await ingestPmDocument({
        tenantId,
        botId,
        documentTitle: `Retrospective — ${sprintName}`,
        documentType: 'retrospective',
        content: retroContent,
        gatewayBaseUrl,
        serviceToken,
    });

    return {
        ok: true,
        output: retroContent,
        documentType: 'retrospective',
        riskLevel: 'medium',
        approvalStatus: 'auto_approved',
        action_item_count: actionItemCount,
        structuredData: { actionItemCount },
    };
}

async function handleImpedimentLog(params: PmActionParams): Promise<PmActionResult> {
    const { tenantId, workspaceId, payload, gatewayBaseUrl, serviceToken, connectorClient } = params;

    const blockerId = str(payload['blocker_id'], `IMP-${Date.now()}`);
    const description = str(payload['description'], 'Blocker description not provided.');
    const impact = str(payload['impact'], 'Impact not specified.');
    const owner = str(payload['owner']) || undefined;
    const severity = (str(payload['severity'], 'major')) as 'critical' | 'major' | 'minor';
    const needsEscalation = bool(payload['escalate']) || severity === 'critical';
    const escalateTo = str(payload['escalate_to']) || undefined;

    const severityEmoji = { critical: '🔴', major: '🟡', minor: '🟢' }[severity];

    const output = [
        `# ${severityEmoji} Impediment Log — ${blockerId}`,
        '',
        `**Severity:** ${severity.toUpperCase()}`,
        `**Raised:** ${new Date().toISOString().split('T')[0]}`,
        `**Owner:** ${owner ?? 'Unassigned — assign immediately'}`,
        '',
        '## Description',
        description,
        '',
        '## Impact on Sprint',
        impact,
        '',
        '## Resolution Path',
        str(payload['resolution_path'], '_To be defined by owner._'),
        '',
        needsEscalation
            ? `## Escalation\n⚠️ This impediment requires escalation to: **${escalateTo ?? 'Project Sponsor / Leadership'}**\n\nEscalation reason: ${severity === 'critical' ? 'Critical blocker impacting sprint goal.' : str(payload['escalation_reason'], 'Requires leadership decision.')}`
            : '## Escalation\n_No escalation required at this time._',
        '',
        '---',
        `_Logged by AgentFarm Scrum Master — ${new Date().toISOString().split('T')[0]}_`,
    ].join('\n');

    // ── Full escalation chain for critical/major blockers ────────────────────
    // A human SM doesn't just log a critical blocker — they create the ticket,
    // notify the team, email the escalation owner, and update the risk register
    // all in one coordinated sequence.
    let escalationReport: string | undefined;
    let ticketKey: string | undefined;

    if (needsEscalation || severity === 'major') {
        const chainResult = await runEscalationChain({
            blockerId,
            description,
            impact,
            severity,
            owner,
            escalateTo,
            projectKey: str(payload['project_key']) || undefined,
            ticketPlatform: str(payload['ticket_platform']) || undefined,
            slackChannel: str(payload['slack_channel']) || undefined,
            teamsWebhook: str(payload['teams_webhook']) || undefined,
            tenantId,
            workspaceId,
            botId: params.botId,
            connectorClient,
            gatewayBaseUrl,
            serviceToken,
        }).catch(() => null);

        if (chainResult) {
            escalationReport = chainResult.report;
            ticketKey        = chainResult.ticketKey;
        }
    } else if (connectorClient) {
        // For minor blockers: just create the ticket, no full chain
        const ticketPlatform = str(payload['ticket_platform']);
        const projectKey     = str(payload['project_key']);
        if (ticketPlatform && projectKey) {
            await connectorClient({
                connectorType: ticketPlatform,
                actionType:    'create_task',
                payload: {
                    title:       `[BLOCKER MINOR] ${description.slice(0, 80)}`,
                    description: `${description}\n\nImpact: ${impact}`,
                    type:        'task',
                    priority:    'low',
                    labels:      ['blocker', 'impediment', 'minor'],
                    project_key: projectKey,
                },
            }).catch(() => { /* non-fatal */ });
        }
    }

    // Append escalation chain report to output
    const finalOutput = escalationReport
        ? [output, '', '---', '', escalationReport].join('\n')
        : output;

    await writeEpisodicMemory({
        tenantId,
        workspaceId,
        pattern: needsEscalation ? 'pm:blocker:escalated' : `pm:impediment:success`,
        summary: `Impediment logged: ${description.slice(0, 80)}${needsEscalation ? ' [ESCALATED]' : ''}`,
        gatewayBaseUrl,
        serviceToken,
    });

    return {
        ok: true,
        output: finalOutput,
        documentType: 'impediment_log',
        riskLevel: severity === 'critical' ? 'high' : 'low',
        approvalStatus: 'auto_approved',
        escalated: needsEscalation,
        structuredData: { blockerId, severity, escalated: needsEscalation, ticketKey },
    };
}

async function handleCeremonyAgenda(params: PmActionParams): Promise<PmActionResult> {
    const { tenantId, workspaceId, payload, gatewayBaseUrl, serviceToken } = params;

    const ceremonyInput: CeremonyInput = {
        type: (str(payload['ceremony_type'], 'standup')) as import('./ceremony-facilitator.js').CeremonyType,
        sprintName: str(payload['sprint_name']) || undefined,
        sprintGoal: str(payload['sprint_goal']) || undefined,
        teamName: str(payload['team_name']) || undefined,
        facilitatorName: str(payload['facilitator_name']) || undefined,
        scheduledAt: str(payload['scheduled_at']) || undefined,
        durationMinutes: typeof payload['duration_minutes'] === 'number' ? payload['duration_minutes'] : undefined,
        context: str(payload['context']) || undefined,
        additionalTopics: arr<string>(payload['additional_topics']),
    };

    const agenda = buildCeremonyAgenda(ceremonyInput);

    await writeEpisodicMemory({
        tenantId,
        workspaceId,
        pattern: 'pm:ceremony_agenda:success',
        summary: `Ceremony agenda generated: ${agenda.title}`,
        gatewayBaseUrl,
        serviceToken,
    });

    return {
        ok: true,
        output: agenda.markdown,
        documentType: 'ceremony_agenda',
        riskLevel: 'low',
        approvalStatus: 'auto_approved',
        structuredData: {
            ceremonyType: agenda.ceremonyType,
            totalDurationMinutes: agenda.totalDurationMinutes,
            agendaItemCount: agenda.agenda.length,
        },
    };
}

// ---------------------------------------------------------------------------
// Proactive monitoring handlers
// ---------------------------------------------------------------------------

async function handleProactiveBlockerScan(params: PmActionParams): Promise<PmActionResult> {
    const { tenantId, botId, workspaceId, gatewayBaseUrl, serviceToken, callLlm } = params;

    const docs = await fetchPmKbContext({
        tenantId,
        botId,
        queryText: 'blocker impediment blocked waiting escalation issue risk',
        topK: 15,
        gatewayBaseUrl,
        serviceToken,
    });

    if (docs.length === 0) {
        return {
            ok: true,
            output: '✅ No PM documents found in the knowledge base — no blockers to report.',
            documentType: 'proactive_blocker_scan',
            riskLevel: 'low',
            approvalStatus: 'auto_approved',
            blocker_count: 0,
        };
    }

    const blockerDocs = docs.filter((d) => {
        const lower = d.content.toLowerCase();
        return (
            lower.includes('blocker') ||
            lower.includes('impediment') ||
            lower.includes('blocked') ||
            (lower.includes('escalat') && lower.includes('risk'))
        );
    });

    if (blockerDocs.length === 0) {
        return {
            ok: true,
            output: `✅ Scanned ${docs.length} PM documents. No open blockers detected.`,
            documentType: 'proactive_blocker_scan',
            riskLevel: 'low',
            approvalStatus: 'auto_approved',
            blocker_count: 0,
        };
    }

    let summary = '';
    if (callLlm) {
        const excerpts = blockerDocs
            .slice(0, 5)
            .map((d, i) => `### Document ${i + 1}\n${d.content.slice(0, 500)}`)
            .join('\n\n---\n\n');
        summary = await callLlmSafe(
            callLlm,
            `The following PM documents contain references to blockers or impediments. Summarise the open blockers in a concise bullet list with: blocker description, who is affected, and severity.\n\n${excerpts}`,
            'You are a Scrum Master. Extract and list open blockers from the provided documents. Be concise — one bullet per blocker. Format: "- [Severity] Blocker description (Owner if known)".',
        );
    }

    const output = [
        `⚠️ Found ${blockerDocs.length} document(s) containing blockers or impediments.`,
        '',
        summary || '_Run with LLM enabled to generate a detailed blocker summary._',
    ].join('\n');

    await writeEpisodicMemory({
        tenantId,
        workspaceId,
        pattern: 'pm:proactive:blockers_found',
        summary: `Proactive scan: ${blockerDocs.length} document(s) with blockers found`,
        gatewayBaseUrl,
        serviceToken,
    });

    return {
        ok: true,
        output,
        documentType: 'proactive_blocker_scan',
        riskLevel: 'low',
        approvalStatus: 'auto_approved',
        blocker_count: blockerDocs.length,
        ragContextUsed: true,
    };
}

async function handleProactiveScopeDrift(params: PmActionParams): Promise<PmActionResult> {
    const { tenantId, botId, workspaceId, gatewayBaseUrl, serviceToken, callLlm } = params;

    const [charterDocs, recentDocs] = await Promise.all([
        fetchPmKbContext({
            tenantId,
            botId,
            queryText: 'project charter scope objectives in scope out of scope constraints',
            topK: 3,
            gatewayBaseUrl,
            serviceToken,
        }),
        fetchPmKbContext({
            tenantId,
            botId,
            queryText: 'sprint plan status report change request new requirement',
            topK: 10,
            gatewayBaseUrl,
            serviceToken,
        }),
    ]);

    if (charterDocs.length === 0) {
        return {
            ok: true,
            output: '⚠️ No project charter found in the knowledge base. Cannot perform scope drift analysis. Draft a project charter first.',
            documentType: 'proactive_scope_drift',
            riskLevel: 'low',
            approvalStatus: 'auto_approved',
            drift_detected: false,
        };
    }

    if (!callLlm) {
        return {
            ok: false,
            output: '',
            errorOutput: 'callLlm is required for scope drift analysis.',
        };
    }

    const charterContext = charterDocs.map((d) => d.content.slice(0, 800)).join('\n\n---\n\n');
    const recentContext = recentDocs.slice(0, 5).map((d) => d.content.slice(0, 400)).join('\n\n---\n\n');

    const analysis = await callLlmSafe(
        callLlm,
        `Compare the original project charter scope against recent project documents to detect scope drift.\n\n## Original Charter\n${charterContext}\n\n## Recent Documents\n${recentContext}\n\nIdentify: (1) items being worked on that are NOT in the charter scope, (2) charter objectives that appear to be de-prioritised or delayed, (3) scope risk rating (GREEN/AMBER/RED). Be specific — cite document references.`,
        'You are a senior Project Manager auditing for scope creep. Compare the charter against recent documents. Be objective and cite specific evidence. Format: ## Scope Drift Findings, ## De-prioritised Objectives, ## Scope Risk Rating.',
    );

    const driftDetected = /amber|red|drift|out.of.scope|scope.creep|not.in.charter/i.test(analysis);

    await writeEpisodicMemory({
        tenantId,
        workspaceId,
        pattern: driftDetected ? 'pm:proactive:scope_drift_detected' : 'pm:proactive:scope_aligned',
        summary: `Scope drift scan: ${driftDetected ? 'DRIFT DETECTED' : 'aligned with charter'}`,
        gatewayBaseUrl,
        serviceToken,
    });

    return {
        ok: true,
        output: analysis || '✅ No scope drift detected based on available documents.',
        documentType: 'proactive_scope_drift',
        riskLevel: 'low',
        approvalStatus: 'auto_approved',
        drift_detected: driftDetected,
        ragContextUsed: true,
    };
}

// ---------------------------------------------------------------------------
// GAP 2 — Scheduled standup registration
// ---------------------------------------------------------------------------

async function handleScheduleStandup(params: PmActionParams): Promise<PmActionResult> {
    const { botId, tenantId, workspaceId, payload, gatewayBaseUrl, serviceToken } = params;

    const teamName = str(payload['team_name'], 'Engineering');
    const cronExpr = str(payload['cron_expr'], '0 9 * * 1-5');
    const name = str(payload['schedule_name'], 'PM Daily Standup');

    const result = await registerPmStandupSchedule({
        botId,
        tenantId,
        name,
        cronExpr,
        teamName,
        gatewayBaseUrl,
        serviceToken,
    });

    const output = result.ok
        ? result.alreadyExists
            ? `✅ Standup schedule already registered (ID: ${result.scheduleId}).`
            : `✅ Daily standup scheduled (ID: ${result.scheduleId}) — fires ${cronExpr} UTC.`
        : `❌ Standup schedule registration failed: ${result.error}`;

    if (result.ok) {
        await writeEpisodicMemory({
            tenantId,
            workspaceId,
            pattern: 'pm:schedule:standup_registered',
            summary: `Standup schedule registered: ${name} (${cronExpr})`,
            gatewayBaseUrl,
            serviceToken,
        });
    }

    return {
        ok: result.ok,
        output,
        documentType: 'schedule_setup',
        riskLevel: 'low',
        approvalStatus: 'auto_approved',
        structuredData: { scheduleId: result.scheduleId, cronExpr, alreadyExists: result.alreadyExists },
        errorOutput: result.ok ? undefined : result.error,
    };
}

// ---------------------------------------------------------------------------
// GAP 3 — Cross-agent handoff actions
// ---------------------------------------------------------------------------

async function handleHandoffToRole(
    params: PmActionParams,
    toRole: HandoffRole,
): Promise<PmActionResult> {
    const { botId, tenantId, workspaceId, taskId, payload, gatewayBaseUrl, serviceToken } = params;

    const orchestratorBaseUrl =
        str(payload['orchestrator_url']) ||
        process.env['ORCHESTRATOR_URL'] ||
        process.env['ORCHESTRATOR_BASE_URL'] ||
        'http://localhost:3003';

    const toBotId = str(payload['to_bot_id']) || `${toRole}-agent`;
    const reason = str(payload['reason'], `PM handoff: ${toRole} work required`);
    const handoffContext = typeof payload['handoff_context'] === 'object' && payload['handoff_context'] !== null
        ? payload['handoff_context'] as Record<string, unknown>
        : { stories: payload['stories'], notes: payload['notes'] };

    const escalateOnTimeoutMs = typeof payload['escalate_on_timeout_ms'] === 'number'
        ? payload['escalate_on_timeout_ms']
        : 4 * 60 * 60 * 1_000; // 4 hours

    const result = await createHandoff({
        tenantId,
        workspaceId,
        taskId,
        fromBotId: botId,
        toBotId,
        toRole,
        reason,
        handoffContext,
        escalateOnTimeoutMs,
        orchestratorBaseUrl,
        serviceToken,
    });

    const output = result.ok
        ? `✅ Handoff created to ${toRole} (handoff ID: ${result.handoff?.id}). Status: ${result.handoff?.status}.`
        : `❌ Handoff creation failed: ${result.error}`;

    if (result.ok) {
        await writeEpisodicMemory({
            tenantId,
            workspaceId,
            pattern: `pm:handoff:to_${toRole}`,
            summary: `Handoff to ${toRole}: ${reason.slice(0, 80)}`,
            gatewayBaseUrl,
            serviceToken,
        });
    }

    return {
        ok: result.ok,
        output,
        documentType: 'agent_handoff',
        riskLevel: 'low',
        approvalStatus: 'auto_approved',
        structuredData: result.handoff ? { handoffId: result.handoff.id, status: result.handoff.status, toRole } : undefined,
        errorOutput: result.ok ? undefined : result.error,
    };
}

async function handleCheckHandoffStatus(params: PmActionParams): Promise<PmActionResult> {
    const { tenantId, workspaceId, payload, gatewayBaseUrl, serviceToken } = params;

    const orchestratorBaseUrl =
        str(payload['orchestrator_url']) ||
        process.env['ORCHESTRATOR_URL'] ||
        process.env['ORCHESTRATOR_BASE_URL'] ||
        'http://localhost:3003';

    const statusFilter = str(payload['status']) as Parameters<typeof listHandoffs>[0]['status'] || undefined;

    const result = await listHandoffs({
        tenantId,
        workspaceId,
        status: statusFilter,
        orchestratorBaseUrl,
        serviceToken,
    });

    if (!result.ok) {
        return {
            ok: false,
            output: `❌ Could not fetch handoff status: ${result.error}`,
            documentType: 'handoff_status',
            errorOutput: result.error,
        };
    }

    const handoffs = result.handoffs ?? [];
    const summary = formatHandoffSummary(handoffs);

    await writeEpisodicMemory({
        tenantId,
        workspaceId,
        pattern: 'pm:handoff:status_checked',
        summary: `Handoff status check: ${handoffs.length} handoff(s) found`,
        gatewayBaseUrl,
        serviceToken,
    });

    return {
        ok: true,
        output: summary,
        documentType: 'handoff_status',
        riskLevel: 'low',
        approvalStatus: 'auto_approved',
        structuredData: { count: handoffs.length, handoffs: handoffs.slice(0, 10) },
    };
}

// ---------------------------------------------------------------------------
// Delivery forecast
// ---------------------------------------------------------------------------

async function handleDeliveryForecast(params: PmActionParams): Promise<PmActionResult> {
    const { tenantId, workspaceId, payload, gatewayBaseUrl, serviceToken } = params;

    const velocityHistory = (() => {
        const raw = payload['historical_velocity'] ?? payload['velocity_history'];
        if (Array.isArray(raw)) return raw.filter((v): v is number => typeof v === 'number');
        if (typeof raw === 'number') return [raw];
        return [];
    })();

    const remainingPoints   = num(payload['remaining_backlog_points'] ?? payload['remaining_points'], 0);
    const sprintLengthDays  = num(payload['sprint_length_days'] ?? payload['sprint_duration_days'], 14);
    const daysElapsed       = num(payload['days_elapsed'], 0);
    const featureName       = str(payload['feature_name'] ?? payload['title'], 'Backlog');
    const teamName          = str(payload['team_name'], 'Team');

    const forecast = computeDeliveryForecast({
        velocityHistory,
        remainingPoints,
        sprintLengthDays,
        currentSprintDaysElapsed: daysElapsed,
        currentSprintStartDate: str(payload['sprint_start_date']) || undefined,
        featureName,
        teamName,
    });

    await writeEpisodicMemory({
        tenantId,
        workspaceId,
        pattern: 'pm:delivery_forecast:generated',
        summary: `Delivery forecast: ${featureName} — realistic end ${forecast.realistic.estimatedEndDate}`,
        gatewayBaseUrl,
        serviceToken,
    });

    return {
        ok: true,
        output: forecast.formattedReport,
        documentType: 'delivery_forecast',
        riskLevel: 'low',
        approvalStatus: 'auto_approved',
        structuredData: {
            optimistic:  forecast.optimistic.estimatedEndDate,
            realistic:   forecast.realistic.estimatedEndDate,
            pessimistic: forecast.pessimistic.estimatedEndDate,
            confidence:  forecast.confidenceLevel,
            avgVelocity: forecast.avgVelocity,
        },
    };
}

// ---------------------------------------------------------------------------
// Sprint health check (live burndown monitoring + automatic alert)
// ---------------------------------------------------------------------------

async function handleSprintHealthCheck(params: PmActionParams): Promise<PmActionResult> {
    const { tenantId, workspaceId, payload, gatewayBaseUrl, serviceToken, connectorClient } = params;

    const sprintId     = payload['sprint_id'] ?? payload['sprintId'];
    const sprintName   = str(payload['sprint_name'], 'Current Sprint');
    const daysTotal    = num(payload['days_total']   ?? payload['sprint_duration_days'], 14);
    const daysElapsed  = num(payload['days_elapsed'] ?? payload['sprint_days_elapsed'], 0);
    const connector    = str(payload['connector']) as 'jira' | 'linear' | '';
    const slackChannel = str(payload['slack_channel']) || undefined;
    const teamsWebhook = str(payload['teams_webhook']) || undefined;
    const credentials  = typeof payload['credentials'] === 'object' ? payload['credentials'] as Record<string, unknown> : undefined;

    let health;

    if (connectorClient && connector && sprintId) {
        // Full live check — fetches board + computes health + fires alert
        health = await runSprintHealthCheck({
            sprintId: sprintId as string | number,
            sprintName,
            sprintDaysTotal:   daysTotal,
            sprintDaysElapsed: daysElapsed,
            connector: connector as 'jira' | 'linear',
            connectorClient,
            slackChannel,
            teamsWebhook,
            credentials,
        });
    } else {
        // Offline check from payload data
        health = computeSprintHealth({
            sprintName,
            sprintDaysTotal:   daysTotal,
            sprintDaysElapsed: daysElapsed,
            committedPoints:  num(payload['committed_points'], 0),
            completedPoints:  num(payload['completed_points'], 0),
            inProgressPoints: num(payload['in_progress_points'], 0),
            blockedCount:     num(payload['blocked_count'], 0),
            atRiskStories:    Array.isArray(payload['at_risk_stories'])
                ? (payload['at_risk_stories'] as string[])
                : [],
        });
    }

    await writeEpisodicMemory({
        tenantId,
        workspaceId,
        pattern: `pm:sprint_health:${health.ragStatus}`,
        summary: `Sprint health check: ${sprintName} → ${health.ragStatus.toUpperCase()} (${health.completionPct}% complete, ${health.blockedCount} blocked)`,
        gatewayBaseUrl,
        serviceToken,
    });

    return {
        ok: true,
        output: health.formattedReport,
        documentType: 'sprint_health',
        riskLevel: health.ragStatus === 'red' ? 'high' : health.ragStatus === 'amber' ? 'medium' : 'low',
        approvalStatus: 'auto_approved',
        structuredData: {
            ragStatus:           health.ragStatus,
            completionPct:       health.completionPct,
            expectedCompletionPct: health.expectedCompletionPct,
            variance:            health.variance,
            blockedCount:        health.blockedCount,
            alertFired:          health.alertRequired,
        },
    };
}

// ---------------------------------------------------------------------------
// Board sync (standalone — read current sprint state and return it)
// ---------------------------------------------------------------------------

async function handleBoardSync(params: PmActionParams): Promise<PmActionResult> {
    const { payload, connectorClient } = params;

    const sprintId   = payload['sprint_id'] ?? payload['sprintId'];
    const sprintName = str(payload['sprint_name'], 'Current Sprint');
    const connector  = str(payload['connector']) as 'jira' | 'linear' | '';
    const daysElapsed = num(payload['days_elapsed'], 0);
    const daysTotal   = num(payload['days_total'], 14);
    const credentials = typeof payload['credentials'] === 'object' ? payload['credentials'] as Record<string, unknown> : undefined;

    if (!connectorClient || !connector || !sprintId) {
        return {
            ok: false,
            output: '⚠️ Board sync requires connector, sprint_id, and connectorClient to be configured.',
            documentType: 'board_sync',
            errorOutput: 'Missing connector or sprint_id',
        };
    }

    const boardState = await fetchSprintBoardState(
        connectorClient,
        connector as 'jira' | 'linear',
        { sprintId: sprintId as string | number, sprintName, credentials },
    );

    if (!boardState) {
        return {
            ok: false,
            output: '❌ Could not fetch board state. Check connector credentials and sprint_id.',
            documentType: 'board_sync',
            errorOutput: 'fetchSprintBoardState returned null',
        };
    }

    const formatted = formatBoardStateForStandup(boardState, daysElapsed, daysTotal);

    return {
        ok: true,
        output: formatted,
        documentType: 'board_sync',
        riskLevel: 'low',
        approvalStatus: 'auto_approved',
        structuredData: {
            sprintName:      boardState.sprintName,
            committedPoints: boardState.committedPoints,
            completedPoints: boardState.completedPoints,
            inProgressPoints: boardState.inProgressPoints,
            blockedCount:    boardState.blockedCount,
            completionPct:   boardState.completionPct,
            issueCount:      boardState.issues.length,
        },
    };
}

// ---------------------------------------------------------------------------
// LLM-based PM document generation (for charter, status report, risk, etc.)
// ---------------------------------------------------------------------------

async function handlePmDocumentAction(params: PmActionParams): Promise<PmActionResult> {
    const {
        actionType,
        tenantId,
        botId,
        taskId,
        workspaceId,
        payload,
        gatewayBaseUrl,
        serviceToken,
        callLlm,
        approvalNotificationTarget,
        approvalNotificationChannel = 'slack',
        approvalEscalationDeadlineIso,
    } = params;

    const projectName = str(payload['title'] ?? payload['project_name'] ?? payload['name'], actionType);
    const documentType = ACTION_TYPE_TO_DOC_TYPE[actionType] ?? 'pm_document';
    const riskLevel = classifyPmActionRisk(actionType);

    // RAG context retrieval
    const ragQuery = `${projectName} ${documentType.replace(/_/g, ' ')} project manager`;
    const ragDocs = await fetchPmKbContext({
        tenantId,
        botId,
        queryText: ragQuery,
        topK: 8,
        gatewayBaseUrl,
        serviceToken,
    });

    const ragContextBlock = ragDocs.length > 0
        ? `## Prior Project Context (from knowledge base)\n${ragDocs.slice(0, 3).map((d) => d.content.slice(0, 600)).join('\n\n---\n\n')}`
        : '';

    // Build prompts
    const systemPrompt = buildPmSystemPrompt({ actionType, ragContextBlock });

    const userPrompt = buildPmUserPrompt(actionType, payload);

    let generatedContent = await callLlmSafe(callLlm, userPrompt, systemPrompt);

    if (!generatedContent) {
        generatedContent = `# ${documentType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}\n\n_Content generation requires a configured LLM provider._\n\n${userPrompt}`;
    }

    // Route by risk
    if (riskLevel === 'low') {
        await ingestPmDocument({ tenantId, botId, documentTitle: projectName, documentType, content: generatedContent, gatewayBaseUrl, serviceToken });
        await writeEpisodicMemory({ tenantId, workspaceId, pattern: `pm:${documentType}:auto_approved`, summary: `${documentType} auto-approved: ${projectName.slice(0, 80)}`, gatewayBaseUrl, serviceToken });
        return { ok: true, output: generatedContent, documentType, riskLevel: 'low', approvalStatus: 'auto_approved', ragContextUsed: !!ragContextBlock };
    }

    if (riskLevel === 'medium') {
        const approvalId = await submitApprovalIntake({ tenantId, workspaceId, botId, taskId, actionType, payload: { ...payload, generated_content: generatedContent.slice(0, 2000) }, riskLevel: 'medium', gatewayBaseUrl, serviceToken });
        await writeEpisodicMemory({ tenantId, workspaceId, pattern: `pm:${documentType}:pending_approval`, summary: `${documentType} pending async approval: ${projectName.slice(0, 80)}`, gatewayBaseUrl, serviceToken });
        return { ok: true, output: generatedContent, documentType, riskLevel: 'medium', approvalId: approvalId ?? undefined, approvalStatus: 'pending_async', ragContextUsed: !!ragContextBlock };
    }

    // High risk — escalate
    const approvalId = await submitApprovalIntake({ tenantId, workspaceId, botId, taskId, actionType, payload: { ...payload, generated_content: generatedContent.slice(0, 2000) }, riskLevel: 'high', gatewayBaseUrl, serviceToken });
    await writeEpisodicMemory({ tenantId, workspaceId, pattern: `pm:${documentType}:pending_escalation`, summary: `${documentType} pending escalation: ${projectName.slice(0, 80)}`, gatewayBaseUrl, serviceToken });
    return { ok: true, output: generatedContent, documentType, riskLevel: 'high', approvalId: approvalId ?? undefined, approvalStatus: 'pending_escalation', ragContextUsed: !!ragContextBlock };
}

function buildPmUserPrompt(actionType: PmActionType, payload: Record<string, unknown>): string {
    const title = str(payload['title'] ?? payload['project_name'] ?? payload['name']);
    const description = str(payload['description']);
    const objectives = arr<string>(payload['objectives']);
    const stakeholders = arr<string>(payload['stakeholders']);
    const timeline = str(payload['timeline']);
    const budget = str(payload['budget']);
    const constraints = str(payload['constraints']);
    const currentState = str(payload['current_state']);
    const targetState = str(payload['target_state']);
    const risks = arr<string>(payload['risks']);

    const parts: string[] = [];
    if (title)       parts.push(`## ${title}`);
    if (description) parts.push(description);
    if (currentState) parts.push(`\n### Current State\n${currentState}`);
    if (targetState)  parts.push(`\n### Target State\n${targetState}`);
    if (objectives.length > 0) parts.push(`\n### Objectives\n${objectives.map((o, i) => `${i + 1}. ${o}`).join('\n')}`);
    if (stakeholders.length > 0) parts.push(`\n### Stakeholders\n${stakeholders.join(', ')}`);
    if (timeline)    parts.push(`\n### Timeline\n${timeline}`);
    if (budget)      parts.push(`\n### Budget\n${budget}`);
    if (constraints) parts.push(`\n### Constraints\n${constraints}`);
    if (risks.length > 0) parts.push(`\n### Known Risks\n${risks.map((r) => `- ${r}`).join('\n')}`);

    if (parts.length === 0) {
        parts.push(`Generate a ${actionType.replace('workspace_pm_', '').replace(/_/g, ' ')} document.`);
    }
    return parts.join('\n\n');
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Route a PM/SM action through the full pipeline.
 *
 * This is the single entry point called by the agent runtime execution engine
 * when an action type matches PM_ACTION_TYPES.
 */
export async function handlePmAction(params: PmActionParams): Promise<PmActionResult> {
    const { actionType } = params;

    // SM structured-data actions (pure domain modules, minimal LLM)
    switch (actionType) {
        case 'workspace_pm_sprint_plan':
            return handleSprintPlan(params);
        case 'workspace_pm_backlog_groom':
            return handleBacklogGroom(params);
        case 'workspace_pm_velocity_report':
            return handleVelocityReport(params);
        case 'workspace_pm_standup_summary':
            return handleStandupSummary(params);
        case 'workspace_pm_retrospective':
            return handleRetrospective(params);
        case 'workspace_pm_impediment_log':
            return handleImpedimentLog(params);
        case 'workspace_pm_ceremony_agenda':
            return handleCeremonyAgenda(params);
        // Proactive monitoring
        case 'workspace_pm_proactive_blocker_scan':
            return handleProactiveBlockerScan(params);
        case 'workspace_pm_proactive_scope_drift':
            return handleProactiveScopeDrift(params);
        // Scheduling
        case 'workspace_pm_schedule_standup':
            return handleScheduleStandup(params);
        // Cross-agent orchestration
        case 'workspace_pm_handoff_to_developer':
            return handleHandoffToRole(params, 'developer');
        case 'workspace_pm_handoff_to_tester':
            return handleHandoffToRole(params, 'tester');
        case 'workspace_pm_check_handoff_status':
            return handleCheckHandoffStatus(params);
        // Human-PM parity: live board + forecasting + health monitoring
        case 'workspace_pm_delivery_forecast':
            return handleDeliveryForecast(params);
        case 'workspace_pm_sprint_health_check':
            return handleSprintHealthCheck(params);
        case 'workspace_pm_board_sync':
            return handleBoardSync(params);
        // PM document-generation actions (LLM + RAG + gate)
        case 'workspace_pm_project_charter':
        case 'workspace_pm_status_report':
        case 'workspace_pm_risk_register':
        case 'workspace_pm_dependency_map':
        case 'workspace_pm_change_request':
        case 'workspace_pm_milestone_plan':
        case 'workspace_pm_budget_forecast':
            return handlePmDocumentAction(params);
    }
}

// ---------------------------------------------------------------------------
// Episodic hooks — re-exported for the execution engine
// ---------------------------------------------------------------------------

export { buildPmEpisodicPattern, buildPmEpisodicSummary };
