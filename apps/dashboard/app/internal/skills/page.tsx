import Link from 'next/link';
import { PageHeader } from '../../components/page-header';
import { InternalSkillCatalogPanel } from '../../components/internal-skill-catalog-panel';

type SearchParams = {
    workspaceId?: string;
    workspace_id?: string;
    botId?: string;
    bot_id?: string;
};

export default async function InternalSkillCatalogPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
    const params = await searchParams;
    const workspaceId = (params.workspaceId ?? params.workspace_id ?? 'ws_primary_001').trim();
    const botId = (params.botId ?? params.bot_id ?? 'bot_dev_001').trim();

    const query = new URLSearchParams({
        workspaceId,
        botId,
    }).toString();

    return (
        <main className="page-shell" style={{ maxWidth: 980 }}>
            <PageHeader
                eyebrow="Internal Operations"
                title="Skill Catalog Manager"
                description="Create managed skills and publish entitlements so customer agents only see allowed installs."
            />

            <div style={{ display: 'flex', gap: '0.55rem', flexWrap: 'wrap' }}>
                <Link href={`/?workspaceId=${encodeURIComponent(workspaceId)}&tab=overview`} className="secondary-action" style={{ textDecoration: 'none' }}>
                    Back to Dashboard
                </Link>
                <Link href={`/marketplace?${query}`} className="primary-action" style={{ textDecoration: 'none' }}>
                    Open Customer Marketplace View
                </Link>
            </div>

            <InternalSkillCatalogPanel defaultWorkspaceId={workspaceId} defaultBotId={botId} />
        </main>
    );
}
