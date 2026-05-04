import type { FastifyInstance, FastifyRequest } from 'fastify';

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

export function registerKnowledgeGraphRoutes(app: FastifyInstance): void {
    // Get full snapshot (all symbols + edges)
    app.get('/knowledge-graph/snapshot', async (_req, reply) => {
        const { globalKnowledgeGraph } = await import(
            '@agentfarm/agent-runtime/repo-knowledge-graph.js'
        ).catch(() => import('../../agent-runtime-stubs.js'));
        const symbols = globalKnowledgeGraph.listSymbols?.() ?? [];
        return reply.send({
            symbols,
            call_edges: globalKnowledgeGraph.getCallEdges?.() ?? [],
            dep_edges: globalKnowledgeGraph.getDepEdges?.() ?? [],
            last_indexed: globalKnowledgeGraph.lastIndexed ?? null,
        });
    });

    // Search symbols
    app.get(
        '/knowledge-graph/symbols',
        async (req: FastifyRequest<{ Querystring: SymbolQuery }>, reply) => {
            const { q, kind, limit } = req.query;
            const { globalKnowledgeGraph } = await import(
                '@agentfarm/agent-runtime/repo-knowledge-graph.js'
            ).catch(() => import('../../agent-runtime-stubs.js'));
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
            const { symbol } = req.query;
            if (!symbol) return reply.status(400).send({ error: 'symbol required' });
            const { globalKnowledgeGraph } = await import(
                '@agentfarm/agent-runtime/repo-knowledge-graph.js'
            ).catch(() => import('../../agent-runtime-stubs.js'));
            const callers = globalKnowledgeGraph.getCallers?.(symbol) ?? [];
            return reply.send({ symbol, callers });
        },
    );

    // Index workspace
    app.post('/knowledge-graph/index', async (req: FastifyRequest<{ Body: IndexBody }>, reply) => {
        const rootDir = req.body?.root_dir ?? '.';
        const { globalKnowledgeGraph } = await import(
            '@agentfarm/agent-runtime/repo-knowledge-graph.js'
        ).catch(() => import('../../agent-runtime-stubs.js'));
        await globalKnowledgeGraph.indexDirectory?.(rootDir);
        return reply.send({ ok: true, indexed_at: new Date().toISOString() });
    });

    // Skill suggestions based on graph context
    app.get(
        '/knowledge-graph/suggestions',
        async (req: FastifyRequest<{ Querystring: SuggestionsQuery }>, reply) => {
            const context = req.query.context;
            const { globalKnowledgeGraph } = await import(
                '@agentfarm/agent-runtime/repo-knowledge-graph.js'
            ).catch(() => import('../../agent-runtime-stubs.js'));
            const suggestions = globalKnowledgeGraph.suggestSkills?.(context) ?? [];
            return reply.send({ suggestions });
        },
    );
}
