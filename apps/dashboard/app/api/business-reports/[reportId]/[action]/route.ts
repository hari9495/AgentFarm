import { NextResponse } from 'next/server';

type ReportStatus = 'draft' | 'pending_review' | 'approved' | 'rejected';
declare global { var __businessReports: Map<string, { id: string; status: ReportStatus; [k: string]: unknown }> | undefined; }

const TRANSITIONS: Record<string, ReportStatus> = { approve: 'approved', reject: 'rejected' };

export async function POST(_req: Request, { params }: { params: Promise<{ reportId: string; action: string }> }): Promise<Response> {
    const { reportId, action } = await params;
    const newStatus = TRANSITIONS[action];
    if (!newStatus) return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
    const store = globalThis.__businessReports;
    if (!store) return NextResponse.json({ error: 'not_initialised' }, { status: 500 });
    const item = store.get(reportId);
    if (!item) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const updated = { ...item, status: newStatus };
    store.set(reportId, updated);
    return NextResponse.json(updated);
}
