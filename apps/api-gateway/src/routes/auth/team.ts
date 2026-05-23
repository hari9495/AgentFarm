import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { hashPassword } from '../lib/password.js';
import { ROLE_RANK } from '../lib/require-role.js';

const ALLOWED_INVITE_ROLES = ['viewer', 'operator', 'admin'] as const;
type InviteRole = (typeof ALLOWED_INVITE_ROLES)[number];

const getPrisma = async () => {
    const db = await import('../lib/db.js');
    return db.prisma;
};

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    role?: string;
    expiresAt: number;
};

export type RegisterTeamRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
    prisma?: PrismaClient;
};

type UserIdParams = { userId: string };

type InviteBody = {
    email: string;
    name: string;
    password: string;
    role: string;
};

type UpdateRoleBody = {
    role: string;
};

const isRoleSufficient = (sessionRole: string | undefined, minimum: string): boolean => {
    const userRank = ROLE_RANK[sessionRole ?? ''] ?? 0;
    const minRank = ROLE_RANK[minimum] ?? 99;
    return userRank >= minRank;
};

export const registerTeamRoutes = async (
    app: FastifyInstance,
    options: RegisterTeamRoutesOptions,
): Promise<void> => {
    const resolvePrisma = options.prisma ? () => Promise.resolve(options.prisma!) : getPrisma;

    // -----------------------------------------------------------------------
    // GET /v1/team/members — list team members (any role)
    // -----------------------------------------------------------------------
    app.get('/v1/team/members', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized' });
        }

        const db = await resolvePrisma();
        const members = await db.tenantUser.findMany({
            where: { tenantId: session.tenantId },
            select: { id: true, email: true, name: true, role: true, createdAt: true },
            orderBy: { createdAt: 'asc' },
        });

        return reply.send({ members });
    });

    // -----------------------------------------------------------------------
    // POST /v1/team/invite — invite a new member (admin+)
    // -----------------------------------------------------------------------
    app.post<{ Body: InviteBody }>('/v1/team/invite', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized' });
        }

        if (!isRoleSufficient(session.role, 'admin')) {
            return reply.code(403).send({ error: 'insufficient_role', required: 'admin', actual: session.role });
        }

        const { email, name, password, role } = request.body ?? ({} as InviteBody);

        if (!email || typeof email !== 'string') {
            return reply.code(400).send({ error: 'validation_failed', field: 'email' });
        }
        if (!name || typeof name !== 'string') {
            return reply.code(400).send({ error: 'validation_failed', field: 'name' });
        }
        if (!password || typeof password !== 'string' || password.length < 10) {
            return reply.code(400).send({ error: 'validation_failed', field: 'password', message: 'Password must be at least 10 characters.' });
        }
        if (!(ALLOWED_INVITE_ROLES as readonly string[]).includes(role)) {
            return reply.code(400).send({ error: 'invalid_role', message: `Role must be one of: ${ALLOWED_INVITE_ROLES.join(', ')}` });
        }

        const db = await resolvePrisma();

        // Check for duplicate email
        const existing = await db.tenantUser.findUnique({ where: { email: email.trim().toLowerCase() } });
        if (existing) {
            return reply.code(409).send({ error: 'email_taken', message: 'A user with this email already exists.' });
        }

        const passwordHash = await hashPassword(password);
        const member = await db.tenantUser.create({
            data: {
                tenantId: session.tenantId,
                email: email.trim().toLowerCase(),
                name: name.trim(),
                passwordHash,
                role: role as InviteRole,
            },
            select: { id: true, email: true, name: true, role: true },
        });

        return reply.code(201).send(member);
    });

    // -----------------------------------------------------------------------
    // PATCH /v1/team/members/:userId/role — update role (admin+)
    // -----------------------------------------------------------------------
    app.patch<{ Params: UserIdParams; Body: UpdateRoleBody }>(
        '/v1/team/members/:userId/role',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) {
                return reply.code(401).send({ error: 'unauthorized' });
            }

            if (!isRoleSufficient(session.role, 'admin')) {
                return reply.code(403).send({ error: 'insufficient_role', required: 'admin', actual: session.role });
            }

            const { userId } = request.params;
            const { role } = request.body ?? ({} as UpdateRoleBody);

            if (userId === session.userId) {
                return reply.code(400).send({ error: 'cannot_modify_self', message: 'You cannot change your own role.' });
            }

            if (!(ALLOWED_INVITE_ROLES as readonly string[]).includes(role)) {
                return reply.code(400).send({ error: 'invalid_role', message: `Role must be one of: ${ALLOWED_INVITE_ROLES.join(', ')}` });
            }

            const db = await resolvePrisma();
            const target = await db.tenantUser.findUnique({ where: { id: userId } });

            if (!target || target.tenantId !== session.tenantId) {
                return reply.code(404).send({ error: 'not_found' });
            }

            if (target.role === 'owner') {
                return reply.code(400).send({ error: 'cannot_modify_owner', message: 'Cannot change the role of an owner.' });
            }

            const updated = await db.tenantUser.update({
                where: { id: userId },
                data: { role },
                select: { id: true, email: true, role: true },
            });

            return reply.send(updated);
        },
    );

    // -----------------------------------------------------------------------
    // DELETE /v1/team/members/:userId — remove member (admin+)
    // -----------------------------------------------------------------------
    app.delete<{ Params: UserIdParams }>('/v1/team/members/:userId', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized' });
        }

        if (!isRoleSufficient(session.role, 'admin')) {
            return reply.code(403).send({ error: 'insufficient_role', required: 'admin', actual: session.role });
        }

        const { userId } = request.params;

        if (userId === session.userId) {
            return reply.code(400).send({ error: 'cannot_remove_self', message: 'You cannot remove yourself.' });
        }

        const db = await resolvePrisma();
        const target = await db.tenantUser.findUnique({ where: { id: userId } });

        if (!target || target.tenantId !== session.tenantId) {
            return reply.code(404).send({ error: 'not_found' });
        }

        if (target.role === 'owner') {
            return reply.code(400).send({ error: 'cannot_remove_owner', message: 'Cannot remove an owner.' });
        }

        await db.tenantUser.delete({ where: { id: userId } });
        return reply.code(204).send();
    });
};
