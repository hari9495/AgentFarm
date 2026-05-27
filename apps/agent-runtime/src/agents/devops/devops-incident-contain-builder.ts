// ============================================================================
// DEVOPS INCIDENT CONTAINMENT BUILDER
//
// Rapid containment and forensic capture for active incidents:
//
//   Node isolation     — kubectl cordon/drain/uncordon, taint nodes
//   Pod isolation      — NetworkPolicy + label quarantine, pod delete
//   State capture      — kubectl describe + logs + env + heap dump
//   SIEM queries       — Elasticsearch/OpenSearch + Splunk raw search API
//   Falco triage       — read falco_events from pod logs or syslog
//   Audit logs         — k8s audit log queries via Elasticsearch
//
// Destructive operations (drain, delete, cordon) require allow_destructive.
// All builders return string[] (CLI argv) with no shell expansion.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NodeIsolationResult {
    nodeName:    string;
    cordoned:    boolean;
    drainStatus: 'pending' | 'completed' | 'failed' | 'skipped';
    message?:    string;
}

export interface PodForensicCapture {
    podName:      string;
    namespace:    string;
    capturedAt:   string;
    describeOutput?: string;
    logOutput?:   string;
    envOutput?:   string;
    events?:      string;
}

export interface FalcoAlert {
    time:       string;
    rule:       string;
    priority:   'Emergency' | 'Alert' | 'Critical' | 'Error' | 'Warning' | 'Notice' | 'Informational' | 'Debug';
    output:     string;
    tags?:      string[];
    hostname?:  string;
}

export interface SiemEvent {
    timestamp:   string;
    source:      string;
    message:     string;
    severity?:   string;
    host?:       string;
    user?:       string;
    process?:    string;
    raw?:        string;
}

export interface ContainmentAction {
    type:        'cordon' | 'drain' | 'isolate_pod' | 'delete_pod' | 'taint_node' | 'revoke_token';
    target:      string;
    namespace?:  string;
    reason:      string;
    reversible:  boolean;
    rollback?:   string;   // command to reverse
}

// ---------------------------------------------------------------------------
// Node isolation builders
// ---------------------------------------------------------------------------

export function buildKubectlCordonArgs(nodeName: string): string[] {
    return ['kubectl', 'cordon', nodeName];
}

export function buildKubectlUncordonArgs(nodeName: string): string[] {
    return ['kubectl', 'uncordon', nodeName];
}

export function buildKubectlDrainArgs(params: {
    nodeName:          string;
    ignoreDaemonSets?: boolean;
    deleteEmptyDirData?: boolean;
    force?:            boolean;
    gracePeriodSec?:   number;
    podSelector?:      string;
    disableEviction?:  boolean;
}): string[] {
    const args = ['kubectl', 'drain', params.nodeName];
    if (params.ignoreDaemonSets !== false) args.push('--ignore-daemonsets');
    if (params.deleteEmptyDirData) args.push('--delete-emptydir-data');
    if (params.force)              args.push('--force');
    if (params.gracePeriodSec !== undefined) {
        args.push('--grace-period', String(params.gracePeriodSec));
    }
    if (params.podSelector)       args.push('--pod-selector', params.podSelector);
    if (params.disableEviction)   args.push('--disable-eviction=true');
    return args;
}

export function buildKubectlTaintNodeArgs(params: {
    nodeName:  string;
    key:       string;
    value?:    string;
    effect:    'NoSchedule' | 'PreferNoSchedule' | 'NoExecute';
    remove?:   boolean;  // append '-' to remove
}): string[] {
    const taint = params.value
        ? `${params.key}=${params.value}:${params.effect}${params.remove ? '-' : ''}`
        : `${params.key}:${params.effect}${params.remove ? '-' : ''}`;
    return ['kubectl', 'taint', 'node', params.nodeName, taint];
}

export function buildKubectlGetNodeArgs(nodeName?: string): string[] {
    return nodeName
        ? ['kubectl', 'get', 'node', nodeName, '-o', 'json']
        : ['kubectl', 'get', 'nodes', '-o', 'json'];
}

// ---------------------------------------------------------------------------
// Pod isolation (NetworkPolicy + label quarantine)
// ---------------------------------------------------------------------------

/**
 * Apply a "quarantine" label to a pod so it matches a deny-all NetworkPolicy.
 * The caller must also apply the NetworkPolicy YAML returned by buildQuarantineNetworkPolicyYaml.
 */
export function buildKubectlQuarantineLabelArgs(params: {
    podName:    string;
    namespace:  string;
    quarantine: boolean;   // true = add label, false = remove
}): string[] {
    const label = params.quarantine
        ? 'quarantine=true'
        : 'quarantine-';   // trailing '-' removes the label
    return ['kubectl', 'label', 'pod', params.podName,
        '-n', params.namespace,
        label, '--overwrite'];
}

/** Deny-all NetworkPolicy that targets pods with label quarantine=true. */
export function buildQuarantineNetworkPolicyYaml(namespace: string): string {
    return `apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: quarantine-deny-all
  namespace: ${namespace}
  labels:
    incident.response/managed: "true"
spec:
  podSelector:
    matchLabels:
      quarantine: "true"
  policyTypes:
    - Ingress
    - Egress
  ingress: []
  egress: []`;
}

export function buildKubectlDeletePodArgs(params: {
    podName:      string;
    namespace:    string;
    gracePeriod?: number;   // 0 = immediate
    force?:       boolean;
}): string[] {
    const args = ['kubectl', 'delete', 'pod', params.podName, '-n', params.namespace];
    if (params.gracePeriod !== undefined) args.push('--grace-period', String(params.gracePeriod));
    if (params.force) args.push('--force');
    return args;
}

export function buildKubectlDeletePodsByLabelArgs(params: {
    namespace:   string;
    labelSelector: string;   // e.g. 'app=compromised-service'
    gracePeriod?: number;
}): string[] {
    const args = ['kubectl', 'delete', 'pods', '-n', params.namespace, '-l', params.labelSelector];
    if (params.gracePeriod !== undefined) args.push('--grace-period', String(params.gracePeriod));
    return args;
}

// ---------------------------------------------------------------------------
// Pod forensic state capture
// ---------------------------------------------------------------------------

export function buildKubectlDescribePodArgs(podName: string, namespace: string): string[] {
    return ['kubectl', 'describe', 'pod', podName, '-n', namespace];
}

export function buildKubectlLogsArgs(params: {
    podName:      string;
    namespace:    string;
    container?:   string;
    previous?:    boolean;    // get previous container logs (for crash loops)
    tailLines?:   number;
    sinceTime?:   string;     // RFC3339
    timestamps?:  boolean;
}): string[] {
    const args = ['kubectl', 'logs', params.podName, '-n', params.namespace];
    if (params.container)  args.push('-c', params.container);
    if (params.previous)   args.push('--previous');
    if (params.tailLines !== undefined) args.push('--tail', String(params.tailLines));
    if (params.sinceTime)  args.push('--since-time', params.sinceTime);
    if (params.timestamps) args.push('--timestamps');
    return args;
}

export function buildKubectlExecEnvArgs(podName: string, namespace: string, container?: string): string[] {
    const args = ['kubectl', 'exec', podName, '-n', namespace];
    if (container) args.push('-c', container);
    args.push('--', 'env');
    return args;
}

export function buildKubectlGetEventsArgs(params: {
    namespace:    string;
    involvedObject?: string;   // pod/service name
    fieldSelector?: string;
    sortBy?:       string;     // e.g. '.lastTimestamp'
}): string[] {
    const args = ['kubectl', 'get', 'events', '-n', params.namespace, '-o', 'json'];
    const selectors: string[] = [];
    if (params.involvedObject) {
        selectors.push(`involvedObject.name=${params.involvedObject}`);
    }
    if (params.fieldSelector) {
        selectors.push(params.fieldSelector);
    }
    if (selectors.length) args.push('--field-selector', selectors.join(','));
    if (params.sortBy)    args.push('--sort-by', params.sortBy);
    return args;
}

/** Capture jstack/thread dump from a Java process inside a pod. */
export function buildJstackCaptureArgs(params: {
    podName:    string;
    namespace:  string;
    container?: string;
    pid?:       number;      // default: find first java process
}): string[] {
    const pid   = params.pid ? String(params.pid) : '$(pgrep java | head -1)';
    const cmd   = `jstack ${pid}`;
    const args  = ['kubectl', 'exec', params.podName, '-n', params.namespace];
    if (params.container) args.push('-c', params.container);
    args.push('--', 'sh', '-c', cmd);
    return args;
}

/** Capture /proc/net/tcp for open connections inside a pod. */
export function buildProcNetTcpArgs(params: {
    podName:    string;
    namespace:  string;
    container?: string;
}): string[] {
    const args = ['kubectl', 'exec', params.podName, '-n', params.namespace];
    if (params.container) args.push('-c', params.container);
    args.push('--', 'cat', '/proc/net/tcp');
    return args;
}

// ---------------------------------------------------------------------------
// SIEM query builders (Elasticsearch / OpenSearch)
// ---------------------------------------------------------------------------

export function buildElasticSiemQueryArgs(params: {
    url:         string;
    index:       string;
    query:       string;    // Lucene / KQL query string
    from?:       string;    // ISO
    to?:         string;
    size?:       number;
    apiKey?:     string;
    basicAuth?:  string;    // user:pass
}): string[] {
    const body = JSON.stringify({
        size:  params.size ?? 100,
        sort:  [{ '@timestamp': { order: 'desc' } }],
        query: {
            bool: {
                must:   [{ query_string: { query: params.query } }],
                filter: (params.from || params.to)
                    ? [{ range: { '@timestamp': {
                        ...(params.from ? { gte: params.from } : {}),
                        ...(params.to   ? { lte: params.to   } : {}),
                      } } }]
                    : [],
            },
        },
    });
    const args = ['curl', '-s', '-X', 'POST', `${params.url}/${params.index}/_search`,
        '-H', 'Content-Type: application/json',
        '-d', body];
    if (params.apiKey)    args.push('-H', `Authorization: ApiKey ${params.apiKey}`);
    if (params.basicAuth) args.push('-u', params.basicAuth);
    return args;
}

/** Splunk raw search via REST API. Returns job sid. */
export function buildSplunkSearchArgs(params: {
    splunkUrl:    string;
    search:       string;   // SPL search string, e.g. 'index=main source=syslog | head 100'
    username:     string;
    password:     string;
    earliestTime?: string;  // e.g. '-1h', '2024-01-01T00:00:00'
    latestTime?:  string;
    maxCount?:    number;
}): string[] {
    const form: Record<string, string> = {
        search:       params.search.startsWith('search ') ? params.search : `search ${params.search}`,
        output_mode:  'json',
        count:        String(params.maxCount ?? 100),
    };
    if (params.earliestTime) form['earliest_time'] = params.earliestTime;
    if (params.latestTime)   form['latest_time']   = params.latestTime;
    const formData = Object.entries(form).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
    return ['curl', '-s', '-k', '-u', `${params.username}:${params.password}`,
        '-d', formData,
        `${params.splunkUrl}/services/search/jobs/export`];
}

/** Get Splunk search results for a running job. */
export function buildSplunkGetResultsArgs(params: {
    splunkUrl: string;
    sid:       string;
    username:  string;
    password:  string;
    count?:    number;
}): string[] {
    return ['curl', '-s', '-k', '-u', `${params.username}:${params.password}`,
        `${params.splunkUrl}/services/search/jobs/${params.sid}/results?output_mode=json&count=${params.count ?? 100}`];
}

// ---------------------------------------------------------------------------
// Falco alert parsing
// ---------------------------------------------------------------------------

export function buildFalcoLogsArgs(params: {
    podName:    string;
    namespace?: string;
    tailLines?: number;
    sinceTime?: string;
}): string[] {
    return buildKubectlLogsArgs({
        podName:    params.podName,
        namespace:  params.namespace ?? 'falco',
        tailLines:  params.tailLines ?? 200,
        sinceTime:  params.sinceTime,
        timestamps: true,
    });
}

export function parseFalcoAlerts(raw: string): FalcoAlert[] {
    const alerts: FalcoAlert[] = [];
    for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        // Falco log line: "<timestamp> <priority> <rule>: ..."
        // or JSON format if falco configured with json_output: true
        try {
            const j = JSON.parse(trimmed) as Record<string, unknown>;
            if (j['rule']) {
                alerts.push({
                    time:     String(j['time'] ?? j['output_fields'] ? '' : new Date().toISOString()),
                    rule:     String(j['rule']     ?? ''),
                    priority: (j['priority'] as FalcoAlert['priority']) ?? 'Warning',
                    output:   String(j['output']   ?? ''),
                    tags:     Array.isArray(j['tags']) ? j['tags'].map(String) : undefined,
                    hostname: j['hostname'] ? String(j['hostname']) : undefined,
                });
            }
        } catch {
            // text format: try simple regex
            const m = trimmed.match(/^(\S+\s+\S+)\s+(\w+)\s+(.+?): (.+)$/);
            if (m) {
                alerts.push({
                    time:     m[1],
                    priority: m[2] as FalcoAlert['priority'],
                    rule:     m[3],
                    output:   m[4],
                });
            }
        }
    }
    return alerts;
}

// ---------------------------------------------------------------------------
// SIEM event parsers
// ---------------------------------------------------------------------------

export function parseElasticSiemResults(raw: string): SiemEvent[] {
    try {
        const j = JSON.parse(raw) as {
            hits?: { hits?: Array<{ _source?: Record<string, unknown> }> };
        };
        return (j.hits?.hits ?? []).map((h) => {
            const s = h._source ?? {};
            return {
                timestamp: String(s['@timestamp'] ?? s['timestamp'] ?? ''),
                source:    String(s['agent']      ?? s['source']    ?? ''),
                message:   String(s['message']    ?? ''),
                severity:  s['log.level'] ? String(s['log.level']) : undefined,
                host:      s['host']  ? String((s['host'] as Record<string, unknown>)['name'] ?? s['host']) : undefined,
                user:      s['user']  ? String((s['user'] as Record<string, unknown>)['name'] ?? '') : undefined,
                process:   s['process'] ? String((s['process'] as Record<string, unknown>)['name'] ?? '') : undefined,
                raw:       JSON.stringify(s).slice(0, 500),
            };
        });
    } catch {
        return [];
    }
}

// ---------------------------------------------------------------------------
// LLM prompt
// ---------------------------------------------------------------------------

export function buildIncidentContainmentPrompt(params: {
    description:    string;
    affectedPods?:  string[];
    affectedNodes?: string[];
    falcoAlerts?:   FalcoAlert[];
    siemEvents?:    SiemEvent[];
    podDescribe?:   string;
    podLogs?:       string;
    k8sEvents?:     string;
    severity?:      'p1' | 'p2' | 'p3';
}): string {
    const falcoSummary = params.falcoAlerts?.length
        ? params.falcoAlerts.slice(0, 10).map((a) => `  [${a.priority}] ${a.rule}: ${a.output}`).join('\n')
        : '';
    const siemSummary = params.siemEvents?.length
        ? params.siemEvents.slice(0, 10).map((e) => `  ${e.timestamp} [${e.severity ?? '?'}] ${e.message}`).join('\n')
        : '';
    return [
        `You are a senior SRE and incident responder. A ${params.severity ?? 'p2'} incident is active.`,
        ``,
        `Incident description: ${params.description}`,
        params.affectedPods?.length  ? `Affected pods: ${params.affectedPods.join(', ')}`   : '',
        params.affectedNodes?.length ? `Affected nodes: ${params.affectedNodes.join(', ')}` : '',
        falcoSummary ? `\nFalco security alerts:\n${falcoSummary}` : '',
        siemSummary  ? `\nSIEM events:\n${siemSummary}`           : '',
        params.podLogs     ? `\nPod logs (tail):\n${params.podLogs.slice(0, 1500)}`      : '',
        params.podDescribe ? `\nPod describe:\n${params.podDescribe.slice(0, 1000)}`     : '',
        params.k8sEvents   ? `\nKubernetes events:\n${params.k8sEvents.slice(0, 1000)}`  : '',
        ``,
        `Provide:`,
        `  1. Immediate containment actions (blast-radius minimization)`,
        `  2. Root cause hypothesis`,
        `  3. Evidence collection commands`,
        `  4. Remediation steps`,
        `  5. Post-incident cleanup (uncordon, remove NetworkPolicy, etc.)`,
        ``,
        `Return JSON:`,
        `{`,
        `  "severity": "p1"|"p2"|"p3",`,
        `  "root_cause_hypothesis": string,`,
        `  "containment_actions": [{ "description": string, "command": string, "reversible": boolean, "rollback": string | null }],`,
        `  "evidence_commands": [{ "description": string, "command": string }],`,
        `  "remediation_steps": [{ "description": string, "command": string | null }],`,
        `  "cleanup_commands": string[]`,
        `}`,
        `Return ONLY the JSON object — no markdown fences.`,
    ].filter(Boolean).join('\n');
}

export function parseIncidentContainmentPlan(raw: string): {
    severity:                string;
    rootCauseHypothesis:     string;
    containmentActions:      ContainmentAction[];
    evidenceCommands:        Array<{ description: string; command: string }>;
    remediationSteps:        Array<{ description: string; command: string | null }>;
    cleanupCommands:         string[];
} | null {
    try {
        const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
        const j = JSON.parse(cleaned) as Record<string, unknown>;
        return {
            severity:            String(j['severity']              ?? 'p2'),
            rootCauseHypothesis: String(j['root_cause_hypothesis'] ?? ''),
            containmentActions:  Array.isArray(j['containment_actions'])
                ? (j['containment_actions'] as Array<Record<string, unknown>>).map((a) => ({
                    type:       'isolate_pod' as ContainmentAction['type'],
                    target:     String(a['description'] ?? ''),
                    reason:     String(a['description'] ?? ''),
                    reversible: Boolean(a['reversible'] ?? true),
                    rollback:   a['rollback'] ? String(a['rollback']) : undefined,
                  }))
                : [],
            evidenceCommands: Array.isArray(j['evidence_commands'])
                ? (j['evidence_commands'] as Array<Record<string, unknown>>).map((c) => ({
                    description: String(c['description'] ?? ''),
                    command:     String(c['command']     ?? ''),
                  }))
                : [],
            remediationSteps: Array.isArray(j['remediation_steps'])
                ? (j['remediation_steps'] as Array<Record<string, unknown>>).map((s) => ({
                    description: String(s['description'] ?? ''),
                    command:     s['command'] ? String(s['command']) : null,
                  }))
                : [],
            cleanupCommands: Array.isArray(j['cleanup_commands']) ? j['cleanup_commands'].map(String) : [],
        };
    } catch {
        return null;
    }
}

export function formatIncidentReport(params: {
    description:   string;
    plan?:         ReturnType<typeof parseIncidentContainmentPlan>;
    falcoAlerts?:  FalcoAlert[];
    actionsToken?: number;
}): string {
    const lines = [
        `Incident Containment Report`,
        `Description: ${params.description}`,
    ];
    if (params.plan) {
        lines.push(`Severity:  ${params.plan.severity.toUpperCase()}`);
        lines.push(`Hypothesis: ${params.plan.rootCauseHypothesis}`);
        if (params.plan.containmentActions.length) {
            lines.push(``, `Containment Actions:`);
            params.plan.containmentActions.forEach((a, i) => {
                lines.push(`  ${i + 1}. ${a.target}${a.reversible ? ' (reversible)' : ' ⚠ IRREVERSIBLE'}`);
                if (a.rollback) lines.push(`     Rollback: ${a.rollback}`);
            });
        }
        if (params.plan.remediationSteps.length) {
            lines.push(``, `Remediation Steps:`);
            params.plan.remediationSteps.forEach((s, i) => {
                lines.push(`  ${i + 1}. ${s.description}`);
                if (s.command) lines.push(`     > ${s.command}`);
            });
        }
        if (params.plan.cleanupCommands.length) {
            lines.push(``, `Cleanup (post-incident):`);
            params.plan.cleanupCommands.forEach((c) => lines.push(`  > ${c}`));
        }
    }
    if (params.falcoAlerts?.length) {
        const critical = params.falcoAlerts.filter((a) =>
            ['Emergency', 'Alert', 'Critical', 'Error'].includes(a.priority));
        if (critical.length) {
            lines.push(``, `Critical Falco Alerts: ${critical.length}`);
            critical.slice(0, 5).forEach((a) => lines.push(`  [${a.priority}] ${a.rule}`));
        }
    }
    return lines.join('\n');
}
