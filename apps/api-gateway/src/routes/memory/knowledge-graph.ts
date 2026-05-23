/**
 * Knowledge graph data is populated by the agent-runtime indexer.
 * To seed test data, dispatch an agent with a code repository task —
 * the runtime writes AgentRepoKnowledge records which this route reads.
 * Empty graph = no indexing runs have completed for this tenant yet.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';

const getPrisma = async () => {
    const db = await import('../lib/db.js');
    return db.prisma;
};

type SymbolQuery = {
    q?: string;
    kind?: string;
    limit?: string;
};

type SuggestionsQuery = {
    context?: string;
};

type IndexBody = {
    root_dir?: string;
};

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    expiresAt: number;
};

export type RegisterKnowledgeGraphRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
};

export function registerKnowledgeGraphRoutes(app: FastifyInstance, options: RegisterKnowledgeGraphRoutesOptions): void {
    const getSession = options.getSession;

    // Get full snapshot (all symbols + edges)
    app.get('/knowledge-graph/snapshot', async (req, reply) => {
        const session = getSession(req);
        if (!session) return reply.status(401).send({ error: 'unauthorized' });
        const { globalKnowledgeGraph } = await import(
            '@agentfarm/agent-runtime/repo-knowledge-graph.js'
        ).catch(() => import('../agent-runtime-stubs.js'));
        const runtimeSymbols = globalKnowledgeGraph.listSymbols?.() ?? [];

        // DB-backed graph — fill in records the runtime hasn't indexed in-memory yet
        const VALID_KINDS = new Set(['function', 'class', 'interface', 'type', 'variable', 'unknown']);
        let dbSymbols: typeof runtimeSymbols = [];
        let dbLastIndexed: string | null = null;
        try {
            const prisma = await getPrisma();
            const dbRecords = await prisma.agentRepoKnowledge.findMany({
                where: { tenantId: session.tenantId },
                take: 500,
                orderBy: { updatedAt: 'desc' },
            });
            if (dbRecords.length > 0) {
                dbLastIndexed = dbRecords[0].updatedAt.toISOString();
            }
            dbSymbols = dbRecords.map((r) => {
                const val =
                    r.value && typeof r.value === 'object' && !Array.isArray(r.value)
                        ? (r.value as Record<string, unknown>)
                        : {};
                return {
                    name: r.key,
                    kind: (VALID_KINDS.has(r.role) ? r.role : 'unknown') as
                        | 'function'
                        | 'class'
                        | 'interface'
                        | 'type'
                        | 'variable'
                        | 'unknown',
                    file_path: typeof val['filePath'] === 'string' ? val['filePath'] : '',
                    line: typeof val['line'] === 'number' ? val['line'] : 0,
                    callers: [],
                    callees: [],
                };
            });
        } catch {
            // DB unavailable — serve whatever the runtime has in memory
        }

        // Runtime symbols take precedence; DB fills the rest
        const runtimeNames = new Set(runtimeSymbols.map((s: { name: string }) => s.name));
        const additionalDbSymbols = dbSymbols.filter((s: { name: string }) => !runtimeNames.has(s.name));

        return reply.send({
            symbols: [...runtimeSymbols, ...additionalDbSymbols],
            call_edges: globalKnowledgeGraph.getCallEdges?.() ?? [],
            dep_edges: globalKnowledgeGraph.getDepEdges?.() ?? [],
            last_indexed: globalKnowledgeGraph.lastIndexed ?? dbLastIndexed,
        });
    });

    // Search symbols
    app.get(
        '/knowledge-graph/symbols',
        async (req: FastifyRequest<{ Querystring: SymbolQuery }>, reply) => {
            const session = getSession(req);
            if (!session) return reply.status(401).send({ error: 'unauthorized' });
            const { q, kind, limit } = req.query;
            const { globalKnowledgeGraph } = await import(
                '@agentfarm/agent-runtime/repo-knowledge-graph.js'
            ).catch(() => import('../agent-runtime-stubs.js'));
            let symbols = globalKnowledgeGraph.listSymbols?.() ?? [];
            if (q) {
                const lq = q.toLowerCase();
                symbols = symbols.filter((s: { name: string }) => s.name.toLowerCase().includes(lq));
            }
            if (kind) {
                symbols = symbols.filter((s: { kind: string }) => s.kind === kind);
            }
            return reply.send({ symbols: symbols.slice(0, Number(limit ?? 100)) });
        },
    );

    // Callers of a symbol
    app.get(
        '/knowledge-graph/callers',
        async (req: FastifyRequest<{ Querystring: { symbol: string } }>, reply) => {
            const session = getSession(req);
            if (!session) return reply.status(401).send({ error: 'unauthorized' });
            const { symbol } = req.query;
            if (!symbol) return reply.status(400).send({ error: 'symbol required' });
            const { globalKnowledgeGraph } = await import(
                '@agentfarm/agent-runtime/repo-knowledge-graph.js'
            ).catch(() => import('../agent-runtime-stubs.js'));
            const callers = globalKnowledgeGraph.getCallers?.(symbol) ?? [];
            return reply.send({ symbol, callers });
        },
    );

    // Index workspace
    app.post('/knowledge-graph/index', async (req: FastifyRequest<{ Body: IndexBody }>, reply) => {
        const session = getSession(req);
        if (!session) return reply.status(401).send({ error: 'unauthorized' });
        const rootDir = req.body?.root_dir ?? '.';
        const { globalKnowledgeGraph } = await import(
            '@agentfarm/agent-runtime/repo-knowledge-graph.js'
        ).catch(() => import('../agent-runtime-stubs.js'));
        await globalKnowledgeGraph.indexDirectory?.(rootDir);
        return reply.send({ ok: true, indexed_at: new Date().toISOString() });
    });

    // Skill suggestions based on graph context
    app.get(
        '/knowledge-graph/suggestions',
        async (req: FastifyRequest<{ Querystring: SuggestionsQuery }>, reply) => {
            const session = getSession(req);
            if (!session) return reply.status(401).send({ error: 'unauthorized' });
            const context = req.query.context;
            const { globalKnowledgeGraph } = await import(
                '@agentfarm/agent-runtime/repo-knowledge-graph.js'
            ).catch(() => import('../agent-runtime-stubs.js'));
            const suggestions = globalKnowledgeGraph.suggestSkills?.(context) ?? [];
            return reply.send({ suggestions });
        },
    );
}
