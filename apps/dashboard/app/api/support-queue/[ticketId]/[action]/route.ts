import { NextResponse } from 'next/server';

type TicketStatus = 'open' | 'in_progress' | 'pending_customer' | 'resolved' | 'escalated';
declare global { var __supportTickets: Map<string, { id: string; status: TicketStatus; updatedAt: string; [k: string]: unknown }> | undefined; }

const TRANSITIONS: Record<string, TicketStatus> = {
    escalate: 'escalated', resolve: 'resolved', reopen: 'open',
};

export async function POST(_req: Request, { params }: { params: Promise<{ ticketId: string; action: string }> }): Promise<Response> {
    const { ticketId, action } = await params;
    const newStatus = TRANSITIONS[action];
    if (!newStatus) return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
    const store = globalThis.__supportTickets;
    if (!store) return NextResponse.json({ error: 'not_initialised' }, { status: 500 });
    const item = store.get(ticketId);
    if (!item) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const updated = { ...item, status: newStatus, updatedAt: new Date().toISOString() };
    store.set(ticketId, updated);
    return NextResponse.json(updated);
}
