import { NextResponse } from 'next/server';
import {
    getSkillEntitlements,
    listSkillEntitlements,
    upsertSkillEntitlements,
} from '../../../lib/marketplace-entitlements';
import { getInternalSessionAuthHeader } from '../../../lib/internal-session';

const resolveWorkspaceId = (value: string | null): string => value?.trim() || '';
const resolveBotId = (value: string | null): string => value?.trim() || '';

export async function GET(request: Request) {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json(
            { error: 'forbidden', message: 'Internal session required.' },
            { status: 403 },
        );
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = resolveWorkspaceId(searchParams.get('workspace_id') ?? searchParams.get('workspaceId'));
    const botId = resolveBotId(searchParams.get('bot_id') ?? searchParams.get('botId'));

    if (workspaceId && botId) {
        return NextResponse.json({
            entitlement: getSkillEntitlements(workspaceId, botId),
        });
    }

    return NextResponse.json({
        entitlements: listSkillEntitlements(),
    });
}

export async function PUT(request: Request) {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json(
            { error: 'forbidden', message: 'Internal session required.' },
            { status: 403 },
        );
    }

    const body = (await request.json().catch(() => null)) as {
        workspace_id?: string;
        workspaceId?: string;
        bot_id?: string;
        botId?: string;
        skill_ids?: string[];
        skillIds?: string[];
    } | null;

    const workspaceId = resolveWorkspaceId(body?.workspace_id ?? body?.workspaceId ?? null);
    const botId = resolveBotId(body?.bot_id ?? body?.botId ?? null);
    const skillIdsRaw = body?.skill_ids ?? body?.skillIds;

    if (!workspaceId || !botId || !Array.isArray(skillIdsRaw)) {
        return NextResponse.json(
            {
                error: 'invalid_payload',
                message: 'workspace_id, bot_id, and skill_ids are required.',
            },
            { status: 400 },
        );
    }

    const saved = upsertSkillEntitlements(
        workspaceId,
        botId,
        skillIdsRaw.filter((entry): entry is string => typeof entry === 'string'),
    );

    return NextResponse.json({
        status: 'saved',
        entitlement: saved,
    });
}
