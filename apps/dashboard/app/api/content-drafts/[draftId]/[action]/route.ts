import { NextResponse } from 'next/server';

type DraftStatus = 'pending_review' | 'approved' | 'rejected' | 'published';
type ContentDraft = { id: string; botId: string; agentRole: string; draftType: string; title: string; excerpt: string; wordCount: number; status: DraftStatus; targetChannel: string; createdAt: string; updatedAt: string; };

declare global {
    // eslint-disable-next-line no-var
    var __contentDrafts: Map<string, ContentDraft> | undefined;
}

const TRANSITIONS: Record<string, DraftStatus> = {
    approve: 'approved',
    reject: 'rejected',
    publish: 'published',
};

export async function POST(
    _request: Request,
    { params }: { params: Promise<{ draftId: string; action: string }> },
): Promise<Response> {
    const { draftId, action } = await params;
    const newStatus = TRANSITIONS[action];
    if (!newStatus) return NextResponse.json({ error: 'invalid_action' }, { status: 400 });

    const store = globalThis.__contentDrafts;
    if (!store) return NextResponse.json({ error: 'store_not_initialised' }, { status: 500 });

    const draft = store.get(draftId);
    if (!draft) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    if (action === 'publish' && draft.status !== 'approved') {
        return NextResponse.json({ error: 'must_be_approved_first', message: 'Approve the draft before publishing.' }, { status: 400 });
    }

    const updated = { ...draft, status: newStatus, updatedAt: new Date().toISOString() };
    store.set(draftId, updated);
    return NextResponse.json(updated);
}
