import { NextResponse } from 'next/server';
import { fetchAuditAccess } from '../../../lib/plan-gate.server';

export async function GET() {
    const { planName, access } = await fetchAuditAccess();
    return NextResponse.json({ planName, auditAccess: access });
}
