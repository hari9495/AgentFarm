/**
 * CRM Updater — writes interaction records and contact data to Salesforce,
 * HubSpot, Zoho CRM, or Microsoft Dynamics via MCP connectors.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InteractionChannel = 'email' | 'chat' | 'phone' | 'ticket' | 'social';
export type InteractionOutcome = 'resolved' | 'escalated' | 'pending' | 'follow_up_needed' | 'no_action';

export interface CrmInteractionRecord {
    ticketId?: string;
    customerId?: string;
    customerEmail?: string;
    channel: InteractionChannel;
    subject: string;
    summary: string;
    outcome: InteractionOutcome;
    agentId?: string;
    resolutionSteps?: string[];
    durationSeconds?: number;
    satisfactionRating?: number;
    tags?: string[];
    nextFollowUpDate?: string;
}

export interface CrmUpdateParams {
    tenantId: string;
    botId: string;
    record: CrmInteractionRecord;
    connector?: string;
}

export interface CrmUpdateResult {
    recordId: string;
    customerId?: string;
    crmProvider: string;
    status: 'created' | 'updated';
    auditLogEntry: string;
}

export interface CaseDocumentParams {
    tenantId: string;
    botId: string;
    ticketId: string;
    title: string;
    rootCause: string;
    resolutionSteps: string[];
    preventionNotes?: string;
    industry?: string;
    connector?: string;
}

export interface CaseDocumentResult {
    documentId: string;
    title: string;
    kbProvider: string;
    url?: string;
    status: 'created' | 'updated';
}

// ---------------------------------------------------------------------------
// Connector resolution
// ---------------------------------------------------------------------------

function resolveCrmUrl(connector?: string): string {
    const candidates = [
        connector && process.env[`MCP_${connector.toUpperCase()}_URL`],
        process.env['MCP_SALESFORCE_URL'],
        process.env['MCP_HUBSPOT_URL'],
        process.env['MCP_ZOHO_CRM_URL'],
        process.env['MCP_DYNAMICS_URL'],
        process.env['MCP_CRM_URL'],
    ];
    for (const c of candidates) {
        if (c && c.trim()) return c.trim();
    }
    throw new Error(
        'No CRM connector configured. Set MCP_SALESFORCE_URL, MCP_HUBSPOT_URL, ' +
        'MCP_ZOHO_CRM_URL, MCP_DYNAMICS_URL, or MCP_CRM_URL.',
    );
}

function resolveKbUrl(connector?: string): string {
    const candidates = [
        connector && process.env[`MCP_${connector.toUpperCase()}_URL`],
        process.env['MCP_CONFLUENCE_URL'],
        process.env['MCP_NOTION_URL'],
        process.env['MCP_ZENDESK_GUIDE_URL'],
        process.env['MCP_KB_URL'],
        process.env['MCP_GOOGLE_DRIVE_URL'],
    ];
    for (const c of candidates) {
        if (c && c.trim()) return c.trim();
    }
    throw new Error(
        'No knowledge base connector configured. Set MCP_CONFLUENCE_URL, MCP_NOTION_URL, ' +
        'MCP_ZENDESK_GUIDE_URL, MCP_KB_URL, or MCP_GOOGLE_DRIVE_URL.',
    );
}

function detectCrmProvider(url: string): string {
    if (url.includes('salesforce')) return 'Salesforce';
    if (url.includes('hubspot')) return 'HubSpot';
    if (url.includes('zoho')) return 'Zoho CRM';
    if (url.includes('dynamics')) return 'Microsoft Dynamics';
    return 'CRM';
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

export async function updateCrmRecord(params: CrmUpdateParams): Promise<CrmUpdateResult> {
    const url = resolveCrmUrl(params.connector);
    const provider = detectCrmProvider(url);

    const res = await fetch(`${url}/interactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            tenantId: params.tenantId,
            botId: params.botId,
            ...params.record,
            timestamp: new Date().toISOString(),
        }),
    });

    if (!res.ok) {
        throw new Error(`CRM connector (${provider}) returned HTTP ${res.status}: ${await res.text()}`);
    }

    const data = (await res.json()) as { recordId?: string; status?: string };

    return {
        recordId: data.recordId ?? `crm-${Date.now()}`,
        customerId: params.record.customerId,
        crmProvider: provider,
        status: (data.status as 'created' | 'updated') ?? 'created',
        auditLogEntry: `CRM record written by botId=${params.botId} for ticket=${params.record.ticketId ?? 'none'} outcome=${params.record.outcome} at ${new Date().toISOString()}`,
    };
}

export async function documentCase(params: CaseDocumentParams): Promise<CaseDocumentResult> {
    const url = resolveKbUrl(params.connector);

    const body = [
        `# ${params.title}`,
        '',
        `**Ticket:** ${params.ticketId}`,
        params.industry ? `**Industry:** ${params.industry}` : '',
        '',
        `## Root Cause`,
        params.rootCause,
        '',
        `## Resolution Steps`,
        params.resolutionSteps.map((s, i) => `${i + 1}. ${s}`).join('\n'),
        '',
        params.preventionNotes ? `## Prevention Notes\n${params.preventionNotes}` : '',
        '',
        `*Documented by CSE Agent on ${new Date().toUTCString()}*`,
    ].filter(Boolean).join('\n');

    const res = await fetch(`${url}/articles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            tenantId: params.tenantId,
            botId: params.botId,
            title: params.title,
            body,
            tags: ['support', 'case-resolution', params.industry ?? 'generic'],
        }),
    });

    if (!res.ok) {
        throw new Error(`KB connector returned HTTP ${res.status}: ${await res.text()}`);
    }

    const data = (await res.json()) as { documentId?: string; url?: string };

    return {
        documentId: data.documentId ?? `doc-${Date.now()}`,
        title: params.title,
        kbProvider: url.includes('confluence') ? 'Confluence' : url.includes('notion') ? 'Notion' : 'Knowledge Base',
        url: data.url,
        status: 'created',
    };
}
