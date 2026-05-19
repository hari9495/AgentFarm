import { SkillSearchPanel } from '../components/skill-search-panel';
import { PageHeader } from '../components/page-header';

type SearchParams = {
    workspaceId?: string;
    botId?: string;
};

export default async function SkillSearchPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
    const params = await searchParams;
    const workspaceId = (params.workspaceId ?? 'ws_primary_001').trim();
    const botId = (params.botId ?? 'bot_dev_001').trim();

    return (
        <main className="page-shell" style={{ maxWidth: 1100 }}>
            <PageHeader
                eyebrow="Skills"
                title="Skill Search"
                description="Find and invoke skills by name, category, or tag. Search across the full skill catalog."
            />
            <SkillSearchPanel workspaceId={workspaceId} botId={botId} />
        </main>
    );
}
