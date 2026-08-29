'use client';

import { useCallback, useEffect, useState } from 'react';

type ActionItem = {
    id: string;
    text: string;
    ownerName: string | null;
    status: string;
    linkedTaskId: string | null;
    linkedConnector: string | null;
    approvalId: string | null;
    dispatchError: string | null;
};

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
    open: { bg: 'var(--surface-2, #f1f1f4)', color: 'var(--ink-soft)', label: 'open' },
    awaiting_approval: { bg: 'var(--warn-bg, #fff4e0)', color: 'var(--warn, #a15c00)', label: 'awaiting approval' },
    done: { bg: 'var(--ok-bg, #e7f6ec)', color: 'var(--ok, #1a7f45)', label: 'done' },
    failed: { bg: 'var(--err-bg, #fdecec)', color: 'var(--err, #b3261e)', label: 'failed' },
};

export default function MeetingActionItemsPanel({ sessionId }: { sessionId: string }) {
    const [items, setItems] = useState<ActionItem[]>([]);
    const [transcript, setTranscript] = useState('');
    const [busy, setBusy] = useState<string | null>(null);
    const [msg, setMsg] = useState<string | null>(null);

    const base = `/api/meetings/${encodeURIComponent(sessionId)}`;

    const load = useCallback(async () => {
        const res = await fetch(`${base}/action-items`, { cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        if (res.ok) setItems(data.items ?? []);
    }, [base]);

    useEffect(() => { void load(); }, [load]);

    const analyze = async () => {
        if (!transcript.trim()) return;
        setBusy('analyze'); setMsg(null);
        const res = await fetch(`${base}/analyze-transcript`, {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ transcript }),
        });
        const data = await res.json().catch(() => ({}));
        setMsg(res.ok ? `Analyzed — ${(data.items ?? []).length} action items.` : `Error: ${data.error ?? res.status}`);
        if (res.ok) { setTranscript(''); await load(); }
        setBusy(null);
    };

    const act = async (itemId: string, path: string, body?: unknown, label?: string) => {
        setBusy(itemId); setMsg(null);
        const res = await fetch(`${base}/action-items/${encodeURIComponent(itemId)}/${path}`, {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
        });
        const data = await res.json().catch(() => ({}));
        setMsg(res.ok ? `${label ?? path} ok` : `${label ?? path}: ${data.error ?? res.status}${data.message ? ` — ${data.message}` : ''}`);
        await load();
        setBusy(null);
    };

    return (
        <section className="card" style={{ display: 'grid', gap: '0.75rem', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Action Items</h3>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--ink-soft)' }}>
                Analyze a transcript to extract action items, then dispatch each through the approval queue.
            </p>

            {/* Analyze */}
            <div style={{ display: 'grid', gap: '0.4rem' }}>
                <textarea
                    value={transcript}
                    onChange={(e) => setTranscript(e.target.value)}
                    placeholder="Paste a meeting transcript…"
                    rows={4}
                    style={{ width: '100%', fontSize: '0.82rem', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border, #d9d9e0)', resize: 'vertical', fontFamily: 'inherit' }}
                />
                <div>
                    <button type="button" className="primary-action" disabled={busy === 'analyze' || !transcript.trim()} onClick={() => void analyze()}>
                        {busy === 'analyze' ? 'Analyzing…' : 'Analyze transcript'}
                    </button>
                </div>
            </div>

            {msg && <p className="message-inline" style={{ margin: 0, fontSize: '0.8rem' }}>{msg}</p>}

            {/* Items */}
            {items.length === 0 ? (
                <p style={{ margin: 0, color: 'var(--ink-soft)', fontSize: '0.82rem' }}>No action items yet.</p>
            ) : (
                <div style={{ display: 'grid', gap: '0.5rem' }}>
                    {items.map((it) => {
                        const s = STATUS_STYLE[it.status] ?? STATUS_STYLE.open;
                        return (
                            <div key={it.id} style={{ display: 'grid', gap: '0.35rem', padding: '0.6rem', borderRadius: '8px', border: '1px solid var(--border, #e3e3ea)' }}>
                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '0.85rem' }}>
                                        {it.ownerName && <strong>{it.ownerName}: </strong>}{it.text}
                                    </span>
                                    <span style={{ padding: '2px 8px', borderRadius: '5px', fontSize: '11px', fontWeight: 700, background: s.bg, color: s.color, whiteSpace: 'nowrap' }}>{s.label}</span>
                                </div>
                                {it.dispatchError && <span style={{ fontSize: '0.75rem', color: 'var(--err, #b3261e)' }}>error: {it.dispatchError}</span>}
                                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                    {(it.status === 'open') && (
                                        <button type="button" className="secondary-action" disabled={busy === it.id} onClick={() => void act(it.id, 'dispatch', { connector: 'jira' }, 'dispatch')}>
                                            Create Jira ticket
                                        </button>
                                    )}
                                    {it.status === 'awaiting_approval' && (
                                        <>
                                            <a href="/approvals" className="secondary-action" style={{ textDecoration: 'none', fontSize: '0.78rem' }}>Approve in queue →</a>
                                            <button type="button" className="primary-action" disabled={busy === it.id} onClick={() => void act(it.id, 'execute', undefined, 'execute')}>
                                                {busy === it.id ? 'Executing…' : 'Execute'}
                                            </button>
                                        </>
                                    )}
                                    {it.status === 'failed' && (
                                        <button type="button" className="secondary-action" disabled={busy === it.id} onClick={() => void act(it.id, 'execute', undefined, 'retry')}>
                                            Retry execute
                                        </button>
                                    )}
                                    {it.status === 'done' && it.linkedTaskId && (
                                        <span style={{ fontSize: '0.78rem', color: 'var(--ok, #1a7f45)' }}>✓ {it.linkedConnector}: {it.linkedTaskId}</span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </section>
    );
}
