import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../lib/internal-session';

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

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

type QueueEntry = {
    id: string;
    status: string;
    dependsOn?: string[];
    dependencyMet?: boolean;
    payload?: unknown;
};

/**
 * GET /api/tasks/dependency-graph?taskIds=id1,id2,...
 *
 * Fetches each task entry from the gateway and builds a TaskDependencyGraph.
 * Depth is computed from the dependency structure (BFS from roots).
 */
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const rawIds = searchParams.get('taskIds') ?? '';
    const taskIds = rawIds
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

    if (taskIds.length === 0) {
        return NextResponse.json(
            { error: 'bad_request', message: 'taskIds query parameter is required.' },
            { status: 400 },
        );
    }

    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json(
            { error: 'forbidden', message: 'Internal session required.' },
            { status: 403 },
        );
    }

    // Fetch all entries in parallel.
    const results = await Promise.all(
        taskIds.map(async (id) => {
            try {
                const res = await fetch(`${getApiBaseUrl()}/v1/task-queue/${encodeURIComponent(id)}`, {
                    headers: { Authorization: authHeader },
                    cache: 'no-store',
                });
                if (!res.ok) return null;
                const data = (await res.json()) as { entry?: QueueEntry };
                return data.entry ?? null;
            } catch {
                return null;
            }
        }),
    );

    const entries = results.filter((e): e is QueueEntry => e !== null);
    const entryMap = new Map(entries.map((e) => [e.id, e]));

    // Compute depth via BFS from roots (entries whose dependsOn are not in the set).
    const knownIds = new Set(entries.map((e) => e.id));
    const depthMap = new Map<string, number>();

    const roots = entries.filter(
        (e) => !(e.dependsOn ?? []).some((dep) => knownIds.has(dep)),
    );
    const queue: { id: string; depth: number }[] = roots.map((r) => ({ id: r.id, depth: 0 }));

    while (queue.length > 0) {
        const { id, depth } = queue.shift()!;
        if (depthMap.has(id)) continue;
        depthMap.set(id, depth);

        // Find entries that directly depend on this id.
        for (const entry of entries) {
            if ((entry.dependsOn ?? []).includes(id)) {
                queue.push({ id: entry.id, depth: depth + 1 });
            }
        }
    }

    // Entries not reached by BFS get depth 0.
    for (const entry of entries) {
        if (!depthMap.has(entry.id)) {
            depthMap.set(entry.id, 0);
        }
    }

    // Compute dependents (reverse edges).
    const dependentsMap = new Map<string, string[]>();
    for (const entry of entries) {
        if (!dependentsMap.has(entry.id)) dependentsMap.set(entry.id, []);
        for (const depId of entry.dependsOn ?? []) {
            if (!dependentsMap.has(depId)) dependentsMap.set(depId, []);
            dependentsMap.get(depId)!.push(entry.id);
        }
    }

    const nodes: TaskDependencyNode[] = entries.map((entry) => {
        const status = normaliseStatus(entry.status, entry.dependsOn ?? [], entryMap);
        return {
            taskId: entry.id,
            status,
            dependsOn: entry.dependsOn ?? [],
            dependents: dependentsMap.get(entry.id) ?? [],
            depth: depthMap.get(entry.id) ?? 0,
        };
    });

    const leafIds = nodes.filter((n) => n.dependents.length === 0).map((n) => n.taskId);
    const rootIds = nodes
        .filter((n) => n.dependsOn.length === 0 || n.dependsOn.every((d: string) => !knownIds.has(d)))
        .map((n) => n.taskId);

    const graph: TaskDependencyGraph = { nodes, rootIds, leafIds };
    return NextResponse.json(graph);
}

function normaliseStatus(
    status: string,
    dependsOn: string[],
    entryMap: Map<string, QueueEntry>,
): TaskDepStatus {
    if (status === 'done') return 'done';
    if (status === 'failed') return 'failed';
    if (status === 'running') return 'running';

    // Mark as blocked if any dependency is not done.
    if (dependsOn.length > 0) {
        const blocked = dependsOn.some((dep) => {
            const depEntry = entryMap.get(dep);
            return !depEntry || depEntry.status !== 'done';
        });
        if (blocked) return 'blocked';
    }

    return 'pending';
}
