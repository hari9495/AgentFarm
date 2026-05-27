// ============================================================================
// DEVOPS HUMAN HANDOFF BUILDER
//
// When the DevOps agent encounters a situation it cannot resolve autonomously
// (hardware access, real-time monitoring, multi-team coordination, vendor
// escalation, novel incidents, budget decisions, etc.) it calls
// workspace_devops_human_handoff to create a structured task on the
// customer dashboard instead of failing silently.
//
// The handoff task contains:
//   • A clear title and summary of what the agent was doing
//   • Everything the agent already gathered (artifacts, logs, diagnoses)
//   • Explicit required actions for the human
//   • Recommended next steps
//   • An optional resume_action so the human can unblock the agent
//
// EscalationType taxonomy:
//   approval_required       — agent needs explicit approval to continue
//   interactive_session     — requires a live terminal/RDP/SSH session
//   hardware_access         — physical access to rack/server/network gear
//   vendor_escalation       — AWS/Azure/GCP support ticket needed
//   customer_communication  — status page or customer email needed
//   novel_incident          — failure pattern not recognised by agent
//   multi_team_coordination — cross-team dependencies (DBA, Sec, Network, etc.)
//   persistent_monitoring   — background watch: "alert me when X changes"
//   budget_decision         — spend/cost action above agent authority
//   context_required        — missing org/team/business context
//   security_breach         — active security incident requiring human judgment
//   regulatory_compliance   — legal/compliance implications
// ============================================================================

import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EscalationType =
    | 'approval_required'
    | 'interactive_session'
    | 'hardware_access'
    | 'vendor_escalation'
    | 'customer_communication'
    | 'novel_incident'
    | 'multi_team_coordination'
    | 'persistent_monitoring'
    | 'budget_decision'
    | 'context_required'
    | 'security_breach'
    | 'regulatory_compliance';

export type HandoffSeverity = 'p1' | 'p2' | 'p3' | 'p4';

/**
 * A structured task surfaced on the customer dashboard when the agent
 * cannot proceed autonomously.
 */
export interface DashboardTask {
    /** Unique handoff task ID (UUID v4). */
    id:               string;
    /** Short imperative title, e.g. "Approve Terraform apply — prod eu-west-1". */
    title:            string;
    /** Category of escalation — drives the dashboard routing and widget type. */
    escalation_type:  EscalationType;
    /** Incident / task severity. */
    severity:         HandoffSeverity;
    /** 2–4 sentence summary of what was happening and why human input is needed. */
    summary:          string;
    /** Everything the agent gathered before escalating. */
    context_gathered: string;
    /** Ordered list of actions the human must take. */
    required_actions: string[];
    /** What the agent recommends the human do next. */
    recommended_steps: string[];
    /**
     * Key-value map of artifact names → content (logs, plans, manifests, etc.)
     * Values are truncated to 4 000 chars each.
     */
    artifacts:        Record<string, string>;
    /** ISO-8601 timestamp. */
    created_at:       string;
    /** The agent's current task context for continuity. */
    agent_context:    Record<string, unknown>;
    /**
     * Optional action the agent should run once the human resolves the task.
     * The dashboard can call this to resume automation.
     */
    resume_action?:   { action_type: string; payload: Record<string, unknown> };
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/**
 * Creates a DashboardTask from the provided escalation parameters.
 */
export function buildDashboardTask(params: {
    title:            string;
    escalation_type:  EscalationType;
    severity:         HandoffSeverity;
    summary:          string;
    context_gathered?: string;
    required_actions:  string[];
    recommended_steps?: string[];
    artifacts?:        Record<string, string>;
    agent_context?:    Record<string, unknown>;
    resume_action?:    { action_type: string; payload: Record<string, unknown> };
}): DashboardTask {
    return {
        id:               randomUUID(),
        title:            params.title,
        escalation_type:  params.escalation_type,
        severity:         params.severity,
        summary:          params.summary,
        context_gathered: params.context_gathered ?? '',
        required_actions: params.required_actions,
        recommended_steps: params.recommended_steps ?? [],
        artifacts:        sanitizeArtifacts(params.artifacts ?? {}),
        created_at:       new Date().toISOString(),
        agent_context:    params.agent_context ?? {},
        resume_action:    params.resume_action,
    };
}

/**
 * Sanitizes artifact values — truncates to 4 000 chars per entry.
 */
function sanitizeArtifacts(raw: Record<string, string>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) {
        out[k] = v.slice(0, 4000);
    }
    return out;
}

// ---------------------------------------------------------------------------
// LLM helper — generate summary from raw situation description
// ---------------------------------------------------------------------------

/**
 * Builds a prompt asking the LLM to summarise the situation for the
 * dashboard task.
 */
export function buildHandoffSummaryPrompt(params: {
    escalation_type: EscalationType;
    situation:       string;
    context_gathered?: string;
}): string {
    return [
        '# Dashboard Task Summary Request',
        '',
        `**Escalation type:** ${params.escalation_type}`,
        '',
        '**Situation:**',
        params.situation,
        ...(params.context_gathered ? ['', '**Context gathered:**', params.context_gathered] : []),
        '',
        '## Task',
        'Write a 2–4 sentence summary of what is happening and why human intervention is needed.',
        'Also write a bullet list of required actions (what the human must do).',
        'Also write a bullet list of recommended next steps.',
        '',
        'Format:',
        'Summary: <text>',
        'Required actions:',
        '- <action 1>',
        '- <action 2>',
        'Recommended steps:',
        '- <step 1>',
        '- <step 2>',
    ].join('\n');
}

export interface HandoffSummaryOutput {
    summary:          string;
    required_actions: string[];
    recommended_steps: string[];
}

/**
 * Parses the LLM response from buildHandoffSummaryPrompt.
 */
export function parseHandoffSummaryOutput(raw: string): HandoffSummaryOutput {
    const summaryMatch = raw.match(/summary[:\s]+([^\n]+(?:\n(?!required|recommended)[^\n]+)*)/i);
    const summary = summaryMatch?.[1]?.trim() ?? raw.slice(0, 300).trim();

    const reqMatch = raw.match(/required\s+actions?[:\s]+([\s\S]+?)(?:\nrecommended|$)/i);
    const required_actions: string[] = reqMatch
        ? reqMatch[1].split('\n').map((l) => l.replace(/^[-•*\d.]+\s*/, '').trim()).filter(Boolean)
        : [];

    const recMatch = raw.match(/recommended\s+(?:next\s+)?steps?[:\s]+([\s\S]+?)(?:\n\n|$)/i);
    const recommended_steps: string[] = recMatch
        ? recMatch[1].split('\n').map((l) => l.replace(/^[-•*\d.]+\s*/, '').trim()).filter(Boolean)
        : [];

    return { summary, required_actions, recommended_steps };
}

// ---------------------------------------------------------------------------
// Escalation-type defaults
// ---------------------------------------------------------------------------

/**
 * Returns default required_actions and recommended_steps for each
 * escalation type.  Used when the caller does not supply them explicitly and
 * the LLM is unavailable.
 */
export function getEscalationDefaults(type: EscalationType): {
    required_actions:  string[];
    recommended_steps: string[];
} {
    switch (type) {
        case 'approval_required':
            return {
                required_actions:  ['Review the proposed change described in the summary', 'Approve or reject via the dashboard button'],
                recommended_steps: ['Check the associated plan/diff artifact before approving', 'Verify the rollback plan is in place'],
            };
        case 'interactive_session':
            return {
                required_actions:  ['Open a terminal session to the target host', 'Complete the interactive investigation'],
                recommended_steps: ['Use the commands listed in context_gathered as a starting point', 'Document findings in the dashboard task notes'],
            };
        case 'hardware_access':
            return {
                required_actions:  ['Physically access the target server or network gear', 'Perform the hardware-level diagnostic described in the summary'],
                recommended_steps: ['Check physical indicators (LEDs, console output)', 'Document findings before taking any action'],
            };
        case 'vendor_escalation':
            return {
                required_actions:  ['Open a support ticket with the cloud/hardware vendor', 'Share the diagnostic artifacts included in this task'],
                recommended_steps: ['Escalate to TAM or account team if SLA is at risk', 'Request a P1 priority ticket if the issue affects production'],
            };
        case 'customer_communication':
            return {
                required_actions:  ['Draft and review customer-facing communication', 'Post status update to status page'],
                recommended_steps: ['Confirm scope of impact before communicating', 'Use plain language — avoid technical jargon'],
            };
        case 'novel_incident':
            return {
                required_actions:  ['Review all artifacts gathered by the agent', 'Apply domain expertise to identify the root cause'],
                recommended_steps: ['Form a hypothesis from the data gathered', 'Run additional diagnostic commands if needed', 'Update the runbook after resolution'],
            };
        case 'multi_team_coordination':
            return {
                required_actions:  ['Identify and contact all affected team owners', 'Coordinate a war-room or joint call if P1/P2'],
                recommended_steps: ['Establish a shared incident channel', 'Designate an incident commander', 'Set a 30-minute check-in cadence'],
            };
        case 'persistent_monitoring':
            return {
                required_actions:  ['Set up an alert rule or dashboard watch for the metric described', 'Notify the agent when the condition changes'],
                recommended_steps: ['Use Grafana / Datadog / CloudWatch alert if available', 'Consider PagerDuty escalation policy if SLO is at risk'],
            };
        case 'budget_decision':
            return {
                required_actions:  ['Review the cost impact described in the summary', 'Approve or reject the spend via the dashboard'],
                recommended_steps: ['Compare against current budget headroom', 'Consult the FinOps team if the amount is significant'],
            };
        case 'context_required':
            return {
                required_actions:  ['Provide the missing context listed in the summary', 'Re-submit the task with the additional information'],
                recommended_steps: ['Check team ownership maps and runbooks', 'Add the context to the agent memory for future tasks'],
            };
        case 'security_breach':
            return {
                required_actions:  ['Engage the security incident response team immediately', 'Do NOT resolve this task until the security team has assessed the situation'],
                recommended_steps: ['Preserve forensic evidence (logs, network captures)', 'Follow the IR playbook in Confluence', 'Consider isolating affected systems'],
            };
        case 'regulatory_compliance':
            return {
                required_actions:  ['Consult legal/compliance team before proceeding', 'Do not execute the change until approval is received'],
                recommended_steps: ['Document the compliance review in the ticket', 'Verify the change against the relevant regulatory framework (GDPR, SOC2, HIPAA, etc.)'],
            };
    }
}

// ---------------------------------------------------------------------------
// Notification builders
// ---------------------------------------------------------------------------

/**
 * Formats a Slack notification block for a DashboardTask.
 */
export function formatSlackHandoffNotification(task: DashboardTask): string {
    const emoji: Record<HandoffSeverity, string> = { p1: '🚨', p2: '⚠️', p3: '📋', p4: 'ℹ️' };
    const lines: string[] = [];
    lines.push(`${emoji[task.severity]} *[${task.severity.toUpperCase()}] Dashboard Task: ${task.title}*`);
    lines.push(`*Type:* ${task.escalation_type.replace(/_/g, ' ')}`);
    lines.push('');
    lines.push(`*Summary:* ${task.summary}`);
    lines.push('');
    lines.push('*Required actions:*');
    for (const a of task.required_actions) { lines.push(`• ${a}`); }
    if (task.recommended_steps.length > 0) {
        lines.push('');
        lines.push('*Recommended steps:*');
        for (const s of task.recommended_steps) { lines.push(`• ${s}`); }
    }
    lines.push('');
    lines.push(`_Task ID: ${task.id}_`);
    return lines.join('\n');
}

/**
 * Formats a PagerDuty-compatible incident title+body for a DashboardTask.
 */
export function formatPagerDutyHandoffPayload(task: DashboardTask): {
    title:  string;
    body:   string;
    severity: 'critical' | 'error' | 'warning' | 'info';
} {
    const sevMap: Record<HandoffSeverity, 'critical' | 'error' | 'warning' | 'info'> = {
        p1: 'critical', p2: 'error', p3: 'warning', p4: 'info',
    };
    return {
        title:    `[Agent Escalation] ${task.title}`,
        body:     `${task.summary}\n\nRequired actions:\n${task.required_actions.map((a) => `• ${a}`).join('\n')}\n\nTask ID: ${task.id}`,
        severity: sevMap[task.severity],
    };
}

/**
 * Formats a DashboardTask into a human-readable markdown string
 * for display in the dashboard UI or a Confluence page.
 */
export function formatHandoffReport(task: DashboardTask): string {
    const lines: string[] = [];
    lines.push(`# Dashboard Task — ${task.title}`);
    lines.push('');
    lines.push(`| Field | Value |`);
    lines.push(`|-------|-------|`);
    lines.push(`| **Task ID** | \`${task.id}\` |`);
    lines.push(`| **Type** | ${task.escalation_type.replace(/_/g, ' ')} |`);
    lines.push(`| **Severity** | ${task.severity.toUpperCase()} |`);
    lines.push(`| **Created** | ${task.created_at} |`);
    lines.push('');
    lines.push('## Summary');
    lines.push(task.summary);

    if (task.context_gathered) {
        lines.push('');
        lines.push('## Context Gathered by Agent');
        lines.push(task.context_gathered);
    }

    if (task.required_actions.length > 0) {
        lines.push('');
        lines.push('## Required Actions');
        for (const a of task.required_actions) { lines.push(`- [ ] ${a}`); }
    }

    if (task.recommended_steps.length > 0) {
        lines.push('');
        lines.push('## Recommended Next Steps');
        for (const s of task.recommended_steps) { lines.push(`- ${s}`); }
    }

    if (Object.keys(task.artifacts).length > 0) {
        lines.push('');
        lines.push('## Artifacts');
        for (const [name, content] of Object.entries(task.artifacts)) {
            lines.push(`\n### ${name}`);
            lines.push('```');
            lines.push(content);
            lines.push('```');
        }
    }

    if (task.resume_action) {
        lines.push('');
        lines.push('## Resume Action');
        lines.push('When resolved, the agent can continue with:');
        lines.push('```json');
        lines.push(JSON.stringify(task.resume_action, null, 2));
        lines.push('```');
    }

    return lines.join('\n');
}
