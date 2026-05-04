import { NextResponse } from 'next/server';
import { runRuntimeProxy } from '../../../../route-handler-core';
import { buildMarketplaceCatalogDeleteRouteContract } from '../../../route-contract';
import { getInternalSessionAuthHeader } from '../../../../../../lib/internal-session';

export async function DELETE(
    _request: Request,
    { params }: { params: Promise<{ botId: string; skillId: string }> },
) {
    const { skillId } = await params;

    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json(
            { error: 'forbidden', message: 'Internal session required.' },
            { status: 403 },
        );
    }

    const trimmedSkillId = skillId.trim();
    if (!trimmedSkillId) {
        return NextResponse.json(
            { error: 'invalid_skill_id', message: 'skillId path parameter is required.' },
            { status: 400 },
        );
    }

    const contract = buildMarketplaceCatalogDeleteRouteContract(trimmedSkillId);
    const result = await runRuntimeProxy({
        sessionAuthHeader: authHeader,
        upstreamUrl: contract.upstreamUrl,
        requestInit: contract.requestInit,
    });

    return NextResponse.json(result.body, { status: result.status });
}
