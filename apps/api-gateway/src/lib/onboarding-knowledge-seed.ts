/**
 * onboarding-knowledge-seed.ts
 *
 * Seeds the AgentKnowledgeBase with foundational context when a new bot is
 * provisioned — so the very first task session starts with memory instead of
 * a blank slate.
 *
 * A human employee spends their first week reading documentation and learning
 * the codebase.  This seed gives the agent the equivalent — role context,
 * tech stack, team conventions, and workspace setup — before any task runs.
 *
 * Integration point: call seedOnboardingKnowledge() non-blocking from
 * hire-handler.ts after the ProvisioningJob is created.
 */

import { writeSemanticMemory } from '@agentfarm/memory-service';
import type { EmbedFn } from '@agentfarm/memory-service';
import type { PrismaClient } from '@prisma/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OnboardingSeedParams {
    botId: string;
    tenantId: string;
    workspaceId: string;
    /** Bot role key (e.g. 'developer', 'tester'). Used to tailor seed content. */
    roleKey: string;
    /** Optional display name for the bot (used in persona context). */
    botName?: string;
    /** Optional repo URL (used as source URL for chunks). */
    repoUrl?: string;
    /** Optional tech stack description (free text from setup wizard). */
    techStack?: string;
    /** Optional coding / communication conventions from setup wizard. */
    teamConventions?: string;
}

export interface SeedResult {
    seededChunks: number;
    skipped: boolean;
    reason?: string;
}

// ---------------------------------------------------------------------------
// Role-tailored seed templates
// ---------------------------------------------------------------------------

const ROLE_SEED_INTRO: Record<string, string> = {
    developer:
        'This agent is a Developer agent. Its primary responsibilities are writing code, ' +
        'reviewing pull requests, fixing bugs, and maintaining software quality across the codebase.',
    tester:
        'This agent is a QA / Tester agent. Its primary responsibilities are writing and ' +
        'executing tests (unit, integration, E2E), identifying bugs, and ensuring release quality.',
    sales:
        'This agent is a Sales Representative agent. Its primary responsibilities are prospecting, ' +
        'outreach, managing CRM records, and supporting the sales pipeline.',
    recruiter:
        'This agent is a Recruiter agent. Its primary responsibilities are posting job listings, ' +
        'reviewing applications, scheduling interviews, and managing candidate pipelines.',
    support:
        'This agent is a Customer Support agent. Its primary responsibilities are triaging tickets, ' +
        'responding to customer enquiries, and escalating unresolved issues.',
    assistant:
        'This agent is a Corporate Assistant agent. Its primary responsibilities are calendar management, ' +
        'email triage, meeting scheduling, and task coordination.',
};

const DEFAULT_ROLE_INTRO =
    'This agent is an AI worker provisioned by AgentFarm. It operates within its assigned role ' +
    'and escalates tasks outside its scope to a human manager.';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Seed the knowledge base with context about the new bot's role and workspace.
 *
 * Non-blocking caller contract: this function should always be called with
 * `.catch(() => {})` or inside a non-awaited promise in the hire flow.
 *
 * @param params    Bot and workspace context from the hire payload.
 * @param embedFn   The embedding function (may be null — silently skips if so).
 * @param prisma    Prisma client for DB writes.
 * @returns         SeedResult with count of written chunks.
 */
export async function seedOnboardingKnowledge(
    params: OnboardingSeedParams,
    embedFn: EmbedFn | null,
    prisma: PrismaClient,
): Promise<SeedResult> {
    if (!embedFn) {
        return { seededChunks: 0, skipped: true, reason: 'embedFn not configured' };
    }

    const { botId, tenantId, roleKey, botName, repoUrl, techStack, teamConventions } = params;
    const deployment = 'text-embedding-3-small';
    const chunks: Array<{ content: string; sourceType: string }> = [];

    // ── Chunk 1: Role identity ───────────────────────────────────────────────
    const roleIntro = ROLE_SEED_INTRO[roleKey.toLowerCase()] ?? DEFAULT_ROLE_INTRO;
    const identityChunk =
        botName
            ? `${roleIntro} The agent's name is ${botName}.`
            : roleIntro;
    chunks.push({ content: identityChunk, sourceType: 'onboarding_role_identity' });

    // ── Chunk 2: Working principles ──────────────────────────────────────────
    chunks.push({
        content:
            'Working principles for this agent: ' +
            '(1) Always ask for clarification when a task description is ambiguous rather than guessing. ' +
            '(2) Escalate high-risk actions (production deploys, permission changes) for human approval. ' +
            '(3) Leave detailed trace comments in PRs and tickets so humans can follow the reasoning. ' +
            '(4) Prefer small, reviewable changes over large sweeping edits. ' +
            '(5) Never commit credentials, tokens, or secrets to source control.',
        sourceType: 'onboarding_working_principles',
    });

    // ── Chunk 3: Tech stack (if provided by setup wizard) ───────────────────
    if (techStack && techStack.trim()) {
        chunks.push({
            content: `Technology stack for this workspace: ${techStack.trim()}`,
            sourceType: 'onboarding_tech_stack',
        });
    }

    // ── Chunk 4: Team conventions (if provided by setup wizard) ─────────────
    if (teamConventions && teamConventions.trim()) {
        chunks.push({
            content: `Team coding and communication conventions: ${teamConventions.trim()}`,
            sourceType: 'onboarding_team_conventions',
        });
    }

    // ── Write all chunks ─────────────────────────────────────────────────────
    let seededChunks = 0;
    for (const chunk of chunks) {
        try {
            await writeSemanticMemory(
                {
                    tenantId,
                    botId,
                    content: chunk.content,
                    sourceUrl: repoUrl ?? undefined,
                    sourceType: chunk.sourceType,
                },
                embedFn,
                prisma as Parameters<typeof writeSemanticMemory>[2],
                deployment,
            );
            seededChunks += 1;
        } catch {
            // Non-blocking: a single chunk failure must not abort the rest
        }
    }

    return { seededChunks, skipped: false };
}
