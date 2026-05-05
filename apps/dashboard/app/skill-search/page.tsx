import { SkillSearchPanel } from '../components/skill-search-panel';

type SearchParams = {
    workspaceId?: string;
    botId?: string;
};

export default async function SkillSearchPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
    const params = await searchParams;
    const workspaceId = (params.workspaceId ?? 'ws_primary_001').trim();
    const botId = (params.botId ?? 'bot_dev_001').trim();

    return (
        <main style={{ maxWidth: 1100, margin: '1.5rem auto', padding: '0 1rem' }}>
            <h1>Skill Search</h1>
            <p style={{ marginTop: '-0.45rem', color: '#57534e' }}>
                Find and invoke skills by name, category, or tag. Search across the full skill catalog.
            </p>
            <SkillSearchPanel workspaceId={workspaceId} botId={botId} />
        </main>
    );
}
