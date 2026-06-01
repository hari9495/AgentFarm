import { NextResponse } from 'next/server';

type CandidateStatus = 'sourced' | 'screened' | 'interviewing' | 'offer_sent' | 'hired' | 'rejected';

type Candidate = {
    id: string; name: string; role: string; source: string;
    status: CandidateStatus; matchScore: number; appliedAt: string;
};

declare global { var __candidates: Map<string, Candidate> | undefined; }

function getStore(): Map<string, Candidate> {
    if (!globalThis.__candidates) {
        const now = new Date().toISOString();
        const seed: Candidate[] = [
            { id: 'cd-001', name: 'Priya Sharma', role: 'Senior DevOps Engineer', source: 'LinkedIn', status: 'interviewing', matchScore: 91, appliedAt: now },
            { id: 'cd-002', name: 'Marcus Webb', role: 'Full-Stack Engineer', source: 'Referral', status: 'screened', matchScore: 84, appliedAt: now },
            { id: 'cd-003', name: 'Aisha Okonkwo', role: 'Product Manager', source: 'AngelList', status: 'offer_sent', matchScore: 88, appliedAt: now },
            { id: 'cd-004', name: 'Jake Thornton', role: 'Senior DevOps Engineer', source: 'GitHub Sourcing', status: 'sourced', matchScore: 76, appliedAt: now },
            { id: 'cd-005', name: 'Sofia Reyes', role: 'ML Engineer', source: 'Direct application', status: 'hired', matchScore: 95, appliedAt: now },
        ];
        globalThis.__candidates = new Map(seed.map(d => [d.id, d]));
    }
    return globalThis.__candidates;
}

export async function GET(request: Request): Promise<Response> {
    const { searchParams } = new URL(request.url);
    const stageFilter = searchParams.get('stage') ?? searchParams.get('status');
    let items = Array.from(getStore().values());
    if (stageFilter) items = items.filter(d => d.status === stageFilter);
    return NextResponse.json({ total: items.length, candidates: items });
}
