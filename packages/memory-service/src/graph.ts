// ============================================================================
// MEMORY GRAPH — Phase 3 of FluxMem
//
// Implements a lightweight heterogeneous graph over AgentMemoryEdge rows,
// connecting AgentKnowledgeBase (approved documents) and AgentLongTermMemory
// (lessons) via typed directed edges.
//
// Edge types:
//   spawned_lesson  KB doc → lesson  (rejection produced this lesson)
//   derived_from    KB doc → KB doc  (PM sprint from BA BRD, tester cases from BA AC)
//   reinforces      KB doc → lesson  (approval confirmed an existing lesson)
//   contradicts     lesson → KB doc  (lesson challenges an approved pattern)
//
// Node types:
//   knowledge  — AgentKnowledgeBase row
//   lesson     — AgentLongTermMemory row
//
// The graph grows automatically:
//   ingestApprovedDocument   → derived_from edge when prior doc exists
//   ingestBaFeedback         → spawned_lesson edge from source doc to new lesson
//
// Consumers:
//   Orchestrator — trace upstream context (PM retrieves BA's BRD via graph)
//   Dashboard    — audit trail: show which lessons a rejected document spawned
//   RAG context  — future Phase 3b: walk graph to surface related prior work
// ============================================================================

import type { PrismaClient } from '@prisma/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MemoryNodeType = 'knowledge' | 'lesson';

export type MemoryEdgeType =
    | 'spawned_lesson'
    | 'derived_from'
    | 'reinforces'
    | 'contradicts';

export interface WriteEdgeParams {
    tenantId:    string;
    workspaceId: string;
    fromId:      string;
    fromType:    MemoryNodeType;
    toId:        string;
    toType:      MemoryNodeType;
    edgeType:    MemoryEdgeType;
    agentPrefix?: string;
    weight?:     number;
}

export interface MemoryEdge {
    id:          string;
    tenantId:    string;
    workspaceId: string;
    fromId:      string;
    fromType:    string;
    toId:        string;
    toType:      string;
    edgeType:    string;
    agentPrefix: string | null;
    weight:      number;
    createdAt:   string;
}

export interface TraversalNode {
    id:        string;
    nodeType:  MemoryNodeType;
    edgeType:  MemoryEdgeType;
    depth:     number;
    weight:    number;
}

// ---------------------------------------------------------------------------
// Internal row type returned by raw queries
// ---------------------------------------------------------------------------

interface EdgeRow {
    id:          string;
    tenantId:    string;
    workspaceId: string;
    fromId:      string;
    fromType:    string;
    toId:        string;
    toType:      string;
    edgeType:    string;
    agentPrefix: string | null;
    weight:      number;
    createdAt:   Date;
}

function rowToEdge(row: EdgeRow): MemoryEdge {
    return {
        ...row,
        weight:    Number(row.weight),
        createdAt: row.createdAt instanceof Date
            ? row.createdAt.toISOString()
            : String(row.createdAt),
    };
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/**
 * Create a directed edge between two memory nodes.
 *
 * Idempotent: upserts on (tenantId, fromId, toId, edgeType).
 * Updating weight on conflict lets callers strengthen edges over time.
 */
export async function writeMemoryEdge(
    prisma: PrismaClient,
    params: WriteEdgeParams,
): Promise<void> {
    const weight = params.weight ?? 1.0;

    await (prisma.$executeRaw as (...args: unknown[]) => Promise<number>)`
        INSERT INTO "AgentMemoryEdge"
            ("id", "tenantId", "workspaceId", "fromId", "fromType",
             "toId", "toType", "edgeType", "agentPrefix", "weight", "createdAt")
        VALUES (
            gen_random_uuid()::text,
            ${params.tenantId},
            ${params.workspaceId},
            ${params.fromId},
            ${params.fromType},
            ${params.toId},
            ${params.toType},
            ${params.edgeType},
            ${params.agentPrefix ?? null},
            ${weight},
            NOW()
        )
        ON CONFLICT ("tenantId", "fromId", "toId", "edgeType") DO UPDATE SET
            "weight"    = GREATEST("AgentMemoryEdge"."weight", EXCLUDED."weight"),
            "createdAt" = "AgentMemoryEdge"."createdAt"
    `;
}

// ---------------------------------------------------------------------------
// Read — outgoing edges
// ---------------------------------------------------------------------------

/**
 * Return all edges originating from a given node.
 * Useful for: "what did this approved document spawn?" (lesson audit trail)
 */
export async function readEdgesFrom(
    prisma:   PrismaClient,
    tenantId: string,
    fromId:   string,
    fromType: MemoryNodeType,
): Promise<MemoryEdge[]> {
    const rows = await (prisma.$queryRaw as (...args: unknown[]) => Promise<EdgeRow[]>)`
        SELECT id, "tenantId", "workspaceId", "fromId", "fromType",
               "toId", "toType", "edgeType", "agentPrefix", weight, "createdAt"
        FROM "AgentMemoryEdge"
        WHERE "tenantId" = ${tenantId}
          AND "fromId"   = ${fromId}
          AND "fromType" = ${fromType}
        ORDER BY "createdAt" DESC
    `;
    return rows.map(rowToEdge);
}

// ---------------------------------------------------------------------------
// Read — incoming edges
// ---------------------------------------------------------------------------

/**
 * Return all edges pointing to a given node.
 * Useful for: "which documents or agents produced this lesson?" (provenance)
 */
export async function readEdgesTo(
    prisma:   PrismaClient,
    tenantId: string,
    toId:     string,
    toType:   MemoryNodeType,
): Promise<MemoryEdge[]> {
    const rows = await (prisma.$queryRaw as (...args: unknown[]) => Promise<EdgeRow[]>)`
        SELECT id, "tenantId", "workspaceId", "fromId", "fromType",
               "toId", "toType", "edgeType", "agentPrefix", weight, "createdAt"
        FROM "AgentMemoryEdge"
        WHERE "tenantId" = ${tenantId}
          AND "toId"     = ${toId}
          AND "toType"   = ${toType}
        ORDER BY "createdAt" DESC
    `;
    return rows.map(rowToEdge);
}

// ---------------------------------------------------------------------------
// Traverse — BFS up to maxDepth hops
// ---------------------------------------------------------------------------

/**
 * Walk the memory graph from a starting node via BFS, up to maxDepth hops.
 *
 * Returns all reachable nodes with their depth and the edge type that led there.
 * Cycles are handled by tracking visited node IDs.
 *
 * Default maxDepth=2 covers the most common case:
 *   BA BRD (depth 0) → PM Sprint Plan (depth 1) → Tester Test Cases (depth 2)
 */
export async function traverseMemoryGraph(
    prisma:    PrismaClient,
    tenantId:  string,
    startId:   string,
    startType: MemoryNodeType,
    maxDepth   = 2,
): Promise<TraversalNode[]> {
    const visited  = new Set<string>([startId]);
    const result:   TraversalNode[] = [];
    const queue:    Array<{ id: string; type: MemoryNodeType; depth: number }> = [
        { id: startId, type: startType, depth: 0 },
    ];

    while (queue.length > 0) {
        const current = queue.shift()!;
        if (current.depth >= maxDepth) continue;

        const edges = await readEdgesFrom(prisma, tenantId, current.id, current.type);

        for (const edge of edges) {
            if (visited.has(edge.toId)) continue;
            visited.add(edge.toId);

            const node: TraversalNode = {
                id:       edge.toId,
                nodeType: edge.toType as MemoryNodeType,
                edgeType: edge.edgeType as MemoryEdgeType,
                depth:    current.depth + 1,
                weight:   edge.weight,
            };
            result.push(node);
            queue.push({ id: edge.toId, type: edge.toType as MemoryNodeType, depth: current.depth + 1 });
        }
    }

    return result;
}
