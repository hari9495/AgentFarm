import { redirect } from 'next/navigation';
import { PageHeader } from '../components/page-header';
import { getSessionPayload } from '../lib/internal-session';
import TeamPanel from '../components/team-panel';

export default async function TeamPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) {
        redirect('/login?next=/team');
    }

    return (
        <main className="page-shell">
            <PageHeader
                eyebrow="Administration"
                title="Team"
                description="Manage team members and access roles for your tenant."
            />
            <TeamPanel />
        </main>
    );
}
