/**
 * Pull Request Draft Routes
 *
 * POST /v1/workspaces/:wsId/pull-requests/draft             — create a PR draft
 * POST /v1/workspaces/:wsId/pull-requests/:draftId/publish  — publish (policy-gated)
 */

import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { SessionContext } from './ci-failures.js';

/** Patterns in changeSummary that trigger a high-risk policy block on publish-to-main. */
const HIGH_RISK_PATTERNS = [
    'merge_release',
    'force_push',
    'delete_branch',
    'bypass_review',
    'skip_ci',
];

type PrDraft = {
    draftId: string;
    workspaceId: string;
    branch: string;
    changeSummary: string;
    linkedIssueIds: string[];
    title: string;
    body: string;
    checklist: string[];
    reviewersSuggested: string[];
    status: 'draft' | 'published';
    createdAt: number;
};

function buildDraftContent(
    branch: string,
    changeSummary: string,
    linkedIssueIds: string[],
): Pick<PrDraft, 'title' | 'body' | 'checklist' | 'reviewersSuggested'> {
    const title = changeSummary.length > 72
        ? `${changeSummary.slice(0, 69)}...`
        : changeSummary;

    const closesLines = linkedIssueIds.map((id) => `Closes #${id}`).join('\n');
    const body = [
        `## Summary\n${changeSummary}`,
        `## Branch\n\`${branch}\``,
        closesLines,
        `## Checklist\n- [ ] Tests pass locally\n- [ ] Changelog updated if user-facing\n- [ ] No unintended scope changes`,
    ].filter(Boolean).join('\n\n');

    return {
        title,
        body,
        checklist: [
            '[ ] Tests pass locally',
            '[ ] Changelog updated if user-facing',
            '[ ] No unintended scope changes',
        ],
        reviewersSuggested: ['on-call-reviewer', 'code-owner-bot'],
    };
}

export async function registerPrRoutes(
    app: FastifyInstance,
    opts: { getSession: () => SessionContext | null },
): Promise<void> {
    const store = new Map<string, PrDraft>();

    // ── POST /v1/workspaces/:wsId/pull-requests/draft ────────────────────────
    app.post<{
        Params: { wsId: string };
        Body: { branch: string; changeSummary: string; linkedIssueIds?: string[] };
    }>('/v1/workspaces/:wsId/pull-requests/draft', async (req, reply) => {
        const session = opts.getSession();
        if (!session) return reply.status(401).send({ error: 'unauthenticated' });
        if (!session.workspaceIds.includes(req.params.wsId))
            return reply.status(403).send({ error: 'forbidden' });

        const { wsId } = req.params;
        const { branch = '', changeSummary = '', linkedIssueIds = [] } = req.body;

        const draftId = `draft_${randomUUID().slice(0, 8)}`;
        const content = buildDraftContent(branch, changeSummary, linkedIssueIds);
        const draft: PrDraft = {
            draftId,
            workspaceId: wsId,
            branch,
            changeSummary,
            linkedIssueIds,
            ...content,
            status: 'draft',
            createdAt: Date.now(),
        };
        store.set(draftId, draft);

        return reply.status(201).send({
            draftId: draft.draftId,
            title: draft.title,
            body: draft.body,
            checklist: draft.checklist,
            reviewersSuggested: draft.reviewersSuggested,
        });
    });

    // ── POST /v1/workspaces/:wsId/pull-requests/:draftId/publish ─────────────
    app.post<{
        Params: { wsId: string; draftId: string };
        Body: { targetBranch?: string };
    }>('/v1/workspaces/:wsId/pull-requests/:draftId/publish', async (req, reply) => {
        const session = opts.getSession();
        if (!session) return reply.status(401).send({ error: 'unauthenticated' });
        if (!session.workspaceIds.includes(req.params.wsId))
            return reply.status(403).send({ error: 'forbidden' });

        const { wsId, draftId } = req.params;
        const { targetBranch } = req.body ?? {};

        const draft = store.get(draftId);
        if (!draft || draft.workspaceId !== wsId)
            return reply.status(404).send({ error: 'not_found' });

        // Policy preflight: block high-risk publish ops targeting protected branches
        const isProtectedBranch = targetBranch === 'main' || targetBranch === 'master';
        const isHighRisk = isProtectedBranch &&
            HIGH_RISK_PATTERNS.some((p) => draft.changeSummary.includes(p));

        if (isHighRisk) {
            return reply.status(403).send({
                error: 'policy_preflight_failed',
                reason: 'high_risk_merge_to_protected_branch',
                blockedBy: HIGH_RISK_PATTERNS.find((p) => draft.changeSummary.includes(p)),
            });
        }

        draft.status = 'published';
        return reply.status(200).send({ draftId, status: 'published', targetBranch });
    });
}
