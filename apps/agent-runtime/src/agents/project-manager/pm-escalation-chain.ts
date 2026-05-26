// ============================================================================
// PM ESCALATION CHAIN
//
// Executes a coordinated multi-step response when a critical or major blocker
// is logged — mirroring what a human Scrum Master would do:
//
//   1. Create a Jira/Linear ticket to formally track the blocker
//   2. Post an urgent Slack or Teams notification to the team channel
//   3. Send a direct email to the escalation owner (if address provided)
//   4. Ingest a risk entry into the knowledge base for RAG retrieval
//
// Each step is fire-and-forget wrapped in try/catch so that a failure in one
// channel never prevents the others from running.
// ============================================================================

import type { PmConnectorClient } from './project-manager-action-handler.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EscalationStep = {
    step: string;
    ok: boolean;
    detail?: string;
};

export type EscalationChainResult = {
    ok: boolean;
    steps: EscalationStep[];
    ticketKey?: string;
    report: string;
};

export type EscalationChainParams = {
    blockerId: string;
    description: string;
    impact: string;
    severity: 'critical' | 'major' | 'minor';
    owner?: string;
    escalateTo?: string;
    projectKey?: string;
    ticketPlatform?: string;
    slackChannel?: string;
    teamsWebhook?: string;
    tenantId: string;
    workspaceId: string;
    botId?: string;
    connectorClient?: PmConnectorClient;
    gatewayBaseUrl: string;
    serviceToken: string;
};

// ---------------------------------------------------------------------------
// runEscalationChain
// ---------------------------------------------------------------------------

export async function runEscalationChain(
    params: EscalationChainParams,
): Promise<EscalationChainResult> {
    const {
        blockerId, description, impact, severity, owner, escalateTo,
        projectKey, ticketPlatform, slackChannel, teamsWebhook,
        tenantId, workspaceId, botId, connectorClient,
        gatewayBaseUrl, serviceToken,
    } = params;

    const steps: EscalationStep[] = [];
    let ticketKey: string | undefined;

    const urgencyEmoji  = severity === 'critical' ? '🔴' : '🟠';
    const priorityLabel = severity === 'critical' ? 'CRITICAL' : 'MAJOR';
    const shortTitle    = `[BLOCKER ${priorityLabel}] ${description.slice(0, 80)}`;
    const responseTime  = severity === 'critical' ? '2 hours' : '24 hours';

    // ── Step 1: Create tracker ticket ─────────────────────────────────────────
    if (connectorClient && ticketPlatform && projectKey) {
        try {
            const r = await connectorClient({
                connectorType: ticketPlatform,
                actionType: 'create_task',
                payload: {
                    title: shortTitle,
                    description: [
                        `**Blocker ID:** ${blockerId}`,
                        `**Description:** ${description}`,
                        '',
                        `**Business Impact:**`,
                        impact,
                        '',
                        `**Owner:** ${owner ?? 'TBD'}`,
                        `**Escalate To:** ${escalateTo ?? 'N/A'}`,
                    ].join('\n'),
                    type: 'task',
                    priority: severity === 'critical' ? 'high' : 'medium',
                    labels: ['blocker', 'impediment', severity],
                    project_key: projectKey,
                },
            });
            // Extract the created ticket key from whichever connector field carries it
            const data = (r as { ok: boolean; data?: Record<string, unknown> }).data;
            ticketKey = typeof data?.['key'] === 'string' ? data['key']
                : typeof data?.['identifier'] === 'string' ? data['identifier']
                : undefined;
            steps.push({
                step:   'create_ticket',
                ok:     r.ok,
                detail: ticketKey ? `Created ${ticketKey}` : r.errorMessage ?? 'no ticket key returned',
            });
        } catch (err) {
            steps.push({ step: 'create_ticket', ok: false, detail: String(err) });
        }
    }

    // ── Step 2: Notify team channel ───────────────────────────────────────────
    const notifyMessage = [
        `${urgencyEmoji} *${priorityLabel} BLOCKER* — ${blockerId}`,
        `> ${description}`,
        `*Impact:* ${impact}`,
        `*Owner:* ${owner ?? 'Unassigned'}`,
        `*Escalation:* ${escalateTo ?? 'Scrum Master to investigate'}`,
        ticketKey ? `*Tracker:* ${ticketKey}` : '',
    ].filter(Boolean).join('\n');

    if (connectorClient && slackChannel) {
        try {
            const r = await connectorClient({
                connectorType: 'slack',
                actionType:    'send_message',
                payload:       { channel_id: slackChannel, text: notifyMessage },
            });
            steps.push({
                step:   'notify_slack',
                ok:     r.ok,
                detail: r.ok ? `Posted to ${slackChannel}` : r.errorMessage,
            });
        } catch (err) {
            steps.push({ step: 'notify_slack', ok: false, detail: String(err) });
        }
    } else if (connectorClient && teamsWebhook) {
        try {
            const r = await connectorClient({
                connectorType: 'teams',
                actionType:    'send_message',
                payload:       { webhook_url: teamsWebhook, text: notifyMessage },
            });
            steps.push({
                step:   'notify_teams',
                ok:     r.ok,
                detail: r.ok ? 'Posted to Teams' : r.errorMessage,
            });
        } catch (err) {
            steps.push({ step: 'notify_teams', ok: false, detail: String(err) });
        }
    }

    // ── Step 3: Email escalation target ───────────────────────────────────────
    if (connectorClient && escalateTo && escalateTo.includes('@')) {
        try {
            const firstName = escalateTo.split('@')[0]?.split('.')?.[0] ?? escalateTo.split('@')[0] ?? '';
            const r = await connectorClient({
                connectorType: 'email',
                actionType:    'send_email',
                payload: {
                    to:      escalateTo,
                    subject: `${urgencyEmoji} ESCALATION REQUIRED: ${shortTitle}`,
                    body:    [
                        `Dear ${firstName},`,
                        '',
                        `I am escalating a ${priorityLabel.toLowerCase()} blocker that requires your immediate attention.`,
                        '',
                        `Blocker ID: ${blockerId}`,
                        `Description: ${description}`,
                        '',
                        `Business Impact: ${impact}`,
                        '',
                        ticketKey ? `Tracker ticket: ${ticketKey}` : '',
                        `Please acknowledge or remediate within ${responseTime}.`,
                        '',
                        'Regards,',
                        'AgentFarm Scrum Master',
                    ].filter((l) => l !== undefined).join('\n'),
                },
            });
            steps.push({
                step:   'email_escalation',
                ok:     r.ok,
                detail: r.ok ? `Sent to ${escalateTo}` : r.errorMessage,
            });
        } catch (err) {
            steps.push({ step: 'email_escalation', ok: false, detail: String(err) });
        }
    }

    // ── Step 4: Ingest risk entry into knowledge base ─────────────────────────
    try {
        const base = gatewayBaseUrl.replace(/\/+$/, '');
        await fetch(`${base}/v1/knowledge-base/ingest`, {
            method: 'POST',
            headers: {
                'content-type':  'application/json',
                Authorization:   `Bearer ${serviceToken}`,
            },
            body: JSON.stringify({
                tenantId,
                botId:      botId ?? '',
                title:      shortTitle,
                sourceType: 'pm_risk_register',
                content: [
                    `Blocker ID: ${blockerId}`,
                    `Description: ${description}`,
                    `Impact: ${impact}`,
                    `Severity: ${severity}`,
                    `Owner: ${owner ?? 'TBD'}`,
                    `Escalated To: ${escalateTo ?? 'N/A'}`,
                    `Ticket: ${ticketKey ?? 'N/A'}`,
                    `Workspace: ${workspaceId}`,
                ].join('\n'),
            }),
            signal: AbortSignal.timeout(10_000),
        });
        steps.push({ step: 'risk_register', ok: true, detail: 'Risk entry persisted to knowledge base' });
    } catch (err) {
        steps.push({ step: 'risk_register', ok: false, detail: String(err) });
    }

    // ── Build report ──────────────────────────────────────────────────────────
    const succeeded = steps.filter((s) => s.ok).length;
    const report = [
        `## Escalation Chain Report — ${blockerId}`,
        '',
        `Severity: **${priorityLabel}** | Steps: ${steps.length} | Succeeded: ${succeeded}/${steps.length}`,
        '',
        '### Actions taken',
        ...steps.map((s) => `- ${s.ok ? '✅' : '❌'} **${s.step}**: ${s.detail ?? ''}`),
        '',
        ticketKey ? `**Tracking ticket:** ${ticketKey}` : '_(No tracking ticket — provide ticket_platform and project_key to enable)_',
        '',
        `Expected resolution within: **${responseTime}**`,
    ].join('\n');

    return { ok: succeeded > 0, steps, ticketKey, report };
}
