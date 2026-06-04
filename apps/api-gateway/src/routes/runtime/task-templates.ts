import { randomUUID } from 'crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type {
    TaskTemplate,
    TaskTemplateDispatchRequest,
    TaskTemplateDispatchResult,
} from '@agentfarm/shared-types';

const getPrisma = async () => {
    const db = await import('../../lib/db.js');
    return db.prisma;
};

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    scope?: 'customer' | 'internal';
    expiresAt: number;
};

export type RegisterTaskTemplateRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
    prisma?: PrismaClient;
};

// ── Built-in templates ────────────────────────────────────────────────────────
// agentRole values match the RoleKey type from shared-types exactly.

const BUILT_IN_TEMPLATES: TaskTemplate[] = [
    {
        id: 'builtin-draft-cold-email',
        slug: 'draft-cold-email',
        name: 'Draft Cold Email',
        description: 'Generate a personalised cold outreach email for a prospect, including a compelling hook, value proposition, and clear CTA.',
        category: 'sales',
        agentRole: 'sales_rep',
        promptTemplate: 'Draft a cold email to {{prospect_name}} at {{company_name}}. Their role is {{prospect_role}}. Focus on {{pain_point}} and highlight how we can help. Keep it under 150 words with a clear call to action.',
        inputSchema: [
            { name: 'prospect_name', label: 'Prospect Name', type: 'text', required: true, placeholder: 'Jane Smith' },
            { name: 'company_name', label: 'Company', type: 'text', required: true, placeholder: 'Acme Corp' },
            { name: 'prospect_role', label: 'Role / Title', type: 'text', required: true, placeholder: 'Head of Engineering' },
            { name: 'pain_point', label: 'Key Pain Point', type: 'text', required: true, placeholder: 'slow deployment pipelines' },
        ],
        exampleInputs: { prospect_name: 'Jane Smith', company_name: 'Acme Corp', prospect_role: 'Head of Engineering', pain_point: 'slow deployment pipelines' },
        tags: ['sales', 'email', 'outreach'],
        isBuiltIn: true,
        tenantId: null,
        useCount: 0,
        estimatedTime: '~2 min',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
    },
    {
        id: 'builtin-qualify-lead',
        slug: 'qualify-lead',
        name: 'Qualify Inbound Lead',
        description: 'Evaluate a new inbound lead against BANT criteria and produce a qualification scorecard with recommended next steps.',
        category: 'sales',
        agentRole: 'sales_rep',
        promptTemplate: 'Qualify the inbound lead from {{lead_name}} at {{company}}. Their stated need is: {{stated_need}}. Company size: {{company_size}}. Evaluate budget fit, authority, need, and timeline. Return a qualification scorecard and recommended next action.',
        inputSchema: [
            { name: 'lead_name', label: 'Lead Name', type: 'text', required: true, placeholder: 'John Doe' },
            { name: 'company', label: 'Company', type: 'text', required: true, placeholder: 'Beta Inc' },
            { name: 'stated_need', label: 'Stated Need', type: 'textarea', required: true, placeholder: 'Looking for an AI platform to automate customer support' },
            { name: 'company_size', label: 'Company Size', type: 'select', required: false, options: ['1-10', '11-50', '51-200', '201-1000', '1000+'] },
        ],
        exampleInputs: { lead_name: 'John Doe', company: 'Beta Inc', stated_need: 'Looking for an AI platform to automate customer support', company_size: '51-200' },
        tags: ['sales', 'qualification', 'BANT'],
        isBuiltIn: true,
        tenantId: null,
        useCount: 0,
        estimatedTime: '~5 min',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
    },
    {
        id: 'builtin-write-jd',
        slug: 'write-job-description',
        name: 'Write Job Description',
        description: 'Create a compelling, inclusive job description for an open role including responsibilities, requirements, and company culture section.',
        category: 'recruiting',
        agentRole: 'recruiter',
        promptTemplate: 'Write a job description for a {{role_title}} role at our company. Level: {{level}}. Key responsibilities: {{responsibilities}}. Must-have skills: {{required_skills}}. Include an inclusive language check.',
        inputSchema: [
            { name: 'role_title', label: 'Role Title', type: 'text', required: true, placeholder: 'Senior Backend Engineer' },
            { name: 'level', label: 'Seniority Level', type: 'select', required: true, options: ['Junior', 'Mid', 'Senior', 'Staff', 'Principal', 'Manager', 'Director'] },
            { name: 'responsibilities', label: 'Key Responsibilities', type: 'textarea', required: true, placeholder: 'Design APIs, mentor juniors, lead architecture reviews' },
            { name: 'required_skills', label: 'Required Skills', type: 'text', required: true, placeholder: 'TypeScript, PostgreSQL, system design' },
        ],
        exampleInputs: { role_title: 'Senior Backend Engineer', level: 'Senior', responsibilities: 'Design APIs, mentor juniors, lead architecture reviews', required_skills: 'TypeScript, PostgreSQL, system design' },
        tags: ['recruiting', 'hiring', 'HR'],
        isBuiltIn: true,
        tenantId: null,
        useCount: 0,
        estimatedTime: '~5 min',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
    },
    {
        id: 'builtin-screen-resume',
        slug: 'screen-resume',
        name: 'Screen Candidate Resume',
        description: 'Analyse a candidate\'s resume against a job description and return a structured fit score with strengths, gaps, and interview recommendations.',
        category: 'recruiting',
        agentRole: 'recruiter',
        promptTemplate: 'Screen the resume for {{candidate_name}} applying for the {{role_title}} role. Resume summary: {{resume_summary}}. Key requirements: {{requirements}}. Score fit 1-10, list top strengths and gaps, and suggest 3 interview questions.',
        inputSchema: [
            { name: 'candidate_name', label: 'Candidate Name', type: 'text', required: true, placeholder: 'Alice Johnson' },
            { name: 'role_title', label: 'Role Title', type: 'text', required: true, placeholder: 'Senior Backend Engineer' },
            { name: 'resume_summary', label: 'Resume / LinkedIn Summary', type: 'textarea', required: true, placeholder: 'Paste resume text or key highlights here' },
            { name: 'requirements', label: 'Key Requirements', type: 'text', required: true, placeholder: '5y TypeScript, API design, team leadership' },
        ],
        exampleInputs: { candidate_name: 'Alice Johnson', role_title: 'Senior Backend Engineer', resume_summary: '6 years backend, TypeScript expert, led team of 4 at startup', requirements: '5y TypeScript, API design, team leadership' },
        tags: ['recruiting', 'screening', 'candidate'],
        isBuiltIn: true,
        tenantId: null,
        useCount: 0,
        estimatedTime: '~3 min',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
    },
    {
        id: 'builtin-write-blog-post',
        slug: 'write-blog-post',
        name: 'Write Blog Post',
        description: 'Draft a structured, SEO-optimised blog post on any topic, complete with intro, sections, and a compelling conclusion.',
        category: 'content',
        agentRole: 'content_writer',
        promptTemplate: 'Write a {{word_count}}-word blog post titled "{{title}}" targeting {{audience}}. Primary keyword: {{keyword}}. Tone: {{tone}}. Include an engaging intro, 3-4 sections with subheadings, and a conclusion with CTA.',
        inputSchema: [
            { name: 'title', label: 'Post Title', type: 'text', required: true, placeholder: 'How AI is Transforming B2B Sales' },
            { name: 'audience', label: 'Target Audience', type: 'text', required: true, placeholder: 'B2B sales leaders' },
            { name: 'keyword', label: 'Primary SEO Keyword', type: 'text', required: false, placeholder: 'AI sales automation' },
            { name: 'tone', label: 'Tone', type: 'select', required: false, options: ['Professional', 'Casual', 'Authoritative', 'Conversational', 'Inspiring'] },
            { name: 'word_count', label: 'Word Count', type: 'select', required: false, options: ['500', '800', '1200', '1800'] },
        ],
        exampleInputs: { title: 'How AI is Transforming B2B Sales', audience: 'B2B sales leaders', keyword: 'AI sales automation', tone: 'Professional', word_count: '800' },
        tags: ['content', 'blog', 'SEO', 'writing'],
        isBuiltIn: true,
        tenantId: null,
        useCount: 0,
        estimatedTime: '~8 min',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
    },
    {
        id: 'builtin-tech-spec',
        slug: 'generate-tech-spec',
        name: 'Generate Technical Spec',
        description: 'Produce a structured technical specification document for a feature or system, including goals, non-goals, design decisions, and open questions.',
        category: 'technical',
        agentRole: 'technical_writer',
        promptTemplate: 'Write a technical specification for: {{feature_name}}. Context: {{context}}. Stakeholders: {{stakeholders}}. Include: goals, non-goals, proposed design, API contracts (if applicable), data model changes, rollout plan, and open questions.',
        inputSchema: [
            { name: 'feature_name', label: 'Feature / System Name', type: 'text', required: true, placeholder: 'Real-time Notification Service' },
            { name: 'context', label: 'Background & Context', type: 'textarea', required: true, placeholder: 'Describe the problem being solved and why now' },
            { name: 'stakeholders', label: 'Stakeholders', type: 'text', required: false, placeholder: 'Backend team, Product, QA' },
        ],
        exampleInputs: { feature_name: 'Real-time Notification Service', context: 'Users miss important alerts because our polling is too slow. We need push notifications.', stakeholders: 'Backend team, Product, QA' },
        tags: ['technical', 'documentation', 'engineering', 'spec'],
        isBuiltIn: true,
        tenantId: null,
        useCount: 0,
        estimatedTime: '~10 min',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
    },
    {
        id: 'builtin-debug-ci',
        slug: 'debug-ci-failure',
        name: 'Debug CI Failure',
        description: 'Diagnose a failing CI pipeline run — identify root cause, list impacted tests, and suggest a remediation plan.',
        category: 'devops',
        agentRole: 'devops_engineer',
        promptTemplate: 'Analyse this CI failure for the {{repo}} repository on branch {{branch}}. Pipeline stage: {{stage}}. Error output: {{error_output}}. Identify the root cause, list affected tests or steps, and propose a fix.',
        inputSchema: [
            { name: 'repo', label: 'Repository', type: 'text', required: true, placeholder: 'org/my-service' },
            { name: 'branch', label: 'Branch', type: 'text', required: true, placeholder: 'feature/new-auth' },
            { name: 'stage', label: 'Failing Stage', type: 'text', required: true, placeholder: 'test / build / lint' },
            { name: 'error_output', label: 'Error Output / Log Snippet', type: 'textarea', required: true, placeholder: 'Paste the relevant error logs here' },
        ],
        exampleInputs: { repo: 'org/my-service', branch: 'feature/new-auth', stage: 'test', error_output: 'Error: Cannot find module \'./auth-middleware\'...' },
        tags: ['devops', 'CI', 'debugging', 'pipeline'],
        isBuiltIn: true,
        tenantId: null,
        useCount: 0,
        estimatedTime: '~5 min',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
    },
    {
        id: 'builtin-write-tests',
        slug: 'write-unit-tests',
        name: 'Write Unit Tests',
        description: 'Generate a comprehensive unit test suite for a function or module, including happy paths, edge cases, and error scenarios.',
        category: 'engineering',
        agentRole: 'tester',
        promptTemplate: 'Write unit tests for the following {{language}} code. Module: {{module_name}}. Code: {{code_snippet}}. Framework: {{test_framework}}. Cover: happy paths, boundary conditions, error handling, and mocked dependencies.',
        inputSchema: [
            { name: 'module_name', label: 'Module / Function Name', type: 'text', required: true, placeholder: 'validateUserEmail' },
            { name: 'language', label: 'Language', type: 'select', required: true, options: ['TypeScript', 'JavaScript', 'Python', 'Go', 'Java', 'Rust'] },
            { name: 'test_framework', label: 'Test Framework', type: 'select', required: false, options: ['node:test', 'Jest', 'Vitest', 'pytest', 'testing package'] },
            { name: 'code_snippet', label: 'Code to Test', type: 'textarea', required: true, placeholder: 'Paste the function or module code here' },
        ],
        exampleInputs: { module_name: 'validateUserEmail', language: 'TypeScript', test_framework: 'node:test', code_snippet: 'export const validateUserEmail = (email: string) => /^[^@]+@[^@]+\\.[^@]+$/.test(email);' },
        tags: ['engineering', 'testing', 'QA'],
        isBuiltIn: true,
        tenantId: null,
        useCount: 0,
        estimatedTime: '~5 min',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
    },
    {
        id: 'builtin-customer-onboarding',
        slug: 'onboard-customer',
        name: 'Onboard New Customer',
        description: 'Draft a personalised onboarding plan and welcome sequence for a new customer, including first-week milestones and success criteria.',
        category: 'support',
        agentRole: 'customer_support_executive',
        promptTemplate: 'Create an onboarding plan for {{customer_name}} ({{company}}). They are using {{product}} for {{use_case}}. Key contacts: {{contacts}}. Draft a welcome email, a first-week milestone checklist, and 30/60/90-day success criteria.',
        inputSchema: [
            { name: 'customer_name', label: 'Customer Name', type: 'text', required: true, placeholder: 'Acme Corp' },
            { name: 'company', label: 'Company', type: 'text', required: true, placeholder: 'Acme Corp' },
            { name: 'product', label: 'Product / Plan', type: 'text', required: true, placeholder: 'AgentFarm Enterprise' },
            { name: 'use_case', label: 'Primary Use Case', type: 'text', required: true, placeholder: 'automating sales outreach' },
            { name: 'contacts', label: 'Key Contacts', type: 'text', required: false, placeholder: 'Jane (CSM), Bob (Eng lead)' },
        ],
        exampleInputs: { customer_name: 'Acme Corp', company: 'Acme Corp', product: 'AgentFarm Enterprise', use_case: 'automating sales outreach', contacts: 'Jane (CSM), Bob (Eng lead)' },
        tags: ['support', 'onboarding', 'customer success'],
        isBuiltIn: true,
        tenantId: null,
        useCount: 0,
        estimatedTime: '~8 min',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
    },
    {
        id: 'builtin-summarize-meeting',
        slug: 'summarize-meeting',
        name: 'Summarise Meeting Notes',
        description: 'Transform raw meeting notes or a transcript into a structured summary with decisions, action items, owners, and deadlines.',
        category: 'meetings',
        agentRole: 'corporate_assistant',
        promptTemplate: 'Summarise these meeting notes from {{meeting_title}} on {{meeting_date}}. Attendees: {{attendees}}. Notes: {{notes}}. Output: executive summary (3 sentences), list of decisions, action items with owners and deadlines, and open questions.',
        inputSchema: [
            { name: 'meeting_title', label: 'Meeting Title', type: 'text', required: true, placeholder: 'Q2 Planning Sync' },
            { name: 'meeting_date', label: 'Date', type: 'text', required: false, placeholder: '2024-06-04' },
            { name: 'attendees', label: 'Attendees', type: 'text', required: false, placeholder: 'Alice, Bob, Carol' },
            { name: 'notes', label: 'Raw Notes / Transcript', type: 'textarea', required: true, placeholder: 'Paste the meeting notes or transcript here' },
        ],
        exampleInputs: { meeting_title: 'Q2 Planning Sync', meeting_date: '2024-06-04', attendees: 'Alice, Bob, Carol', notes: 'Discussed roadmap priorities. Alice to own infra migration by July. Bob confirmed budget approved.' },
        tags: ['meetings', 'notes', 'summarisation', 'action items'],
        isBuiltIn: true,
        tenantId: null,
        useCount: 0,
        estimatedTime: '~3 min',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
    },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderPrompt(template: string, inputs: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => inputs[key] ?? `{{${key}}}`);
}

function dbRowToTemplate(row: {
    id: string; slug: string; name: string; description: string;
    category: string; agentRole: string; promptTemplate: string;
    inputSchema: unknown; exampleInputs: unknown; tags: unknown;
    isBuiltIn: boolean; tenantId: string | null; useCount: number;
    estimatedTime: string | null; createdAt: Date; updatedAt: Date;
}): TaskTemplate {
    return {
        id: row.id,
        slug: row.slug,
        name: row.name,
        description: row.description,
        category: row.category,
        agentRole: row.agentRole,
        promptTemplate: row.promptTemplate,
        inputSchema: Array.isArray(row.inputSchema) ? (row.inputSchema as TaskTemplate['inputSchema']) : [],
        exampleInputs: (row.exampleInputs as Record<string, string>) ?? {},
        tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
        isBuiltIn: row.isBuiltIn,
        tenantId: row.tenantId,
        useCount: row.useCount,
        estimatedTime: row.estimatedTime ?? undefined,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
    };
}

// Returns the set of bot roles the tenant currently has provisioned.
// Falls back to an empty set if the DB is unavailable (all templates lock).
async function getTenantBotRoles(tenantId: string, workspaceIds: string[]): Promise<Set<string>> {
    try {
        const prisma = await getPrisma();
        const bots = await prisma.bot.findMany({
            where: { workspaceId: { in: workspaceIds } },
            select: { role: true },
        });
        // If no workspace IDs in session, fall back to a tenant-wide query via workspace join
        if (bots.length === 0 && workspaceIds.length === 0) {
            const workspaces = await prisma.workspace.findMany({
                where: { tenantId },
                select: { id: true },
            });
            const ids = workspaces.map(w => w.id);
            const allBots = await prisma.bot.findMany({
                where: { workspaceId: { in: ids } },
                select: { role: true },
            });
            return new Set(allBots.map(b => b.role));
        }
        return new Set(bots.map(b => b.role));
    } catch {
        return new Set<string>();
    }
}

// ── Route registration ────────────────────────────────────────────────────────

export async function registerTaskTemplateRoutes(
    app: FastifyInstance,
    options: RegisterTaskTemplateRoutesOptions,
): Promise<void> {
    const { getSession } = options;
    const resolvePrisma = options.prisma
        ? () => Promise.resolve(options.prisma!)
        : getPrisma;

    // ── GET /v1/task-templates ─────────────────────────────────────────────────
    app.get<{ Querystring: { category?: string; agentRole?: string; q?: string; builtInOnly?: string } }>(
        '/v1/task-templates',
        async (request, reply) => {
            const session = getSession(request);
            if (!session) return reply.code(401).send({ error: 'Unauthorized' });

            const { category, agentRole, q, builtInOnly } = request.query;

            // Resolve which roles this tenant has purchased/provisioned
            const ownedRoles = await getTenantBotRoles(session.tenantId, session.workspaceIds);

            let results: TaskTemplate[] = BUILT_IN_TEMPLATES.map(t => ({
                ...t,
                locked: ownedRoles.size > 0 ? !ownedRoles.has(t.agentRole) : false,
            }));

            if (builtInOnly !== 'true') {
                try {
                    const prisma = await resolvePrisma();
                    const dbRows = await prisma.taskTemplate.findMany({
                        where: {
                            OR: [{ tenantId: null }, { tenantId: session.tenantId }],
                            isBuiltIn: false,
                            ...(category ? { category } : {}),
                            ...(agentRole ? { agentRole } : {}),
                        },
                        orderBy: { useCount: 'desc' },
                        take: 100,
                    });
                    const dbTemplates = dbRows.map(row => ({
                        ...dbRowToTemplate(row),
                        locked: ownedRoles.size > 0 ? !ownedRoles.has(row.agentRole) : false,
                    }));
                    results = [...results, ...dbTemplates];
                } catch {
                    // DB not available — return built-ins only
                }
            }

            if (category) results = results.filter(t => t.category === category);
            if (agentRole) results = results.filter(t => t.agentRole === agentRole);
            if (q) {
                const lq = q.toLowerCase();
                results = results.filter(t =>
                    t.name.toLowerCase().includes(lq) ||
                    t.description.toLowerCase().includes(lq) ||
                    t.tags.some(tag => tag.toLowerCase().includes(lq)),
                );
            }

            // Unlocked first, then locked; within each group preserve original order
            results.sort((a, b) => {
                if (a.locked === b.locked) return 0;
                return a.locked ? 1 : -1;
            });

            const categories = [...new Set(BUILT_IN_TEMPLATES.map(t => t.category))];
            return reply.send({ templates: results, categories, total: results.length });
        },
    );

    // ── GET /v1/task-templates/:id ─────────────────────────────────────────────
    app.get<{ Params: { id: string } }>(
        '/v1/task-templates/:id',
        async (request, reply) => {
            const session = getSession(request);
            if (!session) return reply.code(401).send({ error: 'Unauthorized' });

            const { id } = request.params;
            const ownedRoles = await getTenantBotRoles(session.tenantId, session.workspaceIds);

            const builtin = BUILT_IN_TEMPLATES.find(t => t.id === id || t.slug === id);
            if (builtin) {
                return reply.send({
                    template: { ...builtin, locked: ownedRoles.size > 0 ? !ownedRoles.has(builtin.agentRole) : false },
                });
            }

            try {
                const prisma = await resolvePrisma();
                const row = await prisma.taskTemplate.findFirst({
                    where: {
                        OR: [{ id }, { slug: id }],
                        AND: { OR: [{ tenantId: null }, { tenantId: session.tenantId }] },
                    },
                });
                if (!row) return reply.code(404).send({ error: 'Template not found' });
                return reply.send({
                    template: {
                        ...dbRowToTemplate(row),
                        locked: ownedRoles.size > 0 ? !ownedRoles.has(row.agentRole) : false,
                    },
                });
            } catch {
                return reply.code(404).send({ error: 'Template not found' });
            }
        },
    );

    // ── POST /v1/task-templates ────────────────────────────────────────────────
    app.post<{ Body: Partial<Omit<TaskTemplate, 'id' | 'createdAt' | 'updatedAt' | 'useCount' | 'isBuiltIn' | 'locked'>> }>(
        '/v1/task-templates',
        async (request, reply) => {
            const session = getSession(request);
            if (!session) return reply.code(401).send({ error: 'Unauthorized' });

            const body = request.body ?? {};
            if (!body.name || !body.slug || !body.description || !body.category || !body.agentRole || !body.promptTemplate) {
                return reply.code(400).send({ error: 'name, slug, description, category, agentRole, and promptTemplate are required' });
            }

            try {
                const prisma = await resolvePrisma();
                const row = await prisma.taskTemplate.create({
                    data: {
                        id: randomUUID(),
                        slug: body.slug,
                        name: body.name,
                        description: body.description,
                        category: body.category,
                        agentRole: body.agentRole,
                        promptTemplate: body.promptTemplate,
                        inputSchema: (body.inputSchema ?? []) as never,
                        exampleInputs: (body.exampleInputs ?? {}) as never,
                        tags: (body.tags ?? []) as never,
                        tenantId: session.tenantId,
                        estimatedTime: body.estimatedTime ?? null,
                        isBuiltIn: false,
                    },
                });
                return reply.code(201).send({ template: dbRowToTemplate(row) });
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err);
                if (msg.includes('Unique constraint')) return reply.code(409).send({ error: 'A template with that slug already exists' });
                return reply.code(500).send({ error: 'Failed to create template' });
            }
        },
    );

    // ── POST /v1/task-templates/:id/dispatch ──────────────────────────────────
    app.post<{ Params: { id: string }; Body: Partial<TaskTemplateDispatchRequest> }>(
        '/v1/task-templates/:id/dispatch',
        async (request, reply) => {
            const session = getSession(request);
            if (!session) return reply.code(401).send({ error: 'Unauthorized' });

            const { id } = request.params;
            const body = request.body ?? {};

            if (!body.agentId || !body.workspaceId) {
                return reply.code(400).send({ error: 'agentId and workspaceId are required' });
            }

            // Workspace ownership check — prevent dispatching into another tenant's workspace
            if (!session.workspaceIds.includes(body.workspaceId)) {
                return reply.code(403).send({ error: 'workspace_not_accessible' });
            }

            // Resolve the template before doing expensive ownership checks
            const ownedRoles = await getTenantBotRoles(session.tenantId, session.workspaceIds);

            const builtin = BUILT_IN_TEMPLATES.find(t => t.id === id || t.slug === id);
            let template: TaskTemplate | null = builtin ?? null;

            if (!template) {
                try {
                    const prisma = await resolvePrisma();
                    const row = await prisma.taskTemplate.findFirst({
                        where: {
                            OR: [{ id }, { slug: id }],
                            AND: { OR: [{ tenantId: null }, { tenantId: session.tenantId }] },
                        },
                    });
                    if (row) template = dbRowToTemplate(row);
                } catch {
                    // ignore
                }
            }

            if (!template) return reply.code(404).send({ error: 'Template not found' });

            if (ownedRoles.size > 0 && !ownedRoles.has(template.agentRole)) {
                return reply.code(403).send({
                    error: 'agent_not_purchased',
                    message: `You need a ${template.agentRole} agent to use this playbook. Add one from the Agents page.`,
                });
            }

            // Agent ownership check — verify the target agent belongs to this tenant
            // (done after template resolution so unknown templates short-circuit first)
            {
                const prisma = await resolvePrisma();
                const agent = await (prisma as unknown as {
                    bot: { findFirst: (a: { where: { id: string; tenantId: string }; select: { id: boolean } }) => Promise<{ id: string } | null> };
                }).bot.findFirst({
                    where: { id: body.agentId, tenantId: session.tenantId },
                    select: { id: true },
                });
                if (!agent) {
                    return reply.code(403).send({ error: 'agent_not_accessible' });
                }
            }

            const inputs = (body.inputs ?? {}) as Record<string, string>;
            const taskDescription = renderPrompt(template.promptTemplate, inputs);
            const dispatchId = randomUUID();
            const queuedAt = new Date().toISOString();

            try {
                const prisma = await resolvePrisma();

                await prisma.agentDispatchRecord.create({
                    data: {
                        id: dispatchId,
                        fromAgentId: session.userId,
                        toAgentId: body.agentId,
                        workspaceId: body.workspaceId,
                        tenantId: session.tenantId,
                        taskDescription,
                        status: 'queued',
                        wakeSource: 'template_dispatch',
                        queuedAt: new Date(queuedAt),
                    },
                });

                // Increment use count for custom (DB-stored) templates
                if (!builtin) {
                    await prisma.taskTemplate.update({
                        where: { id: template.id },
                        data: { useCount: { increment: 1 } },
                    }).catch(() => null);
                }

                const result: TaskTemplateDispatchResult = {
                    dispatchId,
                    templateId: template.id,
                    taskDescription,
                    status: 'queued',
                    queuedAt,
                };
                return reply.code(201).send(result);
            } catch {
                return reply.code(500).send({ error: 'Failed to dispatch template' });
            }
        },
    );
}
