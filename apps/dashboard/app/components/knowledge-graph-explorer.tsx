'use client';

import { useState } from 'react';

type GraphSymbol = {
    name: string;
    kind: 'function' | 'class' | 'interface' | 'type' | 'variable' | 'unknown';
    file_path: string;
    line: number;
    callers: string[];
    callees: string[];
};

type GraphSnapshot = {
    symbols: GraphSymbol[];
    call_edges: { from: string; to: string }[];
    dep_edges:  { from: string; to: string }[];
    last_indexed: string;
};

type Suggestion = { skill_id: string; confidence: number; rationale: string };

// ── Light-mode kind colours ───────────────────────────────────────────────────

const KIND_BADGE: Record<GraphSymbol['kind'], { bg: string; color: string; border: string }> = {
    function:  { bg: 'rgba(214, 48, 31,0.08)',   color: 'var(--accent)', border: 'rgba(214, 48, 31,0.2)'   },
    class:     { bg: 'rgba(124,45,146,0.08)',  color: '#b8291a', border: 'rgba(124,45,146,0.2)'  },
    interface: { bg: 'rgba(0,155,199,0.08)',   color: 'var(--info)', border: 'rgba(0,155,199,0.2)'   },
    type:      { bg: 'rgba(26,122,74,0.08)',   color: 'var(--ok)', border: 'rgba(26,122,74,0.2)'   },
    variable:  { bg: 'rgba(110,110,115,0.08)', color: 'var(--ink-muted)', border: 'rgba(110,110,115,0.2)' },
    unknown:   { bg: 'rgba(110,110,115,0.06)', color: 'var(--ink-muted)', border: 'rgba(110,110,115,0.15)'},
};

const KIND_TEXT: Record<GraphSymbol['kind'], string> = {
    function: 'var(--accent)', class: '#b8291a', interface: 'var(--info)',
    type: 'var(--ok)', variable: 'var(--ink-muted)', unknown: 'var(--ink-muted)',
};

const KIND_DOT: Record<GraphSymbol['kind'], string> = {
    function: 'var(--info)', class: 'var(--accent)', interface: 'var(--info)',
    type: 'var(--ok)', variable: 'var(--ink-muted)', unknown: 'var(--ink-muted)',
};

// ── Shared styles ─────────────────────────────────────────────────────────────

const card: React.CSSProperties = {
    background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14,
    overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
};

const chip = (kind: GraphSymbol['kind']): React.CSSProperties => ({
    padding: '2px 7px', borderRadius: 6, fontSize: 10, fontWeight: 800,
    fontFamily: 'ui-monospace, monospace', letterSpacing: '0.02em',
    background: KIND_BADGE[kind].bg, color: KIND_BADGE[kind].color,
    border: `1px solid ${KIND_BADGE[kind].border}`,
});

export function KnowledgeGraphExplorer() {
    const [snapshot, setSnapshot]         = useState<GraphSnapshot | null>(null);
    const [searchQuery, setSearchQuery]   = useState('');
    const [searchResults, setSearchResults] = useState<GraphSymbol[]>([]);
    const [selected, setSelected]         = useState<GraphSymbol | null>(null);
    const [suggestions, setSuggestions]   = useState<Suggestion[]>([]);
    const [loading, setLoading]           = useState(false);
    const [indexing, setIndexing]         = useState(false);
    const [searchLoading, setSearchLoading] = useState(false);
    const [error, setError]               = useState<string | null>(null);
    const [activeTab, setActiveTab]       = useState<'symbols' | 'graph' | 'suggestions'>('symbols');
    const [selectedNode, setSelectedNode] = useState<string | null>(null);

    const loadSnapshot = async () => {
        setLoading(true); setError(null);
        try {
            const res = await fetch('/api/knowledge-graph/snapshot');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            setSnapshot((await res.json()) as GraphSnapshot);
        } catch { setError('Failed to load knowledge graph snapshot'); }
        finally { setLoading(false); }
    };

    const triggerIndex = async () => {
        setIndexing(true); setError(null);
        try {
            const res = await fetch('/api/knowledge-graph/index', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ root_dir: '.' }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            await loadSnapshot();
        } catch { setError('Failed to index workspace'); }
        finally { setIndexing(false); }
    };

    const search = async () => {
        if (!searchQuery.trim()) return;
        setSearchLoading(true); setError(null);
        try {
            const res = await fetch(`/api/knowledge-graph/symbols?q=${encodeURIComponent(searchQuery)}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = (await res.json()) as { symbols: GraphSymbol[] };
            setSearchResults(data.symbols);
        } catch { setError('Search failed'); }
        finally { setSearchLoading(false); }
    };

    const loadSuggestions = async (context?: string) => {
        try {
            const url = `/api/knowledge-graph/suggestions${context ? `?context=${encodeURIComponent(context)}` : ''}`;
            const data = (await (await fetch(url)).json()) as { suggestions: Suggestion[] };
            setSuggestions(data.suggestions);
        } catch { setError('Failed to load suggestions'); }
    };

    const selectSymbol = async (symbol: GraphSymbol) => {
        setSelected(symbol);
        await loadSuggestions(symbol.name);
    };

    const displaySymbols = searchResults.length > 0 ? searchResults : (snapshot?.symbols ?? []);
    const hasData = snapshot !== null || searchResults.length > 0;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.01em' }}>Knowledge Graph Explorer</h2>
                    <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--ink-muted)' }}>Browse repository symbols, call graphs, and skill suggestions</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={loadSnapshot} disabled={loading}
                        style={{ padding: '6px 14px', borderRadius: 9999, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink-soft)', fontSize: 12, fontWeight: 600, cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.6 : 1 }}>
                        {loading ? 'Loading…' : 'Load Snapshot'}
                    </button>
                    <button onClick={triggerIndex} disabled={indexing}
                        style={{ padding: '6px 16px', borderRadius: 9999, border: 'none', background: indexing ? 'var(--ink-muted)' : 'var(--accent)', color: 'var(--card)', fontSize: 12, fontWeight: 700, cursor: indexing ? 'not-allowed' : 'pointer' }}>
                        {indexing ? 'Indexing…' : '⟳ Index Workspace'}
                    </button>
                </div>
            </div>

            {/* Error */}
            {error && (
                <div style={{ padding: '8px 12px', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 10, color: 'var(--danger)', fontSize: 13 }}>
                    ⚠ {error}
                </div>
            )}

            {/* Stats bar */}
            {snapshot && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                    {[
                        { label: 'Indexed Symbols',  value: snapshot.symbols.length    },
                        { label: 'Call Edges',        value: snapshot.call_edges.length },
                        { label: 'Dependency Edges',  value: snapshot.dep_edges.length  },
                    ].map(({ label, value }) => (
                        <div key={label} style={{ ...card, padding: '12px 16px' }}>
                            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.03em', tabularNums: true } as React.CSSProperties}>{value}</div>
                            <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 3 }}>{label}</div>
                        </div>
                    ))}
                </div>
            )}

            {/* Search */}
            <div style={{ display: 'flex', gap: 8 }}>
                <input type="text" value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && void search()}
                    placeholder="Search symbols by name, e.g. 'runAutonomousLoop'"
                    style={{ flex: 1, padding: '8px 12px', borderRadius: 9999, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink)', fontSize: 13, fontFamily: 'ui-monospace, monospace', outline: 'none' }}
                />
                <button onClick={() => void search()} disabled={searchLoading || !searchQuery.trim()}
                    style={{ padding: '8px 18px', borderRadius: 9999, border: 'none', background: 'var(--accent)', color: 'var(--card)', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: searchLoading || !searchQuery.trim() ? 0.5 : 1 }}>
                    {searchLoading ? '…' : 'Search'}
                </button>
                {searchResults.length > 0 && (
                    <button onClick={() => { setSearchResults([]); setSearchQuery(''); }}
                        style={{ padding: '8px 14px', borderRadius: 9999, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink-soft)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                        Clear
                    </button>
                )}
            </div>

            {/* Tabs */}
            {hasData && (
                <div style={{ display: 'flex', gap: 2, padding: '3px', borderRadius: 9999, background: 'var(--bg)', width: 'fit-content', border: '1px solid var(--line)' }}>
                    {(['symbols', 'graph', 'suggestions'] as const).map(tab => (
                        <button key={tab} onClick={() => { setActiveTab(tab); if (tab !== 'graph') setSelectedNode(null); if (tab === 'suggestions') void loadSuggestions(); }}
                            style={{ padding: '5px 14px', borderRadius: 9999, fontSize: 12, fontWeight: activeTab === tab ? 700 : 500, cursor: 'pointer', border: 'none', background: activeTab === tab ? 'var(--card)' : 'transparent', color: activeTab === tab ? 'var(--ink)' : 'var(--ink-muted)', boxShadow: activeTab === tab ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', textTransform: 'capitalize' }}>
                            {tab}
                        </button>
                    ))}
                </div>
            )}

            {/* ── Symbols tab ────────────────────────────────────────────── */}
            {activeTab === 'symbols' && (
                <div style={{ display: 'flex', gap: 12 }}>
                    {/* Symbol list */}
                    <div style={{ flex: 1, ...card }}>
                        <div style={{ padding: '10px 14px', borderBottom: '1px solid #f0f0f2', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Symbols</span>
                            <span style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{displaySymbols.length} results</span>
                        </div>
                        {displaySymbols.length === 0 ? (
                            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--ink-muted)', fontSize: 13 }}>
                                {snapshot ? 'No symbols found. Try a different search.' : 'Load a snapshot or index the workspace to begin.'}
                            </div>
                        ) : (
                            <div style={{ maxHeight: 480, overflowY: 'auto' }}>
                                {displaySymbols.slice(0, 100).map(sym => (
                                    <button key={`${sym.file_path}:${sym.name}`} onClick={() => void selectSymbol(sym)}
                                        style={{ width: '100%', display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', textAlign: 'left', border: 'none', borderBottom: '1px solid #f5f5f7', background: selected?.name === sym.name ? 'rgba(214, 48, 31,0.05)' : 'transparent', cursor: 'pointer', transition: 'background 0.1s' }}>
                                        <span style={{ ...chip(sym.kind), flexShrink: 0, marginTop: 2 }}>{sym.kind.slice(0, 2).toUpperCase()}</span>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: 13, fontFamily: 'ui-monospace, monospace', fontWeight: 600, color: KIND_TEXT[sym.kind] }}>{sym.name}</div>
                                            <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sym.file_path}:{sym.line}</div>
                                        </div>
                                        <div style={{ fontSize: 11, color: 'var(--ink-muted)', flexShrink: 0 }}>↑{sym.callers.length} ↓{sym.callees.length}</div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Symbol detail panel */}
                    {selected && (
                        <div style={{ width: 260, ...card, padding: 16, display: 'flex', flexDirection: 'column', gap: 14, alignSelf: 'flex-start' }}>
                            <div>
                                <span style={chip(selected.kind)}>{selected.kind}</span>
                                <div style={{ fontSize: 13, fontFamily: 'ui-monospace, monospace', fontWeight: 700, color: 'var(--ink)', marginTop: 8 }}>{selected.name}</div>
                                <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 3, wordBreak: 'break-all' }}>{selected.file_path}:{selected.line}</div>
                            </div>
                            {selected.callers.length > 0 && (
                                <div>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Called by ({selected.callers.length})</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                        {selected.callers.slice(0, 8).map(c => (
                                            <span key={c} style={{ fontSize: 11, fontFamily: 'ui-monospace, monospace', color: 'var(--ink-soft)', background: 'var(--bg)', border: '1px solid var(--line)', padding: '3px 7px', borderRadius: 6 }}>{c}</span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {selected.callees.length > 0 && (
                                <div>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Calls ({selected.callees.length})</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                        {selected.callees.slice(0, 8).map(c => (
                                            <span key={c} style={{ fontSize: 11, fontFamily: 'ui-monospace, monospace', color: 'var(--ink-soft)', background: 'var(--bg)', border: '1px solid var(--line)', padding: '3px 7px', borderRadius: 6 }}>{c}</span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* ── Graph tab ──────────────────────────────────────────────── */}
            {activeTab === 'graph' && snapshot && (() => {
                const kindFill = (k: string): string => ({ function: 'var(--info)', class: 'var(--accent)', interface: 'var(--info)', variable: 'var(--ink-muted)' }[k] ?? 'var(--ink-muted)');
                const topSymbols = [...snapshot.symbols].sort((a, b) => (b.callers.length + b.callees.length) - (a.callers.length + a.callees.length)).slice(0, 40);
                const count = topSymbols.length;
                const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
                const rows = Math.max(1, Math.ceil(count / cols));
                const [padX, padY] = [80, 50];
                const colStep = (800 - 2 * padX) / cols;
                const rowStep = (500 - 2 * padY) / rows;
                const nodePositions = new Map<string, { x: number; y: number }>();
                topSymbols.forEach((s, i) => nodePositions.set(s.name, { x: padX + (i % cols) * colStep, y: padY + Math.floor(i / cols) * rowStep }));
                const nodeNames = new Set(topSymbols.map(s => s.name));
                const visibleEdges = snapshot.call_edges.filter(e => nodeNames.has(e.from) && nodeNames.has(e.to));
                const selSym = selectedNode ? snapshot.symbols.find(s => s.name === selectedNode) ?? null : null;
                return (
                    <>
                        <div style={{ ...card, padding: 16 }}>
                            <svg viewBox="0 0 800 500" width="100%" preserveAspectRatio="xMidYMid meet">
                                <rect width={800} height={500} fill="#f9f9fb" rx={10} />
                                {visibleEdges.map((e, idx) => {
                                    const from = nodePositions.get(e.from); const to = nodePositions.get(e.to);
                                    if (!from || !to) return null;
                                    return <line key={`${e.from}:${e.to}:${idx}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="#d2d2d7" strokeWidth={1} opacity={0.7} />;
                                })}
                                {topSymbols.map(s => {
                                    const pos = nodePositions.get(s.name); if (!pos) return null;
                                    const isSelected = selectedNode === s.name;
                                    const label = s.name.length > 12 ? s.name.slice(0, 11) + '…' : s.name;
                                    return (
                                        <g key={s.name} onClick={() => setSelectedNode(selectedNode === s.name ? null : s.name)} style={{ cursor: 'pointer' }}>
                                            <circle cx={pos.x} cy={pos.y} r={16} fill={kindFill(s.kind)} stroke={isSelected ? 'var(--ink)' : 'rgba(255,255,255,0.4)'} strokeWidth={isSelected ? 2.5 : 1} />
                                            <text x={pos.x} y={pos.y + 26} fontSize={8} fill="#6e6e73" textAnchor="middle">{label}</text>
                                        </g>
                                    );
                                })}
                            </svg>
                            <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 11, color: 'var(--ink-muted)' }}>
                                <span>{count} of {snapshot.symbols.length} symbols</span>
                                <span>{visibleEdges.length} call edges</span>
                                {snapshot.last_indexed && <span>Last indexed: {new Date(snapshot.last_indexed).toLocaleString()}</span>}
                            </div>
                            {/* Legend */}
                            <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                                {Object.entries(KIND_DOT).slice(0, 5).map(([kind, color]) => (
                                    <div key={kind} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--ink-muted)' }}>
                                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, display: 'inline-block' }} />
                                        {kind}
                                    </div>
                                ))}
                            </div>
                        </div>
                        {selSym && (
                            <div style={{ ...card, padding: 14, marginTop: 4 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                    <span style={{ fontSize: 13, fontFamily: 'ui-monospace, monospace', fontWeight: 700, color: 'var(--ink)' }}>{selSym.name}</span>
                                    <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: kindFill(selSym.kind), color: 'var(--card)' }}>{selSym.kind}</span>
                                </div>
                                <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--ink-muted)', marginBottom: 10 }}>{selSym.file_path}:{selSym.line}</div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                    {selSym.callers.length > 0 && <div>
                                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Callers</div>
                                        {selSym.callers.slice(0, 5).map(c => <div key={c} style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--ink-soft)', background: 'var(--bg)', border: '1px solid var(--line)', padding: '3px 7px', borderRadius: 6, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c}</div>)}
                                    </div>}
                                    {selSym.callees.length > 0 && <div>
                                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Callees</div>
                                        {selSym.callees.slice(0, 5).map(c => <div key={c} style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--ink-soft)', background: 'var(--bg)', border: '1px solid var(--line)', padding: '3px 7px', borderRadius: 6, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c}</div>)}
                                    </div>}
                                </div>
                            </div>
                        )}
                    </>
                );
            })()}

            {/* ── Suggestions tab ────────────────────────────────────────── */}
            {activeTab === 'suggestions' && (
                <div style={card}>
                    <div style={{ padding: '10px 14px', borderBottom: '1px solid #f0f0f2' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Skill Suggestions</div>
                        <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 2 }}>
                            {selected ? `Based on symbol: ${selected.name}` : 'Based on overall workspace context'}
                        </div>
                    </div>
                    {suggestions.length === 0 ? (
                        <div style={{ padding: '32px', textAlign: 'center', color: 'var(--ink-muted)', fontSize: 13 }}>
                            No suggestions available. Select a symbol or load a snapshot first.
                        </div>
                    ) : (
                        suggestions.map(s => (
                            <div key={s.skill_id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderBottom: '1px solid #f5f5f7' }}>
                                <span style={{ padding: '3px 8px', borderRadius: 7, fontFamily: 'ui-monospace, monospace', fontSize: 11, fontWeight: 700, color: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 7%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)', flexShrink: 0 }}>{s.skill_id}</span>
                                <p style={{ flex: 1, fontSize: 12, color: 'var(--ink-muted)', margin: 0, lineHeight: 1.5 }}>{s.rationale}</p>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                                    <div style={{ width: 60, height: 4, borderRadius: 9999, background: 'var(--bg)', overflow: 'hidden' }}>
                                        <div style={{ height: '100%', borderRadius: 9999, background: 'var(--accent)', width: `${s.confidence * 100}%` }} />
                                    </div>
                                    <span style={{ fontSize: 11, color: 'var(--ink-muted)', fontWeight: 600 }}>{(s.confidence * 100).toFixed(0)}%</span>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
