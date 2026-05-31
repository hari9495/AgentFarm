import { SessionReplayLoader } from '../../components/session-replay-loader';
import { SessionIndexPanel } from '../../components/session-index-panel';
import { PageHeader } from '../../components/page-header';
import { AuditUpgradeWall } from '../../components/audit-upgrade-wall';
import { fetchAuditAccess } from '../../lib/plan-gate';

export default async function SessionReplayPage({
    searchParams,
}: {
    searchParams: Promise<{ sessionId?: string }>;
}) {
    const params = await searchParams;
    const sessionId = params.sessionId?.trim() ?? '';

    const { planName, access } = await fetchAuditAccess();
    if (!access) {
        return (
            <main className="page-shell">
                <PageHeader eyebrow="Audit & Compliance" title="Session Replay" tone="violet" />
                <AuditUpgradeWall planName={planName} />
            </main>
        );
    }

    if (!sessionId) {
        return (
            <main className="page-shell">
                <PageHeader
                    eyebrow="Observability"
                    title="Session Replay"
                    description="Recent Sessions — click a row to replay"
                />
                <SessionIndexPanel />
            </main>
        );
    }

    return (
        <main className="page-shell">
            <PageHeader
                eyebrow="Observability"
                title="Session Replay"
                description="Inspect every captured browser or desktop action for this session."
            />
            <SessionReplayLoader sessionId={sessionId} />
        </main>
    );
}
