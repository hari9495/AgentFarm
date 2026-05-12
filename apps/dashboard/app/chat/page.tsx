import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSessionPayload } from '../lib/internal-session';
import ChatSessionsPanel from '../components/chat-sessions-panel';

export default async function ChatPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) {
        redirect('/login?next=/chat');
    }
    const { tenantId } = session;

    return (
        <main className="page-shell">
            <Link
                href="/"
                style={{
                    fontSize: '0.8rem',
                    color: 'var(--ink-soft)',
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    marginBottom: '0.5rem',
                }}
            >
                ← Back to dashboard
            </Link>

            <p
                style={{
                    margin: '0 0 0.25rem',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: 'var(--ink-muted)',
                }}
            >
                Interaction
            </p>
            <h1 style={{ margin: '0 0 0.35rem' }}>Agent Chat</h1>
            <p style={{ margin: '0 0 1.5rem', color: 'var(--ink-soft)', fontSize: '0.9rem' }}>
                Create and manage direct chat sessions with agents.
            </p>

            <ChatSessionsPanel tenantId={tenantId} />
        </main>
    );
}
