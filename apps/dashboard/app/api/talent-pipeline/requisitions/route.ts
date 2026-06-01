import { NextResponse } from 'next/server';

type ReqStatus = 'open' | 'on_hold' | 'filled' | 'cancelled';

type JobRequisition = {
    id: string; title: string; department: string;
    status: ReqStatus; candidateCount: number; openedAt: string;
};

declare global { var __requisitions: Map<string, JobRequisition> | undefined; }

function getStore(): Map<string, JobRequisition> {
    if (!globalThis.__requisitions) {
        const now = new Date().toISOString();
        const seed: JobRequisition[] = [
            { id: 'rq-001', title: 'Senior DevOps Engineer', department: 'Engineering', status: 'open', candidateCount: 7, openedAt: now },
            { id: 'rq-002', title: 'Full-Stack Engineer', department: 'Engineering', status: 'open', candidateCount: 3, openedAt: now },
            { id: 'rq-003', title: 'Product Manager', department: 'Product', status: 'open', candidateCount: 5, openedAt: now },
            { id: 'rq-004', title: 'ML Engineer', department: 'AI Research', status: 'filled', candidateCount: 12, openedAt: now },
            { id: 'rq-005', title: 'Customer Success Manager', department: 'GTM', status: 'on_hold', candidateCount: 2, openedAt: now },
        ];
        globalThis.__requisitions = new Map(seed.map(d => [d.id, d]));
    }
    return globalThis.__requisitions;
}

export async function GET(request: Request): Promise<Response> {
    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status');
    let items = Array.from(getStore().values());
    if (statusFilter) items = items.filter(d => d.status === statusFilter);
    return NextResponse.json({ total: items.length, requisitions: items });
}
