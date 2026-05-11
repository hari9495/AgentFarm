import { SessionReplayLoader } from '../../components/session-replay-loader';
import { SessionIndexPanel } from '../../components/session-index-panel';

export default async function SessionReplayPage({
    searchParams,
}: {
    searchParams: Promise<{ sessionId?: string }>;
}) {
    const params = await searchParams;
    const sessionId = params.sessionId?.trim() ?? '';

    if (!sessionId) {
        return (
            <main className="page-shell" style={{ maxWidth: 1100 }}>
                <header className="hero" style={{ marginBottom: '0.55rem' }}>
                    <p className="eyebrow">Observability</p>
                    <h1>Session Replay</h1>
                    <p>Recent Sessions — click a row to replay</p>
                </header>
                <SessionIndexPanel />
            </main>
        );
    }

    return (
        <main className="page-shell" style={{ maxWidth: 1200 }}>
            <header className="hero" style={{ marginBottom: '0.55rem' }}>
                <p className="eyebrow">Observability</p>
                <h1>Session Replay</h1>
                <p>Inspect every captured browser or desktop action for this session.</p>
            </header>
            <SessionReplayLoader sessionId={sessionId} />
        </main>
    );
}
