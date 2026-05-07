'use client';

import { useState } from 'react';

type AgentQuestionItem = {
    id: string;
    tenantId: string;
    workspaceId: string;
    taskId: string;
    questionText: string;
    status: 'pending' | 'answered' | 'timed_out' | 'abandoned';
    askedAt: string;
    expiresAt: string;
    answer: string | null;
    answeredAt: string | null;
};

type Props = {
    workspaceId: string;
    tenantId: string;
    initialQuestions: AgentQuestionItem[];
};

export function AgentQuestionPanel({ workspaceId, tenantId, initialQuestions }: Props) {
    const [questions, setQuestions] = useState<AgentQuestionItem[]>(initialQuestions);
    const [answersByQuestionId, setAnswersByQuestionId] = useState<Record<string, string>>({});
    const [busyByQuestionId, setBusyByQuestionId] = useState<Record<string, boolean>>({});
    const [message, setMessage] = useState<string | null>(null);

    const submitAnswer = async (questionId: string) => {
        const answer = answersByQuestionId[questionId]?.trim();
        if (!answer) {
            setMessage('Enter an answer before submitting.');
            return;
        }

        setBusyByQuestionId((prev) => ({ ...prev, [questionId]: true }));
        setMessage(null);

        try {
            const response = await fetch('/api/questions/answer', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                },
                body: JSON.stringify({
                    question_id: questionId,
                    answer,
                    tenant_id: tenantId,
                    workspace_id: workspaceId,
                }),
            });

            const data = (await response.json().catch(() => ({}))) as { error?: string; message?: string; status?: string };
            if (!response.ok) {
                setMessage(data.message ?? data.error ?? 'Failed to answer question.');
                return;
            }

            setQuestions((prev) => prev.filter((item) => item.id !== questionId));
            setAnswersByQuestionId((prev) => {
                const next = { ...prev };
                delete next[questionId];
                return next;
            });
            setMessage('Answer submitted. The task can now resume.');
        } catch {
            setMessage('Unable to submit answer right now.');
        } finally {
            setBusyByQuestionId((prev) => ({ ...prev, [questionId]: false }));
        }
    };

    return (
        <section className="card" aria-label="agent-question-panel">
            <h2>Agent Questions</h2>
            <p className="muted" style={{ marginTop: '-0.2rem' }}>
                Questions that block task progress until a human answers.
            </p>

            {message && <div className="status-panel warning" style={{ marginBottom: '0.75rem' }}>{message}</div>}

            {questions.length === 0 ? (
                <p className="muted">No pending agent questions for this workspace.</p>
            ) : (
                <div style={{ display: 'grid', gap: '0.75rem' }}>
                    {questions.map((question) => {
                        const isBusy = busyByQuestionId[question.id] === true;
                        const answerValue = answersByQuestionId[question.id] ?? '';

                        return (
                            <article key={question.id} className="status-panel" style={{ display: 'grid', gap: '0.55rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.4rem' }}>
                                    <strong>Task {question.taskId}</strong>
                                    <span className="badge warn">expires {new Date(question.expiresAt).toLocaleString('en-US')}</span>
                                </div>
                                <p style={{ margin: 0 }}>{question.questionText}</p>
                                <textarea
                                    value={answerValue}
                                    onChange={(event) => {
                                        const value = event.target.value;
                                        setAnswersByQuestionId((prev) => ({ ...prev, [question.id]: value }));
                                    }}
                                    placeholder="Type an answer for the agent..."
                                    rows={3}
                                    style={{ width: '100%', resize: 'vertical' }}
                                    disabled={isBusy}
                                />
                                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                    <button
                                        type="button"
                                        className="secondary-action"
                                        disabled={isBusy}
                                        onClick={() => void submitAnswer(question.id)}
                                    >
                                        {isBusy ? 'Submitting...' : 'Submit Answer'}
                                    </button>
                                </div>
                            </article>
                        );
                    })}
                </div>
            )}
        </section>
    );
}
