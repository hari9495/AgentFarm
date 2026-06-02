import { NextResponse } from 'next/server';

type CandidateStatus = 'sourced' | 'screened' | 'interviewing' | 'offer_sent' | 'hired' | 'rejected';
type Candidate = { id: string; name: string; role: string; source: string; status: CandidateStatus; matchScore: number; appliedAt: string; };
// eslint-disable-next-line no-var
declare global { var __candidates: Map<string, Candidate> | undefined; }

const ADVANCE: Record<CandidateStatus, CandidateStatus> = {
    sourced: 'screened', screened: 'interviewing', interviewing: 'offer_sent',
    offer_sent: 'hired', hired: 'hired', rejected: 'rejected',
};

export async function POST(_req: Request, { params }: { params: Promise<{ candidateId: string; action: string }> }): Promise<Response> {
    const { candidateId, action } = await params;
    const store = globalThis.__candidates;
    if (!store) return NextResponse.json({ error: 'not_initialised' }, { status: 500 });
    const item = store.get(candidateId);
    if (!item) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    let newStatus = item.status;
    if (action === 'advance') newStatus = ADVANCE[item.status];
    else if (action === 'reject') newStatus = 'rejected';
    else return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
    const updated = { ...item, status: newStatus };
    store.set(candidateId, updated);
    return NextResponse.json(updated);
}
