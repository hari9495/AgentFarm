/**
 * PagerDuty Connector
 *
 * Provides integration with PagerDuty for incident management:
 * - Create, acknowledge, and resolve incidents
 * - Query on-call schedules and escalation policies
 * - List recent alerts and alert details
 *
 * Requires PAGERDUTY_API_KEY in environment.
 * Uses PagerDuty REST API v2 (https://api.pagerduty.com).
 */

export type PagerDutyConfig = {
    apiKey: string;
    fromEmail?: string;
    defaultServiceId?: string;
};

export type PdUrgency = 'high' | 'low';

export type PdIncidentStatus = 'triggered' | 'acknowledged' | 'resolved';

export type PdIncident = {
    id: string;
    incident_number: number;
    title: string;
    status: PdIncidentStatus;
    urgency: PdUrgency;
    service: { id: string; name: string };
    assigned_to?: Array<{ id: string; name: string }>;
    created_at: string;
    resolved_at?: string;
    html_url: string;
};

export type PdOnCallEntry = {
    user: { id: string; name: string; email: string };
    schedule_reference?: { id: string; name: string };
    escalation_level: number;
    start: string;
    end: string;
};

export type PdQueryResult<T> = {
    ok: boolean;
    data?: T;
    error?: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PD_API_BASE = 'https://api.pagerduty.com';

function pdHeaders(apiKey: string, fromEmail?: string): Record<string, string> {
    return {
        'Authorization': `Token token=${apiKey}`,
        'Accept': 'application/vnd.pagerduty+json;version=2',
        'Content-Type': 'application/json',
        ...(fromEmail ? { 'From': fromEmail } : {}),
    };
}

// ---------------------------------------------------------------------------
// PagerDutyConnector class
// ---------------------------------------------------------------------------

export class PagerDutyConnector {
    private readonly config: PagerDutyConfig;

    constructor(config: PagerDutyConfig) {
        if (!config.apiKey || config.apiKey.trim().length === 0) {
            throw new Error('PagerDutyConnector: apiKey is required');
        }
        this.config = config;
    }

    static fromEnv(): PagerDutyConnector {
        const apiKey = process.env['PAGERDUTY_API_KEY'];
        if (!apiKey) throw new Error('PAGERDUTY_API_KEY environment variable is required');
        return new PagerDutyConnector({
            apiKey,
            fromEmail: process.env['PAGERDUTY_FROM_EMAIL'],
            defaultServiceId: process.env['PAGERDUTY_SERVICE_ID'],
        });
    }

    private headers(): Record<string, string> {
        return pdHeaders(this.config.apiKey, this.config.fromEmail);
    }

    async createIncident(input: {
        title: string;
        urgency?: PdUrgency;
        serviceId?: string;
        body?: string;
    }): Promise<PdQueryResult<PdIncident>> {
        const serviceId = input.serviceId ?? this.config.defaultServiceId;
        if (!serviceId) return { ok: false, error: 'serviceId or defaultServiceId is required' };
        try {
            const response = await fetch(`${PD_API_BASE}/incidents`, {
                method: 'POST',
                headers: this.headers(),
                body: JSON.stringify({
                    incident: {
                        type: 'incident',
                        title: input.title,
                        urgency: input.urgency ?? 'high',
                        service: { id: serviceId, type: 'service_reference' },
                        body: input.body ? { type: 'incident_body', details: input.body } : undefined,
                    },
                }),
            });
            if (!response.ok) {
                const err = await response.json() as { error?: { message?: string } };
                return { ok: false, error: err.error?.message ?? `HTTP ${response.status}` };
            }
            const json = await response.json() as { incident: PdIncident };
            return { ok: true, data: json.incident };
        } catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    }

    async acknowledgeIncident(incidentId: string): Promise<PdQueryResult<PdIncident>> {
        return this.updateIncidentStatus(incidentId, 'acknowledged');
    }

    async resolveIncident(incidentId: string): Promise<PdQueryResult<PdIncident>> {
        return this.updateIncidentStatus(incidentId, 'resolved');
    }

    private async updateIncidentStatus(incidentId: string, status: PdIncidentStatus): Promise<PdQueryResult<PdIncident>> {
        try {
            const response = await fetch(`${PD_API_BASE}/incidents/${encodeURIComponent(incidentId)}`, {
                method: 'PUT',
                headers: this.headers(),
                body: JSON.stringify({
                    incident: { type: 'incident', status },
                }),
            });
            if (!response.ok) {
                return { ok: false, error: `HTTP ${response.status}` };
            }
            const json = await response.json() as { incident: PdIncident };
            return { ok: true, data: json.incident };
        } catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    }

    async getIncident(incidentId: string): Promise<PdQueryResult<PdIncident>> {
        try {
            const response = await fetch(`${PD_API_BASE}/incidents/${encodeURIComponent(incidentId)}`, {
                headers: this.headers(),
            });
            if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
            const json = await response.json() as { incident: PdIncident };
            return { ok: true, data: json.incident };
        } catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    }

    async listIncidents(status: PdIncidentStatus[] = ['triggered', 'acknowledged'], limit = 25): Promise<PdQueryResult<PdIncident[]>> {
        try {
            const statusParam = status.map((s) => `statuses[]=${s}`).join('&');
            const response = await fetch(`${PD_API_BASE}/incidents?${statusParam}&limit=${limit}&sort_by=created_at:desc`, {
                headers: this.headers(),
            });
            if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
            const json = await response.json() as { incidents: PdIncident[] };
            return { ok: true, data: json.incidents };
        } catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    }

    async getOnCall(escalationPolicyId?: string): Promise<PdQueryResult<PdOnCallEntry[]>> {
        try {
            const params = escalationPolicyId ? `?escalation_policy_ids[]=${encodeURIComponent(escalationPolicyId)}` : '';
            const response = await fetch(`${PD_API_BASE}/oncalls${params}`, {
                headers: this.headers(),
            });
            if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
            const json = await response.json() as { oncalls: PdOnCallEntry[] };
            return { ok: true, data: json.oncalls };
        } catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    }
}
