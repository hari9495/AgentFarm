/**
 * Ticket Manager — wraps helpdesk MCP connectors (Zendesk, Intercom,
 * Freshdesk, ServiceNow) behind a uniform interface.
 *
 * All functions fail-fast when the MCP connector URL is absent so the
 * caller can surface a clear error rather than an undefined-access crash.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TicketStatus = 'open' | 'pending' | 'on_hold' | 'solved' | 'closed';
export type TicketChannel = 'email' | 'chat' | 'phone' | 'web' | 'api' | 'social';

export interface TicketRecord {
    ticketId: string;
    subject: string;
    status: TicketStatus;
    priority: TicketPriority;
    channel: TicketChannel;
    customerId?: string;
    assigneeId?: string;
    tags?: string[];
    createdAt?: string;
    updatedAt?: string;
    url?: string;
}

export interface OpenTicketParams {
    tenantId: string;
    botId: string;
    subject: string;
    description: string;
    priority?: TicketPriority;
    channel?: TicketChannel;
    customerId?: string;
    customerEmail?: string;
    tags?: string[];
    connector?: string;
}

export interface UpdateTicketParams {
    tenantId: string;
    botId: string;
    ticketId: string;
    status?: TicketStatus;
    priority?: TicketPriority;
    assigneeId?: string;
    tags?: string[];
    internalNote?: string;
    connector?: string;
}

export interface CloseTicketParams {
    tenantId: string;
    botId: string;
    ticketId: string;
    resolutionNote: string;
    satisfactionRating?: number;
    connector?: string;
}

export interface MergeTicketParams {
    tenantId: string;
    botId: string;
    primaryTicketId: string;
    duplicateTicketId: string;
    mergeNote?: string;
    connector?: string;
}

export interface AssignTicketParams {
    tenantId: string;
    botId: string;
    ticketId: string;
    assigneeId: string;
    assigneeType: 'agent' | 'team' | 'bot';
    reason?: string;
    connector?: string;
}

// ---------------------------------------------------------------------------
// Connector URL resolver
// ---------------------------------------------------------------------------

function resolveHelpdeskUrl(connector?: string): string {
    const candidates = [
        connector && process.env[`MCP_${connector.toUpperCase()}_URL`],
        process.env['MCP_ZENDESK_URL'],
        process.env['MCP_INTERCOM_URL'],
        process.env['MCP_FRESHDESK_URL'],
        process.env['MCP_SERVICENOW_URL'],
        process.env['MCP_HELPDESK_URL'],
    ];
    for (const c of candidates) {
        if (c && c.trim()) return c.trim();
    }
    throw new Error(
        'No helpdesk connector configured. Set MCP_ZENDESK_URL, MCP_INTERCOM_URL, ' +
        'MCP_FRESHDESK_URL, MCP_SERVICENOW_URL, or MCP_HELPDESK_URL.',
    );
}

async function helpdeskPost(url: string, path: string, body: unknown): Promise<unknown> {
    const res = await fetch(`${url}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        throw new Error(`Helpdesk connector returned HTTP ${res.status}: ${await res.text()}`);
    }
    return res.json();
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

export async function openTicket(params: OpenTicketParams): Promise<TicketRecord> {
    const url = resolveHelpdeskUrl(params.connector);
    const data = await helpdeskPost(url, '/tickets', {
        tenantId: params.tenantId,
        botId: params.botId,
        subject: params.subject,
        description: params.description,
        priority: params.priority ?? 'medium',
        channel: params.channel ?? 'web',
        customerId: params.customerId,
        customerEmail: params.customerEmail,
        tags: params.tags ?? [],
    });
    return data as TicketRecord;
}

export async function updateTicket(params: UpdateTicketParams): Promise<TicketRecord> {
    const url = resolveHelpdeskUrl(params.connector);
    const data = await helpdeskPost(url, `/tickets/${params.ticketId}/update`, {
        tenantId: params.tenantId,
        botId: params.botId,
        status: params.status,
        priority: params.priority,
        assigneeId: params.assigneeId,
        tags: params.tags,
        internalNote: params.internalNote,
    });
    return data as TicketRecord;
}

export async function closeTicket(params: CloseTicketParams): Promise<{ closed: boolean; ticketId: string }> {
    const url = resolveHelpdeskUrl(params.connector);
    const data = await helpdeskPost(url, `/tickets/${params.ticketId}/close`, {
        tenantId: params.tenantId,
        botId: params.botId,
        resolutionNote: params.resolutionNote,
        satisfactionRating: params.satisfactionRating,
    });
    return data as { closed: boolean; ticketId: string };
}

export async function mergeTickets(params: MergeTicketParams): Promise<{ merged: boolean; primaryTicketId: string }> {
    const url = resolveHelpdeskUrl(params.connector);
    const data = await helpdeskPost(url, '/tickets/merge', {
        tenantId: params.tenantId,
        botId: params.botId,
        primaryTicketId: params.primaryTicketId,
        duplicateTicketId: params.duplicateTicketId,
        mergeNote: params.mergeNote,
    });
    return data as { merged: boolean; primaryTicketId: string };
}

export async function assignTicket(params: AssignTicketParams): Promise<TicketRecord> {
    const url = resolveHelpdeskUrl(params.connector);
    const data = await helpdeskPost(url, `/tickets/${params.ticketId}/assign`, {
        tenantId: params.tenantId,
        botId: params.botId,
        assigneeId: params.assigneeId,
        assigneeType: params.assigneeType,
        reason: params.reason,
    });
    return data as TicketRecord;
}
