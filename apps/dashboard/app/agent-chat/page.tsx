/**
 * Agent Chat Page — Tier G Dashboard UX
 *
 * Provides an interactive chat interface for dispatching agent tasks,
 * showing real-time task step progress, and viewing LoopStepRecord history.
 */

import { AgentChatPanel } from '../components/agent-chat-panel';
import { PageHeader } from '../components/page-header';

export default function AgentChatPage() {
    return (
        <main className="page-shell">
            <PageHeader
                eyebrow="Autonomous Agent"
                title="Agent Chat"
                description="Send tasks to the autonomous coding loop and follow each step in real time."
            />
            <AgentChatPanel />
        </main>
    );
}
