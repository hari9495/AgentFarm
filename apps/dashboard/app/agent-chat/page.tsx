/**
 * Agent Chat Page — Tier G Dashboard UX
 *
 * Provides an interactive chat interface for dispatching agent tasks,
 * showing real-time task step progress, and viewing LoopStepRecord history.
 */

import { AgentChatPanel } from '../components/agent-chat-panel';

export default function AgentChatPage() {
    return (
        <main className="page-shell" style={{ maxWidth: 900 }}>
            <header className="hero" style={{ marginBottom: '0.3rem' }}>
                <p className="eyebrow">Autonomous Agent</p>
                <h1>Agent Chat</h1>
                <p>Send tasks to the autonomous coding loop and follow each step in real time.</p>
            </header>
            <AgentChatPanel />
        </main>
    );
}
