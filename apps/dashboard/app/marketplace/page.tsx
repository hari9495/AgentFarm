import Link from 'next/link';
import { PageHeader } from '../components/page-header';
import { SkillMarketplacePanel } from '../components/skill-marketplace-panel';

type SearchParams = {
    workspaceId?: string;
    workspace_id?: string;
    botId?: string;
    bot_id?: string;
};

export default async function MarketplacePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
    const params = await searchParams;
    const workspaceId = (params.workspaceId ?? params.workspace_id ?? 'ws_primary_001').trim();
    const botId = (params.botId ?? params.bot_id ?? 'bot_dev_001').trim();

    const query = new URLSearchParams({
        workspaceId,
        botId,
    }).toString();

    return (
        <main className="page-shell" style={{ maxWidth: 960 }}>
            <PageHeader
                eyebrow="Customer Skill Hub"
                title="Skill Marketplace"
                description="Install and uninstall only the skills purchased for this customer agent."
            />

            <div style={{ display: 'flex', gap: '0.55rem', flexWrap: 'wrap' }}>
                <Link href={`/?workspaceId=${encodeURIComponent(workspaceId)}&tab=overview`} className="secondary-action" style={{ textDecoration: 'none' }}>
                    Back to Dashboard
                </Link>
                <Link href="/marketplace/roles" className="primary-action" style={{ textDecoration: 'none' }}>
                    Browse Agent Roles
                </Link>
                <Link href={`/internal/skills?${query}`} className="secondary-action" style={{ textDecoration: 'none' }}>
                    Open Internal Skill Manager
                </Link>
            </div>

            <SkillMarketplacePanel workspaceId={workspaceId} botId={botId} />
        </main>
    );
}
