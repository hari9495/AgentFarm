import Link from 'next/link';
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
            <header className="hero" style={{ marginBottom: '0.3rem' }}>
                <p className="eyebrow">Customer Skill Hub</p>
                <h1>Skill Marketplace</h1>
                <p>Install and uninstall only the skills purchased for this customer agent.</p>
            </header>

            <div style={{ display: 'flex', gap: '0.55rem', flexWrap: 'wrap' }}>
                <Link href={`/?workspaceId=${encodeURIComponent(workspaceId)}&tab=overview`} className="secondary-action" style={{ textDecoration: 'none' }}>
                    Back to Dashboard
                </Link>
                <Link href={`/internal/skills?${query}`} className="primary-action" style={{ textDecoration: 'none' }}>
                    Open Internal Skill Manager
                </Link>
            </div>

            <SkillMarketplacePanel workspaceId={workspaceId} botId={botId} />
        </main>
    );
}
