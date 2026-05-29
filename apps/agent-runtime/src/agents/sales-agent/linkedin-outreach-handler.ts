import type { PrismaClient } from '@prisma/client';
import type { SalesAgentConfigRecord, LinkedInOutreachType } from '@agentfarm/shared-types';
import { runBrowserTask } from './browser-executor.js';

import { callAnthropic, extractText } from '../../infrastructure/anthropic-caller.js';
// LinkedIn caps connection-request notes at 300 chars; direct messages at 8000
const CONNECTION_NOTE_MAX = 300;
const MESSAGE_MAX = 600;

type PrismaWithLinkedIn = {
    prospect: {
        findUnique: (args: { where: { id: string } }) => Promise<Record<string, unknown> | null>;
    };
    salesActivity: {
        create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }>;
    };
};

export interface LinkedInOutreachParams {
    prospectId: string;
    tenantId: string;
    botId: string;
    outreachType: LinkedInOutreachType;
    config: SalesAgentConfigRecord;
}

export interface LinkedInOutreachResult {
    ok: boolean;
    sent: boolean;
    provider: 'browser' | 'phantombuster';
    message?: string;
    error?: string;
}

// ---------------------------------------------------------------------------
// LLM message generation
// ---------------------------------------------------------------------------

async function generateLinkedInMessage(
    prospectName: string,
    company: string,
    title: string | undefined,
    productDescription: string,
    icp: string,
    outreachType: LinkedInOutreachType,
): Promise<string> {
    const maxChars = outreachType === 'connection_request' ? CONNECTION_NOTE_MAX : MESSAGE_MAX;

    const fallback = outreachType === 'connection_request'
        ? `Hi ${prospectName}, I came across your profile and thought we might have some interesting things to discuss. Would love to connect!`
        : `Hi ${prospectName}, I noticed your work at ${company} and wanted to reach out. I work with companies in your space on ${productDescription}. Would you be open to a quick conversation?`;

    const apiKey = process.env['ANTHROPIC_API_KEY'];
    if (!apiKey) return fallback;

    const system = `You are an expert B2B sales copywriter. Write a short, natural LinkedIn ${outreachType === 'connection_request' ? 'connection note' : 'message'}.
Max ${maxChars} characters. No hashtags. No emojis. First person. Value-focused, not salesy.
Return ONLY the message text — no JSON, no labels, no quotes.`;

    const userPrompt = `Prospect: ${prospectName}, ${title ?? 'professional'} at ${company}
Product/Service: ${productDescription}
ICP context: ${icp}
Write the LinkedIn ${outreachType === 'connection_request' ? 'connection note' : 'message'}.`;

    const { content } = await callAnthropic({
        tier: 'balanced',
        system,
        messages: [{ role: 'user', content: userPrompt }],
        maxTokens: 256,
    });
    const text = extractText(content).trim();
    return text.slice(0, maxChars) || fallback;
}

// ---------------------------------------------------------------------------
// Provider: PhantomBuster
// ---------------------------------------------------------------------------

async function sendViaPhantomBuster(
    linkedinUrl: string,
    message: string,
    config: SalesAgentConfigRecord,
    outreachType: LinkedInOutreachType,
): Promise<{ sent: boolean; error?: string }> {
    const pbApiKey = config.phantombusterApiKey;
    const pbPhantomId = config.phantombusterLinkedInPhantomId;

    if (!pbApiKey || !pbPhantomId) {
        return {
            sent: false,
            error: 'PhantomBuster not configured — set phantombusterApiKey and phantombusterLinkedInPhantomId in SalesAgentConfig',
        };
    }

    const argumentsPayload = outreachType === 'connection_request'
        ? { linkedinProfileUrl: linkedinUrl, message, numberOfAdds: 1, onlyConnect: true }
        : { linkedinProfileUrl: linkedinUrl, message, numberOfMessages: 1 };

    const res = await fetch('https://api.phantombuster.com/api/v2/agents/launch', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'X-Phantombuster-Key': pbApiKey,
        },
        body: JSON.stringify({ id: pbPhantomId, arguments: argumentsPayload }),
        signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
        const errText = await res.text().catch(() => '');
        return { sent: false, error: `PhantomBuster error ${res.status}: ${errText.slice(0, 200)}` };
    }

    return { sent: true };
}

// ---------------------------------------------------------------------------
// Provider: Browser automation via browser-agent service
// ---------------------------------------------------------------------------

async function sendViaBrowser(
    linkedinUrl: string,
    message: string,
    outreachType: LinkedInOutreachType,
    prospectId: string,
    tenantId: string,
    botId: string,
    config: SalesAgentConfigRecord,
    prisma?: PrismaClient,
): Promise<{ sent: boolean; error?: string }> {
    const escapedMessage = message.replace(/"/g, '\\"');

    const goal = outreachType === 'connection_request'
        ? `Navigate to LinkedIn profile: ${linkedinUrl}. Find and click the "Connect" button. ` +
          `If an "Add a note" option appears, click it and type exactly: "${escapedMessage}". ` +
          `Then click "Send invitation". Return JSON: {"sent": true, "method": "connection_request"} on success ` +
          `or {"sent": false, "error": "reason"} on failure.`
        : `Navigate to LinkedIn profile: ${linkedinUrl}. Click the "Message" button. ` +
          `In the message compose box, type exactly: "${escapedMessage}". Click "Send". ` +
          `Return JSON: {"sent": true, "method": "message"} on success or {"sent": false, "error": "reason"} on failure.`;

    const task = await runBrowserTask(
        { tenantId, botId, goal, prospectId },
        config,
        prisma,
        { prospectId },
    );

    if (task.status !== 'completed') {
        return { sent: false, error: task.errorMessage ?? 'Browser automation failed or timed out' };
    }

    try {
        const r = JSON.parse(task.result ?? '{}') as Record<string, unknown>;
        if (r['sent'] === true) return { sent: true };
        return { sent: false, error: String(r['error'] ?? 'Browser task completed but reported failure') };
    } catch {
        // If the browser task completed but returned non-JSON, assume success
        return { sent: task.status === 'completed' };
    }
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function sendLinkedInOutreach(
    params: LinkedInOutreachParams,
    prisma?: PrismaClient,
): Promise<LinkedInOutreachResult> {
    const { prospectId, tenantId, botId, outreachType, config } = params;

    const db = prisma ? (prisma as unknown as PrismaWithLinkedIn) : null;

    const prospect = db ? await db.prospect.findUnique({ where: { id: prospectId } }) : null;
    if (!prospect) return { ok: false, sent: false, provider: 'browser', error: 'Prospect not found' };
    if (String(prospect['tenantId'] ?? '') !== tenantId) {
        return { ok: false, sent: false, provider: 'browser', error: 'Tenant isolation violation' };
    }

    const linkedinUrl = prospect['linkedinUrl'] ? String(prospect['linkedinUrl']) : '';
    if (!linkedinUrl) {
        return { ok: false, sent: false, provider: 'browser', error: 'Prospect has no LinkedIn URL' };
    }

    const prospectName = `${String(prospect['firstName'] ?? '')} ${String(prospect['lastName'] ?? '')}`.trim();
    const company = String(prospect['company'] ?? '');
    const title = prospect['title'] ? String(prospect['title']) : undefined;

    const message = await generateLinkedInMessage(
        prospectName, company, title,
        config.productDescription, config.icp, outreachType,
    );

    // Try browser automation first
    let usedProvider: 'browser' | 'phantombuster' = 'browser';
    let sendResult = await sendViaBrowser(
        linkedinUrl, message, outreachType,
        prospectId, tenantId, botId, config, prisma,
    );

    // Fall back to PhantomBuster if browser fails and it's configured
    if (!sendResult.sent && config.phantombusterApiKey) {
        usedProvider = 'phantombuster';
        sendResult = await sendViaPhantomBuster(linkedinUrl, message, config, outreachType);
    }

    if (db) {
        const activityType = outreachType === 'connection_request' ? 'linkedin_connect' : 'linkedin_message';
        await db.salesActivity.create({
            data: {
                tenantId,
                botId,
                prospectId,
                activityType,
                subject: `LinkedIn ${outreachType} via ${usedProvider} — ${prospectName}`,
                body: message,
                outcome: sendResult.sent ? 'sent' : `failed: ${sendResult.error ?? 'unknown'}`,
                completedAt: new Date(),
                createdAt: new Date(),
                updatedAt: new Date(),
            },
        }).catch(() => undefined);
    }

    return {
        ok: true,
        sent: sendResult.sent,
        provider: usedProvider,
        message,
        error: sendResult.sent ? undefined : sendResult.error,
    };
}
