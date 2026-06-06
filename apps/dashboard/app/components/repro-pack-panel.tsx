'use client';

import { useState, useCallback } from 'react';
import { Package, Plus, Copy, Check, AlertCircle, ChevronDown, ChevronRight, Clock } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type ReproPack = {
    id: string;
    workspaceId: string;
    taskId?: string;
    createdAt: string;
    description?: string;
    payload?: unknown;
};

type ReproPackResponse = {
    reproPack?: ReproPack;
    pack?: ReproPack;
    error?: string;
    message?: string;
};

type ReproPackListResponse = {
    packs?: ReproPack[];
    reproPacks?: ReproPack[];
    error?: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
    try {
        return new Date(iso).toLocaleString(undefined, {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
        });
    } catch {
        return iso;
    }
}

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <button
            onClick={() => { void navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 9999, border: '1px solid var(--line)', background: 'var(--card)', color: copied ? '#1a7a4a' : '#6e6e73', fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' }}
        >
            {copied ? <Check size={11} /> : <Copy size={11} />}
            {copied ? 'Copied' : 'Copy ID'}
        </button>
    );
}

function PackRow({ pack }: { pack: ReproPack }) {
    const [expanded, setExpanded] = useState(false);
    return (
        <div style={{ border: '1px solid var(--line)', borderRadius: 14, background: 'var(--card)', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <button
                type="button"
                onClick={() => setExpanded(v => !v)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}
            >
                <div style={{ width: 34, height: 34, borderRadius: 9, background: 'color-mix(in srgb, var(--accent) 8%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Package size={15} color="var(--accent)" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', fontFamily: 'monospace' }}>
                        #{pack.id.slice(-12).toUpperCase()}
                    </div>
                    {pack.description && (
                        <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {pack.description}
                        </div>
                    )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--ink-muted)' }}>
                        <Clock size={11} /> {formatDate(pack.createdAt)}
                    </span>
                    {expanded ? <ChevronDown size={14} color="#6e6e73" /> : <ChevronRight size={14} color="#6e6e73" />}
                </div>
            </button>

            {expanded && (
                <div style={{ borderTop: '1px solid #f0f0f2', padding: '14px 16px', background: 'var(--bg)' }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                        <CopyButton text={pack.id} />
                        {pack.taskId && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 9999, background: 'color-mix(in srgb, var(--accent) 7%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)', fontSize: 11, fontWeight: 600, color: 'var(--accent)' }}>
                                Task: {pack.taskId.slice(-8).toUpperCase()}
                            </span>
                        )}
                    </div>
                    {pack.payload !== undefined && (
                        <pre style={{ margin: 0, padding: '10px 12px', borderRadius: 10, background: 'var(--bg-deep)', color: '#f5f5f7', fontSize: 11, overflow: 'auto', maxHeight: 220, lineHeight: 1.5, fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}>
                            {JSON.stringify(pack.payload, null, 2)}
                        </pre>
                    )}
                    <div style={{ marginTop: 8, fontSize: 11, color: 'var(--ink-muted)' }}>
                        Workspace: <span style={{ fontFamily: 'monospace' }}>{pack.workspaceId}</span>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Main component ─────────────────────────────────────────────────────────────

type Props = { botId: string };

export default function ReproPackPanel({ botId }: Props) {
    const [packs, setPacks] = useState<ReproPack[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Create form
    const [creating, setCreating] = useState(false);
    const [taskId, setTaskId] = useState('');
    const [description, setDescription] = useState('');
    const [createError, setCreateError] = useState<string | null>(null);
    const [createSuccess, setCreateSuccess] = useState<ReproPack | null>(null);

    const loadPacks = useCallback(async () => {
        if (!botId) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/runtime/${encodeURIComponent(botId)}/repro-pack`);
            if (!res.ok) {
                // GET not supported on collection — that's fine, show create form only
                setLoaded(true);
                return;
            }
            const body = (await res.json()) as ReproPackListResponse;
            if (body.error) { setError(body.error); return; }
            setPacks(body.packs ?? body.reproPacks ?? []);
            setLoaded(true);
        } catch {
            setError('Network error loading repro packs.');
        } finally {
            setLoading(false);
        }
    }, [botId]);

    const createPack = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if (!botId) return;
        setCreating(true);
        setCreateError(null);
        setCreateSuccess(null);
        try {
            const res = await fetch(`/api/runtime/${encodeURIComponent(botId)}/repro-pack`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...(taskId.trim() ? { taskId: taskId.trim() } : {}),
                    ...(description.trim() ? { description: description.trim() } : {}),
                }),
            });
            const body = (await res.json()) as ReproPackResponse;
            if (!res.ok || body.error) {
                setCreateError(body.message ?? body.error ?? 'Failed to create repro pack.');
                return;
            }
            const pack = body.reproPack ?? body.pack;
            if (pack) {
                setCreateSuccess(pack);
                setPacks(prev => [pack, ...prev]);
                setTaskId('');
                setDescription('');
            }
        } catch {
            setCreateError('Network error creating repro pack.');
        } finally {
            setCreating(false);
        }
    }, [botId, taskId, description]);

    const inputStyle: React.CSSProperties = {
        width: '100%', padding: '8px 11px', borderRadius: 9,
        border: '1px solid var(--line)', background: 'var(--card)',
        color: 'var(--ink)', fontSize: 13, outline: 'none',
    };

    if (!botId) {
        return (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink-muted)', fontSize: 14 }}>
                Select a bot to manage repro packs.
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Create form */}
            <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 18, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 9, background: 'color-mix(in srgb, var(--accent) 8%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Package size={15} color="var(--accent)" />
                    </div>
                    <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.01em' }}>Create Repro Pack</div>
                        <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>Bundle a task's context into a reproducible debug snapshot</div>
                    </div>
                </div>

                <form onSubmit={createPack} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div>
                            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)', display: 'block', marginBottom: 4 }}>
                                Task ID <span style={{ color: 'var(--ink-muted)', fontWeight: 400 }}>(optional)</span>
                            </label>
                            <input value={taskId} onChange={e => setTaskId(e.target.value)} style={inputStyle} placeholder="task_..." />
                        </div>
                        <div>
                            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)', display: 'block', marginBottom: 4 }}>Description</label>
                            <input value={description} onChange={e => setDescription(e.target.value)} style={inputStyle} placeholder="e.g. Auth regression in PR #42" />
                        </div>
                    </div>

                    {createError && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 12px', borderRadius: 9, background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger)', fontSize: 12 }}>
                            <AlertCircle size={13} /> {createError}
                        </div>
                    )}
                    {createSuccess && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 12px', borderRadius: 9, background: 'var(--ok-bg)', border: '1px solid var(--ok-border)', color: 'var(--ok)', fontSize: 12 }}>
                            <Check size={13} /> Pack created — ID: <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{createSuccess.id.slice(-12).toUpperCase()}</span>
                            <CopyButton text={createSuccess.id} />
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button type="submit" disabled={creating} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 18px', borderRadius: 9999, border: 'none', background: creating ? 'var(--ink-muted)' : 'var(--accent)', color: 'var(--card)', fontSize: 13, fontWeight: 500, cursor: creating ? 'not-allowed' : 'pointer' }}>
                            <Plus size={13} /> {creating ? 'Creating…' : 'Create Pack'}
                        </button>
                        <button type="button" onClick={loadPacks} disabled={loading} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9999, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink-soft)', fontSize: 13, fontWeight: 500, cursor: loading ? 'not-allowed' : 'pointer' }}>
                            {loading ? 'Loading…' : 'Load packs'}
                        </button>
                    </div>
                </form>
            </div>

            {/* Pack list */}
            {error && (
                <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger)', fontSize: 13 }}>
                    {error}
                </div>
            )}

            {loaded && packs.length === 0 && !error && (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--ink-muted)', fontSize: 13, border: '1px dashed #d2d2d7', borderRadius: 14 }}>
                    No repro packs yet. Create one above to bundle a task for debugging.
                </div>
            )}

            {packs.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                        {packs.length} Pack{packs.length !== 1 ? 's' : ''}
                    </div>
                    {packs.map(pack => <PackRow key={pack.id} pack={pack} />)}
                </div>
            )}
        </div>
    );
}
