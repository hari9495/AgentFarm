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
    dep_edges: { from: string; to: string }[];
    last_indexed: string;
};

type Suggestion = {
    skill_id: string;
    confidence: number;
    rationale: string;
};

const KIND_COLORS: Record<GraphSymbol['kind'], string> = {
    function: 'text-blue-400',
    class: 'text-yellow-400',
    interface: 'text-purple-400',
    type: 'text-cyan-400',
    variable: 'text-zinc-400',
    unknown: 'text-zinc-500',
};

const KIND_BADGES: Record<GraphSymbol['kind'], string> = {
    function: 'bg-blue-900/40 text-blue-300',
    class: 'bg-yellow-900/40 text-yellow-300',
    interface: 'bg-purple-900/40 text-purple-300',
    type: 'bg-cyan-900/40 text-cyan-300',
    variable: 'bg-zinc-700 text-zinc-400',
    unknown: 'bg-zinc-800 text-zinc-500',
};

export function KnowledgeGraphExplorer() {
    const [snapshot, setSnapshot] = useState<GraphSnapshot | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<GraphSymbol[]>([]);
    const [selected, setSelected] = useState<GraphSymbol | null>(null);
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [loading, setLoading] = useState(false);
    const [indexing, setIndexing] = useState(false);
    const [searchLoading, setSearchLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'symbols' | 'graph' | 'suggestions'>('symbols');
    const [selectedNode, setSelectedNode] = useState<string | null>(null);

    const loadSnapshot = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/knowledge-graph/snapshot');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = (await res.json()) as GraphSnapshot;
            setSnapshot(data);
        } catch {
            setError('Failed to load knowledge graph snapshot');
        } finally {
            setLoading(false);
        }
    };

    const triggerIndex = async () => {
        setIndexing(true);
        setError(null);
        try {
            const res = await fetch('/api/knowledge-graph/index', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ root_dir: '.' }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            await loadSnapshot();
        } catch {
            setError('Failed to index workspace');
        } finally {
            setIndexing(false);
        }
    };

    const search = async () => {
        if (!searchQuery.trim()) return;
        setSearchLoading(true);
        setError(null);
        try {
            const res = await fetch(
                `/api/knowledge-graph/symbols?q=${encodeURIComponent(searchQuery)}`,
            );
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = (await res.json()) as { symbols: GraphSymbol[] };
            setSearchResults(data.symbols);
        } catch {
            setError('Search failed');
        } finally {
            setSearchLoading(false);
        }
    };

    const loadSuggestions = async (context?: string) => {
        try {
            const url = `/api/knowledge-graph/suggestions${context ? `?context=${encodeURIComponent(context)}` : ''}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = (await res.json()) as { suggestions: Suggestion[] };
            setSuggestions(data.suggestions);
        } catch {
            setError('Failed to load suggestions');
        }
    };

    const selectSymbol = async (symbol: GraphSymbol) => {
        setSelected(symbol);
        await loadSuggestions(symbol.name);
    };

    const displaySymbols = searchResults.length > 0 ? searchResults : (snapshot?.symbols ?? []);
    const hasData = snapshot !== null || searchResults.length > 0;

    return (
        <div className="flex flex-col gap-6 p-6 bg-zinc-900 min-h-screen text-zinc-100">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Knowledge Graph Explorer</h1>
                    <p className="text-zinc-400 text-sm mt-1">
                        Browse repository symbols, call graphs, and skill suggestions
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={loadSnapshot}
                        disabled={loading}
                        className="px-3 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-sm transition-colors disabled:opacity-50"
                    >
                        {loading ? 'Loading…' : 'Load Snapshot'}
                    </button>
                    <button
                        onClick={triggerIndex}
                        disabled={indexing}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                    >
                        {indexing ? 'Indexing…' : '⟳ Index Workspace'}
                    </button>
                </div>
            </div>

            {error && (
                <div className="p-3 bg-red-900/40 border border-red-700 rounded-lg text-red-300 text-sm">
                    {error}
                </div>
            )}

            {/* Stats bar */}
            {snapshot && (
                <div className="grid grid-cols-3 gap-3">
                    <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-4">
                        <p className="text-3xl font-bold tabular-nums">{snapshot.symbols.length}</p>
                        <p className="text-xs text-zinc-400 mt-1">Indexed Symbols</p>
                    </div>
                    <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-4">
                        <p className="text-3xl font-bold tabular-nums">{snapshot.call_edges.length}</p>
                        <p className="text-xs text-zinc-400 mt-1">Call Edges</p>
                    </div>
                    <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-4">
                        <p className="text-3xl font-bold tabular-nums">{snapshot.dep_edges.length}</p>
                        <p className="text-xs text-zinc-400 mt-1">Dep Edges</p>
                    </div>
                </div>
            )}

            {/* Search */}
            <div className="flex gap-2">
                <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && search()}
                    placeholder="Search symbols by name, e.g. 'runAutonomousLoop'"
                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-sm font-mono focus:outline-none focus:border-blue-500"
                />
                <button
                    onClick={search}
                    disabled={searchLoading || !searchQuery.trim()}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
                >
                    {searchLoading ? '…' : 'Search'}
                </button>
                {searchResults.length > 0 && (
                    <button
                        onClick={() => { setSearchResults([]); setSearchQuery(''); }}
                        className="px-3 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-sm transition-colors"
                    >
                        Clear
                    </button>
                )}
            </div>

            {/* Tabs */}
            {hasData && (
                <div className="flex gap-1 bg-zinc-800 rounded-lg p-1 w-fit">
                    {(['symbols', 'graph', 'suggestions'] as const).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => {
                                setActiveTab(tab);
                                if (tab !== 'graph') setSelectedNode(null);
                                if (tab === 'suggestions') loadSuggestions();
                            }}
                            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${activeTab === tab ? 'bg-zinc-600 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>
            )}

            {/* Symbols tab */}
            {activeTab === 'symbols' && (
                <div className="flex gap-4">
                    {/* Symbol list */}
                    <div className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl overflow-hidden">
                        <div className="px-4 py-3 border-b border-zinc-700 flex items-center justify-between">
                            <h2 className="font-semibold text-sm">Symbols</h2>
                            <span className="text-xs text-zinc-500">{displaySymbols.length} results</span>
                        </div>
                        {displaySymbols.length === 0 ? (
                            <div className="p-8 text-center text-zinc-500 text-sm">
                                {snapshot
                                    ? 'No symbols found. Try a different search.'
                                    : 'Load a snapshot or index the workspace to begin.'}
                            </div>
                        ) : (
                            <div className="divide-y divide-zinc-700 max-h-[480px] overflow-y-auto">
                                {displaySymbols.slice(0, 100).map((sym) => (
                                    <button
                                        key={`${sym.file_path}:${sym.name}`}
                                        onClick={() => selectSymbol(sym)}
                                        className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-zinc-700/50 transition-colors ${selected?.name === sym.name ? 'bg-zinc-700/70' : ''}`}
                                    >
                                        <span className={`mt-0.5 px-1.5 py-0.5 rounded text-xs font-mono font-bold ${KIND_BADGES[sym.kind]}`}>
                                            {sym.kind.slice(0, 2).toUpperCase()}
                                        </span>
                                        <div className="flex-1 min-w-0">
                                            <p className={`text-sm font-mono font-medium ${KIND_COLORS[sym.kind]}`}>
                                                {sym.name}
                                            </p>
                                            <p className="text-xs text-zinc-500 truncate mt-0.5">
                                                {sym.file_path}:{sym.line}
                                            </p>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <p className="text-xs text-zinc-500">
                                                ↑{sym.callers.length} ↓{sym.callees.length}
                                            </p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Symbol detail */}
                    {selected && (
                        <div className="w-72 bg-zinc-800 border border-zinc-700 rounded-xl p-4 flex flex-col gap-3">
                            <div>
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${KIND_BADGES[selected.kind]}`}>
                                    {selected.kind}
                                </span>
                                <h3 className="font-mono font-bold text-sm mt-2">{selected.name}</h3>
                                <p className="text-xs text-zinc-500 mt-1 break-all">
                                    {selected.file_path}:{selected.line}
                                </p>
                            </div>

                            {selected.callers.length > 0 && (
                                <div>
                                    <p className="text-xs font-semibold text-zinc-400 mb-1 uppercase tracking-wide">
                                        Called by ({selected.callers.length})
                                    </p>
                                    <div className="flex flex-col gap-1">
                                        {selected.callers.slice(0, 8).map((c) => (
                                            <span key={c} className="text-xs font-mono text-zinc-300 bg-zinc-700 px-2 py-1 rounded">
                                                {c}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {selected.callees.length > 0 && (
                                <div>
                                    <p className="text-xs font-semibold text-zinc-400 mb-1 uppercase tracking-wide">
                                        Calls ({selected.callees.length})
                                    </p>
                                    <div className="flex flex-col gap-1">
                                        {selected.callees.slice(0, 8).map((c) => (
                                            <span key={c} className="text-xs font-mono text-zinc-300 bg-zinc-700 px-2 py-1 rounded">
                                                {c}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Graph tab */}
            {activeTab === 'graph' && snapshot && (() => {
                const kindFill = (kind: string): string => {
                    const map: Record<string, string> = {
                        function: '#3b82f6',
                        class: '#8b5cf6',
                        interface: '#06b6d4',
                        variable: '#6b7280',
                    };
                    return map[kind] ?? '#6b7280';
                };

                const topSymbols = [...snapshot.symbols]
                    .sort((a, b) => (b.callers.length + b.callees.length) - (a.callers.length + a.callees.length))
                    .slice(0, 40);

                const count = topSymbols.length;
                const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
                const rows = Math.max(1, Math.ceil(count / cols));
                const padX = 80;
                const padY = 50;
                const colStep = (800 - 2 * padX) / cols;
                const rowStep = (500 - 2 * padY) / rows;

                const nodePositions = new Map<string, { x: number; y: number }>();
                topSymbols.forEach((s, i) => {
                    const col = i % cols;
                    const row = Math.floor(i / cols);
                    nodePositions.set(s.name, {
                        x: padX + col * colStep,
                        y: padY + row * rowStep,
                    });
                });

                const nodeNames = new Set(topSymbols.map(s => s.name));
                const visibleEdges = snapshot.call_edges.filter(
                    e => nodeNames.has(e.from) && nodeNames.has(e.to),
                );

                const selSym = selectedNode
                    ? (snapshot.symbols.find(s => s.name === selectedNode) ?? null)
                    : null;

                return (
                    <>
                        <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-4">
                            <svg viewBox="0 0 800 500" width="100%" preserveAspectRatio="xMidYMid meet">
                                <rect width={800} height={500} fill="#18181b" rx={8} />
                                {visibleEdges.map((e, idx) => {
                                    const from = nodePositions.get(e.from);
                                    const to = nodePositions.get(e.to);
                                    if (!from || !to) return null;
                                    return (
                                        <line
                                            key={`${e.from}:${e.to}:${idx}`}
                                            x1={from.x} y1={from.y}
                                            x2={to.x} y2={to.y}
                                            stroke="#3f3f46"
                                            strokeWidth={1}
                                            opacity={0.6}
                                        />
                                    );
                                })}
                                {topSymbols.map(s => {
                                    const pos = nodePositions.get(s.name);
                                    if (!pos) return null;
                                    const fill = kindFill(s.kind);
                                    const isSelected = selectedNode === s.name;
                                    const label = s.name.length > 12 ? s.name.slice(0, 11) + '\u2026' : s.name;
                                    return (
                                        <g
                                            key={s.name}
                                            onClick={() => setSelectedNode(selectedNode === s.name ? null : s.name)}
                                            style={{ cursor: 'pointer' }}
                                        >
                                            <circle
                                                cx={pos.x}
                                                cy={pos.y}
                                                r={18}
                                                fill={fill}
                                                stroke={isSelected ? '#fbbf24' : 'none'}
                                                strokeWidth={isSelected ? 2 : 0}
                                            />
                                            <text
                                                x={pos.x}
                                                y={pos.y + 28}
                                                fontSize={8}
                                                fill="#a1a1aa"
                                                textAnchor="middle"
                                            >
                                                {label}
                                            </text>
                                        </g>
                                    );
                                })}
                            </svg>
                            <p className="text-xs text-zinc-500 mt-2">
                                Showing {count} of {snapshot.symbols.length} symbols · {visibleEdges.length} call edges rendered
                            </p>
                            <p className="text-xs text-zinc-600 mt-1">
                                Last indexed:{' '}
                                {snapshot.last_indexed ? new Date(snapshot.last_indexed).toLocaleString() : '—'}
                            </p>
                        </div>
                        {selSym && (
                            <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-4 mt-4">
                                <div className="flex items-center gap-2 mb-3">
                                    <span className="font-mono font-bold text-sm text-zinc-100">{selSym.name}</span>
                                    <span
                                        className="px-2 py-0.5 rounded text-xs font-semibold"
                                        style={{ background: kindFill(selSym.kind), color: '#fff' }}
                                    >
                                        {selSym.kind}
                                    </span>
                                </div>
                                <p className="text-xs text-zinc-500 font-mono mb-3">
                                    {selSym.file_path}:{selSym.line}
                                </p>
                                {selSym.callers.length > 0 && (
                                    <div className="mb-2">
                                        <p className="text-xs text-zinc-400 font-semibold uppercase tracking-wide mb-1">Callers</p>
                                        <div className="flex flex-col gap-1">
                                            {selSym.callers.slice(0, 5).map(c => (
                                                <span
                                                    key={c}
                                                    className="text-xs font-mono text-zinc-300 bg-zinc-700 px-2 py-0.5 rounded"
                                                    title={c}
                                                >
                                                    {c.length > 30 ? c.slice(0, 29) + '\u2026' : c}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {selSym.callees.length > 0 && (
                                    <div>
                                        <p className="text-xs text-zinc-400 font-semibold uppercase tracking-wide mb-1">Callees</p>
                                        <div className="flex flex-col gap-1">
                                            {selSym.callees.slice(0, 5).map(c => (
                                                <span
                                                    key={c}
                                                    className="text-xs font-mono text-zinc-300 bg-zinc-700 px-2 py-0.5 rounded"
                                                    title={c}
                                                >
                                                    {c.length > 30 ? c.slice(0, 29) + '\u2026' : c}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                );
            })()}

            {/* Suggestions tab */}
            {activeTab === 'suggestions' && (
                <div className="bg-zinc-800 border border-zinc-700 rounded-xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-zinc-700">
                        <h2 className="font-semibold text-sm">Skill Suggestions</h2>
                        <p className="text-xs text-zinc-500 mt-0.5">
                            {selected ? `Based on symbol: ${selected.name}` : 'Based on overall workspace context'}
                        </p>
                    </div>
                    {suggestions.length === 0 ? (
                        <div className="p-8 text-center text-zinc-500 text-sm">
                            No suggestions available. Select a symbol or load a snapshot first.
                        </div>
                    ) : (
                        <div className="divide-y divide-zinc-700">
                            {suggestions.map((s) => (
                                <div key={s.skill_id} className="flex items-center gap-4 px-4 py-3">
                                    <span className="px-2 py-1 bg-zinc-700 rounded font-mono text-xs text-zinc-300">
                                        {s.skill_id}
                                    </span>
                                    <p className="flex-1 text-xs text-zinc-400">{s.rationale}</p>
                                    <div className="text-right">
                                        <div className="flex items-center gap-1">
                                            <div className="w-16 bg-zinc-700 rounded-full h-1.5">
                                                <div
                                                    className="bg-blue-500 h-1.5 rounded-full"
                                                    style={{ width: `${s.confidence * 100}%` }}
                                                />
                                            </div>
                                            <span className="text-xs text-zinc-500 tabular-nums">
                                                {(s.confidence * 100).toFixed(0)}%
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
