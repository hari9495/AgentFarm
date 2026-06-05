import { redirect } from 'next/navigation';
import { PageHeader } from '../components/page-header';
import { getSessionPayload } from '../lib/internal-session';
import { SupportIssueFeed } from '../components/support-issue-feed';
import { SupportDiagnosisTrace } from '../components/support-diagnosis-trace';
import { SupportFixTimeline } from '../components/support-fix-timeline';
import { SupportChatWidget } from '../components/support-chat-widget';
import { SupportStatsBar } from '../components/support-stats-bar';
import { SupportVoiceWidget } from '../components/support-voice-widget';

export default async function SupportPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) {
        redirect('/login?next=/support');
    }

    return (
        <main className="page-shell">
            <PageHeader
                eyebrow="Platform"
                title="Support Agent"
                description="Real-time platform diagnosis and automated fix pipeline for tenant issues."
            />

            <SupportStatsBar />

            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: '340px 1fr',
                    gridTemplateRows: 'auto auto',
                    gap: '1rem',
                    alignItems: 'start',
                }}
            >
                {/* Left column: Issue Feed */}
                <div style={{ gridRow: '1 / 3' }}>
                    <SupportIssueFeed />
                </div>

                {/* Right top: Diagnosis Trace */}
                <SupportDiagnosisTrace />

                {/* Right bottom: three panels side-by-side */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                    <SupportFixTimeline />
                    <SupportChatWidget />
                    <SupportVoiceWidget />
                </div>
            </div>
        </main>
    );
}
