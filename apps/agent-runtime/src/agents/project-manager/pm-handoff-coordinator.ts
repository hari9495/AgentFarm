// ============================================================================
// PM HANDOFF COORDINATOR
//
// HTTP client wrapper around the orchestrator's /v1/agent-handoffs endpoints.
// The PM agent calls these to delegate stories to Developer / Tester bots
// and to check whether those tasks have been completed.
// ============================================================================

export type HandoffRole = 'developer' | 'tester' | 'business_analyst';

export type CreateHandoffParams = {
    tenantId: string;
    workspaceId: string;
    taskId: string;
    fromBotId: string;
    toBotId: string;
    toRole: HandoffRole;
    reason: string;
    handoffContext?: Record<string, unknown>;
    escalateOnTimeoutMs?: number;
    orchestratorBaseUrl: string;
    serviceToken?: string;
};

export type HandoffRecord = {
    id: string;
    tenantId: string;
    workspaceId: string;
    taskId: string;
    fromBotId: string;
    toBotId: string;
    reason: string;
    status: 'pending' | 'in_progress' | 'completed' | 'timed_out' | 'failed';
    handoffContext?: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
};

export type HandoffResult = {
    ok: boolean;
    handoff?: HandoffRecord;
    handoffs?: HandoffRecord[];
    error?: string;
};

// ---------------------------------------------------------------------------
// createHandoff
// ---------------------------------------------------------------------------

export async function createHandoff(params: CreateHandoffParams): Promise<HandoffResult> {
    const base = params.orchestratorBaseUrl.replace(/\/+$/, '');
    const headers = buildHeaders(params.serviceToken);

    const correlationId = `pm_handoff_${params.taskId}_${Date.now()}`;

    try {
        const res = await fetch(`${base}/v1/agent-handoffs`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                tenant_id: params.tenantId,
                workspace_id: params.workspaceId,
                task_id: params.taskId,
                from_bot_id: params.fromBotId,
                to_bot_id: params.toBotId,
                reason: params.reason,
                correlation_id: correlationId,
                handoff_context: {
                    toRole: params.toRole,
                    ...(params.handoffContext ?? {}),
                },
                escalate_on_timeout_ms: params.escalateOnTimeoutMs ?? 3_600_000,
                contract_version: '1',
            }),
            signal: AbortSignal.timeout(10_000),
        });

        if (!res.ok) {
            const text = await res.text().catch(() => '');
            return { ok: false, error: `Handoff creation failed (${res.status}): ${text.slice(0, 200)}` };
        }

        const body = await res.json() as { handoff: HandoffRecord };
        return { ok: true, handoff: body.handoff };
    } catch (err) {
        return { ok: false, error: String(err) };
    }
}

// ---------------------------------------------------------------------------
// listHandoffs
// ---------------------------------------------------------------------------

export async function listHandoffs(params: {
    tenantId: string;
    workspaceId?: string;
    status?: HandoffRecord['status'];
    orchestratorBaseUrl: string;
    serviceToken?: string;
}): Promise<HandoffResult> {
    const base = params.orchestratorBaseUrl.replace(/\/+$/, '');
    const headers = buildHeaders(params.serviceToken);

    const qs = new URLSearchParams({ tenant_id: params.tenantId });
    if (params.workspaceId) qs.set('workspace_id', params.workspaceId);
    if (params.status) qs.set('status', params.status);

    try {
        const res = await fetch(`${base}/v1/agent-handoffs?${qs}`, {
            method: 'GET',
            headers,
            signal: AbortSignal.timeout(10_000),
        });

        if (!res.ok) {
            const text = await res.text().catch(() => '');
            return { ok: false, error: `List handoffs failed (${res.status}): ${text.slice(0, 200)}` };
        }

        const body = await res.json() as { handoffs: HandoffRecord[] };
        return { ok: true, handoffs: body.handoffs ?? [] };
    } catch (err) {
        return { ok: false, error: String(err) };
    }
}

// ---------------------------------------------------------------------------
// updateHandoffStatus
// ---------------------------------------------------------------------------

export async function updateHandoffStatus(params: {
    handoffId: string;
    status: HandoffRecord['status'];
    orchestratorBaseUrl: string;
    serviceToken?: string;
}): Promise<HandoffResult> {
    const base = params.orchestratorBaseUrl.replace(/\/+$/, '');
    const headers = buildHeaders(params.serviceToken);

    try {
        const res = await fetch(`${base}/v1/agent-handoffs/${encodeURIComponent(params.handoffId)}/status`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ status: params.status }),
            signal: AbortSignal.timeout(10_000),
        });

        if (!res.ok) {
            const text = await res.text().catch(() => '');
            return { ok: false, error: `Update handoff failed (${res.status}): ${text.slice(0, 200)}` };
        }

        const body = await res.json() as { handoff: HandoffRecord };
        return { ok: true, handoff: body.handoff };
    } catch (err) {
        return { ok: false, error: String(err) };
    }
}

// ---------------------------------------------------------------------------
// formatHandoffSummary — plain-text summary for standup / status reports
// ---------------------------------------------------------------------------

export function formatHandoffSummary(handoffs: HandoffRecord[]): string {
    if (handoffs.length === 0) return 'No active handoffs.';

    const byStatus = handoffs.reduce<Record<string, number>>((acc, h) => {
        acc[h.status] = (acc[h.status] ?? 0) + 1;
        return acc;
    }, {});

    const lines = Object.entries(byStatus)
        .map(([status, count]) => `${count} ${status}`)
        .join(', ');

    const pending = handoffs.filter((h) => h.status === 'pending');
    const timedOut = handoffs.filter((h) => h.status === 'timed_out');

    const alerts: string[] = [];
    if (timedOut.length > 0) alerts.push(`${timedOut.length} handoff(s) have timed out and need follow-up`);
    if (pending.length > 3) alerts.push(`${pending.length} handoffs awaiting pickup — consider re-assigning`);

    return [
        `Handoff status: ${lines}.`,
        ...alerts,
    ].join(' ');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildHeaders(serviceToken?: string): Record<string, string> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (serviceToken) headers.Authorization = `Bearer ${serviceToken}`;
    return headers;
}
