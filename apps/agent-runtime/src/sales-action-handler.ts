/**
 * Sales Action Handler
 *
 * Bridges the LocalWorkspaceActionType dispatch switch in local-workspace-executor.ts
 * to the 10 concrete sales domain modules in ./sales/.
 *
 * Each action creates (and disconnects) its own short-lived PrismaClient so the
 * executor does not need to thread a DB handle through its stack.
 */

import type { SalesAgentConfigRecord } from '@agentfarm/shared-types';
import type { LocalWorkspaceResult } from './local-workspace-executor.js';
import { findAndSaveProspects, type LeadSearchParams } from './sales/prospect-finder.js';
import { scoreProspect } from './sales/icp-scorer.js';
import { personaliseEmail } from './sales/email-personaliser.js';
import { sendOutreachEmail } from './sales/outreach-orchestrator.js';
import { scheduleFollowUps } from './sales/sequence-scheduler.js';
import { classifyReply } from './sales/reply-classifier.js';
import { generatePreMeetingBrief } from './sales/pre-meeting-research.js';
import { sendBookingInvite } from './sales/booking-invite-sender.js';
import { sendContractInvite } from './sales/contract-sender.js';
import { closeDealWon, closeDealLost } from './sales/deal-closer.js';
import type { LeadCandidate } from './sales/lead-source-provider.js';
import type { EmailProviderConfig } from './sales/email-provider.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SalesActionType =
    | 'workspace_prospect_research'
    | 'workspace_icp_score'
    | 'workspace_email_personalize'
    | 'workspace_outreach_send'
    | 'workspace_sequence_create'
    | 'workspace_reply_classify'
    | 'workspace_pre_meeting_research'
    | 'workspace_booking_invite'
    | 'workspace_contract_send'
    | 'workspace_deal_close';

export function isSalesActionType(t: string): t is SalesActionType {
    return (
        t === 'workspace_prospect_research' ||
        t === 'workspace_icp_score' ||
        t === 'workspace_email_personalize' ||
        t === 'workspace_outreach_send' ||
        t === 'workspace_sequence_create' ||
        t === 'workspace_reply_classify' ||
        t === 'workspace_pre_meeting_research' ||
        t === 'workspace_booking_invite' ||
        t === 'workspace_contract_send' ||
        t === 'workspace_deal_close'
    );
}

// ---------------------------------------------------------------------------
// Prisma helpers — structural typing keeps the executor's package deps minimal
// ---------------------------------------------------------------------------

type PrismaWithProspect = {
    prospect: {
        findUnique: (args: { where: { id: string } }) => Promise<Record<string, unknown> | null>;
    };
};

type PrismaWithSalesConfig = {
    salesAgentConfig: {
        findFirst: (args: { where: { botId: string; tenantId: string } }) => Promise<Record<string, unknown> | null>;
    };
    $disconnect: () => Promise<void>;
};

async function createPrisma(): Promise<PrismaWithSalesConfig> {
    const { PrismaClient } = await import('@prisma/client');
    return new PrismaClient() as unknown as PrismaWithSalesConfig;
}

async function loadSalesConfig(
    tenantId: string,
    botId: string,
    prisma: PrismaWithSalesConfig,
): Promise<SalesAgentConfigRecord | null> {
    const row = await prisma.salesAgentConfig.findFirst({ where: { botId, tenantId } });
    return row as unknown as SalesAgentConfigRecord | null;
}

function requireConfig(config: SalesAgentConfigRecord | null, botId: string): SalesAgentConfigRecord {
    if (!config) {
        throw new Error(`SalesAgentConfig not found for botId=${botId}. Ensure the agent has been configured.`);
    }
    return config;
}

function safeJsonResult(value: unknown): LocalWorkspaceResult {
    return { ok: true, output: JSON.stringify(value, null, 2) };
}

// ---------------------------------------------------------------------------
// Main dispatcher
// ---------------------------------------------------------------------------

export async function handleSalesAction(params: {
    actionType: SalesActionType;
    tenantId: string;
    botId: string;
    taskId: string;
    payload: Record<string, unknown>;
}): Promise<LocalWorkspaceResult> {
    const { actionType, tenantId, botId, payload } = params;

    switch (actionType) {
        // ------------------------------------------------------------------
        // workspace_prospect_research — find and save new prospects
        // payload: { search_params: LeadSearchParams, qualify_threshold?, provider? }
        // ------------------------------------------------------------------
        case 'workspace_prospect_research': {
            const prisma = await createPrisma();
            try {
                const config = requireConfig(await loadSalesConfig(tenantId, botId, prisma), botId);
                const searchParams = (payload['search_params'] ?? {}) as LeadSearchParams;
                const qualifyThreshold = typeof payload['qualify_threshold'] === 'number'
                    ? payload['qualify_threshold']
                    : undefined;
                const result = await findAndSaveProspects({
                    prisma: prisma as unknown as import('@prisma/client').PrismaClient,
                    config,
                    searchParams,
                    qualifyThreshold,
                });
                return safeJsonResult(result);
            } catch (err) {
                return { ok: false, output: '', errorOutput: String(err) };
            } finally {
                await prisma.$disconnect().catch(() => undefined);
            }
        }

        // ------------------------------------------------------------------
        // workspace_icp_score — synchronously score a single lead candidate
        // payload: { candidate: LeadCandidate }
        // ------------------------------------------------------------------
        case 'workspace_icp_score': {
            const prisma = await createPrisma();
            try {
                const config = requireConfig(await loadSalesConfig(tenantId, botId, prisma), botId);
                const candidate = payload['candidate'] as LeadCandidate | undefined;
                if (!candidate || typeof candidate.email !== 'string') {
                    return { ok: false, output: '', errorOutput: 'payload.candidate (LeadCandidate) is required.' };
                }
                const score = scoreProspect(candidate, config);
                return safeJsonResult({ score, candidate: candidate.email });
            } catch (err) {
                return { ok: false, output: '', errorOutput: String(err) };
            } finally {
                await prisma.$disconnect().catch(() => undefined);
            }
        }

        // ------------------------------------------------------------------
        // workspace_email_personalize — LLM-personalise an outreach email
        // payload:
        //   prospect_id?: string  — preferred; loads the prospect from DB (ground truth)
        //   prospect?             — inline fallback for draft/preview when no DB record exists yet
        //   product_description, icp, email_tone, sequence_step, previous_subject
        // NOTE: when prospect_id is supplied the DB record is ALWAYS used — the inline
        //       prospect field is ignored. This prevents the agent from injecting
        //       fabricated prospect details into the email copy.
        // ------------------------------------------------------------------
        case 'workspace_email_personalize': {
            const prisma = await createPrisma();
            try {
                const prospectId = typeof payload['prospect_id'] === 'string' ? payload['prospect_id'] : null;

                let resolvedProspect: {
                    firstName: string;
                    lastName: string;
                    email: string;
                    company: string;
                    title?: string;
                    industry?: string;
                } | null = null;

                if (prospectId) {
                    // Ground truth: load from DB — ignore anything the agent put in payload.prospect
                    const db = prisma as unknown as PrismaWithProspect;
                    const row = await db.prospect.findUnique({ where: { id: prospectId } });
                    if (!row) {
                        return { ok: false, output: '', errorOutput: `Prospect not found: ${prospectId}` };
                    }
                    if (row['tenantId'] !== tenantId) {
                        return { ok: false, output: '', errorOutput: 'Tenant isolation violation' };
                    }
                    resolvedProspect = {
                        firstName: String(row['firstName'] ?? ''),
                        lastName: String(row['lastName'] ?? ''),
                        email: String(row['email'] ?? ''),
                        company: String(row['company'] ?? ''),
                        title: row['title'] != null ? String(row['title']) : undefined,
                        industry: row['industry'] != null ? String(row['industry']) : undefined,
                    };
                } else {
                    // Draft/preview mode: caller supplies inline data
                    type InlineProspect = { firstName: string; lastName: string; email: string; company: string; title?: string; industry?: string };
                    const inline = payload['prospect'] as InlineProspect | undefined | null;
                    if (!inline || typeof inline.email !== 'string' || !inline.email.includes('@')) {
                        return {
                            ok: false,
                            output: '',
                            errorOutput:
                                'Either payload.prospect_id (preferred, loads from DB) or payload.prospect (with valid email) is required.',
                        };
                    }
                    resolvedProspect = inline;
                }

                const config = await loadSalesConfig(tenantId, botId, prisma);

                const productDescription = typeof payload['product_description'] === 'string'
                    ? payload['product_description']
                    : config?.productDescription ?? '';
                const icp = typeof payload['icp'] === 'string'
                    ? payload['icp']
                    : config?.icp ?? '';
                const emailTone = typeof payload['email_tone'] === 'string'
                    ? payload['email_tone']
                    : config?.emailTone ?? 'professional';
                const sequenceStep = typeof payload['sequence_step'] === 'number' ? payload['sequence_step'] : 1;
                const previousSubject = typeof payload['previous_subject'] === 'string'
                    ? payload['previous_subject']
                    : undefined;

                const result = await personaliseEmail({
                    prospect: resolvedProspect,
                    productDescription,
                    icp,
                    emailTone,
                    sequenceStep,
                    previousSubject,
                });
                return safeJsonResult(result);
            } catch (err) {
                return { ok: false, output: '', errorOutput: String(err) };
            } finally {
                await prisma.$disconnect().catch(() => undefined);
            }
        }

        // ------------------------------------------------------------------
        // workspace_outreach_send — send personalised outreach email to a prospect
        // payload: { prospect_id, sequence_step?, previous_subject?, email_config? }
        // ------------------------------------------------------------------
        case 'workspace_outreach_send': {
            const prisma = await createPrisma();
            try {
                const config = requireConfig(await loadSalesConfig(tenantId, botId, prisma), botId);
                const prospectId = typeof payload['prospect_id'] === 'string' ? payload['prospect_id'] : '';
                if (!prospectId) {
                    return { ok: false, output: '', errorOutput: 'payload.prospect_id is required.' };
                }

                const emailConfigRaw = (payload['email_config'] ?? {}) as Record<string, unknown>;
                // fromEmail: payload > env var > empty string (will fail delivery — ensures
                // the agent never sends emails with a silently blank sender address)
                const resolvedFromEmail =
                    (typeof emailConfigRaw['from_email'] === 'string' ? emailConfigRaw['from_email'] : undefined) ??
                    process.env['SALES_EMAIL_FROM'] ??
                    process.env['SALES_FROM_EMAIL'] ??
                    '';
                if (!resolvedFromEmail) {
                    return {
                        ok: false,
                        output: '',
                        errorOutput:
                            'Cannot send outreach email: no sender address. Set SALES_EMAIL_FROM env var or pass payload.email_config.from_email.',
                    };
                }
                const emailConfig: EmailProviderConfig = {
                    apiKey: typeof emailConfigRaw['api_key'] === 'string' ? emailConfigRaw['api_key'] : undefined,
                    host: typeof emailConfigRaw['host'] === 'string' ? emailConfigRaw['host'] : undefined,
                    port: typeof emailConfigRaw['port'] === 'number' ? emailConfigRaw['port'] : undefined,
                    secure: typeof emailConfigRaw['secure'] === 'boolean' ? emailConfigRaw['secure'] : undefined,
                    user: typeof emailConfigRaw['user'] === 'string' ? emailConfigRaw['user'] : undefined,
                    pass: typeof emailConfigRaw['pass'] === 'string' ? emailConfigRaw['pass'] : undefined,
                    fromEmail: resolvedFromEmail,
                    fromName: typeof emailConfigRaw['from_name'] === 'string' ? emailConfigRaw['from_name'] : undefined,
                };

                const result = await sendOutreachEmail(
                    {
                        tenantId,
                        botId,
                        prospectId,
                        config,
                        emailConfig,
                        sequenceStep: typeof payload['sequence_step'] === 'number' ? payload['sequence_step'] : undefined,
                        previousSubject: typeof payload['previous_subject'] === 'string' ? payload['previous_subject'] : undefined,
                    },
                    prisma as unknown as import('@prisma/client').PrismaClient,
                );
                return safeJsonResult(result);
            } catch (err) {
                return { ok: false, output: '', errorOutput: String(err) };
            } finally {
                await prisma.$disconnect().catch(() => undefined);
            }
        }

        // ------------------------------------------------------------------
        // workspace_sequence_create — schedule follow-up sequence for a prospect
        // payload: { prospect_id, start_from? (ISO date string) }
        // ------------------------------------------------------------------
        case 'workspace_sequence_create': {
            const prisma = await createPrisma();
            try {
                const config = requireConfig(await loadSalesConfig(tenantId, botId, prisma), botId);
                const prospectId = typeof payload['prospect_id'] === 'string' ? payload['prospect_id'] : '';
                if (!prospectId) {
                    return { ok: false, output: '', errorOutput: 'payload.prospect_id is required.' };
                }
                const startFrom = typeof payload['start_from'] === 'string'
                    ? new Date(payload['start_from'])
                    : undefined;

                const result = await scheduleFollowUps(
                    { tenantId, botId, prospectId, config, startFrom },
                    prisma as unknown as import('@prisma/client').PrismaClient,
                );
                return safeJsonResult(result);
            } catch (err) {
                return { ok: false, output: '', errorOutput: String(err) };
            } finally {
                await prisma.$disconnect().catch(() => undefined);
            }
        }

        // ------------------------------------------------------------------
        // workspace_reply_classify — classify intent of an inbound reply
        // payload: { reply_text, original_subject }
        // ------------------------------------------------------------------
        case 'workspace_reply_classify': {
            try {
                const replyText = typeof payload['reply_text'] === 'string' ? payload['reply_text'] : '';
                const originalSubject = typeof payload['original_subject'] === 'string' ? payload['original_subject'] : '';
                if (!replyText) {
                    return { ok: false, output: '', errorOutput: 'payload.reply_text is required.' };
                }
                const result = await classifyReply({ replyText, originalSubject });
                return safeJsonResult(result);
            } catch (err) {
                return { ok: false, output: '', errorOutput: String(err) };
            }
        }

        // ------------------------------------------------------------------
        // workspace_pre_meeting_research — generate pre-meeting brief for a prospect
        // payload: { prospect_id }
        // ------------------------------------------------------------------
        case 'workspace_pre_meeting_research': {
            const prisma = await createPrisma();
            try {
                const prospectId = typeof payload['prospect_id'] === 'string' ? payload['prospect_id'] : '';
                if (!prospectId) {
                    return { ok: false, output: '', errorOutput: 'payload.prospect_id is required.' };
                }
                const brief = await generatePreMeetingBrief(
                    prospectId,
                    tenantId,
                    prisma as unknown as import('@prisma/client').PrismaClient,
                );
                return safeJsonResult(brief);
            } catch (err) {
                return { ok: false, output: '', errorOutput: String(err) };
            } finally {
                await prisma.$disconnect().catch(() => undefined);
            }
        }

        // ------------------------------------------------------------------
        // workspace_booking_invite — send a meeting booking invite to a prospect
        // payload: { prospect_id }
        // ------------------------------------------------------------------
        case 'workspace_booking_invite': {
            const prisma = await createPrisma();
            try {
                const config = requireConfig(await loadSalesConfig(tenantId, botId, prisma), botId);
                const prospectId = typeof payload['prospect_id'] === 'string' ? payload['prospect_id'] : '';
                if (!prospectId) {
                    return { ok: false, output: '', errorOutput: 'payload.prospect_id is required.' };
                }
                const result = await sendBookingInvite(
                    prospectId,
                    tenantId,
                    botId,
                    config,
                    prisma as unknown as import('@prisma/client').PrismaClient,
                );
                return safeJsonResult(result);
            } catch (err) {
                return { ok: false, output: '', errorOutput: String(err) };
            } finally {
                await prisma.$disconnect().catch(() => undefined);
            }
        }

        // ------------------------------------------------------------------
        // workspace_contract_send — send a contract / proposal to a prospect
        // payload: { prospect_id, deal_id }
        // ------------------------------------------------------------------
        case 'workspace_contract_send': {
            const prisma = await createPrisma();
            try {
                const config = requireConfig(await loadSalesConfig(tenantId, botId, prisma), botId);
                const prospectId = typeof payload['prospect_id'] === 'string' ? payload['prospect_id'] : '';
                const dealId = typeof payload['deal_id'] === 'string' ? payload['deal_id'] : '';
                if (!prospectId || !dealId) {
                    return { ok: false, output: '', errorOutput: 'payload.prospect_id and payload.deal_id are required.' };
                }
                const result = await sendContractInvite(
                    prospectId,
                    dealId,
                    tenantId,
                    botId,
                    config,
                    prisma as unknown as import('@prisma/client').PrismaClient,
                );
                return safeJsonResult(result);
            } catch (err) {
                return { ok: false, output: '', errorOutput: String(err) };
            } finally {
                await prisma.$disconnect().catch(() => undefined);
            }
        }

        // ------------------------------------------------------------------
        // workspace_deal_close — close a deal as won or lost
        // payload: { deal_id, outcome: 'won'|'lost', signer_email?, signed_at?, reason? }
        // ------------------------------------------------------------------
        case 'workspace_deal_close': {
            const prisma = await createPrisma();
            try {
                const config = requireConfig(await loadSalesConfig(tenantId, botId, prisma), botId);
                const dealId = typeof payload['deal_id'] === 'string' ? payload['deal_id'] : '';
                const outcome = typeof payload['outcome'] === 'string' ? payload['outcome'] : '';
                if (!dealId || (outcome !== 'won' && outcome !== 'lost')) {
                    return { ok: false, output: '', errorOutput: "payload.deal_id and payload.outcome ('won'|'lost') are required." };
                }

                if (outcome === 'won') {
                    const signerEmail = typeof payload['signer_email'] === 'string' ? payload['signer_email'] : '';
                    const signedAtRaw = typeof payload['signed_at'] === 'string' ? payload['signed_at'] : '';
                    const signedAt = signedAtRaw ? new Date(signedAtRaw) : new Date();
                    if (!signerEmail) {
                        return { ok: false, output: '', errorOutput: "payload.signer_email is required when outcome='won'." };
                    }
                    const result = await closeDealWon(
                        dealId,
                        tenantId,
                        botId,
                        signerEmail,
                        signedAt,
                        config,
                        prisma as unknown as import('@prisma/client').PrismaClient,
                    );
                    return safeJsonResult(result);
                } else {
                    const reason = typeof payload['reason'] === 'string' ? payload['reason'] : 'Not specified';
                    const result = await closeDealLost(
                        dealId,
                        tenantId,
                        botId,
                        reason,
                        config,
                        prisma as unknown as import('@prisma/client').PrismaClient,
                    );
                    return safeJsonResult(result);
                }
            } catch (err) {
                return { ok: false, output: '', errorOutput: String(err) };
            } finally {
                await prisma.$disconnect().catch(() => undefined);
            }
        }
    }
}
