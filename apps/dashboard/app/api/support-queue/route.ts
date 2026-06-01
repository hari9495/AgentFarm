import { NextResponse } from 'next/server';

type TicketStatus = 'open' | 'in_progress' | 'pending_customer' | 'resolved' | 'escalated';
type TicketPriority = 'low' | 'normal' | 'high' | 'critical';

type SupportTicket = {
    id: string; ticketNumber: string; subject: string; customerName: string;
    channel: 'email' | 'chat' | 'phone' | 'portal';
    priority: TicketPriority; status: TicketStatus;
    agentDraftReady: boolean; slaBreachAt?: string;
    createdAt: string; updatedAt: string;
};

declare global { var __supportTickets: Map<string, SupportTicket> | undefined; }

function getStore(): Map<string, SupportTicket> {
    if (!globalThis.__supportTickets) {
        const now = new Date().toISOString();
        const soon = new Date(Date.now() + 2 * 3600 * 1000).toISOString();
        const seed: SupportTicket[] = [
            { id: 'tk-001', ticketNumber: 'TK-2041', subject: 'Agent not triggering approvals on high-risk tasks', customerName: 'Ravi Mehta (Acme Corp)', channel: 'portal', priority: 'critical', status: 'in_progress', agentDraftReady: true, slaBreachAt: soon, createdAt: now, updatedAt: now },
            { id: 'tk-002', ticketNumber: 'TK-2042', subject: 'Billing discrepancy — charged for inactive workspace', customerName: 'Sarah Kim (TechFlow)', channel: 'email', priority: 'high', status: 'open', agentDraftReady: true, slaBreachAt: new Date(Date.now() + 4 * 3600 * 1000).toISOString(), createdAt: now, updatedAt: now },
            { id: 'tk-003', ticketNumber: 'TK-2043', subject: 'How do I set up LDAP SSO?', customerName: 'James Owusu (Brightfield)', channel: 'chat', priority: 'normal', status: 'in_progress', agentDraftReady: true, createdAt: now, updatedAt: now },
            { id: 'tk-004', ticketNumber: 'TK-2040', subject: 'Agent loop running indefinitely — no kill switch visible', customerName: 'Nora Chen (AutoPilot AI)', channel: 'portal', priority: 'critical', status: 'escalated', agentDraftReady: false, createdAt: now, updatedAt: now },
            { id: 'tk-005', ticketNumber: 'TK-2038', subject: 'Request: export audit log as CSV', customerName: 'Tom Bradley (Northgate)', channel: 'email', priority: 'low', status: 'resolved', agentDraftReady: false, createdAt: now, updatedAt: now },
            { id: 'tk-006', ticketNumber: 'TK-2039', subject: 'API rate limit too low for bulk task submission', customerName: 'Dev Team (Streamline.io)', channel: 'portal', priority: 'high', status: 'pending_customer', agentDraftReady: true, createdAt: now, updatedAt: now },
        ];
        globalThis.__supportTickets = new Map(seed.map(d => [d.id, d]));
    }
    return globalThis.__supportTickets;
}

export async function GET(request: Request): Promise<Response> {
    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status');
    let items = Array.from(getStore().values());
    if (statusFilter) items = items.filter(d => d.status === statusFilter);
    return NextResponse.json({ total: items.length, tickets: items });
}
