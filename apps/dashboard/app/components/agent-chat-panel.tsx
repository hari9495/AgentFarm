'use client';

/**
 * AgentChatPanel
 *
 * Chat-style interface for submitting tasks to the autonomous coding loop.
 * Displays a task timeline of LoopStepRecord entries per task.
 */

import { useState } from 'react';

type LoopStep =
    | 'analyze_issue'
    | 'create_branch'
    | 'implement_changes'
    | 'run_tests'
    | 'fix_failures'
    | 'create_pr'
    | 'done';

type LoopStepRecord = {
    step: LoopStep;
    status: 'pending' | 'running' | 'done' | 'failed' | 'skipped';
    started_at: number;
    completed_at?: number;
    output?: Record<string, unknown>;
    error?: string;
};

type LoopMessage = {
    role: 'user' | 'agent';
    content: string;
    timestamp: string;
    loop_id?: string;
    steps?: LoopStepRecord[];
};

const STEP_ORDER: LoopStep[] = ['analyze_issue', 'create_branch', 'implement_changes', 'run_tests', 'fix_failures', 'create_pr', 'done'];

const STEP_LABELS: Record<LoopStep, string> = {
    analyze_issue: 'Analyze Issue',
    create_branch: 'Create Branch',
    implement_changes: 'Implement Changes',
    run_tests: 'Run Tests',
    fix_failures: 'Fix Failures',
    create_pr: 'Create PR',
    done: 'Done',
};

const STATUS_ICON: Record<string, string> = {
    pending: '○',
    running: '⟳',
    done: '✓',
    failed: '✗',
    skipped: '–',
};

const STATUS_COLOR: Record<string, string> = {
    pending: '#555',
    running: '#60a5fa',
    done: '#22c55e',
    failed: '#ef4444',
    skipped: '#888',
};

function TaskTimeline({ steps }: { steps: LoopStepRecord[] }) {
    return (
        <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: '#0f0f1a', borderRadius: 8, border: '1px solid #222' }}>
            <p style={{ fontSize: '0.75rem', color: '#888', marginBottom: '0.5rem', fontWeight: 600 }}>TASK TIMELINE</p>
            <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {STEP_ORDER.map((step) => {
                    const record = steps.find((s) => s.step === step);
                    const status = record?.status ?? 'pending';
                    const durationMs = record?.completed_at && record?.started_at
                        ? record.completed_at - record.started_at
                        : null;
                    return (
                        <li key={step} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ color: STATUS_COLOR[status] ?? '#888', fontWeight: 700, fontSize: '0.85rem', minWidth: 14, textAlign: 'center' }}>
                                {STATUS_ICON[status] ?? '○'}
                            </span>
                            <span style={{ fontSize: '0.82rem', color: status === 'done' ? '#ccc' : status === 'running' ? '#93c5fd' : '#555', flex: 1 }}>
                                {STEP_LABELS[step]}
                            </span>
                            {durationMs !== null && (
                                <span style={{ fontSize: '0.72rem', color: '#666' }}>{durationMs}ms</span>
                            )}
                            {record?.error && (
                                <span style={{ fontSize: '0.72rem', color: '#f87171' }}>{record.error}</span>
                            )}
                        </li>
                    );
                })}
            </ol>
        </div>
    );
}

function ChatBubble({ message }: { message: LoopMessage }) {
    const isUser = message.role === 'user';
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start', marginBottom: '0.75rem' }}>
            <div style={{
                maxWidth: '80%',
                padding: '0.65rem 0.85rem',
                borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                background: isUser ? '#4f46e5' : '#1a1a2e',
                border: isUser ? 'none' : '1px solid #333',
                fontSize: '0.875rem',
                lineHeight: 1.5,
            }}>
                {message.content}
            </div>
            <span style={{ fontSize: '0.68rem', color: '#555', marginTop: '0.2rem' }}>
                {new Date(message.timestamp).toLocaleTimeString()}
                {message.loop_id && ` · ${message.loop_id}`}
            </span>
            {message.steps && message.steps.length > 0 && (
                <div style={{ maxWidth: '80%', width: '100%' }}>
                    <TaskTimeline steps={message.steps} />
                </div>
            )}
        </div>
    );
}

export function AgentChatPanel() {
    const [messages, setMessages] = useState<LoopMessage[]>([
        {
            role: 'agent',
            content: 'Hello! Describe a task and I\'ll kick off the autonomous coding loop. Example: "Fix the flaky test in auth service and open a PR."',
            timestamp: new Date().toISOString(),
        },
    ]);
    const [input, setInput] = useState('');
    const [isRunning, setIsRunning] = useState(false);

    const sendMessage = async () => {
        const trimmed = input.trim();
        if (!trimmed || isRunning) return;
        setInput('');
        const userMsg: LoopMessage = { role: 'user', content: trimmed, timestamp: new Date().toISOString() };
        setMessages((prev) => [...prev, userMsg]);
        setIsRunning(true);

        try {
            const response = await fetch('/api/runtime/agent/autonomous-loop', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ description: trimmed, dry_run: true }),
            });
            const body = await response.json() as { loop_id?: string; steps?: LoopStepRecord[]; summary?: string; error?: string; ok?: boolean };
            const agentMsg: LoopMessage = {
                role: 'agent',
                content: body.summary ?? (body.ok === false ? (body.error ?? 'Task failed.') : 'Task dispatched. See timeline below.'),
                timestamp: new Date().toISOString(),
                loop_id: body.loop_id,
                steps: body.steps ?? [],
            };
            setMessages((prev) => [...prev, agentMsg]);
        } catch (err) {
            setMessages((prev) => [...prev, {
                role: 'agent',
                content: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
                timestamp: new Date().toISOString(),
            }]);
        } finally {
            setIsRunning(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void sendMessage();
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '70vh', background: '#0d0d1a', borderRadius: 12, border: '1px solid #222', overflow: 'hidden' }}>
            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column' }}>
                {messages.map((msg, i) => (
                    <ChatBubble key={i} message={msg} />
                ))}
                {isRunning && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', color: '#60a5fa' }}>
                        <span style={{ animation: 'spin 1s linear infinite' }}>⟳</span>
                        Agent is working…
                    </div>
                )}
            </div>

            {/* Input */}
            <div style={{ padding: '0.75rem', borderTop: '1px solid #222', display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
                <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    rows={2}
                    placeholder="Describe a task… (Enter to send, Shift+Enter for newline)"
                    style={{ flex: 1, padding: '0.5rem 0.7rem', borderRadius: 8, border: '1px solid #333', background: '#0f0f1a', color: '#eee', fontSize: '0.875rem', resize: 'none', lineHeight: 1.5 }}
                    disabled={isRunning}
                />
                <button
                    onClick={() => { void sendMessage(); }}
                    disabled={isRunning || input.trim().length === 0}
                    style={{ padding: '0.55rem 1.1rem', borderRadius: 8, background: isRunning ? '#333' : '#4f46e5', color: '#fff', border: 'none', cursor: isRunning ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.875rem', height: 'fit-content' }}
                >
                    Send
                </button>
            </div>
        </div>
    );
}
