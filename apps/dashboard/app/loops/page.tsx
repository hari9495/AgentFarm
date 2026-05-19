import { redirect } from 'next/navigation';
import { PageHeader } from '../components/page-header';
import { getSessionPayload } from '../lib/internal-session';
import AutonomousLoopsPanel from '../components/autonomous-loops-panel';

export default async function LoopsPage() {
    const session = await getSessionPayload();
    if (!session) {
        redirect('/login?next=/loops');
    }

    return (
        <main className="page-shell">
            <PageHeader
                eyebrow="Automation"
                title="Autonomous Loops"
                description="Execute and monitor self-directing autonomous agent loops."
            />
            <AutonomousLoopsPanel />
        </main>
    );
}
