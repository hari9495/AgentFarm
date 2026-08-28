/**
 * Meeting action-item dispatch — Phase 2 "act via approvals".
 *
 * Bridges a meeting action item to the EXISTING approval + connector-execute
 * machinery by calling the gateway's own HTTP endpoints with the service shared
 * tokens. This reuses the full propose → approve → execute path instead of
 * reimplementing it:
 *   dispatch → POST /v1/approvals/intake          (creates a pending Approval)
 *   execute  → POST /v1/connectors/actions/execute (approval-gated connector run)
 */

const selfBase = (): string =>
    (process.env['AF_SELF_BASE_URL'] ?? 'http://127.0.0.1:3000').replace(/\/+$/u, '');

const intakeToken = (): string =>
    process.env['AGENTFARM_APPROVAL_INTAKE_SHARED_TOKEN'] ??
    process.env['APPROVAL_INTAKE_SHARED_TOKEN'] ??
    '';

const connectorExecToken = (): string =>
    process.env['AGENTFARM_CONNECTOR_EXEC_SHARED_TOKEN'] ??
    process.env['CONNECTOR_EXEC_SHARED_TOKEN'] ??
    '';

const TASK_TRACKERS = new Set([
    'jira', 'linear', 'asana', 'trello', 'clickup', 'azure_devops', 'github', 'gitlab',
]);

/** Default normalized action type for a connector when the caller omits one. */
export function defaultActionTypeForConnector(connector: string): string {
    if (TASK_TRACKERS.has(connector)) return 'create_task';
    if (connector === 'gmail' || connector === 'outlook' || connector === 'email') return 'send_email';
    return 'send_message'; // slack, teams, …
}

/** Default role key that is allowed to run the action for a connector. */
export function roleForConnector(connector: string): string {
    return TASK_TRACKERS.has(connector)
        ? 'project_manager_product_owner_scrum_master'
        : 'corporate_assistant';
}

export type ApprovalIntakeInput = {
    tenantId: string;
    workspaceId: string;
    botId: string;
    actionId: string;
    actionSummary: string;
    riskLevel: 'low' | 'medium' | 'high';
    requestedBy: string;
};
export type ApprovalIntakeResult = {
    ok: boolean;
    approvalId?: string;
    status?: string;
    error?: string;
};

export async function createApprovalForAction(
    input: ApprovalIntakeInput,
): Promise<ApprovalIntakeResult> {
    const token = intakeToken();
    if (!token) return { ok: false, error: 'approval_intake_not_configured' };
    try {
        const res = await fetch(`${selfBase()}/v1/approvals/intake`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-approval-intake-token': token },
            body: JSON.stringify({
                tenant_id: input.tenantId,
                workspace_id: input.workspaceId,
                bot_id: input.botId,
                task_id: `mtg-action:${input.actionId}`,
                action_id: input.actionId,
                action_summary: input.actionSummary,
                risk_level: input.riskLevel,
                requested_by: input.requestedBy,
                policy_pack_version: 'meeting-ai-v1',
            }),
            signal: AbortSignal.timeout(15_000),
        });
        const data = (await res.json().catch(() => ({}))) as {
            approval_id?: string;
            status?: string;
            error?: string;
        };
        if (!res.ok) {
            return { ok: false, status: data.status, error: data.error ?? `intake_http_${res.status}` };
        }
        return { ok: true, approvalId: data.approval_id, status: data.status };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'intake_failed' };
    }
}

export type ConnectorExecInput = {
    tenantId: string;
    workspaceId: string;
    botId: string;
    roleKey: string;
    connectorType: string;
    actionType: string;
    payload: Record<string, unknown>;
    approvalActionId: string;
};
export type ConnectorExecResult = {
    ok: boolean;
    status?: number;
    externalId?: string;
    resultSummary?: string;
    blocked?: boolean;
    error?: string;
};

export async function executeConnectorAction(
    input: ConnectorExecInput,
): Promise<ConnectorExecResult> {
    const token = connectorExecToken();
    if (!token) return { ok: false, error: 'connector_exec_not_configured' };
    try {
        const res = await fetch(`${selfBase()}/v1/connectors/actions/execute`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-connector-exec-token': token },
            body: JSON.stringify({
                tenant_id: input.tenantId,
                role_key: input.roleKey,
                connector_type: input.connectorType,
                workspace_id: input.workspaceId,
                bot_id: input.botId,
                action_type: input.actionType,
                payload: input.payload,
                approval_action_id: input.approvalActionId,
                correlation_id: `mtg-action:${input.approvalActionId}`,
            }),
            signal: AbortSignal.timeout(30_000),
        });
        const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (!res.ok) {
            // 403/409 from the gateway's approval gate = "not yet approved".
            const blocked = res.status === 403 || res.status === 409;
            const error = typeof data['error'] === 'string' ? (data['error'] as string) : `exec_http_${res.status}`;
            return { ok: false, status: res.status, blocked, error };
        }
        return {
            ok: true,
            status: res.status,
            externalId: pickExternalId(data),
            resultSummary:
                typeof data['result_summary'] === 'string'
                    ? (data['result_summary'] as string)
                    : typeof data['resultSummary'] === 'string'
                      ? (data['resultSummary'] as string)
                      : undefined,
        };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'exec_failed' };
    }
}

/** Pull an external identifier (issue key, message id, …) out of a varied response shape. */
function pickExternalId(data: Record<string, unknown>): string | undefined {
    const result =
        data['result'] && typeof data['result'] === 'object'
            ? (data['result'] as Record<string, unknown>)
            : data;
    for (const k of ['key', 'issueKey', 'issue_key', 'id', 'message_id', 'messageId', 'ts', 'externalId', 'external_id']) {
        const v = result[k];
        if (typeof v === 'string' && v) return v;
        if (typeof v === 'number') return String(v);
    }
    return undefined;
}
