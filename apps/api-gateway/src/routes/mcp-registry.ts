import type { FastifyInstance, FastifyRequest } from 'fastify';

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    expiresAt: number;
};

type McpServerRecord = {
    id: string;
    tenantId: string;
    workspaceId: string | null;
    name: string;
    url: string;
    headers: Record<string, string> | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
};

type McpServerRepo = {
    upsert(input: {
        tenantId: string;
        name: string;
        url: string;
        workspaceId?: string | null;
        headers?: Record<string, string> | null;
    }): Promise<McpServerRecord>;
    findActive(tenantId: string): Promise<McpServerRecord[]>;
    findById(id: string): Promise<McpServerRecord | null>;
    deactivate(id: string): Promise<void>;
};

const getPrisma = async () => {
    const db = await import('../lib/db.js');
    return db.prisma;
};

const defaultRepo: McpServerRepo = {
    async upsert(input) {
        const prisma = await getPrisma();
        return prisma.tenantMcpServer.upsert({
            where: { tenantId_name: { tenantId: input.tenantId, name: input.name } },
            create: {
                tenantId: input.tenantId,
                name: input.name,
                url: input.url,
                workspaceId: input.workspaceId ?? null,
                headers: input.headers ?? undefined,
                isActive: true,
            },
            update: {
                url: input.url,
                workspaceId: input.workspaceId ?? null,
                headers: input.headers ?? undefined,
                isActive: true,
            },
        }) as unknown as McpServerRecord;
    },
    async findActive(tenantId) {
        const prisma = await getPrisma();
        return prisma.tenantMcpServer.findMany({
            where: { tenantId, isActive: true },
            orderBy: { createdAt: 'asc' },
        }) as unknown as McpServerRecord[];
    },
    async findById(id) {
        const prisma = await getPrisma();
        return prisma.tenantMcpServer.findUnique({
            where: { id },
        }) as unknown as McpServerRecord | null;
    },
    async deactivate(id) {
        const prisma = await getPrisma();
        await prisma.tenantMcpServer.update({
            where: { id },
            data: { isActive: false },
        });
    },
};

type RegisterMcpRegistryRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
    repo?: McpServerRepo;
    fetcher?: (url: string, init?: RequestInit) => Promise<Response>;
};

type CreateBody = {
    name?: string;
    url?: string;
    workspaceId?: string;
    headers?: Record<string, string>;
};

type IdParams = {
    id: string;
};

export async function registerMcpRegistryRoutes(
    app: FastifyInstance,
    options: RegisterMcpRegistryRoutesOptions,
): Promise<void> {
    const repo = options.repo ?? defaultRepo;
    const fetcher = options.fetcher ?? globalThis.fetch;

    // POST /v1/mcp — register or reactivate a server
    app.post<{ Body: CreateBody }>('/v1/mcp', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized', message: 'A valid authenticated session is required.' });
        }

        const name = typeof request.body?.name === 'string' ? request.body.name.trim() : '';
        if (!name) {
            return reply.code(400).send({ error: 'invalid_request', message: 'name is required.' });
        }

        const url = typeof request.body?.url === 'string' ? request.body.url.trim() : '';
        if (!url) {
            return reply.code(400).send({ error: 'invalid_request', message: 'url is required.' });
        }

        // Basic URL validation to prevent obvious injection.
        let parsedUrl: URL;
        try {
            parsedUrl = new URL(url);
        } catch {
            return reply.code(400).send({ error: 'invalid_request', message: 'url must be a valid absolute URL.' });
        }
        if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
            return reply.code(400).send({ error: 'invalid_request', message: 'url must use http or https protocol.' });
        }

        const workspaceId = typeof request.body?.workspaceId === 'string' ? request.body.workspaceId.trim() : null;
        const headers =
            request.body?.headers && typeof request.body.headers === 'object' && !Array.isArray(request.body.headers)
                ? (request.body.headers as Record<string, string>)
                : null;

        const record = await repo.upsert({
            tenantId: session.tenantId,
            name,
            url,
            workspaceId,
            headers,
        });

        return reply.code(201).send({
            id: record.id,
            name: record.name,
            url: record.url,
            isActive: true,
        });
    });

    // GET /v1/mcp — list active servers for tenant
    app.get('/v1/mcp', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized', message: 'A valid authenticated session is required.' });
        }

        const servers = await repo.findActive(session.tenantId);
        return reply.code(200).send(servers);
    });

    // DELETE /v1/mcp/:id — soft delete (deactivate)
    app.delete<{ Params: IdParams }>('/v1/mcp/:id', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized', message: 'A valid authenticated session is required.' });
        }

        const id = request.params.id?.trim();
        if (!id) {
            return reply.code(400).send({ error: 'invalid_request', message: 'id param is required.' });
        }

        const record = await repo.findById(id);
        if (!record) {
            return reply.code(404).send({ error: 'not_found', message: 'MCP server not found.' });
        }
        if (record.tenantId !== session.tenantId) {
            return reply.code(403).send({ error: 'forbidden', message: 'Access denied.' });
        }

        await repo.deactivate(id);
        return reply.code(200).send({ ok: true });
    });

    // GET /v1/mcp/:id/ping — latency probe
    app.get<{ Params: IdParams }>('/v1/mcp/:id/ping', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized', message: 'A valid authenticated session is required.' });
        }

        const id = request.params.id?.trim();
        if (!id) {
            return reply.code(400).send({ error: 'invalid_request', message: 'id param is required.' });
        }

        const record = await repo.findById(id);
        if (!record) {
            return reply.code(404).send({ error: 'not_found', message: 'MCP server not found.' });
        }
        if (record.tenantId !== session.tenantId) {
            return reply.code(403).send({ error: 'forbidden', message: 'Access denied.' });
        }

        const TIMEOUT_MS = 5000;
        const start = Date.now();

        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
            try {
                await fetcher(record.url, { method: 'HEAD', signal: controller.signal });
            } finally {
                clearTimeout(timer);
            }
            const latencyMs = Date.now() - start;
            return reply.code(200).send({ ok: true, latencyMs });
        } catch {
            return reply.code(200).send({ ok: false, latencyMs: TIMEOUT_MS });
        }
    });
}
