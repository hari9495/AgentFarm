'use client';

import { useCallback, useEffect, useState } from 'react';

type TaskDepStatus = 'pending' | 'running' | 'done' | 'failed' | 'blocked';

type TaskDependencyNode = {
    taskId: string;
    status: TaskDepStatus;
    dependsOn: string[];
    dependents: string[];
    depth: number;
};

type TaskDependencyGraph = {
    nodes: TaskDependencyNode[];
    rootIds: string[];
    leafIds: string[];
};

type TaskDagPanelProps = {
    taskIds: string[];
};

// ─── Layout constants ──────────────────────────────────────────────────────────

const NODE_W = 160;
const NODE_H = 48;
const COL_GAP = 80;
const ROW_GAP = 20;
const PADDING = 32;

// ─── Colours by status ────────────────────────────────────────────────────────

const STATUS_FILL: Record<TaskDepStatus, string> = {
    pending: 'var(--color-background-secondary, #f1f5f9)',
    running: '#3b82f6',
    done: '#22c55e',
    failed: '#ef4444',
    blocked: '#f59e0b',
};

const STATUS_TEXT: Record<TaskDepStatus, string> = {
    pending: '#475569',
    running: '#ffffff',
    done: '#ffffff',
    failed: '#ffffff',
    blocked: '#ffffff',
};

const STATUS_STROKE: Record<TaskDepStatus, string> = {
    pending: '#cbd5e1',
    running: '#2563eb',
    done: '#16a34a',
    failed: '#dc2626',
    blocked: '#d97706',
};

// ─── Layout helper ────────────────────────────────────────────────────────────

type NodeLayout = {
    node: TaskDependencyNode;
    x: number;
    y: number;
};

function buildLayout(graph: TaskDependencyGraph): NodeLayout[] {
    // Group nodes by depth (column).
    const columns = new Map<number, TaskDependencyNode[]>();
    for (const node of graph.nodes) {
        const col = node.depth;
        if (!columns.has(col)) columns.set(col, []);
        columns.get(col)!.push(node);
    }

    const layout: NodeLayout[] = [];
    for (const [col, nodes] of columns) {
        nodes.forEach((node, rowIdx) => {
            layout.push({
                node,
                x: PADDING + col * (NODE_W + COL_GAP),
                y: PADDING + rowIdx * (NODE_H + ROW_GAP),
            });
        });
    }
    return layout;
}

function svgDimensions(layout: NodeLayout[]) {
    const maxX = Math.max(...layout.map((l) => l.x + NODE_W)) + PADDING;
    const maxY = Math.max(...layout.map((l) => l.y + NODE_H)) + PADDING;
    return { width: Math.max(maxX, 320), height: Math.max(maxY, 160) };
}

// ─── Arrow marker ────────────────────────────────────────────────────────────

const ARROW_MARKER_ID = 'dag-arrow';

// ─── Component ───────────────────────────────────────────────────────────────

export default function TaskDagPanel({ taskIds }: TaskDagPanelProps) {
    const [graph, setGraph] = useState<TaskDependencyGraph | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchGraph = useCallback(async () => {
        if (taskIds.length === 0) return;
        setLoading(true);
        setError(null);
        try {
            const ids = taskIds.join(',');
            const res = await fetch(`/api/tasks/dependency-graph?taskIds=${encodeURIComponent(ids)}`, {
                cache: 'no-store',
            });
            if (!res.ok) {
                const data = (await res.json()) as { error?: string };
                setError(data.error ?? `HTTP ${res.status}`);
                return;
            }
            const data = (await res.json()) as TaskDependencyGraph;
            setGraph(data);
        } catch {
            setError('Failed to load dependency graph.');
        } finally {
            setLoading(false);
        }
    }, [taskIds]);

    useEffect(() => {
        void fetchGraph();
    }, [fetchGraph]);

    const layout = graph ? buildLayout(graph) : [];
    const layoutMap = new Map(layout.map((l) => [l.node.taskId, l]));
    const dims = layout.length > 0 ? svgDimensions(layout) : { width: 320, height: 160 };

    return (
        <div style={{ fontFamily: 'inherit' }}>
            {/* Header row */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '0.75rem',
                }}
            >
                <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-foreground, #0f172a)' }}>
                    Dependency graph
                    {graph && (
                        <span
                            style={{
                                marginLeft: '0.5rem',
                                fontSize: '0.75rem',
                                fontWeight: 400,
                                background: '#e2e8f0',
                                color: '#475569',
                                borderRadius: 9999,
                                padding: '1px 8px',
                            }}
                        >
                            {graph.nodes.length}
                        </span>
                    )}
                </span>
                <button
                    onClick={() => void fetchGraph()}
                    disabled={loading}
                    style={{
                        fontSize: '0.75rem',
                        padding: '4px 10px',
                        borderRadius: 6,
                        border: '1px solid #cbd5e1',
                        background: loading ? '#f1f5f9' : '#fff',
                        cursor: loading ? 'default' : 'pointer',
                        color: '#475569',
                    }}
                >
                    {loading ? 'Loading…' : 'Refresh'}
                </button>
            </div>

            {/* Body */}
            {error && (
                <div
                    style={{
                        padding: '0.75rem',
                        borderRadius: 8,
                        background: '#fee2e2',
                        color: '#991b1b',
                        fontSize: '0.8125rem',
                    }}
                >
                    {error}
                </div>
            )}

            {!error && taskIds.length === 0 && (
                <div style={{ color: '#94a3b8', fontSize: '0.875rem', padding: '1rem 0' }}>
                    No tasks selected.
                </div>
            )}

            {!error && taskIds.length > 0 && !loading && graph && graph.nodes.length === 0 && (
                <div style={{ color: '#94a3b8', fontSize: '0.875rem', padding: '1rem 0' }}>
                    No dependency data available.
                </div>
            )}

            {!error && graph && graph.nodes.length > 0 && (
                <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                    <svg
                        width={dims.width}
                        height={dims.height}
                        style={{ display: 'block', background: 'var(--color-background, #fff)' }}
                        aria-label="Task dependency graph"
                        role="img"
                    >
                        <defs>
                            <marker
                                id={ARROW_MARKER_ID}
                                markerWidth="8"
                                markerHeight="8"
                                refX="6"
                                refY="3"
                                orient="auto"
                            >
                                <path d="M0,0 L0,6 L8,3 z" fill="#94a3b8" />
                            </marker>
                        </defs>

                        {/* Edges */}
                        {layout.map(({ node, x, y }) =>
                            node.dependsOn.map((depId: string) => {
                                const from = layoutMap.get(depId);
                                if (!from) return null;
                                const x1 = from.x + NODE_W;
                                const y1 = from.y + NODE_H / 2;
                                const x2 = x;
                                const y2 = y + NODE_H / 2;
                                const mx = (x1 + x2) / 2;
                                return (
                                    <path
                                        key={`${depId}->${node.taskId}`}
                                        d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
                                        fill="none"
                                        stroke="#94a3b8"
                                        strokeWidth={1.5}
                                        markerEnd={`url(#${ARROW_MARKER_ID})`}
                                    />
                                );
                            }),
                        )}

                        {/* Nodes */}
                        {layout.map(({ node, x, y }) => {
                            const fill = STATUS_FILL[node.status];
                            const textColor = STATUS_TEXT[node.status];
                            const stroke = STATUS_STROKE[node.status];
                            const shortId = node.taskId.length > 12
                                ? `…${node.taskId.slice(-10)}`
                                : node.taskId;
                            return (
                                <g key={node.taskId} role="listitem">
                                    <rect
                                        x={x}
                                        y={y}
                                        width={NODE_W}
                                        height={NODE_H}
                                        rx={6}
                                        fill={fill}
                                        stroke={stroke}
                                        strokeWidth={1.5}
                                    />
                                    <text
                                        x={x + NODE_W / 2}
                                        y={y + 17}
                                        textAnchor="middle"
                                        fontSize={11}
                                        fontFamily="inherit"
                                        fill={textColor}
                                        fontWeight={500}
                                    >
                                        {shortId}
                                    </text>
                                    <text
                                        x={x + NODE_W / 2}
                                        y={y + 33}
                                        textAnchor="middle"
                                        fontSize={10}
                                        fontFamily="inherit"
                                        fill={textColor}
                                        opacity={0.85}
                                    >
                                        {node.status}
                                    </text>
                                </g>
                            );
                        })}
                    </svg>
                </div>
            )}

            {/* Legend */}
            {graph && graph.nodes.length > 0 && (
                <div
                    style={{
                        display: 'flex',
                        gap: '1rem',
                        flexWrap: 'wrap',
                        marginTop: '0.75rem',
                        fontSize: '0.75rem',
                        color: '#64748b',
                    }}
                >
                    {(Object.keys(STATUS_FILL) as TaskDepStatus[]).map((s) => (
                        <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span
                                style={{
                                    width: 10,
                                    height: 10,
                                    borderRadius: 2,
                                    background: STATUS_FILL[s],
                                    border: `1px solid ${STATUS_STROKE[s]}`,
                                    display: 'inline-block',
                                }}
                            />
                            {s}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}
