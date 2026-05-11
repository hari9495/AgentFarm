'use client';

/**
 * SkillSearchPanel
 *
 * Full-text skill search with category/tag filtering, dependency info, and invoke-in-place.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

type SkillCard = {
    id: string;
    name: string;
    version: string;
    permissions: string[];
    source: string;
    installed: boolean;
    installedVersion: string | null;
    verified: boolean;
};

type Props = {
    workspaceId: string;
    botId: string;
};

export function SkillSearchPanel({ workspaceId, botId }: Props) {
    const [query, setQuery] = useState('');
    const [category, setCategory] = useState<string>('all');
    const [selectedSkill, setSelectedSkill] = useState<SkillCard | null>(null);
    const [invokeInputs, setInvokeInputs] = useState('{}');
    const [invokeResult, setInvokeResult] = useState<{ ok: boolean; summary: string; duration_ms: number } | null>(null);
    const [invoking, setInvoking] = useState(false);
    const [invokeError, setInvokeError] = useState<string | null>(null);

    const [catalogSkills, setCatalogSkills] = useState<SkillCard[]>([]);
    const [catalogLoading, setCatalogLoading] = useState(true);
    const [catalogError, setCatalogError] = useState<string | null>(null);

    const fetchCatalog = useCallback(async () => {
        setCatalogLoading(true);
        setCatalogError(null);
        try {
            const res = await fetch(`/api/runtime/${encodeURIComponent(botId)}/marketplace/catalog`, { cache: 'no-store' });
            const body = (await res.json().catch(() => ({}))) as { skills?: SkillCard[]; message?: string; reason?: string };
            if (!res.ok) {
                setCatalogError(body.message ?? body.reason ?? 'Failed to load skill catalog.');
            } else {
                setCatalogSkills(Array.isArray(body.skills) ? body.skills : []);
            }
        } catch (err) {
            setCatalogError((err as Error).message);
        } finally {
            setCatalogLoading(false);
        }
    }, [botId]);

    useEffect(() => {
        void fetchCatalog();
    }, [fetchCatalog]);

    const categories = useMemo(
        () => ['all', ...Array.from(new Set(catalogSkills.map((s) => s.source))).sort()],
        [catalogSkills],
    );

    const filteredSkills = useMemo(() => {
        const q = query.toLowerCase().trim();
        return catalogSkills.filter((skill) => {
            const matchesCategory = category === 'all' || skill.source === category;
            if (!matchesCategory) return false;
            if (!q) return true;
            return (
                skill.id.toLowerCase().includes(q) ||
                skill.name.toLowerCase().includes(q)
            );
        });
    }, [query, category, catalogSkills]);

    const handleInvoke = async () => {
        if (!selectedSkill) return;
        setInvoking(true);
        setInvokeError(null);
        setInvokeResult(null);

        let parsedInputs: Record<string, unknown> = {};
        try {
            parsedInputs = JSON.parse(invokeInputs) as Record<string, unknown>;
        } catch {
            setInvokeError('Invalid JSON inputs');
            setInvoking(false);
            return;
        }

        try {
            const res = await fetch(`/api/runtime/${encodeURIComponent(botId)}/marketplace/invoke`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ skill_id: selectedSkill.id, inputs: parsedInputs, workspace_id: workspaceId }),
            });
            const body = (await res.json().catch(() => ({}))) as { ok?: boolean; summary?: string; duration_ms?: number; message?: string };
            if (!res.ok) {
                setInvokeError(body.message ?? 'Invocation failed');
            } else {
                setInvokeResult({ ok: body.ok ?? true, summary: body.summary ?? 'Done', duration_ms: body.duration_ms ?? 0 });
            }
        } catch (err) {
            setInvokeError((err as Error).message);
        } finally {
            setInvoking(false);
        }
    };

    return (
        <section style={{ marginTop: '1rem' }}>
            {/* Catalog loading / error */}
            {catalogLoading && (
                <p style={{ fontSize: '0.83rem', color: '#78716c', marginBottom: '0.75rem' }}>Loading skill catalog…</p>
            )}
            {catalogError && (
                <div style={{ marginBottom: '0.75rem', padding: '0.6rem 0.9rem', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 6, color: '#dc2626', fontSize: '0.83rem' }}>
                    {catalogError}
                </div>
            )}

            {/* Search + filter bar */}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                <input
                    type="search"
                    placeholder="Search skills by name or id…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    style={{ flex: '1 1 260px', padding: '0.45rem 0.7rem', borderRadius: 6, border: '1px solid #d4d4d4', fontSize: '0.88rem' }}
                />
                <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    style={{ padding: '0.45rem 0.7rem', borderRadius: 6, border: '1px solid #d4d4d4', fontSize: '0.88rem', background: '#fff' }}
                >
                    {categories.map((c) => (
                        <option key={c} value={c}>{c === 'all' ? 'All Sources' : c}</option>
                    ))}
                </select>
            </div>

            {/* Results count */}
            <p style={{ fontSize: '0.8rem', color: '#78716c', marginBottom: '0.5rem' }}>
                {filteredSkills.length} skill{filteredSkills.length !== 1 ? 's' : ''} found
            </p>

            {/* Skill grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.55rem' }}>
                {filteredSkills.map((skill) => (
                    <button
                        key={skill.id}
                        onClick={() => { setSelectedSkill(skill); setInvokeResult(null); setInvokeError(null); }}
                        style={{
                            textAlign: 'left', padding: '0.75rem', border: '1px solid',
                            borderColor: selectedSkill?.id === skill.id ? '#6366f1' : '#e2e8f0',
                            borderRadius: 8, background: selectedSkill?.id === skill.id ? '#eef2ff' : '#fff',
                            cursor: 'pointer', transition: 'border-color 0.15s',
                        }}
                    >
                        <div style={{ fontWeight: 600, fontSize: '0.88rem', marginBottom: '0.25rem' }}>{skill.name}</div>
                        <div style={{ fontSize: '0.78rem', color: '#57534e', marginBottom: '0.35rem', lineHeight: 1.4, fontFamily: 'monospace' }}>{skill.id}</div>
                        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', borderRadius: 99, background: '#f1f5f9', color: '#475569' }}>
                                {skill.source}
                            </span>
                            <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', borderRadius: 99, background: '#f1f5f9', color: '#475569' }}>
                                v{skill.version}
                            </span>
                            {skill.verified && (
                                <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', borderRadius: 99, background: '#dcfce7', color: '#166534' }}>
                                    ✓ verified
                                </span>
                            )}
                        </div>
                    </button>
                ))}
            </div>

            {/* Invoke panel for selected skill */}
            {selectedSkill && (
                <div style={{ marginTop: '1.25rem', padding: '1rem', border: '1px solid #6366f1', borderRadius: 8, background: '#fafafa' }}>
                    <h3 style={{ margin: '0 0 0.15rem', fontSize: '1rem' }}>{selectedSkill.name}</h3>
                    <p style={{ margin: '0 0 0.4rem', fontSize: '0.78rem', color: '#57534e', fontFamily: 'monospace' }}>{selectedSkill.id} · v{selectedSkill.version} · {selectedSkill.source}</p>

                    {selectedSkill.permissions.length > 0 && (
                        <p style={{ fontSize: '0.78rem', color: '#92400e', marginBottom: '0.5rem' }}>
                            Permissions: {selectedSkill.permissions.join(', ')}
                        </p>
                    )}

                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                        JSON Inputs
                    </label>
                    <textarea
                        rows={3}
                        value={invokeInputs}
                        onChange={(e) => setInvokeInputs(e.target.value)}
                        style={{ width: '100%', padding: '0.45rem', fontFamily: 'monospace', fontSize: '0.82rem', borderRadius: 6, border: '1px solid #d4d4d4', boxSizing: 'border-box' }}
                    />

                    <button
                        onClick={() => void handleInvoke()}
                        disabled={invoking}
                        style={{ marginTop: '0.5rem', padding: '0.4rem 1rem', background: invoking ? '#c7d2fe' : '#6366f1', color: '#fff', border: 'none', borderRadius: 6, cursor: invoking ? 'wait' : 'pointer', fontSize: '0.85rem' }}
                    >
                        {invoking ? 'Running…' : 'Run Skill'}
                    </button>

                    {invokeError && <p style={{ color: '#dc2626', fontSize: '0.82rem', marginTop: '0.5rem' }}>{invokeError}</p>}

                    {invokeResult && (
                        <div style={{ marginTop: '0.6rem', padding: '0.6rem', background: invokeResult.ok ? '#f0fdf4' : '#fef2f2', borderRadius: 6, fontSize: '0.83rem' }}>
                            <span style={{ fontWeight: 700, color: invokeResult.ok ? '#15803d' : '#dc2626' }}>{invokeResult.ok ? '✓ Success' : '✗ Failed'}</span>
                            <span style={{ marginLeft: '0.5rem', color: '#57534e' }}>{invokeResult.summary}</span>
                            <span style={{ marginLeft: '0.75rem', color: '#78716c' }}>{invokeResult.duration_ms}ms</span>
                        </div>
                    )}
                </div>
            )}
        </section>
    );
}
