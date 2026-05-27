// ============================================================================
// DEVOPS ALERT WEBHOOK BUILDER
//
// Normalises inbound alert webhook payloads from four platforms into a single
// AlertEvent type and maps each alert to a DevOps agent task specification.
//
// Supported sources:
//   • PagerDuty  — messages API v2 webhook (type: incident.*  /  alert.*)
//   • OpsGenie   — alert webhook v2
//   • Alertmanager (Prometheus) — webhook receiver payload
//   • CloudWatch  — SNS-wrapped CloudWatch Alarm notification
//   • Datadog     — event-based webhook
//
// Usage (pseudo-code for a webhook receiver):
//
//   import { normalizeAlertPayload, buildTaskFromAlert } from './devops-alert-webhook-builder.js';
//   import { handleDevopsAction } from './devops-action-handler.js';
//
//   app.post('/webhook/:source', async (req, res) => {
//       const source = req.params.source as AlertSource;
//       const events = normalizeAlertPayload(req.body, source);
//       for (const event of events) {
//           const task = buildTaskFromAlert(event);
//           await handleDevopsAction({ actionType: task.actionType as any, payload: task.payload, ... });
//       }
//       res.status(204).end();
//   });
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AlertSeverity = 'critical' | 'high' | 'warning' | 'info' | 'unknown';
export type AlertSource   = 'pagerduty' | 'opsgenie' | 'alertmanager' | 'cloudwatch' | 'datadog' | 'unknown';
export type AlertStatus   = 'firing' | 'resolved' | 'acknowledged' | 'unknown';

/** Normalised alert event — source-independent. */
export interface AlertEvent {
    /** Unique alert identifier derived from the source payload. */
    id:           string;
    source:       AlertSource;
    status:       AlertStatus;
    severity:     AlertSeverity;
    /** Short title / alert name. */
    title:        string;
    /** Longer description or runbook URL. */
    description:  string;
    /** Affected service / team label. */
    service?:     string;
    /** Environment label e.g. "production", "staging". */
    environment?: string;
    /** All key-value labels from the source payload. */
    labels:       Record<string, string>;
    /** Annotations / additional metadata. */
    annotations:  Record<string, string>;
    startsAt?:    string;
    endsAt?:      string;
    /** Link to the source UI. */
    generatorURL?: string;
    /** The original raw payload for debugging. */
    rawPayload:   unknown;
}

/**
 * Task specification that the webhook receiver should submit to the
 * DevOps action handler.
 */
export interface AlertTaskSpec {
    actionType:  string;
    payload:     Record<string, unknown>;
    /** Suggested task priority for the orchestrator. */
    priority:    'p1' | 'p2' | 'p3' | 'p4';
    title:       string;
    description: string;
}

// ---------------------------------------------------------------------------
// Severity helpers
// ---------------------------------------------------------------------------

function normalizeSeverity(raw?: string): AlertSeverity {
    if (!raw) return 'unknown';
    const s = raw.toLowerCase();
    if (['critical', 'p1', 'sev1', 'sev-1', 'fatal', 'emergency'].includes(s)) return 'critical';
    if (['high', 'p2', 'sev2', 'sev-2', 'error'].includes(s))                   return 'high';
    if (['warning', 'warn', 'p3', 'sev3', 'sev-3', 'medium'].includes(s))        return 'warning';
    if (['info', 'p4', 'sev4', 'low', 'informational'].includes(s))              return 'info';
    return 'unknown';
}

function severityToPriority(sev: AlertSeverity): AlertTaskSpec['priority'] {
    if (sev === 'critical') return 'p1';
    if (sev === 'high')     return 'p2';
    if (sev === 'warning')  return 'p3';
    return 'p4';
}

function coerceStr(v: unknown): string {
    return typeof v === 'string' ? v : '';
}

function coerceRecord(v: unknown): Record<string, string> {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
        const out: Record<string, string> = {};
        for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
            out[k] = String(val);
        }
        return out;
    }
    return {};
}

// ---------------------------------------------------------------------------
// PagerDuty parser
// ---------------------------------------------------------------------------

/**
 * Parses a PagerDuty webhook v3 / messages API v2 payload.
 * Handles event types: incident.triggered, incident.acknowledged,
 * incident.resolved, alert.triggered.
 */
export function parsePagerDutyWebhook(body: unknown): AlertEvent[] {
    if (!body || typeof body !== 'object') return [];
    const b = body as Record<string, unknown>;

    // v3 format: { messages: [{ event: { id, event_type, data } }] }
    const messages = Array.isArray(b['messages']) ? (b['messages'] as unknown[]) : [];
    if (messages.length > 0) {
        return messages.flatMap((msg) => {
            if (!msg || typeof msg !== 'object') return [];
            const m       = msg as Record<string, unknown>;
            const event   = (m['event'] ?? m) as Record<string, unknown>;
            const data    = (event['data'] ?? {}) as Record<string, unknown>;
            const type    = coerceStr(event['event_type'] ?? event['type']);

            let status: AlertStatus = 'unknown';
            if (type.includes('trigger'))         status = 'firing';
            else if (type.includes('resolve'))    status = 'resolved';
            else if (type.includes('acknowledge'))status = 'acknowledged';

            const sev  = normalizeSeverity(coerceStr((data['urgency'] ?? data['severity'])));
            const svc  = coerceStr((data['service'] as Record<string,unknown>)?.['name'] ?? (data['service']));

            return [{
                id:          coerceStr(event['id'] ?? data['id'] ?? data['incident_number']),
                source:      'pagerduty' as AlertSource,
                status,
                severity:    sev,
                title:       coerceStr(data['title'] ?? data['summary'] ?? type),
                description: coerceStr(data['body']?.toString() ?? data['html_url'] ?? ''),
                service:     svc || undefined,
                environment: coerceStr(data['escalation_policy']?.toString()) || undefined,
                labels:      coerceRecord(data['labels']),
                annotations: {},
                startsAt:    coerceStr(data['created_at'] ?? event['created_at']) || undefined,
                generatorURL: coerceStr(data['html_url']) || undefined,
                rawPayload:  body,
            } satisfies AlertEvent];
        });
    }

    // v2 simple format
    const incident = (b['incident'] ?? b) as Record<string, unknown>;
    const type      = coerceStr(b['event_type'] ?? b['messages_count'] ?? '');
    return [{
        id:          coerceStr(incident['id'] ?? incident['incident_number']),
        source:      'pagerduty',
        status:      type.includes('resolve') ? 'resolved' : 'firing',
        severity:    normalizeSeverity(coerceStr(incident['urgency'] ?? incident['severity'])),
        title:       coerceStr(incident['title'] ?? incident['summary']),
        description: coerceStr(incident['body']?.toString() ?? ''),
        service:     coerceStr((incident['service'] as Record<string,unknown>)?.['name']) || undefined,
        labels:      {},
        annotations: {},
        generatorURL: coerceStr(incident['html_url']) || undefined,
        rawPayload:  body,
    }];
}

// ---------------------------------------------------------------------------
// OpsGenie parser
// ---------------------------------------------------------------------------

/**
 * Parses an OpsGenie alert webhook v2 payload.
 * Format: { action, alert: { alertId, message, priority, ... } }
 */
export function parseOpsGenieWebhook(body: unknown): AlertEvent[] {
    if (!body || typeof body !== 'object') return [];
    const b      = body as Record<string, unknown>;
    const alert  = (b['alert'] ?? b) as Record<string, unknown>;
    const action = coerceStr(b['action']);

    let status: AlertStatus = 'firing';
    if (action === 'Resolve' || action === 'resolve')         status = 'resolved';
    else if (action === 'Acknowledge' || action === 'acknowledge') status = 'acknowledged';

    const labelsRaw = coerceRecord(alert['details']);
    const env       = coerceStr(alert['tags']?.toString() ?? labelsRaw['environment']) || undefined;

    return [{
        id:          coerceStr(alert['alertId'] ?? alert['id']),
        source:      'opsgenie',
        status,
        severity:    normalizeSeverity(coerceStr(alert['priority'] ?? alert['severity'])),
        title:       coerceStr(alert['message'] ?? alert['name']),
        description: coerceStr(alert['description'] ?? alert['message']),
        service:     coerceStr(alert['source'] ?? labelsRaw['service']) || undefined,
        environment: env,
        labels:      labelsRaw,
        annotations: coerceRecord(alert['extra']),
        startsAt:    coerceStr(alert['createdAt'] ?? alert['created_at']) || undefined,
        generatorURL: coerceStr(alert['url']) || undefined,
        rawPayload:  body,
    }];
}

// ---------------------------------------------------------------------------
// Alertmanager parser
// ---------------------------------------------------------------------------

/**
 * Parses a Prometheus Alertmanager webhook receiver payload.
 * Format: { version, status, alerts: [{ status, labels, annotations, ... }] }
 */
export function parseAlertmanagerWebhook(body: unknown): AlertEvent[] {
    if (!body || typeof body !== 'object') return [];
    const b      = body as Record<string, unknown>;
    const alerts = Array.isArray(b['alerts']) ? (b['alerts'] as unknown[]) : [b];

    return alerts.flatMap((raw) => {
        if (!raw || typeof raw !== 'object') return [];
        const a           = raw as Record<string, unknown>;
        const labels      = coerceRecord(a['labels']);
        const annotations = coerceRecord(a['annotations']);

        const statusRaw = coerceStr(a['status'] ?? b['status']);
        let status: AlertStatus = 'unknown';
        if (statusRaw === 'firing')   status = 'firing';
        if (statusRaw === 'resolved') status = 'resolved';

        const alertName = labels['alertname'] ?? coerceStr(a['name'] ?? 'unknown_alert');

        return [{
            id:          coerceStr(a['fingerprint'] ?? alertName),
            source:      'alertmanager' as AlertSource,
            status,
            severity:    normalizeSeverity(labels['severity'] ?? labels['priority']),
            title:       alertName,
            description: annotations['description'] ?? annotations['summary'] ?? alertName,
            service:     labels['service'] ?? labels['job'] ?? undefined,
            environment: labels['environment'] ?? labels['env'] ?? undefined,
            labels,
            annotations,
            startsAt:    coerceStr(a['startsAt']) || undefined,
            endsAt:      coerceStr(a['endsAt'])   || undefined,
            generatorURL: coerceStr(a['generatorURL']) || undefined,
            rawPayload:  raw,
        } satisfies AlertEvent];
    });
}

// ---------------------------------------------------------------------------
// CloudWatch parser
// ---------------------------------------------------------------------------

/**
 * Parses a CloudWatch Alarm notification delivered via SNS.
 * Format: { AlarmName, NewStateValue, AlarmDescription, ... }
 * Also handles SNS-wrapper: { Type: "Notification", Message: "<json>" }
 */
export function parseCloudWatchAlarm(body: unknown): AlertEvent[] {
    if (!body || typeof body !== 'object') return [];
    const b = body as Record<string, unknown>;

    // Unwrap SNS envelope
    let inner: Record<string, unknown> = b;
    if (b['Type'] === 'Notification' && typeof b['Message'] === 'string') {
        try { inner = JSON.parse(b['Message']); } catch { /* use body as-is */ }
    }

    const state     = coerceStr(inner['NewStateValue']);
    let status: AlertStatus = 'firing';
    if (state === 'OK')                status = 'resolved';
    else if (state === 'INSUFFICIENT_DATA') status = 'unknown';

    const dimRaw = Array.isArray(inner['Trigger']?.valueOf?.())
        ? {}
        : coerceRecord((inner['Trigger'] as Record<string,unknown>)?.['Dimensions']);

    return [{
        id:          coerceStr(inner['AlarmArn'] ?? inner['AlarmName']),
        source:      'cloudwatch',
        status,
        severity:    normalizeSeverity(coerceStr(inner['NewStateValue'])),
        title:       coerceStr(inner['AlarmName']),
        description: coerceStr(inner['AlarmDescription'] ?? inner['NewStateReason']),
        service:     coerceStr(inner['Namespace']) || undefined,
        environment: coerceStr(inner['Region'] ?? (inner as any)['AWSAccountId']) || undefined,
        labels:      { ...dimRaw, namespace: coerceStr(inner['Namespace']) },
        annotations: { reason: coerceStr(inner['NewStateReason']) },
        startsAt:    coerceStr(inner['StateChangeTime']) || undefined,
        generatorURL: coerceStr(inner['AlarmArn']) || undefined,
        rawPayload:  body,
    }];
}

// ---------------------------------------------------------------------------
// Datadog parser
// ---------------------------------------------------------------------------

/**
 * Parses a Datadog event webhook.
 * Format: { id, title, text, alert_type, date_happened, ... }
 */
export function parseDatadogEvent(body: unknown): AlertEvent[] {
    if (!body || typeof body !== 'object') return [];
    const b     = body as Record<string, unknown>;
    const type  = coerceStr(b['alert_type'] ?? b['event_type']);

    let status: AlertStatus = 'firing';
    if (type === 'success' || type.includes('resolved')) status = 'resolved';

    const tags: Record<string, string> = {};
    if (Array.isArray(b['tags'])) {
        for (const t of b['tags'] as string[]) {
            const [k, ...v] = t.split(':');
            if (k) tags[k] = v.join(':');
        }
    }

    return [{
        id:          coerceStr(b['id'] ?? b['alert_id']),
        source:      'datadog',
        status,
        severity:    normalizeSeverity(coerceStr(b['priority'] ?? b['alert_type'])),
        title:       coerceStr(b['title']),
        description: coerceStr(b['text'] ?? b['msg_text'] ?? ''),
        service:     (tags['service'] ?? coerceStr(b['source_type_name'])) || undefined,
        environment: tags['env'] ?? undefined,
        labels:      tags,
        annotations: { event_type: type },
        startsAt:    b['date_happened'] ? new Date(Number(b['date_happened']) * 1000).toISOString() : undefined,
        generatorURL: coerceStr(b['url']) || undefined,
        rawPayload:  body,
    }];
}

// ---------------------------------------------------------------------------
// Normalisation entry point
// ---------------------------------------------------------------------------

/**
 * Normalises a raw webhook body from the given source into AlertEvent[].
 * Pass `source = 'unknown'` to attempt auto-detection.
 */
export function normalizeAlertPayload(body: unknown, source: AlertSource): AlertEvent[] {
    if (source === 'unknown') {
        // Auto-detect
        if (!body || typeof body !== 'object') return [];
        const b = body as Record<string, unknown>;
        if (b['messages'] || b['incident'])                           return parsePagerDutyWebhook(body);
        if (b['action'] && b['alert'])                                return parseOpsGenieWebhook(body);
        if (b['alerts'] || (b['status'] && b['externalURL']))         return parseAlertmanagerWebhook(body);
        if (b['AlarmName'] || b['Type'] === 'Notification')           return parseCloudWatchAlarm(body);
        if (b['alert_type'] || b['date_happened'])                    return parseDatadogEvent(body);
        return [];
    }
    switch (source) {
        case 'pagerduty':    return parsePagerDutyWebhook(body);
        case 'opsgenie':     return parseOpsGenieWebhook(body);
        case 'alertmanager': return parseAlertmanagerWebhook(body);
        case 'cloudwatch':   return parseCloudWatchAlarm(body);
        case 'datadog':      return parseDatadogEvent(body);
        default:             return [];
    }
}

// ---------------------------------------------------------------------------
// Alert → Task mapping
// ---------------------------------------------------------------------------

/**
 * Maps an AlertEvent to a DevOps agent task specification.
 *
 * Mapping strategy:
 *   • critical/high + Kubernetes signals → workspace_devops_incident_contain
 *   • critical/high + CI/CD signals      → workspace_devops_pipeline_status
 *   • any + resolved                     → workspace_devops_standup_report
 *   • default                            → workspace_devops_incident_triage
 */
export function buildTaskFromAlert(event: AlertEvent): AlertTaskSpec {
    const priority    = severityToPriority(event.severity);
    const isK8s       = Object.values(event.labels).some((v) =>
        ['pod', 'namespace', 'node', 'container', 'deployment'].includes(v.toLowerCase()),
    ) || event.title.toLowerCase().includes('pod') || event.title.toLowerCase().includes('node');

    const isCiCd      = event.service?.toLowerCase().includes('pipeline') ||
                        event.title.toLowerCase().includes('pipeline') ||
                        event.title.toLowerCase().includes('build') ||
                        event.title.toLowerCase().includes('deploy');

    if (event.status === 'resolved') {
        return {
            actionType:  'workspace_devops_standup_report',
            priority:    'p4',
            title:       `Resolved: ${event.title}`,
            description: `Alert ${event.id} resolved — generate summary.`,
            payload: {
                incident_id:  event.id,
                service:      event.service,
                environment:  event.environment,
                resolved_at:  event.endsAt ?? new Date().toISOString(),
                description:  event.description,
            },
        };
    }

    if ((event.severity === 'critical' || event.severity === 'high') && isK8s) {
        return {
            actionType:  'workspace_devops_incident_contain',
            priority,
            title:       `Incident: ${event.title}`,
            description: `High-severity K8s alert — begin containment.`,
            payload: {
                action:      'analyze',
                description: event.description || event.title,
                service:     event.service,
                environment: event.environment,
                severity:    event.severity === 'critical' ? 'p1' : 'p2',
                labels:      event.labels,
                source:      event.source,
                alert_id:    event.id,
            },
        };
    }

    if (isCiCd) {
        return {
            actionType:  'workspace_devops_pipeline_status',
            priority,
            title:       `Pipeline Alert: ${event.title}`,
            description: `CI/CD pipeline alert detected — check status.`,
            payload: {
                description: event.description || event.title,
                service:     event.service,
                environment: event.environment,
                alert_id:    event.id,
            },
        };
    }

    // Default: general incident triage
    return {
        actionType:  'workspace_devops_incident_triage',
        priority,
        title:       event.title,
        description: event.description || event.title,
        payload: {
            description:  event.description || event.title,
            service:      event.service,
            environment:  event.environment,
            severity:     event.severity,
            source:       event.source,
            alert_id:     event.id,
            labels:       event.labels,
            annotations:  event.annotations,
            starts_at:    event.startsAt,
            generator_url: event.generatorURL,
        },
    };
}

// ---------------------------------------------------------------------------
// Webhook server reference implementation (not executed — for documentation)
// ---------------------------------------------------------------------------

/**
 * Reference webhook handler showing how to wire normalizeAlertPayload and
 * buildTaskFromAlert into an Express-style route.
 *
 * ```typescript
 * import express from 'express';
 * import { normalizeAlertPayload, buildTaskFromAlert, AlertSource } from './devops-alert-webhook-builder.js';
 * import { handleDevopsAction, DevopsActionType } from './devops-action-handler.js';
 *
 * const app = express();
 * app.use(express.json());
 *
 * app.post('/alerts/webhook/:source', async (req, res) => {
 *     const source = req.params.source as AlertSource;
 *     const events = normalizeAlertPayload(req.body, source);
 *     const results = [];
 *     for (const event of events) {
 *         const task = buildTaskFromAlert(event);
 *         const result = await handleDevopsAction({
 *             actionType:   task.actionType as DevopsActionType,
 *             tenantId:     req.headers['x-tenant-id'] as string,
 *             botId:        'alert-webhook-bot',
 *             taskId:       `alert-${event.id}-${Date.now()}`,
 *             payload:      task.payload,
 *             workspaceDir: process.cwd(),
 *             executeAction: async () => ({ ok: false, output: '' }),
 *             runCommand:    undefined,
 *             callLlm:       undefined,
 *         });
 *         results.push({ event: event.id, ok: result.ok });
 *     }
 *     res.json({ processed: results.length, results });
 * });
 * ```
 */
export const WEBHOOK_REFERENCE_IMPL = '// See JSDoc above for reference implementation';
