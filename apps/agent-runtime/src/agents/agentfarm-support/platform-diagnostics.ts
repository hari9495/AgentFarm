/**
 * AgentFarm Support Agent — Platform Diagnostics
 *
 * Reads the platform's own internals for a given tenant to build a structured
 * diagnosis report. All queries are scoped to tenantId — never reads across
 * tenant boundaries.
 *
 * All data sources run in parallel via buildDiagnosisReport(). Each source
 * has its own 5-second timeout and degrades gracefully — a timeout means that
 * source is skipped and noted in the report rather than failing the whole
 * diagnosis.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TaskLogEntry {
    id: string;
    status: string;
    actionType: string;
    errorMessage?: string;
    createdAt: string;
    completedAt?: string;
}

export interface OtelSpan {
    traceId: string;
    spanId: string;
    operationName: string;
    status: string;
    durationMs: number;
    attributes: Record<string, string>;
    startedAt: string;
}

export interface ConnectorHealthEntry {
    connectorId: string;
    connectorType: string;
    status: 'healthy' | 'degraded' | 'error' | 'needs_reconnect';
    lastCheckedAt: string;
    errorMessage?: string;
}

export interface ApprovalQueueState {
    pendingCount: number;
    isJammed: boolean;
    oldestPendingAgeMinutes: number;
    jamReason?: string;
}

export interface BillingState {
    subscriptionStatus: string;
    budgetPolicyEnabled: boolean;
    dailyUsagePercent: number;
    monthlyUsagePercent: number;
    isThrottled: boolean;
    isHardStopped: boolean;
}

export interface ProvisioningState {
    runningJobs: number;
    stuckJobs: Array<{ jobId: string; status: string; ageMinutes: number }>;
    lastCompletedAt?: string;
}

export interface AuditLogEntry {
    id: string;
    action: string;
    actorId: string;
    resourceType: string;
    resourceId: string;
    createdAt: string;
}

export type DiagnosisSourceStatus = 'ok' | 'timeout' | 'error' | 'unavailable';

export interface DiagnosisReport {
    tenantId: string;
    generatedAt: string;
    taskLogs: { status: DiagnosisSourceStatus; entries: TaskLogEntry[] };
    otelTraces: { status: DiagnosisSourceStatus; spans: OtelSpan[] };
    connectorHealth: { status: DiagnosisSourceStatus; connectors: ConnectorHealthEntry[] };
    approvalQueue: { status: DiagnosisSourceStatus; state?: ApprovalQueueState };
    billing: { status: DiagnosisSourceStatus; state?: BillingState };
    provisioning: { status: DiagnosisSourceStatus; state?: ProvisioningState };
    auditLog: { status: DiagnosisSourceStatus; entries: AuditLogEntry[] };
    summary: string[];
}

// ---------------------------------------------------------------------------
// Dependencies injected at call time — no globals, easier to test
// ---------------------------------------------------------------------------

export interface DiagnosticsDeps {
    gatewayBaseUrl: string;
    serviceToken: string;
    timeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STUCK_JOB_THRESHOLD_MS = 30 * 60 * 1000; // 30 min
const APPROVAL_JAM_COUNT = 10;
const APPROVAL_JAM_AGE_MIN = 30;
const SOURCE_TIMEOUT_MS = 5_000;

async function withTimeout<T>(
    label: string,
    fn: () => Promise<T>,
    timeoutMs: number,
): Promise<{ status: DiagnosisSourceStatus; value?: T }> {
    try {
        const value = await Promise.race([
            fn(),
            new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error(`timeout:${label}`)), timeoutMs),
            ),
        ]);
        return { status: 'ok', value };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { status: msg.startsWith('timeout:') ? 'timeout' : 'error' };
    }
}

async function apiGet<T>(url: string, token: string, timeoutMs: number): Promise<T> {
    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Individual data-source readers
// ---------------------------------------------------------------------------

export async function readTaskLogs(
    tenantId: string,
    timeWindowHours: number,
    deps: DiagnosticsDeps,
): Promise<TaskLogEntry[]> {
    const base = deps.gatewayBaseUrl.replace(/\/+$/, '');
    const since = new Date(Date.now() - timeWindowHours * 3_600_000).toISOString();
    const data = await apiGet<{ tasks?: Array<Record<string, unknown>> }>(
        `${base}/v1/runtime/tasks?tenantId=${encodeURIComponent(tenantId)}&since=${encodeURIComponent(since)}&limit=50`,
        deps.serviceToken,
        deps.timeoutMs ?? SOURCE_TIMEOUT_MS,
    );
    return (data.tasks ?? []).map((t) => ({
        id: String(t['id'] ?? ''),
        status: String(t['status'] ?? 'unknown'),
        actionType: String(t['actionType'] ?? ''),
        errorMessage: t['errorMessage'] != null ? String(t['errorMessage']) : undefined,
        createdAt: String(t['createdAt'] ?? ''),
        completedAt: t['completedAt'] != null ? String(t['completedAt']) : undefined,
    }));
}

export async function readOtelTraces(
    tenantId: string,
    correlationId: string | undefined,
    deps: DiagnosticsDeps,
): Promise<OtelSpan[]> {
    const base = deps.gatewayBaseUrl.replace(/\/+$/, '');
    const qs = correlationId
        ? `tenantId=${encodeURIComponent(tenantId)}&correlationId=${encodeURIComponent(correlationId)}&limit=20`
        : `tenantId=${encodeURIComponent(tenantId)}&limit=20`;
    const data = await apiGet<{ spans?: Array<Record<string, unknown>> }>(
        `${base}/v1/observability/traces?${qs}`,
        deps.serviceToken,
        deps.timeoutMs ?? SOURCE_TIMEOUT_MS,
    );
    return (data.spans ?? []).map((s) => ({
        traceId: String(s['traceId'] ?? ''),
        spanId: String(s['spanId'] ?? ''),
        operationName: String(s['operationName'] ?? ''),
        status: String(s['status'] ?? ''),
        durationMs: Number(s['durationMs'] ?? 0),
        attributes: (s['attributes'] as Record<string, string>) ?? {},
        startedAt: String(s['startedAt'] ?? ''),
    }));
}

export async function readConnectorHealth(
    tenantId: string,
    deps: DiagnosticsDeps,
): Promise<ConnectorHealthEntry[]> {
    const base = deps.gatewayBaseUrl.replace(/\/+$/, '');
    const data = await apiGet<{ connectors?: Array<Record<string, unknown>> }>(
        `${base}/v1/connectors/health?tenantId=${encodeURIComponent(tenantId)}`,
        deps.serviceToken,
        deps.timeoutMs ?? SOURCE_TIMEOUT_MS,
    );
    return (data.connectors ?? []).map((c) => ({
        connectorId: String(c['id'] ?? ''),
        connectorType: String(c['type'] ?? ''),
        status: (c['status'] as ConnectorHealthEntry['status']) ?? 'error',
        lastCheckedAt: String(c['lastCheckedAt'] ?? ''),
        errorMessage: c['errorMessage'] != null ? String(c['errorMessage']) : undefined,
    }));
}

export async function readApprovalQueueState(
    tenantId: string,
    deps: DiagnosticsDeps,
): Promise<ApprovalQueueState> {
    const base = deps.gatewayBaseUrl.replace(/\/+$/, '');
    const data = await apiGet<{ approvals?: Array<Record<string, unknown>> }>(
        `${base}/v1/approvals?tenantId=${encodeURIComponent(tenantId)}&status=pending&limit=100`,
        deps.serviceToken,
        deps.timeoutMs ?? SOURCE_TIMEOUT_MS,
    );
    const approvals = data.approvals ?? [];
    const now = Date.now();
    let oldestAgeMs = 0;
    for (const a of approvals) {
        const createdAt = a['createdAt'] ? new Date(String(a['createdAt'])).getTime() : now;
        const ageMs = now - createdAt;
        if (ageMs > oldestAgeMs) oldestAgeMs = ageMs;
    }
    const oldestAgeMin = Math.floor(oldestAgeMs / 60_000);
    const isJammed = approvals.length >= APPROVAL_JAM_COUNT && oldestAgeMin >= APPROVAL_JAM_AGE_MIN;
    return {
        pendingCount: approvals.length,
        isJammed,
        oldestPendingAgeMinutes: oldestAgeMin,
        jamReason: isJammed
            ? `${approvals.length} pending approvals, oldest is ${oldestAgeMin} minutes old`
            : undefined,
    };
}

export async function readBillingState(
    tenantId: string,
    deps: DiagnosticsDeps,
): Promise<BillingState> {
    const base = deps.gatewayBaseUrl.replace(/\/+$/, '');
    const data = await apiGet<Record<string, unknown>>(
        `${base}/v1/billing/state?tenantId=${encodeURIComponent(tenantId)}`,
        deps.serviceToken,
        deps.timeoutMs ?? SOURCE_TIMEOUT_MS,
    );
    return {
        subscriptionStatus: String(data['subscriptionStatus'] ?? 'unknown'),
        budgetPolicyEnabled: Boolean(data['budgetPolicyEnabled']),
        dailyUsagePercent: Number(data['dailyUsagePercent'] ?? 0),
        monthlyUsagePercent: Number(data['monthlyUsagePercent'] ?? 0),
        isThrottled: Boolean(data['isThrottled']),
        isHardStopped: Boolean(data['isHardStopped']),
    };
}

export async function readProvisioningState(
    tenantId: string,
    deps: DiagnosticsDeps,
): Promise<ProvisioningState> {
    const base = deps.gatewayBaseUrl.replace(/\/+$/, '');
    const data = await apiGet<{ jobs?: Array<Record<string, unknown>> }>(
        `${base}/v1/admin/provision/jobs?tenantId=${encodeURIComponent(tenantId)}&limit=50`,
        deps.serviceToken,
        deps.timeoutMs ?? SOURCE_TIMEOUT_MS,
    );
    const jobs = data.jobs ?? [];
    const now = Date.now();
    const stuckJobs = jobs
        .filter((j) => {
            const status = String(j['status'] ?? '');
            if (!['pending', 'running'].includes(status)) return false;
            const createdAt = j['createdAt'] ? new Date(String(j['createdAt'])).getTime() : now;
            return now - createdAt >= STUCK_JOB_THRESHOLD_MS;
        })
        .map((j) => ({
            jobId: String(j['id'] ?? ''),
            status: String(j['status'] ?? ''),
            ageMinutes: Math.floor((now - new Date(String(j['createdAt'] ?? now)).getTime()) / 60_000),
        }));
    const runningJobs = jobs.filter((j) => String(j['status'] ?? '') === 'running').length;
    const completedJobs = jobs.filter((j) => String(j['status'] ?? '') === 'completed');
    const lastCompleted = completedJobs.sort((a, b) =>
        new Date(String(b['completedAt'] ?? 0)).getTime() - new Date(String(a['completedAt'] ?? 0)).getTime()
    )[0];
    return {
        runningJobs,
        stuckJobs,
        lastCompletedAt: lastCompleted ? String(lastCompleted['completedAt'] ?? '') : undefined,
    };
}

export async function readAuditLog(
    tenantId: string,
    limit: number,
    deps: DiagnosticsDeps,
): Promise<AuditLogEntry[]> {
    const base = deps.gatewayBaseUrl.replace(/\/+$/, '');
    const data = await apiGet<{ entries?: Array<Record<string, unknown>> }>(
        `${base}/v1/governance/audit?tenantId=${encodeURIComponent(tenantId)}&limit=${limit}`,
        deps.serviceToken,
        deps.timeoutMs ?? SOURCE_TIMEOUT_MS,
    );
    return (data.entries ?? []).map((e) => ({
        id: String(e['id'] ?? ''),
        action: String(e['action'] ?? ''),
        actorId: String(e['actorId'] ?? ''),
        resourceType: String(e['resourceType'] ?? ''),
        resourceId: String(e['resourceId'] ?? ''),
        createdAt: String(e['createdAt'] ?? ''),
    }));
}

// ---------------------------------------------------------------------------
// Diagnostic access audit — best-effort, never blocks the diagnosis
// ---------------------------------------------------------------------------

export interface DiagnosticAccessAuditEntry {
    tenantId: string;
    requestedBy: string;
    dataSources: string[];
    timedOutSources: string[];
    timestamp: string;
    correlationId?: string;
}

export async function writeDiagnosticAccessAudit(
    entry: DiagnosticAccessAuditEntry,
    deps: DiagnosticsDeps,
): Promise<void> {
    try {
        const base = deps.gatewayBaseUrl.replace(/\/+$/, '');
        await fetch(`${base}/v1/audit/support-diagnostic`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                Authorization: `Bearer ${deps.serviceToken}`,
            },
            body: JSON.stringify({ eventType: 'support_agent_diagnostic_read', ...entry }),
            signal: AbortSignal.timeout(3_000),
        });
    } catch {
        // Non-critical — diagnostic must never fail because auditing is unavailable.
    }
}

// ---------------------------------------------------------------------------
// Build full diagnosis report — all sources in parallel with per-source timeout
// ---------------------------------------------------------------------------

export async function buildDiagnosisReport(
    tenantId: string,
    deps: DiagnosticsDeps,
    opts: { timeWindowHours?: number; correlationId?: string; auditLimit?: number; requestedBy?: string } = {},
): Promise<DiagnosisReport> {
    const { timeWindowHours = 4, correlationId, auditLimit = 20, requestedBy = 'unknown' } = opts;

    const perSourceTimeout = deps.timeoutMs ?? SOURCE_TIMEOUT_MS;
    const [taskResult, otelResult, connectorResult, approvalResult, billingResult, provisioningResult, auditResult] =
        await Promise.all([
            withTimeout('task_logs',    () => readTaskLogs(tenantId, timeWindowHours, deps), perSourceTimeout),
            withTimeout('otel_traces',  () => readOtelTraces(tenantId, correlationId, deps), perSourceTimeout),
            withTimeout('connectors',   () => readConnectorHealth(tenantId, deps),           perSourceTimeout),
            withTimeout('approvals',    () => readApprovalQueueState(tenantId, deps),        perSourceTimeout),
            withTimeout('billing',      () => readBillingState(tenantId, deps),              perSourceTimeout),
            withTimeout('provisioning', () => readProvisioningState(tenantId, deps),         perSourceTimeout),
            withTimeout('audit',        () => readAuditLog(tenantId, auditLimit, deps),      perSourceTimeout),
        ]);

    // Write access audit (best-effort, non-blocking)
    const allSources = ['task_logs', 'otel_traces', 'connectors', 'approvals', 'billing', 'provisioning', 'audit'];
    const allResults = [taskResult, otelResult, connectorResult, approvalResult, billingResult, provisioningResult, auditResult];
    const timedOutSources = allSources.filter((_, i) => allResults[i].status !== 'ok');
    void writeDiagnosticAccessAudit(
        {
            tenantId,
            requestedBy,
            dataSources: allSources,
            timedOutSources,
            timestamp: new Date().toISOString(),
            correlationId,
        },
        deps,
    );

    const summary: string[] = [];

    // Summarise notable findings
    if (connectorResult.status === 'ok') {
        const unhealthy = (connectorResult.value ?? []).filter((c) => c.status !== 'healthy');
        if (unhealthy.length > 0) {
            summary.push(`${unhealthy.length} connector(s) unhealthy: ${unhealthy.map((c) => c.connectorType).join(', ')}`);
        }
    }
    if (approvalResult.status === 'ok' && approvalResult.value?.isJammed) {
        summary.push(`Approval queue jammed: ${approvalResult.value.jamReason}`);
    }
    if (billingResult.status === 'ok') {
        if (billingResult.value?.isHardStopped) summary.push('Billing: tenant hard-stopped (budget exceeded)');
        else if (billingResult.value?.isThrottled) summary.push('Billing: tenant throttled (90% budget reached)');
        else if ((billingResult.value?.monthlyUsagePercent ?? 0) >= 80) summary.push(`Billing: ${billingResult.value?.monthlyUsagePercent}% monthly budget used`);
    }
    if (provisioningResult.status === 'ok' && (provisioningResult.value?.stuckJobs.length ?? 0) > 0) {
        summary.push(`Provisioning: ${provisioningResult.value?.stuckJobs.length} stuck job(s)`);
    }
    if (taskResult.status === 'ok') {
        const failed = (taskResult.value ?? []).filter((t) => t.status === 'failed');
        if (failed.length > 0) summary.push(`${failed.length} failed task(s) in the last ${timeWindowHours}h`);
    }
    if (['task_logs', 'otel_traces', 'connectors', 'approvals', 'billing', 'provisioning', 'audit'].some(
        (_, i) => [taskResult, otelResult, connectorResult, approvalResult, billingResult, provisioningResult, auditResult][i].status !== 'ok',
    )) {
        const timedOut = (
            [['task_logs', taskResult], ['otel_traces', otelResult], ['connectors', connectorResult],
             ['approvals', approvalResult], ['billing', billingResult], ['provisioning', provisioningResult],
             ['audit', auditResult]] as Array<[string, { status: DiagnosisSourceStatus }]>
        ).filter(([, r]) => r.status !== 'ok').map(([name]) => name);
        if (timedOut.length > 0) summary.push(`Partial diagnosis — sources unavailable: ${timedOut.join(', ')}`);
    }

    return {
        tenantId,
        generatedAt: new Date().toISOString(),
        taskLogs:       { status: taskResult.status,        entries:    taskResult.value     ?? [] },
        otelTraces:     { status: otelResult.status,        spans:      otelResult.value     ?? [] },
        connectorHealth:{ status: connectorResult.status,   connectors: connectorResult.value ?? [] },
        approvalQueue:  { status: approvalResult.status,    state:      approvalResult.value },
        billing:        { status: billingResult.status,     state:      billingResult.value },
        provisioning:   { status: provisioningResult.status,state:      provisioningResult.value },
        auditLog:       { status: auditResult.status,       entries:    auditResult.value     ?? [] },
        summary,
    };
}
