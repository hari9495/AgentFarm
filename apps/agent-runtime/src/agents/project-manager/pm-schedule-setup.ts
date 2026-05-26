// ============================================================================
// PM SCHEDULE SETUP
//
// Registers (or updates) a recurring standup job via the API gateway's
// schedule management endpoint (POST /v1/schedules).
//
// The gateway persists it to the `scheduledJob` table; the trigger-service's
// schedule-sweep fires it every morning by POSTing to agent-runtime /run-task.
// ============================================================================

export type ScheduleSetupResult = {
    ok: boolean;
    scheduleId?: string;
    alreadyExists?: boolean;
    error?: string;
};

export type StandupScheduleOptions = {
    /** The bot (PM agent) that owns this schedule */
    botId: string;
    tenantId: string;
    /** Human-readable schedule name shown in the UI */
    name?: string;
    /** Cron expression — default: 9 AM Mon–Fri */
    cronExpr?: string;
    /** Team or workspace label used inside the standup goal */
    teamName?: string;
    /** Gateway base URL, e.g. http://api-gateway:4000 */
    gatewayBaseUrl: string;
    /** Bearer token for the gateway */
    serviceToken: string;
};

/**
 * Register a daily standup schedule for the PM agent.
 *
 * Idempotent: if a schedule named `name` already exists for this tenant it is
 * returned as-is (the caller can optionally DELETE + re-create to change the
 * cron expression, but that is a separate concern).
 */
export async function registerPmStandupSchedule(
    opts: StandupScheduleOptions,
): Promise<ScheduleSetupResult> {
    const {
        botId,
        tenantId,
        name = 'PM Daily Standup',
        cronExpr = '0 9 * * 1-5',
        teamName = 'Engineering',
        gatewayBaseUrl,
        serviceToken,
    } = opts;

    const base = gatewayBaseUrl.replace(/\/+$/, '');
    const headers = {
        'content-type': 'application/json',
        Authorization: `Bearer ${serviceToken}`,
    };

    // ── Step 1: check for an existing schedule with this name ────────────────
    try {
        const listRes = await fetch(`${base}/v1/schedules`, {
            method: 'GET',
            headers,
            signal: AbortSignal.timeout(10_000),
        });
        if (listRes.ok) {
            const body = await listRes.json() as { schedules?: Array<{ id: string; name: string }> };
            const existing = (body.schedules ?? []).find((s) => s.name === name);
            if (existing) {
                return { ok: true, scheduleId: existing.id, alreadyExists: true };
            }
        }
    } catch {
        // non-fatal — proceed to create
    }

    // ── Step 2: create the schedule ──────────────────────────────────────────
    const goal = JSON.stringify({
        actionType: 'workspace_pm_standup_summary',
        teamName,
        triggeredBy: 'schedule',
        tenantId,
        botId,
    });

    try {
        const res = await fetch(`${base}/v1/schedules`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                name,
                cronExpr,
                goal,
                agentId: botId,
                enabled: true,
            }),
            signal: AbortSignal.timeout(10_000),
        });

        if (!res.ok) {
            const text = await res.text().catch(() => '');
            return {
                ok: false,
                error: `Schedule registration failed (${res.status}): ${text.slice(0, 200)}`,
            };
        }

        const created = await res.json() as { id: string };
        return { ok: true, scheduleId: created.id };
    } catch (err) {
        return { ok: false, error: String(err) };
    }
}
