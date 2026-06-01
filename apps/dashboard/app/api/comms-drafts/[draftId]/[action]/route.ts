import { NextResponse } from 'next/server';

type CommsStatus = 'draft' | 'pending_review' | 'approved' | 'sent' | 'rejected';

declare global {
    // eslint-disable-next-line no-var
    var __commsDrafts: Map<string, { id: string; status: CommsStatus; updatedAt: string; [key: string]: unknown }> | undefined;
}

const TRANSITIONS: Record<string, CommsStatus> = {
    approve: 'approved',
    reject: 'rejected',
    send: 'sent',
};

export async function POST(
    _request: Request,
    { params }: { params: Promise<{ draftId: string; action: string }> },
): Promise<Response> {
    const { draftId, action } = await params;
    const newStatus = TRANSITIONS[action];
    if (!newStatus) return NextResponse.json({ error: 'invalid_action' }, { status: 400 });

    const store = globalThis.__commsDrafts;
    if (!store) return NextResponse.json({ error: 'store_not_initialised' }, { status: 500 });

    const draft = store.get(draftId);
    if (!draft) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    if (action === 'send' && draft.status !== 'approved') {
        return NextResponse.json({ error: 'must_be_approved_first', message: 'Approve the draft before sending.' }, { status: 400 });
    }

    const updated = { ...draft, status: newStatus, updatedAt: new Date().toISOString() };
    store.set(draftId, updated);
    return NextResponse.json(updated);
}
